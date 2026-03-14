/**
 * Agent 配置管理工具
 * 
 * 用于动态更新 Agent 配置，包括 subagents.allowAgents 等
 */

import { loadConfig, writeConfigFile } from "../config/config.js";
import { normalizeAgentId } from "../routing/session-key.js";
import type { OpenClawConfig, AgentEntry } from "../config/config.js";

/**
 * 将指定 Agent ID 添加到 main Agent 的 subagents.allowAgents 列表
 * 
 * 逻辑：
 * 1. 如果 allowAgents 包含 "*"，说明允许所有 Agent，无需添加
 * 2. 如果目标 Agent 已在 allowAgents 中，跳过
 * 3. 否则，将目标 Agent 添加到 allowAgents 并保存配置
 * 
 * @param targetAgentId - 目标 Agent ID
 * @returns 是否成功添加
 */
export async function addAgentToAllowList(targetAgentId: string): Promise<boolean> {
  try {
    const cfg = loadConfig();
    const normalizedTargetId = normalizeAgentId(targetAgentId);
    
    // 找到 main Agent 的配置
    const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
    const mainIndex = agents.findIndex(
      (agent) => normalizeAgentId(agent.id) === "main"
    );
    
    if (mainIndex < 0) {
      console.warn(`[Config] Main agent not found in config`);
      return false;
    }
    
    const mainAgent = agents[mainIndex];
    const currentAllowAgents = mainAgent.subagents?.allowAgents ?? [];
    
    // 检查是否已经允许所有 Agent
    if (currentAllowAgents.includes("*")) {
      console.log(`[Config] Main agent already allows all subagents (*)`);
      return true;
    }
    
    // 检查目标 Agent 是否已在 allowAgents 中
    const normalizedAllowList = currentAllowAgents.map((id) => normalizeAgentId(id));
    if (normalizedAllowList.includes(normalizedTargetId)) {
      console.log(`[Config] Agent ${normalizedTargetId} already in allowAgents`);
      return true;
    }
    
    // 添加目标 Agent 到 allowAgents
    const updatedAllowAgents = [...currentAllowAgents, normalizedTargetId];
    const updatedMainAgent: AgentEntry = {
      ...mainAgent,
      subagents: {
        ...mainAgent.subagents,
        allowAgents: updatedAllowAgents,
      },
    };
    
    // 更新 agents list
    const updatedAgents = [...agents];
    updatedAgents[mainIndex] = updatedMainAgent;
    
    // 保存配置
    const updatedConfig: OpenClawConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        list: updatedAgents,
      },
    };
    
    await writeConfigFile(updatedConfig);
    console.log(`[Config] ✓ Added ${normalizedTargetId} to main agent's allowAgents:`, updatedAllowAgents);
    return true;
    
  } catch (error) {
    console.error(`[Config] Failed to add ${targetAgentId} to allowAgents:`, error);
    return false;
  }
}

/**
 * 批量添加多个 Agent 到 allowlist
 * 
 * @param targetAgentIds - 目标 Agent ID 数组
 * @returns 成功添加的数量
 */
export async function addAgentsToAllowList(targetAgentIds: string[]): Promise<number> {
  let successCount = 0;
  
  for (const agentId of targetAgentIds) {
    const added = await addAgentToAllowList(agentId);
    if (added) {
      successCount++;
    }
  }
  
  return successCount;
}

/**
 * 从 allowAgents 中移除指定 Agent
 * 
 * @param targetAgentId - 目标 Agent ID
 * @returns 是否成功移除
 */
export async function removeAgentFromAllowList(targetAgentId: string): Promise<boolean> {
  try {
    const cfg = loadConfig();
    const normalizedTargetId = normalizeAgentId(targetAgentId);
    
    const agents = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
    const mainIndex = agents.findIndex(
      (agent) => normalizeAgentId(agent.id) === "main"
    );
    
    if (mainIndex < 0) {
      console.warn(`[Config] Main agent not found in config`);
      return false;
    }
    
    const mainAgent = agents[mainIndex];
    const currentAllowAgents = mainAgent.subagents?.allowAgents ?? [];
    
    // 如果是通配符模式，先清除通配符
    if (currentAllowAgents.includes("*")) {
      const filteredAllowAgents = currentAllowAgents.filter((id) => id !== "*");
      const updatedMainAgent: AgentEntry = {
        ...mainAgent,
        subagents: {
          ...mainAgent.subagents,
          allowAgents: filteredAllowAgents,
        },
      };
      
      const updatedAgents = [...agents];
      updatedAgents[mainIndex] = updatedMainAgent;
      
      const updatedConfig: OpenClawConfig = {
        ...cfg,
        agents: {
          ...cfg.agents,
          list: updatedAgents,
        },
      };
      
      await writeConfigFile(updatedConfig);
      console.log(`[Config] ✓ Removed wildcard (*) from allowAgents`);
    }
    
    // 移除目标 Agent
    const updatedAllowAgents = currentAllowAgents.filter(
      (id) => normalizeAgentId(id) !== normalizedTargetId
    );
    
    if (updatedAllowAgents.length === currentAllowAgents.length) {
      console.log(`[Config] Agent ${normalizedTargetId} not in allowAgents`);
      return false;
    }
    
    const updatedMainAgent: AgentEntry = {
      ...mainAgent,
      subagents: {
        ...mainAgent.subagents,
        allowAgents: updatedAllowAgents,
      },
    };
    
    const updatedAgents = [...agents];
    updatedAgents[mainIndex] = updatedMainAgent;
    
    const updatedConfig: OpenClawConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        list: updatedAgents,
      },
    };
    
    await writeConfigFile(updatedConfig);
    console.log(`[Config] ✓ Removed ${normalizedTargetId} from allowAgents:`, updatedAllowAgents);
    return true;
    
  } catch (error) {
    console.error(`[Config] Failed to remove ${targetAgentId} from allowAgents:`, error);
    return false;
  }
}
