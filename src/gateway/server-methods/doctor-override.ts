/**
 * doctor-override.ts
 *
 * 覆盖/扩展上游 doctor.memory.dreamDiary handler，并新增 doctor.memory.dreamTargets：
 * - dreamDiary：支持可选的 agentId/groupId 参数，读取对应工作空间的梦境日记
 * - dreamTargets：返回系统中所有可做梦的目标列表（所有 agent + 所有群组工作空间）
 * - 确保梦境日记存储路径遵循工作空间设置逻辑
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../../upstream/src/agents/agent-scope.js";
import { loadConfig } from "../../../upstream/src/config/config.js";
import type {
  DoctorMemoryDreamDiaryPayload,
} from "../../../upstream/src/gateway/server-methods/doctor.js";
import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import { groupWorkspaceManager } from "../../workspace/group-workspace.js";

const DREAM_DIARY_FILE_NAMES = ["DREAMS.md", "dreams.md"] as const;

/** 可做梦的目标类型 */
export type DreamTarget =
  | { kind: "agent"; id: string; label: string; workspaceDir: string }
  | { kind: "group"; id: string; label: string; workspaceDir: string; projectId?: string };

export type DoctorMemoryDreamTargetsPayload = {
  targets: DreamTarget[];
  defaultTargetId: string;
};

async function readDreamDiary(
  workspaceDir: string,
): Promise<Omit<DoctorMemoryDreamDiaryPayload, "agentId">> {
  for (const name of DREAM_DIARY_FILE_NAMES) {
    const filePath = path.join(workspaceDir, name);
    let stat;
    try {
      stat = await fs.lstat(filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        continue;
      }
      return { found: false, path: name };
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      continue;
    }
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return {
        found: true,
        path: name,
        content,
        updatedAtMs: Math.floor(stat.mtimeMs),
      };
    } catch {
      return { found: false, path: name };
    }
  }
  return { found: false, path: DREAM_DIARY_FILE_NAMES[0] };
}

/**
 * 枚举系统中所有可做梦目标：agent 工作空间 + 群组工作空间
 */
function resolveDreamTargets(): DreamTarget[] {
  const targets: DreamTarget[] = [];
  const seenWorkspaceDirs = new Set<string>();

  // 1. 枚举所有 agent
  try {
    const cfg = loadConfig();
    const configuredAgents = Array.isArray((cfg as Record<string, unknown>).agents &&
      (cfg as Record<string, { list?: unknown[] }>).agents?.list)
        ? ((cfg as Record<string, { list?: Array<Record<string, unknown>> }>).agents?.list ?? [])
        : [];
    const agentIds: string[] = [];
    const seen = new Set<string>();
    for (const entry of configuredAgents) {
      if (entry && typeof entry.id === "string" && entry.id.trim()) {
        const id = entry.id.trim().toLowerCase();
        if (!seen.has(id)) {
          seen.add(id);
          agentIds.push(id);
        }
      }
    }
    if (agentIds.length === 0) {
      agentIds.push(resolveDefaultAgentId(cfg));
    }
    for (const agentId of agentIds) {
      const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
      if (!workspaceDir) { continue; }
      const normalized = path.resolve(workspaceDir).toLowerCase();
      if (seenWorkspaceDirs.has(normalized)) { continue; }
      seenWorkspaceDirs.add(normalized);
      targets.push({
        kind: "agent",
        id: agentId,
        label: agentId,
        workspaceDir,
      });
    }
  } catch {
    // loadConfig 失败时跳过
  }

  // 2. 枚举所有群组工作空间
  try {
    const allGroups = groupWorkspaceManager.getAllWorkspaces();
    for (const group of allGroups) {
      if (!group.dir) { continue; }
      const normalized = path.resolve(group.dir).toLowerCase();
      if (seenWorkspaceDirs.has(normalized)) { continue; }
      seenWorkspaceDirs.add(normalized);
      const target: DreamTarget = {
        kind: "group",
        id: group.groupId,
        label: group.groupName || group.groupId,
        workspaceDir: group.dir,
      };
      if ((group as { projectId?: string }).projectId) {
        (target as { projectId?: string }).projectId = (group as { projectId?: string }).projectId;
      }
      targets.push(target);
    }
  } catch {
    // groupWorkspaceManager 访问失败时跳过
  }

  return targets;
}

export const doctorOverrideHandlers: GatewayRequestHandlers = {
  /**
   * 覆盖上游 doctor.memory.dreamDiary：
   * - 接受可选参数 `agentId` 或 `groupId`
   * - agentId：读取指定 agent 的工作空间梦境日记
   * - groupId：读取指定群组工作空间的梦境日记
   * - 若均未提供，回退到默认 agent（保持与上游兼容）
   */
  "doctor.memory.dreamDiary": async ({ respond, params }) => {
    const cfg = loadConfig();
    const p = params && typeof params === "object" ? (params) : {};

    const requestedGroupId =
      typeof p.groupId === "string" ? p.groupId.trim() : null;

    if (requestedGroupId && requestedGroupId.length > 0) {
      // 读取群组工作空间的梦境日记
      const workspaceDir = groupWorkspaceManager.getGroupWorkspaceDir(requestedGroupId);
      const dreamDiary = await readDreamDiary(workspaceDir);
      const payload = {
        agentId: `group:${requestedGroupId}`,
        groupId: requestedGroupId,
        ...dreamDiary,
      };
      respond(true, payload, undefined);
      return;
    }

    const requestedAgentId =
      typeof p.agentId === "string" ? p.agentId.trim() : null;

    const agentId =
      requestedAgentId && requestedAgentId.length > 0
        ? requestedAgentId
        : resolveDefaultAgentId(cfg);

    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const dreamDiary = await readDreamDiary(workspaceDir);
    const payload: DoctorMemoryDreamDiaryPayload = {
      agentId,
      ...dreamDiary,
    };
    respond(true, payload, undefined);
  },

  /**
   * 新增接口：doctor.memory.dreamTargets
   * 返回系统中所有可做梦的目标列表（agents + groups）
   * 前端用于渲染「选择梦境来源」下拉框
   */
  "doctor.memory.dreamTargets": async ({ respond }) => {
    const targets = resolveDreamTargets();
    let defaultTargetId = "";
    try {
      const cfg = loadConfig();
      defaultTargetId = resolveDefaultAgentId(cfg);
    } catch {
      defaultTargetId = targets[0]?.id ?? "";
    }
    const payload: DoctorMemoryDreamTargetsPayload = {
      targets,
      defaultTargetId,
    };
    respond(true, payload, undefined);
  },
};
