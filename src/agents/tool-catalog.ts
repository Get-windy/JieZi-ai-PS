export type ToolProfileId = "minimal" | "coding" | "messaging" | "full";

type ToolProfilePolicy = {
  allow?: string[];
  deny?: string[];
};

export type CoreToolSection = {
  id: string;
  label: string;
  tools: Array<{
    id: string;
    label: string;
    description: string;
  }>;
};

type CoreToolDefinition = {
  id: string;
  label: string;
  description: string;
  sectionId: string;
  profiles: ToolProfileId[];
  includeInOpenClawGroup?: boolean;
};

const CORE_TOOL_SECTION_ORDER: Array<{ id: string; label: string }> = [
  { id: "fs", label: "Files" },
  { id: "runtime", label: "Runtime" },
  { id: "web", label: "Web" },
  { id: "memory", label: "Memory" },
  { id: "sessions", label: "Sessions" },
  { id: "ui", label: "UI" },
  { id: "messaging", label: "Messaging" },
  { id: "automation", label: "Automation" },
  { id: "nodes", label: "Nodes" },
  { id: "agents", label: "Agents" },
  { id: "media", label: "Media" },
  // ─── 扩展工具分组 ───
  { id: "agent_mgmt", label: "Agent Management" },
  { id: "agent_lifecycle", label: "Agent Lifecycle" },
  { id: "agent_discovery", label: "Agent Discovery" },
  { id: "task_mgmt", label: "Task Management" },
  { id: "group_mgmt", label: "Group Management" },
  { id: "social", label: "Social" },
  { id: "approval", label: "Approval" },
  { id: "access_control", label: "Access Control" },
  { id: "org_mgmt", label: "Organization" },
  { id: "hr_mgmt", label: "HR Management" },
  { id: "training", label: "Training" },
];

const CORE_TOOL_DEFINITIONS: CoreToolDefinition[] = [
  {
    id: "read",
    label: "read",
    description: "Read file contents",
    sectionId: "fs",
    profiles: ["coding"],
  },
  {
    id: "write",
    label: "write",
    description: "Create or overwrite files",
    sectionId: "fs",
    profiles: ["coding"],
  },
  {
    id: "edit",
    label: "edit",
    description: "Make precise edits",
    sectionId: "fs",
    profiles: ["coding"],
  },
  {
    id: "apply_patch",
    label: "apply_patch",
    description: "Patch files (OpenAI)",
    sectionId: "fs",
    profiles: ["coding"],
  },
  {
    id: "exec",
    label: "exec",
    description: "Run shell commands",
    sectionId: "runtime",
    profiles: ["coding"],
  },
  {
    id: "process",
    label: "process",
    description: "Manage background processes",
    sectionId: "runtime",
    profiles: ["coding"],
  },
  {
    id: "web_search",
    label: "web_search",
    description: "Search the web",
    sectionId: "web",
    profiles: [],
    includeInOpenClawGroup: true,
  },
  {
    id: "web_fetch",
    label: "web_fetch",
    description: "Fetch web content",
    sectionId: "web",
    profiles: [],
    includeInOpenClawGroup: true,
  },
  {
    id: "memory_search",
    label: "memory_search",
    description: "Semantic search",
    sectionId: "memory",
    profiles: ["coding"],
    includeInOpenClawGroup: true,
  },
  {
    id: "memory_get",
    label: "memory_get",
    description: "Read memory files",
    sectionId: "memory",
    profiles: ["coding"],
    includeInOpenClawGroup: true,
  },
  {
    id: "sessions_list",
    label: "sessions_list",
    description: "List sessions",
    sectionId: "sessions",
    profiles: ["coding", "messaging"],
    includeInOpenClawGroup: true,
  },
  {
    id: "sessions_history",
    label: "sessions_history",
    description: "Session history",
    sectionId: "sessions",
    profiles: ["coding", "messaging"],
    includeInOpenClawGroup: true,
  },
  {
    id: "sessions_send",
    label: "sessions_send",
    description: "Send to session",
    sectionId: "sessions",
    profiles: ["coding", "messaging"],
    includeInOpenClawGroup: true,
  },
  {
    id: "sessions_spawn",
    label: "sessions_spawn",
    description: "Spawn sub-agent",
    sectionId: "sessions",
    profiles: ["coding"],
    includeInOpenClawGroup: true,
  },
  {
    id: "subagents",
    label: "subagents",
    description: "Manage sub-agents",
    sectionId: "sessions",
    profiles: ["coding"],
    includeInOpenClawGroup: true,
  },
  {
    id: "session_status",
    label: "session_status",
    description: "Session status",
    sectionId: "sessions",
    profiles: ["minimal", "coding", "messaging"],
    includeInOpenClawGroup: true,
  },
  {
    id: "browser",
    label: "browser",
    description: "Control web browser",
    sectionId: "ui",
    profiles: [],
    includeInOpenClawGroup: true,
  },
  {
    id: "canvas",
    label: "canvas",
    description: "Control canvases",
    sectionId: "ui",
    profiles: [],
    includeInOpenClawGroup: true,
  },
  {
    id: "message",
    label: "message",
    description: "Send messages",
    sectionId: "messaging",
    profiles: ["messaging"],
    includeInOpenClawGroup: true,
  },
  {
    id: "cron",
    label: "cron",
    description: "Schedule tasks",
    sectionId: "automation",
    profiles: [],
    includeInOpenClawGroup: true,
  },
  {
    id: "gateway",
    label: "gateway",
    description: "Gateway control",
    sectionId: "automation",
    profiles: [],
    includeInOpenClawGroup: true,
  },
  {
    id: "nodes",
    label: "nodes",
    description: "Nodes + devices",
    sectionId: "nodes",
    profiles: [],
    includeInOpenClawGroup: true,
  },
  {
    id: "agents_list",
    label: "agents_list",
    description: "List agents",
    sectionId: "agents",
    profiles: [],
    includeInOpenClawGroup: true,
  },
  {
    id: "image",
    label: "image",
    description: "Image understanding",
    sectionId: "media",
    profiles: ["coding"],
    includeInOpenClawGroup: true,
  },
  {
    id: "tts",
    label: "tts",
    description: "Text-to-speech conversion",
    sectionId: "media",
    profiles: [],
    includeInOpenClawGroup: true,
  },
  // ─── 助手管理（CRUD）───
  {
    id: "agent_create",
    label: "agent_create",
    description: "Create a new agent",
    sectionId: "agent_mgmt",
    profiles: [],
  },
  {
    id: "agent_update",
    label: "agent_update",
    description: "Update agent config",
    sectionId: "agent_mgmt",
    profiles: [],
  },
  {
    id: "agent_delete",
    label: "agent_delete",
    description: "Delete an agent",
    sectionId: "agent_mgmt",
    profiles: [],
  },
  // ─── 助手生命周期 ───
  {
    id: "agent_spawn",
    label: "agent_spawn",
    description: "Spawn and start agent",
    sectionId: "agent_lifecycle",
    profiles: [],
  },
  {
    id: "agent_start",
    label: "agent_start",
    description: "Start agent",
    sectionId: "agent_lifecycle",
    profiles: [],
  },
  {
    id: "agent_stop",
    label: "agent_stop",
    description: "Stop agent",
    sectionId: "agent_lifecycle",
    profiles: [],
  },
  {
    id: "agent_restart",
    label: "agent_restart",
    description: "Restart agent",
    sectionId: "agent_lifecycle",
    profiles: [],
  },
  {
    id: "agent_configure",
    label: "agent_configure",
    description: "Configure agent",
    sectionId: "agent_lifecycle",
    profiles: [],
  },
  {
    id: "agent_destroy",
    label: "agent_destroy",
    description: "Permanently destroy agent",
    sectionId: "agent_lifecycle",
    profiles: [],
  },
  {
    id: "agent_clone",
    label: "agent_clone",
    description: "Clone agent",
    sectionId: "agent_lifecycle",
    profiles: [],
  },
  // ─── 助手发现与通信 ───
  {
    id: "agent_discover",
    label: "agent_discover",
    description: "Discover agents",
    sectionId: "agent_discovery",
    profiles: [],
  },
  {
    id: "agent_inspect",
    label: "agent_inspect",
    description: "Inspect agent details",
    sectionId: "agent_discovery",
    profiles: [],
  },
  {
    id: "agent_status",
    label: "agent_status",
    description: "Get/set agent status",
    sectionId: "agent_discovery",
    profiles: [],
  },
  {
    id: "agent_capabilities",
    label: "agent_capabilities",
    description: "Query agent capabilities",
    sectionId: "agent_discovery",
    profiles: [],
  },
  {
    id: "agent_assign_task",
    label: "agent_assign_task",
    description: "Assign task to agent",
    sectionId: "agent_discovery",
    profiles: [],
  },
  {
    id: "agent_communicate",
    label: "agent_communicate",
    description: "Communicate with agent",
    sectionId: "agent_discovery",
    profiles: [],
  },
  // ─── 任务管理 ───
  {
    id: "task_create",
    label: "task_create",
    description: "Create task",
    sectionId: "task_mgmt",
    profiles: [],
  },
  {
    id: "task_list",
    label: "task_list",
    description: "List tasks",
    sectionId: "task_mgmt",
    profiles: [],
  },
  {
    id: "task_update",
    label: "task_update",
    description: "Update task",
    sectionId: "task_mgmt",
    profiles: [],
  },
  {
    id: "task_complete",
    label: "task_complete",
    description: "Complete task",
    sectionId: "task_mgmt",
    profiles: [],
  },
  {
    id: "task_delete",
    label: "task_delete",
    description: "Delete task",
    sectionId: "task_mgmt",
    profiles: [],
  },
  // ─── 群组管理 ───
  {
    id: "group_list",
    label: "group_list",
    description: "List groups",
    sectionId: "group_mgmt",
    profiles: [],
  },
  {
    id: "group_create",
    label: "group_create",
    description: "Create group",
    sectionId: "group_mgmt",
    profiles: [],
  },
  {
    id: "group_add_member",
    label: "group_add_member",
    description: "Add group member",
    sectionId: "group_mgmt",
    profiles: [],
  },
  {
    id: "group_remove_member",
    label: "group_remove_member",
    description: "Remove group member",
    sectionId: "group_mgmt",
    profiles: [],
  },
  {
    id: "group_update_member_role",
    label: "group_update_member_role",
    description: "Update group member role",
    sectionId: "group_mgmt",
    profiles: [],
  },
  {
    id: "group_delete",
    label: "group_delete",
    description: "Delete group",
    sectionId: "group_mgmt",
    profiles: [],
  },
  {
    id: "group_send",
    label: "group_send",
    description: "Send message to group chat",
    sectionId: "group_mgmt",
    profiles: [],
  },
  // ─── 好友管理 ───
  {
    id: "friend_add",
    label: "friend_add",
    description: "Add friend",
    sectionId: "social",
    profiles: [],
  },
  {
    id: "friend_remove",
    label: "friend_remove",
    description: "Remove friend",
    sectionId: "social",
    profiles: [],
  },
  {
    id: "friend_list",
    label: "friend_list",
    description: "List friends",
    sectionId: "social",
    profiles: [],
  },
  // ─── 审批流程 ───
  {
    id: "create_approval_request",
    label: "create_approval_request",
    description: "Create approval request",
    sectionId: "approval",
    profiles: [],
  },
  {
    id: "approve_request",
    label: "approve_request",
    description: "Approve request",
    sectionId: "approval",
    profiles: [],
  },
  {
    id: "reject_request",
    label: "reject_request",
    description: "Reject request",
    sectionId: "approval",
    profiles: [],
  },
  {
    id: "list_pending_approvals",
    label: "list_pending_approvals",
    description: "List pending approvals",
    sectionId: "approval",
    profiles: [],
  },
  {
    id: "get_approval_status",
    label: "get_approval_status",
    description: "Get approval status",
    sectionId: "approval",
    profiles: [],
  },
  {
    id: "cancel_approval_request",
    label: "cancel_approval_request",
    description: "Cancel approval request",
    sectionId: "approval",
    profiles: [],
  },
  // ─── 权限管理 ───
  {
    id: "grant_permission",
    label: "grant_permission",
    description: "Grant permission",
    sectionId: "access_control",
    profiles: [],
  },
  {
    id: "revoke_permission",
    label: "revoke_permission",
    description: "Revoke permission",
    sectionId: "access_control",
    profiles: [],
  },
  {
    id: "delegate_permission",
    label: "delegate_permission",
    description: "Delegate permission",
    sectionId: "access_control",
    profiles: [],
  },
  {
    id: "check_permission",
    label: "check_permission",
    description: "Check permission",
    sectionId: "access_control",
    profiles: [],
  },
  {
    id: "permission_list",
    label: "permission_list",
    description: "List permissions",
    sectionId: "access_control",
    profiles: [],
  },
  {
    id: "audit_permission_changes",
    label: "audit_permission_changes",
    description: "Audit permission changes",
    sectionId: "access_control",
    profiles: [],
  },
  // ─── 组织架构 ───
  {
    id: "create_department",
    label: "create_department",
    description: "Create department",
    sectionId: "org_mgmt",
    profiles: [],
  },
  {
    id: "create_team",
    label: "create_team",
    description: "Create team",
    sectionId: "org_mgmt",
    profiles: [],
  },
  {
    id: "assign_to_department",
    label: "assign_to_department",
    description: "Assign to department",
    sectionId: "org_mgmt",
    profiles: [],
  },
  {
    id: "assign_to_team",
    label: "assign_to_team",
    description: "Assign to team",
    sectionId: "org_mgmt",
    profiles: [],
  },
  {
    id: "set_reporting_line",
    label: "set_reporting_line",
    description: "Set reporting line",
    sectionId: "org_mgmt",
    profiles: [],
  },
  {
    id: "organization_list",
    label: "organization_list",
    description: "List organizations",
    sectionId: "org_mgmt",
    profiles: [],
  },
  // ─── 人事管理 ───
  {
    id: "deactivate_agent",
    label: "deactivate_agent",
    description: "Deactivate agent",
    sectionId: "hr_mgmt",
    profiles: [],
  },
  {
    id: "activate_agent",
    label: "activate_agent",
    description: "Activate agent",
    sectionId: "hr_mgmt",
    profiles: [],
  },
  {
    id: "configure_agent_role",
    label: "configure_agent_role",
    description: "Configure agent role",
    sectionId: "hr_mgmt",
    profiles: [],
  },
  {
    id: "assign_supervisor",
    label: "assign_supervisor",
    description: "Assign supervisor",
    sectionId: "hr_mgmt",
    profiles: [],
  },
  {
    id: "assign_mentor",
    label: "assign_mentor",
    description: "Assign mentor",
    sectionId: "hr_mgmt",
    profiles: [],
  },
  {
    id: "promote_agent",
    label: "promote_agent",
    description: "Promote agent",
    sectionId: "hr_mgmt",
    profiles: [],
  },
  {
    id: "transfer_agent",
    label: "transfer_agent",
    description: "Transfer agent",
    sectionId: "hr_mgmt",
    profiles: [],
  },
  // ─── 培训与评估 ───
  {
    id: "train_agent",
    label: "train_agent",
    description: "Train agent",
    sectionId: "training",
    profiles: [],
  },
  {
    id: "transfer_skill",
    label: "transfer_skill",
    description: "Transfer skill",
    sectionId: "training",
    profiles: [],
  },
  {
    id: "assess_agent",
    label: "assess_agent",
    description: "Assess agent",
    sectionId: "training",
    profiles: [],
  },
  {
    id: "create_training_course",
    label: "create_training_course",
    description: "Create training course",
    sectionId: "training",
    profiles: [],
  },
  {
    id: "assign_training",
    label: "assign_training",
    description: "Assign training",
    sectionId: "training",
    profiles: [],
  },
  {
    id: "training_start",
    label: "training_start",
    description: "Start training",
    sectionId: "training",
    profiles: [],
  },
  {
    id: "training_complete",
    label: "training_complete",
    description: "Complete training",
    sectionId: "training",
    profiles: [],
  },
  {
    id: "certify_trainer",
    label: "certify_trainer",
    description: "Certify trainer",
    sectionId: "training",
    profiles: [],
  },
];

const CORE_TOOL_BY_ID = new Map<string, CoreToolDefinition>(
  CORE_TOOL_DEFINITIONS.map((tool) => [tool.id, tool]),
);

function listCoreToolIdsForProfile(profile: ToolProfileId): string[] {
  return CORE_TOOL_DEFINITIONS.filter((tool) => tool.profiles.includes(profile)).map(
    (tool) => tool.id,
  );
}

const CORE_TOOL_PROFILES: Record<ToolProfileId, ToolProfilePolicy> = {
  minimal: {
    allow: listCoreToolIdsForProfile("minimal"),
  },
  coding: {
    allow: listCoreToolIdsForProfile("coding"),
  },
  messaging: {
    allow: listCoreToolIdsForProfile("messaging"),
  },
  full: {},
};

function buildCoreToolGroupMap() {
  const sectionToolMap = new Map<string, string[]>();
  for (const tool of CORE_TOOL_DEFINITIONS) {
    const groupId = `group:${tool.sectionId}`;
    const list = sectionToolMap.get(groupId) ?? [];
    list.push(tool.id);
    sectionToolMap.set(groupId, list);
  }
  const openclawTools = CORE_TOOL_DEFINITIONS.filter((tool) => tool.includeInOpenClawGroup).map(
    (tool) => tool.id,
  );
  return {
    "group:openclaw": openclawTools,
    ...Object.fromEntries(sectionToolMap.entries()),
  };
}

export const CORE_TOOL_GROUPS = buildCoreToolGroupMap();

export const PROFILE_OPTIONS = [
  { id: "minimal", label: "Minimal" },
  { id: "coding", label: "Coding" },
  { id: "messaging", label: "Messaging" },
  { id: "full", label: "Full" },
] as const;

export function resolveCoreToolProfilePolicy(profile?: string): ToolProfilePolicy | undefined {
  if (!profile) {
    return undefined;
  }
  const resolved = CORE_TOOL_PROFILES[profile as ToolProfileId];
  if (!resolved) {
    return undefined;
  }
  if (!resolved.allow && !resolved.deny) {
    return undefined;
  }
  return {
    allow: resolved.allow ? [...resolved.allow] : undefined,
    deny: resolved.deny ? [...resolved.deny] : undefined,
  };
}

export function listCoreToolSections(): CoreToolSection[] {
  return CORE_TOOL_SECTION_ORDER.map((section) => ({
    id: section.id,
    label: section.label,
    tools: CORE_TOOL_DEFINITIONS.filter((tool) => tool.sectionId === section.id).map((tool) => ({
      id: tool.id,
      label: tool.label,
      description: tool.description,
    })),
  })).filter((section) => section.tools.length > 0);
}

export function resolveCoreToolProfiles(toolId: string): ToolProfileId[] {
  const tool = CORE_TOOL_BY_ID.get(toolId);
  if (!tool) {
    return [];
  }
  return [...tool.profiles];
}
