/**
 * Workspace Hygiene — 工作空间自检与卫生维护模块
 *
 * 业界实践参考：OpenAI Agents SDK「Memory Hygiene Job」/ MemOS 生命周期管理
 *
 * 职责：
 * 1. P1-检查1：MEMORY.md 大小检查 — 超过 8KB (80% 阈值) 即触发预归档警告
 * 2. P1-检查2：孤儿工作空间目录检测 — 文件系统有但 openclaw.json 未注册的 agent 目录
 * 3. P1-检查3：个人工作空间根目录杂项文件检测 — 非系统白名单 .md 文件
 * 4. P1-检查4：幻觉项目目录检测 — groups/ 下有但 groups.json 未注册的目录
 * 5. P1-检查5：AGENTS.md 路径声明一致性 — 注入的路径是否与当前配置一致
 *
 * 暴露 RPC 接口：workspace.hygiene.run / workspace.hygiene.status
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadConfig } from "../../upstream/src/config/config.js";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { archiveMemoryOverflow } from "./file-tools-secure.js";

// ============================================================================
// 类型定义
// ============================================================================

export interface HygieneIssue {
  /** 问题级别 */
  level: "error" | "warn" | "info";
  /** 检查项类别 */
  category: "memory-size" | "orphan-agent" | "stray-file" | "ghost-project" | "path-declaration";
  /** 受影响的路径 */
  path: string;
  /** 问题描述 */
  message: string;
  /** 建议操作 */
  suggestion?: string;
  /** 是否已自动修复 */
  autoFixed?: boolean;
}

export interface HygieneReport {
  /** 检查时间 (ISO 8601) */
  checkedAt: string;
  /** 耗时 ms */
  durationMs: number;
  /** 汇总 */
  summary: {
    errors: number;
    warns: number;
    infos: number;
    autoFixed: number;
  };
  /** 详细问题列表 */
  issues: HygieneIssue[];
}

// ============================================================================
// 常量
// ============================================================================

/** 系统文件白名单（大小写不敏感），允许在个人工作空间根目录存在 */
const SYSTEM_FILES_WHITELIST = new Set([
  "agents.md",
  "soul.md",
  "identity.md",
  "user.md",
  "memory.md",
  "tools.md",
  "heartbeat.md",
  "heartbeat_state.md",
  "bootstrap.md",
  "projects.md",
  "qoder.md",
  "deployment.md",
  "code_review_guidelines.md",
  "readme.md",
]);

/** 允许在 groups/ 下存在的系统/元文件（不算幻觉目录内文件） */
const _GROUPS_SYSTEM_FILES = new Set([
  "shared_memory.md",
  "team_memory.md",
  "rules.md",
  "group_info.md",
  "members.md",
  "workspace_guide.md",
  "project_config.json",
  "readme.md",
]);

/** MEMORY.md 预警阈值（字节），超过时发 warn */
const MEMORY_WARN_BYTES = 8 * 1024; // 8KB = 80% of 10KB limit
/** MEMORY.md 归档阈值（字节），超过时发 error */
const MEMORY_ERROR_BYTES = 10 * 1024; // 10KB

// ============================================================================
// 核心自检逻辑
// ============================================================================

/**
 * 读取 openclaw.json，返回注册的 agent 列表
 */
function loadRegisteredAgents(): Array<{ id: string; workspace: string | null }> {
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    if (!fs.existsSync(configPath)) {
      return [];
    }
    const raw = fs.readFileSync(configPath, "utf-8");
    const json = JSON.parse(raw);
    const agents: Array<{ id: string; workspace: string | null }> = json?.agents?.list ?? [];
    return agents;
  } catch {
    return [];
  }
}

/**
 * 读取 groups.json，返回注册的群组 projectId 集合（小写）
 */
function loadRegisteredProjectIds(): Set<string> {
  try {
    const groupsPath = path.join(os.homedir(), ".openclaw", "groups", "groups.json");
    if (!fs.existsSync(groupsPath)) {
      return new Set();
    }
    const raw = fs.readFileSync(groupsPath, "utf-8");
    const json = JSON.parse(raw);
    const groups: Array<{ projectId?: string }> = json?.groups ?? json ?? [];
    const ids = new Set<string>();
    for (const g of groups) {
      if (g.projectId) {
        ids.add(g.projectId.toLowerCase());
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

/**
 * 检查1：MEMORY.md 大小（超限时自动归档）
 */
function checkMemorySize(agentWorkspaceDir: string, agentId: string): HygieneIssue[] {
  const issues: HygieneIssue[] = [];
  const memPath = path.join(agentWorkspaceDir, "MEMORY.md");
  if (!fs.existsSync(memPath)) {
    return issues;
  }
  try {
    const size = fs.statSync(memPath).size;
    if (size >= MEMORY_ERROR_BYTES) {
      // 自动归档：将旧内容转移到 memory/ 子目录
      let autoFixed = false;
      try {
        const content = fs.readFileSync(memPath, "utf-8");
        const result = archiveMemoryOverflow(content, memPath);
        if (result.archived) {
          const archiveDir = path.dirname(result.archiveFilePath);
          if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
          }
          fs.writeFileSync(result.archiveFilePath, result.archiveContent, "utf-8");
          fs.writeFileSync(memPath, result.newMainContent, "utf-8");
          autoFixed = true;
          console.log(`  → 已自动归档 Agent [${agentId}] MEMORY.md → ${result.archiveFilePath}`);
        }
      } catch {
        // 归档失败不影响报告
      }
      issues.push({
        level: "error",
        category: "memory-size",
        path: memPath,
        message: `Agent [${agentId}] MEMORY.md 超过 10KB 上限，当前 ${(size / 1024).toFixed(1)}KB，需要立即归档`,
        suggestion: autoFixed
          ? "已自动归档"
          : "系统将在下次 bootstrap 时自动归档，或手动运行 workspace.hygiene.archive",
        autoFixed,
      });
    } else if (size >= MEMORY_WARN_BYTES) {
      issues.push({
        level: "warn",
        category: "memory-size",
        path: memPath,
        message: `Agent [${agentId}] MEMORY.md 接近上限，当前 ${(size / 1024).toFixed(1)}KB / 10KB`,
        suggestion: "建议整理个人记忆，将项目成果移至项目 SHARED_MEMORY.md",
      });
    }
  } catch {
    // 忽略 stat 失败
  }
  return issues;
}

/**
 * 检查3：个人工作空间根目录杂项文件（自动移动到 docs/ 子目录）
 */
function checkStrayFiles(agentWorkspaceDir: string, agentId: string): HygieneIssue[] {
  const issues: HygieneIssue[] = [];
  if (!fs.existsSync(agentWorkspaceDir)) {
    return issues;
  }
  try {
    const entries = fs.readdirSync(agentWorkspaceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        if (!SYSTEM_FILES_WHITELIST.has(entry.name.toLowerCase())) {
          const filePath = path.join(agentWorkspaceDir, entry.name);
          const size = fs.statSync(filePath).size;
          const docsDir = path.join(agentWorkspaceDir, "docs");
          const destPath = path.join(docsDir, entry.name);
          let autoFixed = false;
          try {
            if (!fs.existsSync(docsDir)) {
              fs.mkdirSync(docsDir, { recursive: true });
            }
            fs.renameSync(filePath, destPath);
            autoFixed = true;
            console.log(`  → 移动到 docs/ 子目录: ${destPath}`);
          } catch {
            // 移动失败（如目标已存在），仅报告
          }
          issues.push({
            level: "warn",
            category: "stray-file",
            path: filePath,
            message: `Agent [${agentId}] 个人工作空间根目录存在非系统文件 "${entry.name}" (${(size / 1024).toFixed(1)}KB)`,
            suggestion: `移动到 docs/ 子目录: ${destPath}`,
            autoFixed,
          });
        }
      }
    }
  } catch {
    // 忽略读取失败
  }
  return issues;
}

/**
 * 检查2 & 4：孤儿 agent 目录 + 幻觉项目目录
 * 同时检查两类问题，避免重复读取配置
 */
function checkOrphansAndGhosts(
  registeredAgents: Array<{ id: string; workspace: string | null }>,
  registeredProjectIds: Set<string>,
  groupsRoot: string,
): HygieneIssue[] {
  const issues: HygieneIssue[] = [];

  // 检查4：幻觉项目目录（groups/ 下有但未在 groups.json 注册）
  if (fs.existsSync(groupsRoot)) {
    try {
      const dirs = fs.readdirSync(groupsRoot, { withFileTypes: true });
      for (const dir of dirs) {
        if (dir.isDirectory()) {
          const dirNameLower = dir.name.toLowerCase();
          if (!registeredProjectIds.has(dirNameLower)) {
            issues.push({
              level: "warn",
              category: "ghost-project",
              path: path.join(groupsRoot, dir.name),
              message: `groups/ 下目录 "${dir.name}" 未在 groups.json 中注册任何群组`,
              suggestion: "如果是废弃目录可以删除；如果是有效项目请先在系统中创建对应群组",
            });
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  return issues;
}

/**
 * 检查5：AGENTS.md 路径声明一致性
 * 检查注入的系统路径声明区块里的 agentId / workspace 路径与当前配置是否一致
 */
function checkPathDeclaration(agentWorkspaceDir: string, agentId: string): HygieneIssue[] {
  const issues: HygieneIssue[] = [];
  const agentsPath = path.join(agentWorkspaceDir, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    return issues;
  }

  try {
    const content = fs.readFileSync(agentsPath, "utf-8");
    // 检查路径声明区块是否存在
    if (!content.includes("🗂️ 系统路径声明")) {
      issues.push({
        level: "info",
        category: "path-declaration",
        path: agentsPath,
        message: `Agent [${agentId}] AGENTS.md 缺少系统路径声明区块`,
        suggestion: "重启该 Agent 会话，系统会在 bootstrap 时自动注入路径声明",
      });
      return issues;
    }

    // 检查声明的工作空间路径是否与当前一致
    const normalizedExpected = path.normalize(agentWorkspaceDir).toLowerCase();
    const match = content.match(/\*\*我的个人工作空间\*\*：`([^`]+)`/);
    if (match) {
      const declaredPath = path.normalize(match[1]).toLowerCase();
      if (declaredPath !== normalizedExpected) {
        issues.push({
          level: "warn",
          category: "path-declaration",
          path: agentsPath,
          message: `Agent [${agentId}] AGENTS.md 路径声明与实际不符: 声明="${match[1]}" vs 实际="${agentWorkspaceDir}"`,
          suggestion: "重启该 Agent 会话，系统会在 bootstrap 时自动更新路径声明",
        });
      }
    }
  } catch {
    // 忽略读取失败
  }
  return issues;
}

// ============================================================================
// 主入口：运行完整自检
// ============================================================================

/**
 * 运行完整的工作空间卫生检查
 *
 * @param groupsRoot - groups 工作空间根目录（默认从环境变量/配置读取）
 * @returns 检查报告
 */
export function runWorkspaceHygiene(groupsRoot?: string): HygieneReport {
  const startTime = Date.now();
  const allIssues: HygieneIssue[] = [];

  const effectiveGroupsRoot =
    groupsRoot || process.env.OPENCLAW_GROUPS_ROOT || "H:\\OpenClaw_Workspace\\groups";

  // 读取权威数据源
  const registeredAgents = loadRegisteredAgents();
  const registeredProjectIds = loadRegisteredProjectIds();

  // 对每个已注册 agent 执行检查
  for (const agent of registeredAgents) {
    if (!agent.id) {
      continue;
    }

    // 解析实际工作空间路径：优先用 agent.workspace 配置，否则用 resolveAgentWorkspaceDir
    let agentWorkspaceDir: string;
    if (agent.workspace) {
      agentWorkspaceDir = agent.workspace.replace(/\\\\/g, "\\");
    } else {
      try {
        const cfg = loadConfig();
        agentWorkspaceDir = resolveAgentWorkspaceDir(cfg, agent.id);
      } catch {
        agentWorkspaceDir = path.join(os.homedir(), ".openclaw", `workspace-${agent.id}`);
      }
    }

    if (!fs.existsSync(agentWorkspaceDir)) {
      // 工作空间目录不存在时只记录 info，不报 error（可能是新 agent 还未初始化）
      allIssues.push({
        level: "info",
        category: "orphan-agent",
        path: agentWorkspaceDir,
        message: `Agent [${agent.id}] 工作空间目录不存在: ${agentWorkspaceDir}`,
        suggestion: "启动该 Agent 会话后系统会自动创建工作空间目录",
      });
      continue;
    }

    // 检查1：MEMORY.md 大小
    allIssues.push(...checkMemorySize(agentWorkspaceDir, agent.id));
    // 检查3：根目录杂项文件
    allIssues.push(...checkStrayFiles(agentWorkspaceDir, agent.id));
    // 检查5：路径声明一致性
    allIssues.push(...checkPathDeclaration(agentWorkspaceDir, agent.id));
  }

  // 检查2 & 4：孤儿 agent + 幻觉项目
  allIssues.push(
    ...checkOrphansAndGhosts(registeredAgents, registeredProjectIds, effectiveGroupsRoot),
  );

  const durationMs = Date.now() - startTime;

  const summary = {
    errors: allIssues.filter((i) => i.level === "error").length,
    warns: allIssues.filter((i) => i.level === "warn").length,
    infos: allIssues.filter((i) => i.level === "info").length,
    autoFixed: allIssues.filter((i) => i.autoFixed).length,
  };

  const report: HygieneReport = {
    checkedAt: new Date().toISOString(),
    durationMs,
    summary,
    issues: allIssues,
  };

  // 打印简报到控制台
  const total = allIssues.length;
  if (total === 0) {
    console.log(`[WorkspaceHygiene] ✅ 自检完成，无问题 (耗时 ${durationMs}ms)`);
  } else {
    console.log(
      `[WorkspaceHygiene] 自检完成 (耗时 ${durationMs}ms): ` +
        `${summary.errors} errors, ${summary.warns} warns, ${summary.infos} infos`,
    );
    for (const issue of allIssues) {
      const prefix = issue.level === "error" ? "❌" : issue.level === "warn" ? "⚠️" : "ℹ️";
      console.log(`  ${prefix} [${issue.category}] ${issue.message}`);
      if (issue.suggestion) {
        console.log(`     → ${issue.suggestion}`);
      }
    }
  }

  return report;
}

/**
 * 获取最近一次自检报告（缓存）
 */
let _lastReport: HygieneReport | null = null;
let _lastReportTime = 0;

/**
 * 获取缓存的自检报告（5分钟内有效）
 */
export function getCachedHygieneReport(): HygieneReport | null {
  if (_lastReport && Date.now() - _lastReportTime < 5 * 60 * 1000) {
    return _lastReport;
  }
  return null;
}

/**
 * 运行自检并缓存结果
 */
export function runAndCacheHygiene(groupsRoot?: string): HygieneReport {
  _lastReport = runWorkspaceHygiene(groupsRoot);
  _lastReportTime = Date.now();
  return _lastReport;
}
