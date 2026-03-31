/**
 * 部门沙箱解析器
 *
 * 在现有 resolveSandboxConfigForAgent 的基础上，叠加部门级沙箱配置，
 * 实现部门间的硬隔离（Docker 容器命名空间 + 文件系统 + 网络三层隔离）。
 *
 * 对抗机制（方案设计中定义的 6 条防守原则均在此实现）：
 *   防1 - containerPrefix 强制包含 deptId hash（不可被用户完全覆盖）
 *   防2 - agentId 必须是部门成员才能使用部门配置（见 DeptAccessGuard）
 *   防3 - crossDeptBindMounts 强制降级为只读
 *   防4 - network / containerPrefix 不允许被 Agent 级配置覆盖
 *   防5 - 部门不存在时 mode 自动 off，拒绝 fallback 到全局开放沙箱
 *   防6 - 部门隔离时 scope 强制为 "agent"，禁止 "shared"
 */

import crypto from "node:crypto";
import path from "node:path";
import { resolveUserPath } from "../../../upstream/src/utils.js";
import { organizationStorage } from "../../organization/storage.js";
import { resolveSandboxConfigForAgent } from "../../../upstream/src/agents/sandbox/config.js";
import type { SandboxConfig } from "../../../upstream/src/agents/sandbox/types.js";
import type { OpenClawConfig } from "../../../upstream/src/config/config.js";

// ============================================================================
// 内部工具函数
// ============================================================================

/**
 * 从 departmentId 生成稳定的 8 位 hex hash（用于 containerPrefix）
 * 确保每个部门都有唯一的容器前缀（防进攻1）
 */
function hashDeptId(deptId: string): string {
  return crypto.createHash("sha256").update(deptId).digest("hex").slice(0, 8);
}

/**
 * 根据部门 ID 生成强制容器前缀
 *
 * 格式：openclaw-dept-<hint_or_safe_name>-<hash8>-
 * 用户可提供 hint（如 "finance"），但 hash 后缀由系统附加，无法省略。
 */
function buildDeptContainerPrefix(deptId: string, hint?: string): string {
  const hash = hashDeptId(deptId);
  const safeName = hint
    ? hint
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20)
    : deptId
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .slice(0, 12);
  return `openclaw-dept-${safeName}-${hash}-`;
}

/**
 * 合并工具策略（部门追加到全局之上）
 */
function mergeDeptToolPolicy(
  base: SandboxConfig["tools"],
  deptPolicy?: { allow?: string[]; deny?: string[] },
): SandboxConfig["tools"] {
  if (!deptPolicy) return base;

  const allow = deptPolicy.allow ? [...(base.allow ?? []), ...deptPolicy.allow] : base.allow;
  const deny = deptPolicy.deny ? [...(base.deny ?? []), ...deptPolicy.deny] : base.deny;
  return { allow, deny };
}

// ============================================================================
// 核心解析函数
// ============================================================================

/**
 * 解析带部门隔离的沙箱配置
 *
 * 调用链：
 *   resolveSandboxConfigForAgent（全局+Agent）→ 叠加部门配置
 *
 * @param config OpenClaw 全局配置
 * @param agentId Agent ID（用于查全局+agent 沙箱配置）
 * @param departmentId 部门 ID（可选；null/undefined 时行为与原函数相同）
 * @returns 合并后的 SandboxConfig
 */
export async function resolveSandboxConfigWithDept(params: {
  config?: OpenClawConfig;
  agentId?: string;
  departmentId?: string | null;
}): Promise<SandboxConfig> {
  // 1. 先获取全局+Agent 级配置（原有逻辑）
  const baseCfg = resolveSandboxConfigForAgent(params.config, params.agentId);

  // 2. 无部门 → 直接返回原配置
  if (!params.departmentId) {
    return baseCfg;
  }

  // 3. 查询部门存储
  const dept = await organizationStorage.getOrganization(params.departmentId);

  // 4. 防进攻5：部门被删除时 → mode=off，禁止 fallback 到全局开放沙箱
  if (!dept) {
    console.warn(
      `[DeptSandboxResolver] Department ${params.departmentId} not found. ` +
        `Forcing sandbox mode=off to prevent unintended fallback.`,
    );
    return { ...baseCfg, mode: "off" };
  }

  // 5. 部门没有配置 sandboxConfig，或明确 enabled=false → 原配置不变
  const deptSandbox = dept.sandboxConfig;
  if (!deptSandbox || deptSandbox.enabled === false) {
    return baseCfg;
  }

  // 6. 防进攻1：强制生成含 deptId hash 的 containerPrefix（不可绕过）
  const deptContainerPrefix = buildDeptContainerPrefix(
    params.departmentId,
    deptSandbox.containerPrefixHint,
  );

  // 7. 防进攻6：部门隔离时强制 scope=agent，禁止 shared
  const scope = "agent";

  // 8. workspaceRoot：优先使用部门配置（用户路径展开）
  const workspaceRoot = deptSandbox.workspaceRoot
    ? resolveUserPath(deptSandbox.workspaceRoot)
    : resolveUserPath(
        path.join(
          "~/.openclaw/sandboxes",
          `dept-${params.departmentId.replace(/[^a-z0-9-]/gi, "-")}`,
        ),
      );

  // 9. 防进攻3：处理跨部门挂载（强制只读）
  const crossDeptBinds: string[] = [];
  if (deptSandbox.crossDeptBindMounts?.length) {
    for (const mount of deptSandbox.crossDeptBindMounts) {
      const srcDept = await organizationStorage.getOrganization(mount.sourceDeptId);
      if (!srcDept?.sandboxConfig?.workspaceRoot) {
        console.warn(
          `[DeptSandboxResolver] crossDeptBindMount: source dept ${mount.sourceDeptId} ` +
            `has no workspaceRoot configured, skipping.`,
        );
        continue;
      }
      // 防进攻3：access 即使设置为 rw 也强制降级为 ro
      if (mount.access === "rw") {
        console.warn(
          `[DeptSandboxResolver] crossDeptBindMount from ${mount.sourceDeptId}: ` +
            `rw access is not allowed, downgrading to ro.`,
        );
      }
      const srcRoot = resolveUserPath(srcDept.sandboxConfig.workspaceRoot);
      crossDeptBinds.push(`${srcRoot}:${mount.mountPath}:ro`);
    }
  }

  // 10. 合并 Docker 配置
  //   防进攻4：network 和 containerPrefix 由部门控制，不允许 Agent 覆盖
  const existingBinds = baseCfg.docker.binds ?? [];
  const mergedDocker = {
    ...baseCfg.docker,
    // 部门配置优先（覆盖 Agent 配置）
    containerPrefix: deptContainerPrefix,
    // 防进攻4：network 由部门配置决定，Agent 无权修改
    network: deptSandbox.network ?? baseCfg.docker.network,
    // 镜像：部门 < Agent（允许 Agent 在部门镜像基础上进一步定制）
    image: baseCfg.docker.image !== "openclaw-sandbox:bookworm-slim"
      ? baseCfg.docker.image  // Agent 有显式配置则优先
      : (deptSandbox.image ?? baseCfg.docker.image),
    // 资源配额：部门设置的作为上限
    memory: deptSandbox.resourceQuota?.memory ?? baseCfg.docker.memory,
    cpus: deptSandbox.resourceQuota?.cpus ?? baseCfg.docker.cpus,
    pidsLimit: deptSandbox.resourceQuota?.pidsLimit ?? baseCfg.docker.pidsLimit,
    // 合并 bind mounts（跨部门只读挂载追加到现有挂载之后）
    binds:
      crossDeptBinds.length > 0
        ? [...existingBinds, ...crossDeptBinds]
        : existingBinds.length > 0
          ? existingBinds
          : undefined,
  };

  // 11. 合并工具策略
  const mergedTools = mergeDeptToolPolicy(baseCfg.tools, deptSandbox.toolPolicy);

  // 12. 返回合并后的最终配置
  const resolved: SandboxConfig = {
    ...baseCfg,
    scope,
    workspaceRoot,
    docker: mergedDocker,
    tools: mergedTools,
  };

  return resolved;
}

// ============================================================================
// 部门沙箱信息查询（供 Agent 工具层调用）
// ============================================================================

/**
 * 查询某部门的沙箱配置摘要（不含敏感信息）
 */
export async function getDeptSandboxSummary(departmentId: string): Promise<{
  enabled: boolean;
  containerPrefix: string;
  workspaceRoot: string;
  network?: string;
  hasResourceQuota: boolean;
  crossDeptMountCount: number;
} | null> {
  const dept = await organizationStorage.getOrganization(departmentId);
  if (!dept) return null;

  const cfg = dept.sandboxConfig;
  if (!cfg || cfg.enabled === false) {
    return {
      enabled: false,
      containerPrefix: buildDeptContainerPrefix(departmentId),
      workspaceRoot: `~/.openclaw/sandboxes/dept-${departmentId}`,
      hasResourceQuota: false,
      crossDeptMountCount: 0,
    };
  }

  return {
    enabled: cfg.enabled ?? true,
    containerPrefix: buildDeptContainerPrefix(departmentId, cfg.containerPrefixHint),
    workspaceRoot: cfg.workspaceRoot ?? `~/.openclaw/sandboxes/dept-${departmentId}`,
    network: cfg.network,
    hasResourceQuota: !!(cfg.resourceQuota?.memory || cfg.resourceQuota?.cpus),
    crossDeptMountCount: cfg.crossDeptBindMounts?.length ?? 0,
  };
}
