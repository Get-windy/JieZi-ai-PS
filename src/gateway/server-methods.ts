import type { GatewayRequestHandlers, GatewayRequestOptions } from "./server-methods/types.js";
import { ErrorCodes, errorShape } from "./protocol/index.js";
import { agent2AgentHandlers } from "./server-methods/agent-to-agent.js";
import { agentHandlers } from "./server-methods/agent.js";
import { agentsManagementHandlers } from "./server-methods/agents-management.js";
import { agentsHandlers } from "./server-methods/agents.js";
import { assessmentHandlers } from "./server-methods/assessment-rpc.js";
import { browserHandlers } from "./server-methods/browser.js";
import { channelPoliciesHandlers } from "./server-methods/channel-policies.js";
import { channelsHandlers } from "./server-methods/channels.js";
import { chatHandlers } from "./server-methods/chat.js";
import { configHandlers } from "./server-methods/config.js";
import { connectHandlers } from "./server-methods/connect.js";
import { cronHandlers } from "./server-methods/cron.js";
import { dataScopeHandlers } from "./server-methods/data-scope-rpc.js";
import { deviceHandlers } from "./server-methods/devices.js";
import { execApprovalsHandlers } from "./server-methods/exec-approvals.js";
import { friendsHandlers } from "./server-methods/friends-rpc.js";
import { groupsHandlers } from "./server-methods/groups-rpc.js";
import { healthHandlers } from "./server-methods/health.js";
import { humanAuthHandlers } from "./server-methods/human-auth.js";
import { knowledgeSinkHandlers } from "./server-methods/knowledge-sink.js";
import { lifecycleHandlers } from "./server-methods/lifecycle-rpc.js";
import { logsHandlers } from "./server-methods/logs.js";
import { mentorshipHandlers } from "./server-methods/mentorship-rpc.js";
import { messageQueueHandlers } from "./server-methods/message-queue-rpc.js";
import { modelsHandlers } from "./server-methods/models.js";
import { monitorHandlers } from "./server-methods/monitor-rpc.js";
import { nodeHandlers } from "./server-methods/nodes.js";
import { organizationChartHandlers } from "./server-methods/organization-chart.js";
import { organizationHierarchyHandlers } from "./server-methods/organization-hierarchy-rpc.js";
import { permissionsManagementHandlers } from "./server-methods/permissions-management.js";
import { phase5RpcHandlers } from "./server-methods/phase5-rpc.js";
import { phase6IntegrationHandlers } from "./server-methods/phase6-integration-rpc.js";
import { phase7AdminHandlers } from "./server-methods/phase7-admin-rpc.js";
import { reportsHandlers } from "./server-methods/reports-rpc.js";
import { scenariosHandlers } from "./server-methods/scenarios-rpc.js";
import { sendHandlers } from "./server-methods/send.js";
import { sessionsHandlers } from "./server-methods/sessions.js";
import { skillManagementHandlers } from "./server-methods/skill-management-rpc.js";
import { skillsHandlers } from "./server-methods/skills.js";
import { storageHandlers } from "./server-methods/storage.js";
import { systemHandlers } from "./server-methods/system.js";
import { talkHandlers } from "./server-methods/talk.js";
import { trainingPlanHandlers } from "./server-methods/training-plan-rpc.js";
import { trainingMethods } from "./server-methods/training.js";
import { ttsHandlers } from "./server-methods/tts.js";
import { updateHandlers } from "./server-methods/update.js";
import { usageHandlers } from "./server-methods/usage.js";
import { voicewakeHandlers } from "./server-methods/voicewake.js";
import { webHandlers } from "./server-methods/web.js";
import { wizardHandlers } from "./server-methods/wizard.js";

const ADMIN_SCOPE = "operator.admin";
const READ_SCOPE = "operator.read";
const WRITE_SCOPE = "operator.write";
const APPROVALS_SCOPE = "operator.approvals";
const PAIRING_SCOPE = "operator.pairing";

const APPROVAL_METHODS = new Set(["exec.approval.request", "exec.approval.resolve"]);
const NODE_ROLE_METHODS = new Set(["node.invoke.result", "node.event", "skills.bins"]);
const PAIRING_METHODS = new Set([
  "node.pair.request",
  "node.pair.list",
  "node.pair.approve",
  "node.pair.reject",
  "node.pair.verify",
  "device.pair.list",
  "device.pair.approve",
  "device.pair.reject",
  "device.token.rotate",
  "device.token.revoke",
  "node.rename",
]);
const ADMIN_METHOD_PREFIXES = ["exec.approvals."];
const READ_METHODS = new Set([
  "health",
  "logs.tail",
  "channels.status",
  "status",
  "usage.status",
  "usage.cost",
  "tts.status",
  "tts.providers",
  "models.list",
  "agents.list",
  "agent.identity.get",
  "agent.modelAccounts.list",
  "agent.channelPolicies.list",
  "agent.modelAccounts.get",
  "agent.channelPolicies.get",
  "permissions.get",
  "approvals.list",
  "approvals.stats",
  "permissions.history",
  "messageQueue.status",
  "messageQueue.stats",
  "messageQueue.config.get",
  "permission.config.get",
  "approval.requests.list",
  "organization.data.get",
  "skills.status",
  "voicewake.get",
  "sessions.list",
  "sessions.preview",
  "cron.list",
  "cron.status",
  "cron.runs",
  "system-presence",
  "last-heartbeat",
  "node.list",
  "node.describe",
  "chat.history",
  "storage.listDrives",
  "storage.listDirectories",
  "storage.validatePath",
  "storage.getCurrentPath",
  // Groups - Read
  "groups.list",
  "groups.get",
  "groups.members",
  "groups.friends",
  // Friends - Read
  "friends.list",
  "friends.requests",
  "friends.messages",
  // Monitor - Read
  "monitor.sessions",
  "monitor.messageFlows",
  "monitor.forwardingRules",
  "monitor.metrics",
  "monitor.alerts",
  "monitor.realtime",
  "monitor.sessionDetail",
  "monitor.agentStats",
  "monitor.channelStats",
  "monitor.healthStatus",
  // Scenarios - Read
  "scenarios.list",
  "scenarios.get",
  "scenarios.runs",
  "scenarios.recommendations",
  // Training - Read
  "training.courses.list",
  "training.progresses.list",
  "training.certificates.list",
  "training.course.get",
  "training.stats",
  // Assessment - Read
  "assessment.get",
  "assessment.agent.list",
  "assessment.agent.valid",
  "assessment.agent.latest",
  "assessment.trend",
  "assessment.statistics",
  "assessment.list",
  // Training Plan - Read
  "trainingPlan.get",
  "trainingPlan.agent.list",
  "trainingPlan.progress",
  "trainingPlan.list",
  // Channel Policies - Read
  "channel.policy.get",
  "channel.policy.list",
  "channel.policy.status",
  // Agent2Agent - Read
  "agent2agent.getHistory",
  "agent2agent.getStatistics",
  // Knowledge Sink - Read
  "knowledge.get",
  "knowledge.list",
  "knowledge.statistics",
  // Human Auth - Read
  "humanAuth.validateSession",
  "humanAuth.getCurrentUser",
  "humanAuth.listUsers",
  // Data Scope - Read
  "dataScope.rules.list",
  "dataScope.rules.get",
  "dataScope.check",
  "dataScope.statistics",
  // Mentorship - Read
  "mentorship.get",
  "mentorship.list",
  "mentorship.statistics",
  "mentorship.skills.search",
  "mentorship.apprentices",
  "mentorship.mentors",
  // Lifecycle - Read
  "lifecycle.getState",
  "lifecycle.getHistory",
  "lifecycle.getStatistics",
  "lifecycle.batchGetStates",
  "lifecycle.getConfig",
  // Skill Management - Read
  "skills.definition.get",
  "skills.definition.list",
  "skills.agent.get",
  "skills.agent.list",
  "skills.statistics",
  // Phase 6 Integration - Read
  "phase6.status",
  "phase6.healthCheck",
  "phase6.training.getStats",
  // Phase 7 Admin - Read
  "phase7.status",
  "phase7.healthCheck",
  "admin.list",
  "admin.get",
  "admin.permissions.get",
  "admin.operations.history",
  "approval.requests.list",
  "approval.request.get",
  "approval.pending.list",
  "approval.statistics",
  "approval.policy.list",
  "notification.list",
  "notification.unreadCount",
  "notification.statistics",
  // Organization Hierarchy - Read
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
  // Reports - Read
  "reports.templates",
  "reports.history",
]);
const WRITE_METHODS = new Set([
  "send",
  "agent",
  "agent.wait",
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
  "agent.modelAccounts.update",
  "agent.channelPolicies.update",
  "approvals.respond",
  "approvals.cancel",
  "approvals.batch-approve",
  "approvals.batch-deny",
  "messageQueue.config.update",
  "messageQueue.clear",
  // Groups - Write
  "groups.addMember",
  "groups.removeMember",
  "groups.updateMemberRole",
  "groups.muteMember",
  "groups.addFriend",
  "groups.confirmFriend",
  "groups.removeFriend",
  // Friends - Write
  "friends.add",
  "friends.confirm",
  "friends.remove",
  "friends.sendMessage",
  // Monitor - Write
  "monitor.addForwardingRule",
  "monitor.updateForwardingRule",
  "monitor.deleteForwardingRule",
  "monitor.acknowledgeAlert",
  "monitor.clearAlerts",
  "monitor.recordMetric",
  // Scenarios - Write
  "scenarios.create",
  "scenarios.update",
  "scenarios.delete",
  "scenarios.run",
  // Training - Write
  "training.course.start",
  "training.module.complete",
  "training.course.complete",
  // Assessment - Write
  "assessment.skill.create",
  "assessment.performance.create",
  "assessment.360feedback.create",
  "assessment.self.create",
  "assessment.knowledge.create",
  "assessment.compare",
  "assessment.delete",
  // Training Plan - Write
  "trainingPlan.create",
  "trainingPlan.update",
  "trainingPlan.delete",
  "trainingPlan.activate",
  "trainingPlan.cancel",
  "trainingPlan.addCourse",
  "trainingPlan.removeCourse",
  "trainingPlan.recommend",
  // Data Scope - Write
  "dataScope.rules.create",
  "dataScope.rules.update",
  "dataScope.rules.delete",
  "dataScope.rules.batchToggle",
  // Mentorship - Write
  "mentorship.create",
  "mentorship.addSession",
  "mentorship.addFeedback",
  "mentorship.updateStatus",
  "mentorship.complete",
  "mentorship.skills.add",
  // Lifecycle - Write
  "lifecycle.initialize",
  "lifecycle.transitionStage",
  "lifecycle.recordEvent",
  "lifecycle.suspend",
  "lifecycle.reactivate",
  "lifecycle.setConfig",
  // Skill Management - Write
  "skills.definition.add",
  "skills.definition.update",
  "skills.definition.delete",
  "skills.agent.grant",
  "skills.agent.levelUp",
  "skills.agent.certify",
  "skills.agent.assess",
  "skills.agent.recordUsage",
  // Phase 6 Integration - Write
  "phase6.initialize",
  "phase6.workflow.onboarding",
  "phase6.workflow.promotion",
  "phase6.agent.create",
  "phase6.agent.activate",
  "phase6.agent.startTraining",
  "phase6.training.assignCourse",
  "phase6.training.completeCourse",
  "phase6.skills.addToAgent",
  "phase6.skills.upgrade",
  "phase6.skills.analyzeGap",
  "training.exercise.submit",
  // Phase 7 Admin - Write
  "phase7.initialize",
  "admin.login",
  "admin.logout",
  "admin.verifyMfa",
  "approval.request.create",
  "approval.request.process",
  "approval.request.cancel",
  "emergency.request.create",
  "emergency.request.grant",
  "emergency.request.deny",
  "emergency.request.revoke",
  "notification.markRead",
  "notification.markAllRead",
  // Channel Policies - Write
  "channel.policy.set",
  "channel.policy.test",
  // Agent2Agent - Write
  "agent2agent.send",
  "agent2agent.allowPair",
  "agent2agent.setForwardPolicy",
  "agent2agent.clearHistory",
  // Knowledge Sink - Write
  "knowledge.recordMessage",
  "knowledge.endSession",
  "knowledge.generateMeetingNotes",
  "knowledge.generateADR",
  "knowledge.addTrigger",
  // Human Auth - Write
  "humanAuth.register",
  "humanAuth.login",
  "humanAuth.logout",
  "humanAuth.verifyMFA",
  "humanAuth.enableMFA",
  "humanAuth.disableMFA",
  "humanAuth.updateUser",
  "humanAuth.changePassword",
  // Reports - Write
  "reports.generate.organization",
  "reports.generate.lifecycle",
  "reports.generate.training",
  "reports.generate.skills",
  "reports.generate.comprehensive",
  "reports.export",
]);

function authorizeGatewayMethod(method: string, client: GatewayRequestOptions["client"]) {
  if (!client?.connect) {
    return null;
  }
  const role = client.connect.role ?? "operator";
  const scopes = client.connect.scopes ?? [];
  if (NODE_ROLE_METHODS.has(method)) {
    if (role === "node") {
      return null;
    }
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (role === "node") {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (role !== "operator") {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (scopes.includes(ADMIN_SCOPE)) {
    return null;
  }
  if (APPROVAL_METHODS.has(method) && !scopes.includes(APPROVALS_SCOPE)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.approvals");
  }
  if (PAIRING_METHODS.has(method) && !scopes.includes(PAIRING_SCOPE)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.pairing");
  }
  if (READ_METHODS.has(method) && !(scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE))) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.read");
  }
  if (WRITE_METHODS.has(method) && !scopes.includes(WRITE_SCOPE)) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.write");
  }
  if (APPROVAL_METHODS.has(method)) {
    return null;
  }
  if (PAIRING_METHODS.has(method)) {
    return null;
  }
  if (READ_METHODS.has(method)) {
    return null;
  }
  if (WRITE_METHODS.has(method)) {
    return null;
  }
  if (ADMIN_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix))) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
  }
  if (
    method.startsWith("config.") ||
    method.startsWith("wizard.") ||
    method.startsWith("update.") ||
    method === "channels.logout" ||
    method === "agents.create" ||
    method === "agents.update" ||
    method === "agents.delete" ||
    method === "skills.install" ||
    method === "skills.update" ||
    method === "cron.add" ||
    method === "cron.update" ||
    method === "cron.remove" ||
    method === "cron.run" ||
    method === "sessions.patch" ||
    method === "sessions.reset" ||
    method === "sessions.delete" ||
    method === "sessions.compact" ||
    method === "storage.migrateData" ||
    method === "groups.create" ||
    method === "groups.update" ||
    method === "groups.delete" ||
    method === "training.course.create" ||
    method === "admin.create" ||
    method === "admin.update" ||
    method === "admin.delete" ||
    method === "approval.policy.create" ||
    method === "approval.policy.update"
  ) {
    return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
  }
  return errorShape(ErrorCodes.INVALID_REQUEST, "missing scope: operator.admin");
}

export const coreGatewayHandlers: GatewayRequestHandlers = {
  ...agent2AgentHandlers,
  ...knowledgeSinkHandlers,
  ...connectHandlers,
  ...logsHandlers,
  ...voicewakeHandlers,
  ...healthHandlers,
  ...channelsHandlers,
  ...chatHandlers,
  ...cronHandlers,
  ...deviceHandlers,
  ...execApprovalsHandlers,
  ...webHandlers,
  ...modelsHandlers,
  ...configHandlers,
  ...wizardHandlers,
  ...talkHandlers,
  ...ttsHandlers,
  ...skillsHandlers,
  ...sessionsHandlers,
  ...storageHandlers,
  ...systemHandlers,
  ...updateHandlers,
  ...nodeHandlers,
  ...sendHandlers,
  ...usageHandlers,
  ...agentHandlers,
  ...agentsHandlers,
  ...browserHandlers,
  ...agentsManagementHandlers,
  ...organizationChartHandlers,
  ...organizationHierarchyHandlers,
  ...permissionsManagementHandlers,
  ...phase5RpcHandlers,
  ...messageQueueHandlers,
  ...groupsHandlers,
  ...friendsHandlers,
  ...monitorHandlers,
  ...scenariosHandlers,
  ...trainingMethods,
  ...trainingPlanHandlers,
  ...assessmentHandlers,
  ...channelPoliciesHandlers,
  ...humanAuthHandlers,
  ...dataScopeHandlers,
  ...mentorshipHandlers,
  ...lifecycleHandlers,
  ...skillManagementHandlers,
  ...phase6IntegrationHandlers,
  ...phase7AdminHandlers,
  ...reportsHandlers,
};

export async function handleGatewayRequest(
  opts: GatewayRequestOptions & { extraHandlers?: GatewayRequestHandlers },
): Promise<void> {
  const { req, respond, client, isWebchatConnect, context } = opts;
  const authError = authorizeGatewayMethod(req.method, client);
  if (authError) {
    respond(false, undefined, authError);
    return;
  }
  const handler = opts.extraHandlers?.[req.method] ?? coreGatewayHandlers[req.method];
  if (!handler) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${req.method}`),
    );
    return;
  }
  await handler({
    req,
    params: (req.params ?? {}) as Record<string, unknown>,
    client,
    isWebchatConnect,
    respond,
    context,
  });
}
