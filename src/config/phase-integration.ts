/**
 * Phase 1/2/3/4 集成初始化
 * 在应用启动时初始化智能模型路由、通道策略、权限系统和组织协作体系
 */

import type { OrganizationConfig } from "../organization/organization-integration.js";
import type { AgentModelAccountsConfig } from "./types.agents.js";
import type { AgentChannelBindings } from "./types.channel-bindings.js";
import type { OpenClawConfig } from "./types.js";
import type { AgentPermissionsConfig } from "./types.permissions.js";
import { agentContextManager } from "../agents/agent-context.js";
import { modelRoutingIntegrator } from "../agents/model-routing-integration.js";
import { skillManager } from "../agents/skill-manager.js";
import { messageQueue } from "../channels/message-queue.js";
import { initializeChannelPolicies } from "../channels/policy-integration.js";
import { initializeFromConfig } from "../organization/organization-integration.js";
import { approvalSystem } from "../permissions/approval-system.js";
import { initializePermissionSystem } from "../permissions/integration.js";
import { groupSessionCoordinator } from "../sessions/group-session-coordinator.js";

/**
 * 验证模型账号配置
 */
function validateModelAccounts(config: AgentModelAccountsConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 验证 accounts 字段
  if (!config.accounts || !Array.isArray(config.accounts)) {
    errors.push("modelAccounts: 'accounts' must be a non-empty array");
    return { valid: false, errors };
  }

  if (config.accounts.length === 0) {
    errors.push("modelAccounts: 'accounts' must contain at least one account ID");
  }

  // 检查账号ID唯一性
  const accountIds = config.accounts;
  const duplicates = accountIds.filter(
    (id: string, index: number) => accountIds.indexOf(id) !== index,
  );
  if (duplicates.length > 0) {
    errors.push(`modelAccounts: duplicate account IDs: ${duplicates.join(", ")}`);
  }

  // 验证 routingMode
  if (config.routingMode && !["manual", "smart"].includes(config.routingMode)) {
    errors.push(
      `modelAccounts: 'routingMode' must be 'manual' or 'smart', got '${config.routingMode}'`,
    );
  }

  // 验证 defaultAccountId（如果手动模式）
  if (config.routingMode === "manual") {
    if (!config.defaultAccountId) {
      errors.push("modelAccounts: 'defaultAccountId' is required when routingMode is 'manual'");
    } else if (!config.accounts.includes(config.defaultAccountId)) {
      errors.push(
        `modelAccounts: 'defaultAccountId' '${config.defaultAccountId}' is not in 'accounts' list`,
      );
    }
  }

  // 验证评分权重（如果智能模式）
  // 注意：smartRouting 配置中没有 scoringWeights，这里的验证逻辑需要根据实际字段调整
  // 目前 smartRouting 有 complexityWeight, capabilityWeight, costWeight, speedWeight
  if (config.routingMode === "smart" && config.smartRouting) {
    const sr = config.smartRouting;

    // 验证各个权重值
    const weightKeys = ["complexityWeight", "capabilityWeight", "costWeight", "speedWeight"];
    for (const key of weightKeys) {
      const value = (sr as any)[key];
      if (value !== undefined) {
        if (typeof value !== "number" || value < 0 || value > 100) {
          errors.push(`modelAccounts: ${key} must be a number between 0 and 100`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证通道绑定配置
 */
function validateChannelBindings(config: AgentChannelBindings): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.bindings || !Array.isArray(config.bindings)) {
    errors.push("channelBindings: 'bindings' must be an array");
    return { valid: false, errors };
  }

  // 检查绑定ID唯一性
  const bindingIds = config.bindings.map((b: any) => b.id);
  const duplicates = bindingIds.filter(
    (id: any, index: number) => bindingIds.indexOf(id) !== index,
  );
  if (duplicates.length > 0) {
    errors.push(`channelBindings: duplicate binding IDs: ${duplicates.join(", ")}`);
  }

  // 验证每个绑定
  for (let i = 0; i < config.bindings.length; i++) {
    const binding = config.bindings[i];
    if (!binding.id) {
      errors.push(`channelBindings: binding[${i}] missing required field 'id'`);
    }
    if (!binding.channelId) {
      errors.push(`channelBindings: binding[${i}] missing required field 'channelId'`);
    }
    if (!binding.accountId) {
      errors.push(`channelBindings: binding[${i}] missing required field 'accountId'`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证权限配置
 */
function validatePermissions(config: AgentPermissionsConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查规则ID唯一性
  if (config.rules && Array.isArray(config.rules)) {
    const ruleIds = config.rules.map((r: any) => r.id);
    const duplicates = ruleIds.filter((id: any, index: number) => ruleIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`permissions: duplicate rule IDs: ${duplicates.join(", ")}`);
    }
  }

  // 检查角色ID唯一性
  if (config.roles && Array.isArray(config.roles)) {
    const roleIds = config.roles.map((r: any) => r.id);
    const duplicates = roleIds.filter((id: any, index: number) => roleIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`permissions: duplicate role IDs: ${duplicates.join(", ")}`);
    }
  }

  // 检查组ID唯一性
  if (config.groups && Array.isArray(config.groups)) {
    const groupIds = config.groups.map((g: any) => g.id);
    const duplicates = groupIds.filter((id: any, index: number) => groupIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`permissions: duplicate group IDs: ${duplicates.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证组织体系配置（Phase 4）
 */
function validateOrganizationConfig(config: OrganizationConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 验证组织配置
  if (config.organizations && Array.isArray(config.organizations)) {
    const orgIds = config.organizations.map((o: any) => o.id);
    const duplicates = orgIds.filter((id: any, index: number) => orgIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`organization: duplicate organization IDs: ${duplicates.join(", ")}`);
    }

    // 验证层级关系
    const levelOrder = ["company", "department", "team", "individual"];
    for (let i = 0; i < config.organizations.length; i++) {
      const org = config.organizations[i];
      if (!org.id) {
        errors.push(`organization: organization[${i}] missing required field 'id'`);
      }
      if (!org.name) {
        errors.push(`organization: organization[${i}] missing required field 'name'`);
      }
      if (!org.level) {
        errors.push(`organization: organization[${i}] missing required field 'level'`);
      } else if (!levelOrder.includes(org.level)) {
        errors.push(
          `organization: organization[${i}] invalid level '${org.level}', must be one of: ${levelOrder.join(", ")}`,
        );
      }

      // 验证父级层级关系
      if (org.parentId) {
        const parent = config.organizations.find((o: any) => o.id === org.parentId);
        if (!parent) {
          errors.push(
            `organization: organization[${i}] references unknown parent '${org.parentId}'`,
          );
        } else {
          const childIndex = levelOrder.indexOf(org.level);
          const parentIndex = levelOrder.indexOf(parent.level);
          if (childIndex <= parentIndex) {
            errors.push(
              `organization: organization[${i}] invalid hierarchy: ${org.level} cannot be child of ${parent.level}`,
            );
          }
        }
      }
    }
  }

  // 验证团队配置
  if (config.teams && Array.isArray(config.teams)) {
    const teamIds = config.teams.map((t: any) => t.id);
    const duplicates = teamIds.filter((id: any, index: number) => teamIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`organization: duplicate team IDs: ${duplicates.join(", ")}`);
    }

    for (let i = 0; i < config.teams.length; i++) {
      const team = config.teams[i];
      if (!team.id) {
        errors.push(`organization: team[${i}] missing required field 'id'`);
      }
      if (!team.name) {
        errors.push(`organization: team[${i}] missing required field 'name'`);
      }
      if (!team.organizationId) {
        errors.push(`organization: team[${i}] missing required field 'organizationId'`);
      }
      if (!team.leaderId) {
        errors.push(`organization: team[${i}] missing required field 'leaderId'`);
      }
      if (!team.type || !["permanent", "project", "temporary"].includes(team.type)) {
        errors.push(
          `organization: team[${i}] invalid type '${team.type}', must be: permanent, project, or temporary`,
        );
      }
    }
  }

  // 验证协作关系配置
  if (config.collaborations && Array.isArray(config.collaborations)) {
    const collabIds = config.collaborations.map((c: any) => c.id);
    const duplicates = collabIds.filter(
      (id: any, index: number) => collabIds.indexOf(id) !== index,
    );
    if (duplicates.length > 0) {
      errors.push(`organization: duplicate collaboration IDs: ${duplicates.join(", ")}`);
    }

    const validTypes = ["supervisor", "colleague", "project", "business", "mentor", "monitor"];
    for (let i = 0; i < config.collaborations.length; i++) {
      const collab = config.collaborations[i];
      if (!collab.id) {
        errors.push(`organization: collaboration[${i}] missing required field 'id'`);
      }
      if (!collab.fromAgentId) {
        errors.push(`organization: collaboration[${i}] missing required field 'fromAgentId'`);
      }
      if (!collab.toAgentId) {
        errors.push(`organization: collaboration[${i}] missing required field 'toAgentId'`);
      }
      if (!collab.type || !validTypes.includes(collab.type)) {
        errors.push(
          `organization: collaboration[${i}] invalid type '${collab.type}', must be one of: ${validTypes.join(", ")}`,
        );
      }
    }
  }

  // 验证师徒关系配置
  if (config.mentorships && Array.isArray(config.mentorships)) {
    const mentorshipIds = config.mentorships.map((m: any) => m.id);
    const duplicates = mentorshipIds.filter(
      (id: any, index: number) => mentorshipIds.indexOf(id) !== index,
    );
    if (duplicates.length > 0) {
      errors.push(`organization: duplicate mentorship IDs: ${duplicates.join(", ")}`);
    }

    for (let i = 0; i < config.mentorships.length; i++) {
      const mentorship = config.mentorships[i];
      if (!mentorship.id) {
        errors.push(`organization: mentorship[${i}] missing required field 'id'`);
      }
      if (!mentorship.mentorId) {
        errors.push(`organization: mentorship[${i}] missing required field 'mentorId'`);
      }
      if (!mentorship.menteeId) {
        errors.push(`organization: mentorship[${i}] missing required field 'menteeId'`);
      }
      if (mentorship.mentorId === mentorship.menteeId) {
        errors.push(`organization: mentorship[${i}] mentor and mentee cannot be the same agent`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 初始化 Phase 1/2/3/4/5/6 系统
 *
 * 在应用启动时调用，用于验证配置并初始化所有核心系统
 */
export function initializePhaseIntegration(config: OpenClawConfig): {
  success: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log("[Phase Integration] Initializing Phase 1/2/3/4/5/6 systems...");

  // 初始化全局模型路由集成器（Phase 1）
  try {
    modelRoutingIntegrator.initialize(config);
    console.log("[Phase Integration] Model routing integrator initialized");
  } catch (err) {
    errors.push(
      `Failed to initialize model routing integrator: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 验证和初始化每个智能助手的配置
  const agents = config.agents?.list;
  if (!agents || !Array.isArray(agents)) {
    warnings.push("No agents configured");
  } else {
    for (const agent of agents) {
      if (!agent || typeof agent !== "object") {
        continue;
      }

      const agentId = (agent as any).id || "default";

      // 验证模型账号配置（Phase 1）
      if ((agent as any).modelAccounts) {
        const modelAccountsResult = validateModelAccounts((agent as any).modelAccounts);
        if (!modelAccountsResult.valid) {
          errors.push(...modelAccountsResult.errors.map((e) => `Agent ${agentId}: ${e}`));
        } else {
          console.log(`[Phase Integration] Agent ${agentId}: model accounts validated`);
        }
      }

      // 验证通道绑定配置（Phase 2）
      if ((agent as any).channelBindings) {
        const bindingResult = validateChannelBindings((agent as any).channelBindings);
        if (!bindingResult.valid) {
          errors.push(...bindingResult.errors.map((e) => `Agent ${agentId}: ${e}`));
        } else {
          console.log(`[Phase Integration] Agent ${agentId}: channel bindings validated`);
        }
      }

      // 验证和初始化权限配置（Phase 3）
      if ((agent as any).permissions) {
        const permissionResult = validatePermissions((agent as any).permissions);
        if (!permissionResult.valid) {
          errors.push(...permissionResult.errors.map((e) => `Agent ${agentId}: ${e}`));
        } else {
          // 初始化权限系统
          try {
            initializePermissionSystem((agent as any).permissions);
            console.log(`[Phase Integration] Agent ${agentId}: permissions initialized`);
          } catch (err) {
            errors.push(
              `Agent ${agentId}: failed to initialize permissions: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    }
  }

  // 初始化通道策略系统（Phase 2）
  try {
    const policyResult = initializeChannelPolicies(config);
    if (!policyResult.success) {
      errors.push(...policyResult.errors);
    }
    if (policyResult.warnings.length > 0) {
      warnings.push(...policyResult.warnings);
    }
    console.log("[Phase Integration] Channel policies initialized");
  } catch (err) {
    errors.push(
      `Failed to initialize channel policies: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 验证和初始化组织体系配置（Phase 4）
  if ((config as any).organization) {
    const orgConfig = (config as any).organization as OrganizationConfig;
    const orgResult = validateOrganizationConfig(orgConfig);

    if (!orgResult.valid) {
      errors.push(...orgResult.errors);
    } else {
      // 初始化组织体系
      try {
        initializeFromConfig(orgConfig, "system").then(
          (result) => {
            console.log(
              `[Phase Integration] Organization system initialized: ${result.organizations.length} organizations, ${result.teams.length} teams, ${result.collaborations.length} collaborations, ${result.mentorships.length} mentorships`,
            );
          },
          (err) => {
            errors.push(
              `Failed to initialize organization system: ${err instanceof Error ? err.message : String(err)}`,
            );
          },
        );
      } catch (err) {
        errors.push(
          `Failed to initialize organization system: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // 初始化群组会话系统（Phase 6）
  try {
    // 群组系统已通过单例自动初始化
    console.log("[Phase Integration] Group session system ready");
  } catch (err) {
    errors.push(
      `Failed to initialize group session system: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 初始化 Agent 上下文管理器（Phase 5）
  try {
    // 为每个配置的 Agent 创建上下文
    if (agents && Array.isArray(agents)) {
      for (const agent of agents) {
        if (agent && typeof agent === "object") {
          agentContextManager.createContext(agent as any).catch((err) => {
            warnings.push(
              `Failed to create context for agent ${(agent as any).id}: ${err.message}`,
            );
          });
        }
      }
    }
    console.log("[Phase Integration] Agent context manager initialized");
  } catch (err) {
    errors.push(
      `Failed to initialize agent context manager: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 初始化技能管理器（Phase 3）
  try {
    // 技能管理器已通过单例自动初始化
    console.log("[Phase Integration] Skill manager ready");
  } catch (err) {
    errors.push(
      `Failed to initialize skill manager: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 初始化消息队列系统（Phase 2）
  try {
    // 消息队列已通过单例自动初始化
    console.log("[Phase Integration] Message queue ready");
  } catch (err) {
    errors.push(
      `Failed to initialize message queue: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 初始化审批系统（Phase 3）
  try {
    // 审批系统已通过单例自动初始化
    // 启动过期请求检查定时器
    setInterval(() => {
      approvalSystem.checkExpiredRequests().catch((err) => {
        console.error("[Phase Integration] Failed to check expired approvals:", err);
      });
    }, 60 * 1000); // 每分钟检查一次
    console.log("[Phase Integration] Approval system ready");
  } catch (err) {
    errors.push(
      `Failed to initialize approval system: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const success = errors.length === 0;
  if (success) {
    console.log("[Phase Integration] Phase 1/2/3/4/5/6 systems initialized successfully");
    if (warnings.length > 0) {
      console.warn("[Phase Integration] Warnings:", warnings);
    }
  } else {
    console.error("[Phase Integration] Initialization failed:", errors);
  }

  return { success, errors, warnings };
}

/**
 * 便捷函数：在配置加载后调用
 */
export function initializeAfterConfigLoad(config: OpenClawConfig): void {
  const result = initializePhaseIntegration(config);
  if (!result.success) {
    console.warn(
      "[Phase Integration] Some systems failed to initialize, but continuing startup...",
    );
  }
}
