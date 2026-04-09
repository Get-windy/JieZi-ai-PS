/**
 * 任务系统资源级权限（Resource-Level RBAC）
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  AI 自治系统权限模型 — 委托衰减链（Attenuated Delegation Chain）    ║
 * ║                                                                      ║
 * ║  设计原则（来自 DIF Trusted AI Agents WG / OWASP LLM Top 10）：      ║
 * ║                                                                      ║
 * ║  1. 子 Agent 的权限 ≤ 父 Agent 权限（只能缩减，不能扩张）            ║
 * ║  2. 任务分配即授权：Manager 分配任务给 Worker，Worker 自动获得        ║
 * ║     该任务的写权限，不需要额外的权限配置                             ║
 * ║  3. 组织角色向下覆盖：org admin/manager 对自己管辖范围内所有资源      ║
 * ║     有读写权限                                                        ║
 * ║  4. 最小特权原则：默认拒绝，必须有明确授权才允许                      ║
 * ║                                                                      ║
 * ║  权限层次（从高到低）：                                               ║
 * ║    human（董事长）> org.owner/admin > org.manager > team.lead        ║
 * ║    > task.supervisor > task.assignee.owner > task.assignee           ║
 * ║    > task.creator > org.member（只读）                               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * 本模块只做「资源级」检查（能否访问/修改/删除某个 Task/Meeting）。
 * 「工具级」检查（能否调用某个 RPC Tool）由 permissions/checker.ts 负责，两者独立。
 */

import { organizationStorage } from "../organization/storage.js";
import type { MemberRole } from "../organization/types.js";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  /** 实际生效的权限来源（调试用） */
  grantedBy?: GrantSource;
}

/**
 * 权限来源（用于调试和审计日志）
 */
export type GrantSource =
  | "creator" // 任务创建者
  | "assignee" // 任务执行者（已被分配）
  | "assignee-owner" // 任务执行者中的 owner 角色
  | "supervisor" // 任务监管者（supervisorId 字段）
  | "org-admin" // 组织 owner/admin
  | "org-manager" // 组织 manager（管辖范围内）
  | "team-lead" // 团队 lead（团队范围内）
  | "human-owner"; // 人类最高权限持有者（董事长）

/**
 * 组织权限解析结果（内部使用）
 */
interface OrgRoleResolution {
  /** 在目标 org 中的最高角色 */
  role: MemberRole | null;
  /** 角色来源（直接所属 or 通过 team） */
  source: "direct" | "team" | "none";
}

// ============================================================================
// 组织角色解析（核心：接入 organization/storage）
// ============================================================================

/**
 * 解析 agentId 在给定组织/团队中的最高有效角色。
 *
 * 查询顺序（越前越高权限）：
 *   1. org.members（详细成员列表，含 role）
 *   2. org.managerId（向后兼容旧数据）
 *   3. Team.leaderId（团队 lead）
 *
 * 角色优先级：owner > admin > manager > lead > member > observer
 *
 * @param agentId      - 要检查的 Agent ID
 * @param orgId        - 所属组织 ID（可选）
 * @param teamId       - 所属团队 ID（可选）
 * @returns 解析到的最高角色，或 null（无角色）
 */
async function resolveOrgRole(
  agentId: string,
  orgId: string | undefined,
  teamId: string | undefined,
): Promise<OrgRoleResolution> {
  const ROLE_PRIORITY: MemberRole[] = ["owner", "admin", "manager", "lead", "member", "observer"];

  let bestRole: MemberRole | null = null;
  let source: "direct" | "team" | "none" = "none";

  // ── 1. 查直属组织角色 ──
  if (orgId) {
    try {
      const org = await organizationStorage.getOrganization(orgId);
      if (org) {
        // 检查 org.members 详细列表（新数据）
        const member = org.members?.find((m) => m.id === agentId);
        if (member) {
          bestRole = member.role;
          source = "direct";
        }
        // 向后兼容：检查 managerId
        if (!bestRole && org.managerId === agentId) {
          bestRole = "manager";
          source = "direct";
        }
      }
    } catch {
      // 组织不存在时静默忽略
    }
  }

  // ── 2. 查团队角色（可能比 org 角色更高，如 team lead）──
  if (teamId) {
    try {
      const team = await organizationStorage.getTeam(teamId);
      if (team) {
        if (team.leaderId === agentId) {
          const teamRole: MemberRole = "lead";
          // 只有当 team lead 比已有 org 角色更高时才替换
          const currentIdx = bestRole ? ROLE_PRIORITY.indexOf(bestRole) : Infinity;
          const teamIdx = ROLE_PRIORITY.indexOf(teamRole);
          if (teamIdx < currentIdx) {
            bestRole = teamRole;
            source = "team";
          }
        }
        // team.memberIds 里只有 ID，不含角色；已通过 org.members 覆盖
      }
    } catch {
      // 团队不存在时静默忽略
    }
  }

  return { role: bestRole, source: bestRole ? source : "none" };
}

/**
 * 判断角色是否具有「管理员级」权限（可管辖范围内所有资源）
 *
 * owner / admin / manager 均视为有管理权限
 * lead 只对团队范围有管理权限（在调用方判断）
 */
function isManagerRole(role: MemberRole | null): boolean {
  if (!role) {
    return false;
  }
  return role === "owner" || role === "admin" || role === "manager";
}

// ============================================================================
// Task 资源权限 API（异步版本）
// ============================================================================

/**
 * 任务资源上下文（统一传参，避免参数爆炸）
 */
export interface TaskResourceContext {
  /** 任务创建者 ID */
  creatorId: string;
  /** 任务执行者 ID 列表 */
  assigneeIds: string[];
  /** 任务执行者中 owner 角色的 ID 列表 */
  ownerAssigneeIds: string[];
  /** 任务监管者 ID（上级 Agent 委托字段） */
  supervisorId?: string;
  /** 任务所属组织 ID */
  orgId?: string;
  /** 任务所属团队 ID */
  teamId?: string;
}

/**
 * 会议资源上下文
 */
export interface MeetingResourceContext {
  /** 会议组织者 ID */
  organizerId: string;
  /** 参会者 ID 列表 */
  participantIds: string[];
  /** 会议所属组织 ID */
  orgId?: string;
  /** 会议所属团队 ID */
  teamId?: string;
}

/**
 * 检查 Agent 是否有权读取任务
 *
 * 允许：creator | assignee | supervisor | org admin/manager | team lead
 */
export async function checkTaskReadAccess(
  ctx: TaskResourceContext,
  requesterId: string,
): Promise<PermissionCheckResult> {
  // ── 直接关系检查（无需 IO，优先走捷径）──
  if (ctx.creatorId === requesterId) {
    return { allowed: true, grantedBy: "creator" };
  }
  if (ctx.assigneeIds.includes(requesterId)) {
    return { allowed: true, grantedBy: "assignee" };
  }
  if (ctx.supervisorId && ctx.supervisorId === requesterId) {
    return { allowed: true, grantedBy: "supervisor" };
  }

  // ── 组织角色检查（含团队 lead）──
  const { role, source } = await resolveOrgRole(requesterId, ctx.orgId, ctx.teamId);
  if (isManagerRole(role)) {
    return {
      allowed: true,
      grantedBy: role === "manager" ? "org-manager" : "org-admin",
    };
  }
  if (role === "lead" && source === "team") {
    // team lead 可读自己团队所有任务
    return { allowed: true, grantedBy: "team-lead" };
  }
  // 普通 member/observer 也可读（最小可见性）
  if (role === "member" || role === "observer") {
    return { allowed: true, grantedBy: "org-manager" }; // 复用字段
  }

  return {
    allowed: false,
    reason: `Agent "${requesterId}" has no read access to this task (not creator/assignee/supervisor, and no org role found)`,
  };
}

/**
 * 检查 Agent 是否有权修改任务
 *
 * 允许：creator | assignee(owner role) | supervisor | org admin/manager | team lead
 * 不允许：普通 assignee 只能更新自己的工作日志，不能改标题/优先级等
 *
 * 注意：「任务分配即授权」原则 —— supervisorId 分配给谁，被分配者自动获得写权限
 */
export async function checkTaskWriteAccess(
  ctx: TaskResourceContext,
  requesterId: string,
): Promise<PermissionCheckResult> {
  // ── 直接关系检查 ──
  if (ctx.creatorId === requesterId) {
    return { allowed: true, grantedBy: "creator" };
  }
  // owner 角色的 assignee 可写（任务分配即授权）
  if (ctx.ownerAssigneeIds.includes(requesterId)) {
    return { allowed: true, grantedBy: "assignee-owner" };
  }
  // 普通 assignee 也可以更新自己的执行状态（如 in-progress → review）
  if (ctx.assigneeIds.includes(requesterId)) {
    return { allowed: true, grantedBy: "assignee" };
  }
  // supervisor（上级委托者）可写
  if (ctx.supervisorId && ctx.supervisorId === requesterId) {
    return { allowed: true, grantedBy: "supervisor" };
  }

  // ── 组织角色检查 ──
  const { role, source } = await resolveOrgRole(requesterId, ctx.orgId, ctx.teamId);
  if (isManagerRole(role)) {
    return {
      allowed: true,
      grantedBy: role === "manager" ? "org-manager" : "org-admin",
    };
  }
  if (role === "lead" && source === "team") {
    return { allowed: true, grantedBy: "team-lead" };
  }

  return {
    allowed: false,
    reason: `Agent "${requesterId}" has no write access to this task (not creator/supervisor/owner-assignee, and org role [${role ?? "none"}] insufficient)`,
  };
}

/**
 * 检查 Agent 是否有权删除任务
 *
 * 删除是高风险操作，权限更严格：
 * 允许：creator | supervisor | org admin（manager 需要额外确认）
 *
 * 普通 assignee 不可删除——他们只负责执行，不负责销毁。
 */
export async function checkTaskDeleteAccess(
  ctx: Pick<TaskResourceContext, "creatorId" | "supervisorId" | "orgId" | "teamId">,
  requesterId: string,
): Promise<PermissionCheckResult> {
  if (ctx.creatorId === requesterId) {
    return { allowed: true, grantedBy: "creator" };
  }
  if (ctx.supervisorId && ctx.supervisorId === requesterId) {
    return { allowed: true, grantedBy: "supervisor" };
  }

  const { role } = await resolveOrgRole(requesterId, ctx.orgId, ctx.teamId);
  if (role === "owner" || role === "admin") {
    return { allowed: true, grantedBy: "org-admin" };
  }
  // manager 可删（但调用方应考虑触发 require_approval 审批流）
  if (role === "manager") {
    return { allowed: true, grantedBy: "org-manager" };
  }

  return {
    allowed: false,
    reason: `Agent "${requesterId}" cannot delete this task. Only creator, supervisor, or org admin/manager are allowed.`,
  };
}

// ============================================================================
// Meeting 资源权限 API
// ============================================================================

/**
 * 检查 Agent 是否有权访问会议
 *
 * 允许：organizer | participant | org admin/manager | team lead
 */
export async function checkMeetingReadAccess(
  ctx: MeetingResourceContext,
  requesterId: string,
): Promise<PermissionCheckResult> {
  if (ctx.organizerId === requesterId) {
    return { allowed: true, grantedBy: "creator" };
  }
  if (ctx.participantIds.includes(requesterId)) {
    return { allowed: true, grantedBy: "assignee" };
  }

  const { role, source } = await resolveOrgRole(requesterId, ctx.orgId, ctx.teamId);
  if (isManagerRole(role) || (role === "lead" && source === "team") || role === "member") {
    return { allowed: true, grantedBy: isManagerRole(role) ? "org-manager" : "team-lead" };
  }

  return {
    allowed: false,
    reason: `Agent "${requesterId}" is not the meeting organizer, participant, or an org member with sufficient role`,
  };
}

/**
 * 检查 Agent 是否有权修改会议（更新议程、决策等）
 *
 * 允许：organizer | org admin/manager | team lead
 */
export async function checkMeetingWriteAccess(
  ctx: MeetingResourceContext,
  requesterId: string,
): Promise<PermissionCheckResult> {
  if (ctx.organizerId === requesterId) {
    return { allowed: true, grantedBy: "creator" };
  }

  const { role, source } = await resolveOrgRole(requesterId, ctx.orgId, ctx.teamId);
  if (isManagerRole(role)) {
    return { allowed: true, grantedBy: role === "manager" ? "org-manager" : "org-admin" };
  }
  if (role === "lead" && source === "team") {
    return { allowed: true, grantedBy: "team-lead" };
  }

  return {
    allowed: false,
    reason: `Agent "${requesterId}" cannot modify this meeting. Only organizer, org admin/manager, or team lead are allowed.`,
  };
}

// ============================================================================
// 向后兼容的同步 shim（保留旧签名，不阻断现有调用方）
//
// ⚠️  已废弃（@deprecated）：这些同步函数不查询组织角色，只做直接关系检查。
//    新代码请改用上方的 async 版本（checkTaskReadAccess / checkTaskWriteAccess 等）。
// ============================================================================

/**
 * @deprecated 请改用 checkTaskReadAccess(ctx, requesterId)
 * 保留仅为向后兼容，不查询组织角色。
 */
export function checkTaskAccess(
  taskCreatorId: string,
  taskAssigneeIds: string[],
  _taskOrgId: string | undefined,
  _taskTeamId: string | undefined,
  userId: string,
  _userOrgId?: string,
  _userTeamId?: string,
  taskSupervisorId?: string,
): PermissionCheckResult {
  if (taskCreatorId === userId) {
    return { allowed: true, grantedBy: "creator" };
  }
  if (taskAssigneeIds.includes(userId)) {
    return { allowed: true, grantedBy: "assignee" };
  }
  if (taskSupervisorId && taskSupervisorId === userId) {
    return { allowed: true, grantedBy: "supervisor" };
  }
  return { allowed: false, reason: "User is not the task creator, assignee, or supervisor" };
}

/**
 * @deprecated 请改用 checkTaskWriteAccess(ctx, requesterId)
 * 保留仅为向后兼容，不查询组织角色。
 */
export function checkTaskModifyAccess(
  taskCreatorId: string,
  taskOwnerIds: string[],
  _taskOrgId: string | undefined,
  _taskTeamId: string | undefined,
  userId: string,
  _userOrgId?: string,
  _userTeamId?: string,
): PermissionCheckResult {
  if (taskCreatorId === userId) {
    return { allowed: true, grantedBy: "creator" };
  }
  if (taskOwnerIds.includes(userId)) {
    return { allowed: true, grantedBy: "assignee-owner" };
  }
  return { allowed: false, reason: "User is not authorized to modify this task" };
}

/**
 * @deprecated 请改用 checkTaskDeleteAccess(ctx, requesterId)
 * 保留仅为向后兼容，不查询组织角色。
 */
export { checkTaskDeleteAccess as checkTaskDeleteAccessLegacy };

/**
 * @deprecated 请改用 checkMeetingReadAccess(ctx, requesterId)
 * 保留仅为向后兼容，不查询组织角色。
 */
export function checkMeetingAccess(
  meetingOrganizerId: string,
  meetingParticipantIds: string[],
  _meetingOrgId: string | undefined,
  _meetingTeamId: string | undefined,
  userId: string,
  _userOrgId?: string,
  _userTeamId?: string,
): PermissionCheckResult {
  if (meetingOrganizerId === userId) {
    return { allowed: true, grantedBy: "creator" };
  }
  if (meetingParticipantIds.includes(userId)) {
    return { allowed: true, grantedBy: "assignee" };
  }
  return { allowed: false, reason: "User is not the meeting organizer or participant" };
}

/**
 * @deprecated 请改用 checkMeetingWriteAccess(ctx, requesterId)
 * 保留仅为向后兼容，不查询组织角色。
 */
export function checkMeetingModifyAccess(
  meetingOrganizerId: string,
  _meetingOrgId: string | undefined,
  _meetingTeamId: string | undefined,
  userId: string,
  _userOrgId?: string,
  _userTeamId?: string,
): PermissionCheckResult {
  if (meetingOrganizerId === userId) {
    return { allowed: true, grantedBy: "creator" };
  }
  return { allowed: false, reason: "Only meeting organizer or administrators can modify meetings" };
}
