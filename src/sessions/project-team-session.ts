/**
 * 项目/团队级会话隔离工具
 *
 * 功能：
 * - 创建项目级会话键（避免多项目信息交叉污染）
 * - 创建团队级会话键
 * - 支持按项目/团队维度隔离聊天历史、任务、记忆
 */

import type { GatewayRequestHandlerOptions } from "../../upstream/src/gateway/server-methods/types.js";

// ============================================================================
// 类型定义
// ============================================================================

export interface ProjectSessionParams {
  /** 项目 ID（必填，如 "wo-shi-renlei"） */
  projectId: string;

  /** 会话名称（可选，如 "main", "planning", "development"） */
  sessionName?: string;

  /** 智能体 ID（可选，默认从上下文获取） */
  agentId?: string;
}

export interface TeamSessionParams {
  /** 团队 ID（必填，如 "team-member-group"） */
  teamId: string;

  /** 会话名称（可选，如 "daily-standup", "sprint-planning"） */
  sessionName?: string;

  /** 智能体 ID（可选，默认从上下文获取） */
  agentId?: string;
}

// ============================================================================
// 会话键生成工具
// ============================================================================

/**
 * 生成项目级会话键
 * 格式：agent:{agentId}:project:{projectId}:{sessionName}
 */
export function generateProjectSessionKey(params: ProjectSessionParams): string {
  const { projectId, sessionName = "main", agentId = "main" } = params;

  if (!projectId || !projectId.trim()) {
    throw new Error("Project ID is required");
  }

  const normalizedProjectId = projectId.trim().toLowerCase();
  const normalizedSessionName = sessionName.trim().toLowerCase();
  const normalizedAgentId = agentId.trim().toLowerCase();

  return `agent:${normalizedAgentId}:project:${normalizedProjectId}:${normalizedSessionName}`;
}

/**
 * 生成团队级会话键
 * 格式：agent:{agentId}:team:{teamId}:{sessionName}
 */
export function generateTeamSessionKey(params: TeamSessionParams): string {
  const { teamId, sessionName = "main", agentId = "main" } = params;

  if (!teamId || !teamId.trim()) {
    throw new Error("Team ID is required");
  }

  const normalizedTeamId = teamId.trim().toLowerCase();
  const normalizedSessionName = sessionName.trim().toLowerCase();
  const normalizedAgentId = agentId.trim().toLowerCase();

  return `agent:${normalizedAgentId}:team:${normalizedTeamId}:${normalizedSessionName}`;
}

/**
 * 解析项目/团队会话键
 */
export function parseProjectOrTeamSessionKey(
  sessionKey: string | undefined | null,
): { type: "project" | "team"; agentId: string; id: string; sessionName: string } | null {
  const raw = (sessionKey ?? "").trim().toLowerCase();
  if (!raw) {
    return null;
  }

  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 5 || parts[0] !== "agent") {
    return null;
  }

  const agentId = parts[1];
  const scopeType = parts[2]; // "project" or "team"

  if (scopeType === "project" && parts.length >= 4) {
    return {
      type: "project",
      agentId,
      id: parts[3], // projectId
      sessionName: parts.slice(4).join(":") || "main",
    };
  }

  if (scopeType === "team" && parts.length >= 4) {
    return {
      type: "team",
      agentId,
      id: parts[3], // teamId
      sessionName: parts.slice(4).join(":") || "main",
    };
  }

  return null;
}

// ============================================================================
// Gateway 工具方法
// ============================================================================

/**
 * 创建项目级会话（Gateway 工具）
 */
export async function createProjectSession(
  params: ProjectSessionParams,
  _options: GatewayRequestHandlerOptions,
): Promise<{ success: boolean; sessionKey: string; message: string }> {
  try {
    const sessionKey = generateProjectSessionKey(params);
    return {
      success: true,
      sessionKey,
      message: `项目会话 ${sessionKey} 已创建`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      sessionKey: "",
      message: `创建项目会话失败: ${msg}`,
    };
  }
}

/**
 * 创建团队级会话（Gateway 工具）
 */
export async function createTeamSession(
  params: TeamSessionParams,
  _options: GatewayRequestHandlerOptions,
): Promise<{ success: boolean; sessionKey: string; message: string }> {
  try {
    const sessionKey = generateTeamSessionKey(params);
    return {
      success: true,
      sessionKey,
      message: `团队会话 ${sessionKey} 已创建`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      sessionKey: "",
      message: `创建团队会话失败: ${msg}`,
    };
  }
}

// ============================================================================
// 导出给外部使用
// ============================================================================

export const projectSessionTools = {
  generateProjectSessionKey,
  generateTeamSessionKey,
  parseProjectOrTeamSessionKey,
  createProjectSession,
  createTeamSession,
};
