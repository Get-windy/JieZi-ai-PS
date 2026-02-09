/**
 * Phase 5: Agent Model Accounts and Channel Policies Controllers
 * 智能助手模型账号和通道策略数据加载
 */

import type { GatewayBrowserClient } from "../gateway.ts";

export type AgentPhase5State = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  modelAccountsConfig: Record<string, unknown> | null;
  modelAccountsLoading: boolean;
  modelAccountsError: string | null;
  modelAccountsSaving: boolean;
  modelAccountsSaveSuccess: boolean;
  channelPoliciesConfig: Record<string, unknown> | null;
  channelPoliciesLoading: boolean;
  channelPoliciesError: string | null;
  channelPoliciesSaving: boolean;
  channelPoliciesSaveSuccess: boolean;
};

/**
 * 加载智能助手的模型账号配置
 */
export async function loadModelAccounts(state: AgentPhase5State, agentId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.modelAccountsLoading) {
    return;
  }

  state.modelAccountsLoading = true;
  state.modelAccountsError = null;

  try {
    const result = await state.client.request<Record<string, unknown>>("agent.modelAccounts.get", {
      agentId,
    });
    if (result) {
      state.modelAccountsConfig = result;
    }
  } catch (err) {
    state.modelAccountsError = String(err);
  } finally {
    state.modelAccountsLoading = false;
  }
}

/**
 * 加载智能助手的通道策略配置
 */
export async function loadChannelPolicies(state: AgentPhase5State, agentId: string) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.channelPoliciesLoading) {
    return;
  }

  state.channelPoliciesLoading = true;
  state.channelPoliciesError = null;

  try {
    const result = await state.client.request<Record<string, unknown>>(
      "agent.channelPolicies.get",
      { agentId },
    );
    if (result) {
      state.channelPoliciesConfig = result;
    }
  } catch (err) {
    state.channelPoliciesError = String(err);
  } finally {
    state.channelPoliciesLoading = false;
  }
}

/**
 * 保存智能助手的模型账号配置
 */
export async function saveModelAccounts(
  state: AgentPhase5State,
  agentId: string,
  config: Record<string, unknown>,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  state.modelAccountsSaving = true;
  state.modelAccountsError = null;
  state.modelAccountsSaveSuccess = false;

  try {
    await state.client.request("agent.modelAccounts.update", {
      agentId,
      config,
    });
    state.modelAccountsConfig = config;
    state.modelAccountsSaveSuccess = true;

    // 3秒后清除成功提示
    setTimeout(() => {
      state.modelAccountsSaveSuccess = false;
    }, 3000);
  } catch (err) {
    state.modelAccountsError = String(err);
    throw err;
  } finally {
    state.modelAccountsSaving = false;
  }
}

/**
 * 保存智能助手的通道策略配置
 */
export async function saveChannelPolicies(
  state: AgentPhase5State,
  agentId: string,
  config: Record<string, unknown>,
) {
  if (!state.client || !state.connected) {
    throw new Error("Not connected to gateway");
  }

  state.channelPoliciesSaving = true;
  state.channelPoliciesError = null;
  state.channelPoliciesSaveSuccess = false;

  try {
    await state.client.request("agent.channelPolicies.update", {
      agentId,
      config,
    });
    state.channelPoliciesConfig = config;
    state.channelPoliciesSaveSuccess = true;

    // 3秒后清除成功提示
    setTimeout(() => {
      state.channelPoliciesSaveSuccess = false;
    }, 3000);
  } catch (err) {
    state.channelPoliciesError = String(err);
    throw err;
  } finally {
    state.channelPoliciesSaving = false;
  }
}
