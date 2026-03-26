/**
 * 任务系统权限辅助函数
 *
 * 提供简化的权限检查接口，用于任务和会议的访问控制
 */

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 检查用户是否有权限访问任务
 *
 * 权限规则：
 * - 创建者总是有权限
 * - 任务执行者（assignees）有权限
 * - 任务监管者（supervisorId）有权限
 * - 所属组织/团队/项目的管理员有权限
 *
 * TODO: 集成Phase 3权限系统
 */
export function checkTaskAccess(
  taskCreatorId: string,
  taskAssigneeIds: string[],
  taskOrgId: string | undefined,
  taskTeamId: string | undefined,
  userId: string,
  _userOrgId?: string,
  _userTeamId?: string,
  taskSupervisorId?: string,
): PermissionCheckResult {
  // 创建者有权限
  if (taskCreatorId === userId) {
    return { allowed: true };
  }

  // 执行者有权限
  if (taskAssigneeIds.includes(userId)) {
    return { allowed: true };
  }

  // 监管者有权限
  if (taskSupervisorId && taskSupervisorId === userId) {
    return { allowed: true };
  }

  // TODO: 检查组织/团队管理员权限
  // TODO: 集成 Phase 3 权限系统

  return {
    allowed: false,
    reason: "User is not the task creator or assignee",
  };
}

/**
 * 检查用户是否有权限修改任务
 *
 * 权限规则：
 * - 创建者可以修改
 * - owner角色的执行者可以修改
 * - 管理员可以修改
 */
export function checkTaskModifyAccess(
  taskCreatorId: string,
  taskOwnerIds: string[],
  taskOrgId: string | undefined,
  taskTeamId: string | undefined,
  userId: string,
  _userOrgId?: string,
  _userTeamId?: string,
): PermissionCheckResult {
  // 创建者有权限
  if (taskCreatorId === userId) {
    return { allowed: true };
  }

  // owner角色有权限
  if (taskOwnerIds.includes(userId)) {
    return { allowed: true };
  }

  // TODO: 检查管理员权限

  return {
    allowed: false,
    reason: "User is not authorized to modify this task",
  };
}

/**
 * 检查用户是否有权限删除任务
 *
 * 权限规则：
 * - 只有创建者可以删除
 * - 管理员可以删除
 */
export function checkTaskDeleteAccess(
  taskCreatorId: string,
  taskOrgId: string | undefined,
  taskTeamId: string | undefined,
  userId: string,
  _userOrgId?: string,
  _userTeamId?: string,
): PermissionCheckResult {
  // 创建者有权限
  if (taskCreatorId === userId) {
    return { allowed: true };
  }

  // TODO: 检查管理员权限

  return {
    allowed: false,
    reason: "Only task creator or administrators can delete tasks",
  };
}

/**
 * 检查用户是否有权限访问会议
 *
 * 权限规则：
 * - 组织者有权限
 * - 参会者有权限
 * - 所属组织/团队/项目的成员有权限
 */
export function checkMeetingAccess(
  meetingOrganizerId: string,
  meetingParticipantIds: string[],
  meetingOrgId: string | undefined,
  meetingTeamId: string | undefined,
  userId: string,
  _userOrgId?: string,
  _userTeamId?: string,
): PermissionCheckResult {
  // 组织者有权限
  if (meetingOrganizerId === userId) {
    return { allowed: true };
  }

  // 参会者有权限
  if (meetingParticipantIds.includes(userId)) {
    return { allowed: true };
  }

  // TODO: 检查组织/团队成员权限

  return {
    allowed: false,
    reason: "User is not the meeting organizer or participant",
  };
}

/**
 * 检查用户是否有权限修改会议
 *
 * 权限规则：
 * - 只有组织者可以修改
 * - 管理员可以修改
 */
export function checkMeetingModifyAccess(
  meetingOrganizerId: string,
  meetingOrgId: string | undefined,
  meetingTeamId: string | undefined,
  userId: string,
  _userOrgId?: string,
  _userTeamId?: string,
): PermissionCheckResult {
  // 组织者有权限
  if (meetingOrganizerId === userId) {
    return { allowed: true };
  }

  // TODO: 检查管理员权限

  return {
    allowed: false,
    reason: "Only meeting organizer or administrators can modify meetings",
  };
}
