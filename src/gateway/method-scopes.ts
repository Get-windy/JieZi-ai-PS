export const ADMIN_SCOPE = "operator.admin" as const;
export const READ_SCOPE = "operator.read" as const;
export const WRITE_SCOPE = "operator.write" as const;
export const APPROVALS_SCOPE = "operator.approvals" as const;
export const PAIRING_SCOPE = "operator.pairing" as const;

export type OperatorScope =
  | typeof ADMIN_SCOPE
  | typeof READ_SCOPE
  | typeof WRITE_SCOPE
  | typeof APPROVALS_SCOPE
  | typeof PAIRING_SCOPE;

export const CLI_DEFAULT_OPERATOR_SCOPES: OperatorScope[] = [
  ADMIN_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  APPROVALS_SCOPE,
  PAIRING_SCOPE,
];

const NODE_ROLE_METHODS = new Set([
  "node.invoke.result",
  "node.event",
  "node.canvas.capability.refresh",
  "node.pending.pull",
  "node.pending.ack",
  "skills.bins",
]);

const METHOD_SCOPE_GROUPS: Record<OperatorScope, readonly string[]> = {
  [APPROVALS_SCOPE]: [
    "exec.approval.request",
    "exec.approval.waitDecision",
    "exec.approval.resolve",
    // 审批流程（Gateway RPC）
    "approval.create",
    "approval.approve",
    "approval.reject",
    "approval.cancel",
    "approval.get_status",
    "approval.list_pending",
  ],
  [PAIRING_SCOPE]: [
    "node.pair.request",
    "node.pair.list",
    "node.pair.approve",
    "node.pair.reject",
    "node.pair.verify",
    "device.pair.list",
    "device.pair.approve",
    "device.pair.reject",
    "device.pair.remove",
    "device.token.rotate",
    "device.token.revoke",
    "node.rename",
  ],
  [READ_SCOPE]: [
    "health",
    "doctor.memory.status",
    "logs.tail",
    "channels.status",
    "status",
    "usage.status",
    "usage.cost",
    "tts.status",
    "tts.providers",
    "models.list",
    "tools.catalog",
    "agents.list",
    "agent.identity.get",
    "agent.status",
    "agent.capabilities",
    "agent.discover",
    "agent.inspect",
    "skills.status",
    "voicewake.get",
    "sessions.list",
    "sessions.get",
    "sessions.preview",
    "sessions.resolve",
    "sessions.usage",
    "sessions.usage.timeseries",
    "sessions.usage.logs",
    "cron.list",
    "cron.status",
    "cron.runs",
    "system-presence",
    "last-heartbeat",
    "node.list",
    "node.describe",
    "chat.history",
    "config.get",
    "config.schema.lookup",
    "talk.config",
    "agents.files.list",
    "agents.files.get",
    // 权限管理：查询类
    "permission_mgmt.check",
    "permission_mgmt.list",
    // 组织架构：查询类
    "org_structure.get_department",
    "org_structure.get_team",
    "org_structure.list_departments",
    "org_structure.list_teams",
    "org_structure.get_relationship",
    // 培训：查询类
    "training.get_record",
    "training.list_records",
    "training.get_course",
    "training.list_courses",
    // HR：查询类
    "hr_mgmt.get_status",
    // 群组：查询类
    "groups.list",
    "groups.get",
    // 群组聊天：查询
    "groups.chat.history",
    // 群组工作空间：查询
    "groups.workspace.getDir",
    // 工作空间管理：查询
    "agent.workspace.getDefault",
    // 群组文件：查询
    "groups.files.list",
    "groups.files.get",
    // 记忆块：查询
    "memory.list",
    "memory.namespace.stats",
    // 自我进化：查询类
    "evolve.reflect.list",
    "evolve.skill.list",
    "evolve.stats",
    // Scenarios 场景：查询类
    "scenarios.list",
    "scenarios.get",
    "scenarios.runs",
    "scenarios.recommendations",
    // Monitor 监控：查询类
    "monitor.sessions",
    "monitor.messageFlows",
    "monitor.forwardingRules",
    "monitor.performanceMetrics",
    "monitor.alerts",
    "monitor.healthCheck",
    "monitor.metrics.query",
    // 任务：查询类
    "task.list",
    "task.get",
    // 团队监控：查询类（只读，不修改任何数据）
    "agent.team.status",
    // 组织：查询类（补充缺失）
    "organization.list",
    "organization.data.get",
    "organization.tree.get",
    "org.hierarchy.isAncestor",
    "org.hierarchy.isSibling",
    "org.hierarchy.commonAncestor",
    "org.hierarchy.depth",
    "org.hierarchy.tree",
    "org.hierarchy.path",
    "org.hierarchy.allMembers",
    "org.hierarchy.isMember",
    "org.hierarchy.agentOrganizations",
    "org.hierarchy.primaryOrganization",
    "org.hierarchy.totalQuota",
    "org.hierarchy.statistics",
    "org.hierarchy.batchStatistics",
    "org.hierarchy.globalStatistics",
    // 审批：查询类（由 APPROVALS_SCOPE 覆盖，此处保留为兼容）
    // 好友：查询类
    "friends.list",
    // 项目管理：查询类
    "project.team.relations",
    "project.team.my-projects",
    // 组织：查询类（补充缺失）
    "org.list",
  ],
  [WRITE_SCOPE]: [
    "send",
    "poll",
    "agent",
    "agent.wait",
    "agent.create",
    "wake",
    "talk.mode",
    "tts.enable",
    "tts.disable",
    "tts.convert",
    "tts.setProvider",
    "voicewake.set",
    "node.invoke",
    "chat.send",
    "chat.abort",
    "browser.request",
    "push.test",
    // 群组工作空间：写操作
    "groups.workspace.setDir",
    "groups.workspace.migrate",
    // 工作空间管理：写操作
    "agent.workspace.setDefault",
    "workspace.backup",
    "workspace.migrate.all",
    "workspace.openFolder",
    // 群组文件：写操作
    "groups.files.set",
    "groups.files.delete",
    // 群组：写操作
    "groups.create",
    "groups.update",
    "groups.delete",
    "groups.add_member",
    "groups.addMember",
    "groups.remove_member",
    "groups.removeMember",
    // 群组升级为项目群
    "groups.upgradeToProject",
    // 群组聊天：写操作
    "groups.chat.send",
    // 记忆块：写操作
    "memory.save",
    "memory.delete",
    // 自我进化：写操作
    "evolve.reflect.save",
    "evolve.skill.save",
    "evolve.skill.use",
    // Scenarios 场景：写操作
    "scenarios.create",
    "scenarios.update",
    "scenarios.delete",
    "scenarios.run",
    // Monitor 监控：写操作
    "monitor.addForwardingRule",
    "monitor.updateForwardingRule",
    "monitor.deleteForwardingRule",
    "monitor.acknowledgeAlert",
    "monitor.metrics.record",
    "monitor.sessions.update",
    // 任务：写操作（基础 + 扩展）
    "task.create",
    "task.update",
    "task.delete",
    "task.assign",
    "task.complete",
    "task.status.update",
    "task.comment.add",
    "task.attachment.add",
    "task.worklog.add",
    "task.subtask.create",
    "task.dependency.add",
    "task.block",
    "permission_mgmt.grant",
    "permission_mgmt.revoke",
    "permission_mgmt.delegate",
    "permission.grant",
    "permission.revoke",
    "permission.list",
    // 组织架构：写操作
    "org_structure.create_department",
    "org_structure.update_department",
    "org_structure.create_team",
    "org_structure.update_team",
    "org_structure.set_relationship",
    "org.department.create",
    "org.team.create",
    "org.assign_to_department",
    "org.assign_to_team",
    "org.set_reporting_line",
    "org.member.remove",
    // 权限更新
    "permission.update",
    "permission.set",
    "permission.init",
    "permission.role.assign",
    "permission.role.remove",
    // 培训：写操作
    "training.create_course",
    "training.update_course",
    "training.enroll",
    "training.complete",
    "training.certify_trainer",
    // HR：写操作
    "hr_mgmt.deactivate",
    "hr_mgmt.activate",
    "hr_mgmt.offboard",
    "hr_mgmt.create_requisition",
    "hr.deactivate_agent",
    "hr.activate_agent",
    "hr.configure_agent_role",
    "hr.assign_supervisor",
    "hr.assign_mentor",
    "hr.promote_agent",
    "hr.transfer_agent",
    // 好友：写操作
    "friends.add",
    "friends.remove",
    // 招募：写操作
    "organization.agent.recruit",
    "organization.agent.recruit.approve",
    "organization.agent.recruit.list",
    // 组织：写操作（补充缺失）
    "organization.create",
    "organization.update",
    "organization.delete",
    "organization.member.add",
    "organization.member.update",
    "organization.member.remove",
    "organization.relation.create",
    "organization.relation.delete",
    // 项目管理：写操作
    "projects.create",
    "projects.get",
    "projects.updateWorkspace",
    // 项目跨团队协作与交付：写操作
    "project.team.assign",
    "project.team.remove",
    "project.handoff",
    "project.team.status",
    // 任务：写操作（补充缺失部分已合并到上方，此处保留 agent 相关）
    // Agent 发现与通信
    "agent.assign_task",
    "agent.communicate",
    // Agent 任务汇报（写操作：更新任务状态、发送通知）
    "agent.task.report",
  ],
  [ADMIN_SCOPE]: [
    "channels.logout",
    "agents.create",
    "agents.update",
    "agents.delete",
    "skills.install",
    "skills.update",
    "secrets.reload",
    "secrets.resolve",
    "cron.add",
    "cron.update",
    "cron.remove",
    "cron.run",
    "sessions.patch",
    "sessions.reset",
    "sessions.delete",
    "sessions.compact",
    "connect",
    "chat.inject",
    "web.login.start",
    "web.login.wait",
    "set-heartbeats",
    "system-event",
    "agents.files.set",
    // 权限管理：仅管理员
    "permission_mgmt.audit",
    // 组织架构：仅管理员
    "org_structure.delete_department",
    "org_structure.delete_team",
    // 培训：仅管理员
    "training.delete_course",
    // Agent 生命周期：仅管理员
    "agent.spawn",
    "agent.start",
    "agent.stop",
    "agent.restart",
    "agent.configure",
    "agent.destroy",
    "agent.clone",
    "agent.update",
    "agent.delete",
  ],
};

const ADMIN_METHOD_PREFIXES = ["exec.approvals.", "config.", "wizard.", "update."] as const;

const METHOD_SCOPE_BY_NAME = new Map<string, OperatorScope>(
  Object.entries(METHOD_SCOPE_GROUPS).flatMap(([scope, methods]) =>
    methods.map((method) => [method, scope as OperatorScope]),
  ),
);

function resolveScopedMethod(method: string): OperatorScope | undefined {
  const explicitScope = METHOD_SCOPE_BY_NAME.get(method);
  if (explicitScope) {
    return explicitScope;
  }
  if (ADMIN_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix))) {
    return ADMIN_SCOPE;
  }
  return undefined;
}

export function isApprovalMethod(method: string): boolean {
  return resolveScopedMethod(method) === APPROVALS_SCOPE;
}

export function isPairingMethod(method: string): boolean {
  return resolveScopedMethod(method) === PAIRING_SCOPE;
}

export function isReadMethod(method: string): boolean {
  return resolveScopedMethod(method) === READ_SCOPE;
}

export function isWriteMethod(method: string): boolean {
  return resolveScopedMethod(method) === WRITE_SCOPE;
}

export function isNodeRoleMethod(method: string): boolean {
  return NODE_ROLE_METHODS.has(method);
}

export function isAdminOnlyMethod(method: string): boolean {
  return resolveScopedMethod(method) === ADMIN_SCOPE;
}

export function resolveRequiredOperatorScopeForMethod(method: string): OperatorScope | undefined {
  return resolveScopedMethod(method);
}

export function resolveLeastPrivilegeOperatorScopesForMethod(method: string): OperatorScope[] {
  const requiredScope = resolveRequiredOperatorScopeForMethod(method);
  if (requiredScope) {
    return [requiredScope];
  }
  // Default-deny for unclassified methods.
  return [];
}

export function authorizeOperatorScopesForMethod(
  method: string,
  scopes: readonly string[],
): { allowed: true } | { allowed: false; missingScope: OperatorScope } {
  if (scopes.includes(ADMIN_SCOPE)) {
    return { allowed: true };
  }
  const requiredScope = resolveRequiredOperatorScopeForMethod(method) ?? ADMIN_SCOPE;
  if (requiredScope === READ_SCOPE) {
    if (scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE)) {
      return { allowed: true };
    }
    return { allowed: false, missingScope: READ_SCOPE };
  }
  if (scopes.includes(requiredScope)) {
    return { allowed: true };
  }
  return { allowed: false, missingScope: requiredScope };
}

export function isGatewayMethodClassified(method: string): boolean {
  if (isNodeRoleMethod(method)) {
    return true;
  }
  return resolveRequiredOperatorScopeForMethod(method) !== undefined;
}
