/**
 * 带部门感知的沙箱上下文解析器
 *
 * 这是 upstream resolveSandboxContext 的增强版本，
 * 在原有逻辑之上叠加部门级沙箱隔离配置。
 *
 * 调用方应优先使用本函数而非直接调用 resolveSandboxContext，
 * 以获得部门硬隔离能力。
 *
 * 工作流程：
 *   1. 通过 DeptAccessGuard 验证 agentId + departmentId（防进攻2）
 *   2. 调用 resolveSandboxConfigWithDept 合并部门配置（含对抗1/3/4/5/6）
 *   3. 把合并后的 SandboxConfig 注入到 resolveSandboxContext 的 config 中
 *   4. 调用原始 resolveSandboxContext 返回 SandboxContext
 */

import { resolveSessionAgentId } from "../../../upstream/src/agents/agent-scope.js";
import { resolveSandboxContext } from "../../../upstream/src/agents/sandbox/context.js";
import type { SandboxContext } from "../../../upstream/src/agents/sandbox/types.js";
import type { OpenClawConfig } from "../../../upstream/src/config/config.js";
import { guardedResolveDeptId } from "./dept-access-guard.js";
import { resolveSandboxConfigWithDept } from "./dept-sandbox-resolver.js";

// ============================================================================
// 带部门感知的沙箱上下文解析
// ============================================================================

/**
 * 解析带部门隔离的沙箱上下文
 *
 * 在 resolveSandboxContext 基础上：
 * - 自动推断 agentId 所属部门（或使用显式指定的 departmentId）
 * - 叠加部门沙箱配置
 * - 对抗层验证（agentId 必须是部门成员）
 *
 * @param params.config OpenClaw 配置
 * @param params.sessionKey 会话 key（用于推断 agentId）
 * @param params.workspaceDir 工作目录
 * @param params.departmentId 显式指定部门 ID（可选；不传时自动推断）
 * @returns SandboxContext 或 null（沙箱被禁用时）
 */
export async function resolveSandboxContextWithDept(params: {
  config?: OpenClawConfig;
  sessionKey?: string;
  workspaceDir?: string;
  departmentId?: string | null;
}): Promise<SandboxContext | null> {
  // 1. 从 sessionKey 中提取 agentId
  const sessionKey = params.sessionKey?.trim() ?? "";
  const agentId = sessionKey
    ? resolveSessionAgentId({ sessionKey, config: params.config })
    : undefined;

  // 2. 对抗层：验证 agentId 的部门归属，获取已验证的 departmentId
  const verifiedDeptId = agentId ? await guardedResolveDeptId(agentId, params.departmentId) : null;

  // 3. 如果没有部门归属，直接走原始路径
  if (!verifiedDeptId) {
    return resolveSandboxContext({
      config: params.config,
      sessionKey: params.sessionKey,
      workspaceDir: params.workspaceDir,
    });
  }

  // 4. 获取合并了部门配置的 SandboxConfig
  const deptCfg = await resolveSandboxConfigWithDept({
    config: params.config,
    agentId,
    departmentId: verifiedDeptId,
  });

  // 5. 防进攻5：部门被删除时 deptCfg.mode = "off"，直接返回 null
  if (deptCfg.mode === "off") {
    return null;
  }

  // 6. 把部门合并配置注入到 OpenClawConfig 的 sandbox 配置层
  //    通过修改 agents.defaults.sandbox 实现（深度合并，保留其余配置）
  const patchedConfig: OpenClawConfig = injectSandboxConfig(params.config, agentId, deptCfg);

  // 7. 使用打补丁后的配置调用原始 resolveSandboxContext
  return resolveSandboxContext({
    config: patchedConfig,
    sessionKey: params.sessionKey,
    workspaceDir: params.workspaceDir,
  });
}

// ============================================================================
// 内部：将 SandboxConfig 注入到 OpenClawConfig
// ============================================================================

/**
 * 将已合并的 SandboxConfig 注入到 OpenClawConfig 的 agents.defaults.sandbox 层
 *
 * 注意：这里只注入"安全参数"（部门强制的 containerPrefix / network / workspaceRoot）。
 * 原有 Agent 级配置会在下一步 resolveSandboxConfigForAgent 中被正确处理。
 *
 * 防进攻4：network 和 containerPrefix 由部门控制，通过注入到 defaults 层来"压制"
 * Agent 级配置（因为 resolveSandboxDockerConfig 中 agent > global，
 * 所以我们把部门配置注入为 agent-specific 配置来优先）。
 */
function injectSandboxConfig(
  config: OpenClawConfig | undefined,
  agentId: string | undefined,
  deptCfg: ReturnType<
    (typeof import("../../../upstream/src/agents/sandbox/config.js"))["resolveSandboxConfigForAgent"]
  >,
): OpenClawConfig {
  const base: OpenClawConfig = config ? { ...config } : {};

  // 构建注入的 sandbox 配置（仅注入部门强制的安全参数）
  const injectedSandbox = {
    mode: deptCfg.mode,
    scope: deptCfg.scope,
    workspaceRoot: deptCfg.workspaceRoot,
    docker: {
      ...base.agents?.defaults?.sandbox?.docker,
      // 防进攻4：部门强制参数覆盖
      containerPrefix: deptCfg.docker.containerPrefix,
      network: deptCfg.docker.network,
      // 资源配额
      memory: deptCfg.docker.memory,
      cpus: deptCfg.docker.cpus,
      pidsLimit: deptCfg.docker.pidsLimit,
      // 跨部门 bind mounts
      binds: deptCfg.docker.binds,
    },
  };

  // 如果有 agentId，把部门配置作为 agent-specific 配置注入
  // （这样优先级高于 defaults，实现防进攻4）
  if (agentId) {
    const existingList = base.agents?.list ?? [];
    const existingAgentIndex = existingList.findIndex((a) => a.id === agentId);
    const existingAgent = existingAgentIndex >= 0 ? existingList[existingAgentIndex] : undefined;

    const updatedAgent = {
      ...(existingAgent ?? { id: agentId }),
      // oxlint-disable-next-line typescript/no-explicit-any
      sandbox: mergeAgentSandbox((existingAgent as any)?.sandbox, injectedSandbox),
    };

    const updatedList =
      existingAgentIndex >= 0
        ? [
            ...existingList.slice(0, existingAgentIndex),
            updatedAgent,
            ...existingList.slice(existingAgentIndex + 1),
          ]
        : [...existingList, updatedAgent];

    return {
      ...base,
      agents: {
        ...base.agents,
        list: updatedList,
      },
    };
  }

  // 没有 agentId 时注入到 defaults 层
  return {
    ...base,
    agents: {
      ...base.agents,
      defaults: {
        ...base.agents?.defaults,
        sandbox: injectedSandbox,
      },
    },
  };
}

/**
 * 合并 Agent 已有的 sandbox 配置与部门注入配置
 * 部门的安全参数（network/containerPrefix）优先；
 * Agent 自己的其他配置（image/setupCommand等）保留。
 */
function mergeAgentSandbox(
  // oxlint-disable-next-line typescript/no-explicit-any
  existingSandbox: Record<string, any> | undefined,
  // oxlint-disable-next-line typescript/no-explicit-any
  deptInjected: Record<string, any>,
  // oxlint-disable-next-line typescript/no-explicit-any
): Record<string, any> {
  if (!existingSandbox) {
    return deptInjected;
  }

  return {
    ...existingSandbox,
    // 部门级强制参数覆盖（mode / scope / workspaceRoot）
    mode: deptInjected.mode,
    scope: deptInjected.scope,
    workspaceRoot: deptInjected.workspaceRoot,
    docker: {
      ...existingSandbox.docker,
      // 部门强制参数（防进攻4）
      containerPrefix: deptInjected.docker.containerPrefix,
      network: deptInjected.docker.network,
      memory: deptInjected.docker.memory ?? existingSandbox.docker?.memory,
      cpus: deptInjected.docker.cpus ?? existingSandbox.docker?.cpus,
      pidsLimit: deptInjected.docker.pidsLimit ?? existingSandbox.docker?.pidsLimit,
      // binds：部门的 bind mounts 追加到 agent 已有的 binds 之后
      binds: mergeBuildBinds(existingSandbox.docker?.binds, deptInjected.docker.binds),
    },
  };
}

function mergeBuildBinds(
  existing: string[] | undefined,
  deptBinds: string[] | undefined,
): string[] | undefined {
  if (!existing?.length && !deptBinds?.length) {
    return undefined;
  }
  return [...(existing ?? []), ...(deptBinds ?? [])];
}
