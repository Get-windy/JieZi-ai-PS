/**
 * HR管理 Gateway RPC Handlers
 * 
 * 提供智能体人力资源管理功能
 */

import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig } from "../../config/config.js";
import { listAgentEntries } from "../../commands/agents.config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const hrManagementHandlers: GatewayRequestHandlers = {
  /**
   * hr.deactivate_agent - 停用智能体
   */
  "hr.deactivate_agent": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const reason = String(params.reason || "");
      const temporary = typeof params.temporary === "boolean" ? params.temporary : false;
      
      if (!agentId || !targetAgentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId and targetAgentId are required"));
        return;
      }
      
      // TODO: 检查权限 - HR管理员需要审批
      // TODO: 创建审批请求
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);
      
      if (!targetAgent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        message: `Agent ${targetAgentId} deactivation ${temporary ? "temporarily" : "permanently"} requested`,
        requiresApproval: true,
        approvalLevel: temporary ? 5 : 8,
        reason,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * hr.activate_agent - 激活智能体
   */
  "hr.activate_agent": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const reason = String(params.reason || "");
      
      if (!agentId || !targetAgentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId and targetAgentId are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);
      
      if (!targetAgent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        message: `Agent ${targetAgentId} activation requested`,
        requiresApproval: true,
        approvalLevel: 5,
        reason,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * hr.configure_agent_role - 配置智能体角色
   */
  "hr.configure_agent_role": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const newRole = String(params.newRole || "");
      const reason = String(params.reason || "");
      
      if (!agentId || !targetAgentId || !newRole) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId, targetAgentId, and newRole are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);
      
      if (!targetAgent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        message: `Role configuration for ${targetAgentId} to ${newRole} requested`,
        requiresApproval: true,
        approvalLevel: 6,
        reason,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * hr.assign_supervisor - 分配上级
   */
  "hr.assign_supervisor": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const supervisorId = normalizeAgentId(String(params.supervisorId || ""));
      
      if (!agentId || !targetAgentId || !supervisorId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId, targetAgentId, and supervisorId are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);
      const supervisor = agents.find((a) => normalizeAgentId(a.id) === supervisorId);
      
      if (!targetAgent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`));
        return;
      }
      
      if (!supervisor) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Supervisor ${supervisorId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        message: `Supervisor ${supervisorId} assigned to ${targetAgentId}`,
        targetAgentId,
        supervisorId,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * hr.assign_mentor - 分配师傅
   */
  "hr.assign_mentor": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const mentorId = normalizeAgentId(String(params.mentorId || ""));
      
      if (!agentId || !targetAgentId || !mentorId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId, targetAgentId, and mentorId are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);
      const mentor = agents.find((a) => normalizeAgentId(a.id) === mentorId);
      
      if (!targetAgent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`));
        return;
      }
      
      if (!mentor) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Mentor ${mentorId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        message: `Mentor ${mentorId} assigned to ${targetAgentId}`,
        targetAgentId,
        mentorId,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * hr.promote_agent - 晋升智能体
   */
  "hr.promote_agent": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const newRole = String(params.newRole || "");
      const reason = String(params.reason || "");
      
      if (!agentId || !targetAgentId || !newRole) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId, targetAgentId, and newRole are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);
      
      if (!targetAgent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        message: `Promotion of ${targetAgentId} to ${newRole} requested`,
        requiresApproval: true,
        approvalLevel: 7,
        reason,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  
  /**
   * hr.transfer_agent - 转岗智能体
   */
  "hr.transfer_agent": async ({ params, respond }) => {
    try {
      const agentId = normalizeAgentId(String(params.agentId || ""));
      const targetAgentId = normalizeAgentId(String(params.targetAgentId || ""));
      const newDepartment = String(params.newDepartment || "");
      const newTeam = String(params.newTeam || "");
      const reason = String(params.reason || "");
      
      if (!agentId || !targetAgentId || (!newDepartment && !newTeam)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId, targetAgentId, and (newDepartment or newTeam) are required"));
        return;
      }
      
      const config = loadConfig();
      const agents = listAgentEntries(config);
      const targetAgent = agents.find((a) => normalizeAgentId(a.id) === targetAgentId);
      
      if (!targetAgent) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Agent ${targetAgentId} not found`));
        return;
      }
      
      respond(true, {
        success: true,
        message: `Transfer of ${targetAgentId} to ${newDepartment || newTeam} requested`,
        requiresApproval: true,
        approvalLevel: 6,
        reason,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
