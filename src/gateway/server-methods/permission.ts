/**
 * 权限管理 Gateway RPC Handlers
 * 
 * 提供权限配置的查询和修改功能
 */

import type { GatewayRequestHandlers } from "../../../upstream/src/gateway/server-methods/types.js";
import type { AgentPermissionsConfig } from "../../config/types.permissions.js";
import { loadConfig, saveConfig } from "../../../upstream/src/config/config.js";
import { listAgentEntries } from "../../../upstream/src/commands/agents.config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import {
  createPermissionTemplate,
  assignRoleToAgent,
  removeRoleFromAgent,
  getAgentRoles,
  createCustomToolRule,
  PREDEFINED_ROLES,
  TOOL_CATEGORIES,
} from "../../agents/tools/permission-templates.js";
import { clearPermissionCache } from "../../agents/tools/permission-middleware.js";
import { ErrorCodes, errorShape } from "../../../upstream/src/gateway/protocol/index.js";

export const permissionHandlers: GatewayRequestHandlers = {
  /**
   * permission.get - 获取智能体的权限配置
   */
  "permission.get": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      
      if (!agent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      const permissions = (agent as any).permissions as AgentPermissionsConfig | undefined;
      
      respond(true, {
        success: true,
        agentId,
        permissions: permissions || null,
        hasPermissions: !!permissions,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * permission.set - 设置智能体的权限配置
   */
  "permission.set": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const permissions = params.permissions as AgentPermissionsConfig | null;
      
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agentIndex = agents.findIndex((a) => normalizeAgentId(a.id) === agentId);
      
      if (agentIndex === -1) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      // 更新权限配置
      (agents[agentIndex] as any).permissions = permissions;
      
      // 保存配置
      await saveConfig(config);
      
      // 清除权限缓存
      clearPermissionCache(agentId);
      
      respond(true, {
        success: true,
        agentId,
        message: `Permissions updated for agent ${agentId}`,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * permission.init - 初始化智能体的权限配置（使用模板）
   */
  "permission.init": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const includeAllRoles = params.includeAllRoles !== false;
      
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agentIndex = agents.findIndex((a) => normalizeAgentId(a.id) === agentId);
      
      if (agentIndex === -1) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      // 创建权限配置模板
      const permissionTemplate = createPermissionTemplate({ includeAllRoles });
      
      // 更新权限配置
      (agents[agentIndex] as any).permissions = permissionTemplate;
      
      // 保存配置
      await saveConfig(config);
      
      // 清除权限缓存
      clearPermissionCache(agentId);
      
      respond(true, {
        success: true,
        agentId,
        message: `Permissions initialized for agent ${agentId}`,
        permissions: permissionTemplate,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * permission.role.assign - 为智能体分配角色
   */
  "permission.role.assign": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const roleId = String(params.roleId || "");
      
      if (!agentId || !targetAgentId || !roleId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId, targetAgentId, and roleId are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agentIndex = agents.findIndex((a) => normalizeAgentId(a.id) === agentId);
      
      if (agentIndex === -1) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      const currentPermissions = (agents[agentIndex] as any).permissions as AgentPermissionsConfig;
      
      if (!currentPermissions) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} has no permissions config. Initialize first.`));
        return;
      }
      
      // 分配角色
      const updatedPermissions = assignRoleToAgent(targetAgentId, roleId, currentPermissions);
      
      // 更新配置
      (agents[agentIndex] as any).permissions = updatedPermissions;
      
      // 保存配置
      await saveConfig(config);
      
      // 清除权限缓存
      clearPermissionCache(agentId);
      
      respond(true, {
        success: true,
        message: `Role ${roleId} assigned to agent ${targetAgentId}`,
        agentId: targetAgentId,
        roleId,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * permission.role.remove - 移除智能体的角色
   */
  "permission.role.remove": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const roleId = String(params.roleId || "");
      
      if (!agentId || !targetAgentId || !roleId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId, targetAgentId, and roleId are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agentIndex = agents.findIndex((a) => normalizeAgentId(a.id) === agentId);
      
      if (agentIndex === -1) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      const currentPermissions = (agents[agentIndex] as any).permissions as AgentPermissionsConfig;
      
      if (!currentPermissions) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} has no permissions config`));
        return;
      }
      
      // 移除角色
      const updatedPermissions = removeRoleFromAgent(targetAgentId, roleId, currentPermissions);
      
      // 更新配置
      (agents[agentIndex] as any).permissions = updatedPermissions;
      
      // 保存配置
      await saveConfig(config);
      
      // 清除权限缓存
      clearPermissionCache(agentId);
      
      respond(true, {
        success: true,
        message: `Role ${roleId} removed from agent ${targetAgentId}`,
        agentId: targetAgentId,
        roleId,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * permission.role.list - 获取智能体的所有角色
   */
  "permission.role.list": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      
      if (!agentId || !targetAgentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId and targetAgentId are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      
      if (!agent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      const permissions = (agent as any).permissions as AgentPermissionsConfig | undefined;
      
      if (!permissions) {
        respond(true, {
          success: true,
          agentId: targetAgentId,
          roles: [],
        });
        return;
      }
      
      const roles = getAgentRoles(targetAgentId, permissions);
      
      respond(true, {
        success: true,
        agentId: targetAgentId,
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
        })),
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * permission.roles.available - 获取所有可用角色
   */
  "permission.roles.available": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      
      if (!agentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
      
      if (!agent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      const permissions = (agent as any).permissions as AgentPermissionsConfig | undefined;
      
      if (!permissions || !permissions.roles) {
        respond(true, {
          success: true,
          roles: [],
        });
        return;
      }
      
      respond(true, {
        success: true,
        roles: permissions.roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          memberCount: r.members.length,
        })),
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * permission.rule.add - 添加自定义权限规则
   */
  "permission.rule.add": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const toolName = String(params.toolName || "");
      const agentIds = params.agentIds as string[] | undefined;
      const roleIds = params.roleIds as string[] | undefined;
      const action = params.action as "allow" | "deny" | "require_approval";
      const description = params.description as string | undefined;
      
      if (!agentId || !toolName || !action) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId, toolName, and action are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const agentIndex = agents.findIndex((a) => normalizeAgentId(a.id) === agentId);
      
      if (agentIndex === -1) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} not found`));
        return;
      }
      
      const currentPermissions = (agents[agentIndex] as any).permissions as AgentPermissionsConfig;
      
      if (!currentPermissions) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${agentId} has no permissions config. Initialize first.`));
        return;
      }
      
      // 创建自定义规则
      const newRule = createCustomToolRule({
        toolName,
        agentIds,
        roleIds,
        action,
        description,
      });
      
      // 添加规则
      const updatedPermissions = {
        ...currentPermissions,
        rules: [...currentPermissions.rules, newRule],
      };
      
      // 更新配置
      (agents[agentIndex] as any).permissions = updatedPermissions;
      
      // 保存配置
      await saveConfig(config);
      
      // 清除权限缓存
      clearPermissionCache(agentId);
      
      respond(true, {
        success: true,
        message: `Rule added for tool ${toolName}`,
        ruleId: newRule.id,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * permission.constants - 获取权限系统的常量定义
   */
  "permission.constants": async ({ respond }) => {
    try {
      respond(true, {
        success: true,
        predefinedRoles: PREDEFINED_ROLES,
        toolCategories: TOOL_CATEGORIES,
        actions: ["allow", "deny", "require_approval"],
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
