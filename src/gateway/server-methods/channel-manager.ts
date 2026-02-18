/**
 * Phase 3 - Channel Manager Gateway Handlers
 * 通道管理器的 Gateway 处理器
 */

import type { GatewayRequestHandlers } from "./types.js";
import { channelManager } from "../../channels/channel-manager.js";
import type {
  ChannelAccountBinding,
  ChannelPolicyConfig,
} from "../../config/types.channel-bindings.js";

/**
 * 通道管理器 Gateway 处理器
 */
export const channelManagerHandlers: GatewayRequestHandlers = {
  /**
   * 列出智能助手的所有通道绑定
   */
  "channels.bindings.list": async ({ params, respond }) => {
    try {
      const { agentId, channelId, enabled } = params as {
        agentId: string;
        channelId?: string;
        enabled?: boolean;
      };

      const bindings = await channelManager.listBindings(agentId, { channelId, enabled });

      respond(true, { bindings });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to list bindings",
      });
    }
  },

  /**
   * 添加通道绑定
   */
  "channels.bindings.add": async ({ params, respond }) => {
    try {
      const { agentId, binding } = params as {
        agentId: string;
        binding: ChannelAccountBinding;
      };

      const result = await channelManager.addChannelBinding(agentId, binding);

      respond(true, result);
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to add binding",
      });
    }
  },

  /**
   * 更新通道绑定
   */
  "channels.bindings.update": async ({ params, respond }) => {
    try {
      const { agentId, bindingId, updates } = params as {
        agentId: string;
        bindingId: string;
        updates: Partial<ChannelAccountBinding>;
      };

      const result = await channelManager.updateChannelBinding(agentId, bindingId, updates);

      respond(true, result);
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to update binding",
      });
    }
  },

  /**
   * 删除通道绑定
   */
  "channels.bindings.remove": async ({ params, respond }) => {
    try {
      const { agentId, bindingId } = params as {
        agentId: string;
        bindingId: string;
      };

      const result = await channelManager.removeChannelBinding(agentId, bindingId);

      respond(true, result);
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to remove binding",
      });
    }
  },

  /**
   * 启用通道绑定
   */
  "channels.bindings.enable": async ({ params, respond }) => {
    try {
      const { agentId, bindingId } = params as {
        agentId: string;
        bindingId: string;
      };

      const result = await channelManager.enableChannelBinding(agentId, bindingId);

      respond(true, result);
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to enable binding",
      });
    }
  },

  /**
   * 禁用通道绑定
   */
  "channels.bindings.disable": async ({ params, respond }) => {
    try {
      const { agentId, bindingId } = params as {
        agentId: string;
        bindingId: string;
      };

      const result = await channelManager.disableChannelBinding(agentId, bindingId);

      respond(true, result);
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to disable binding",
      });
    }
  },

  /**
   * 更新绑定策略
   */
  "channels.bindings.updatePolicy": async ({ params, respond }) => {
    try {
      const { agentId, bindingId, policy } = params as {
        agentId: string;
        bindingId: string;
        policy: ChannelPolicyConfig;
      };

      const result = await channelManager.updateBindingPolicy(agentId, bindingId, policy);

      respond(true, result);
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to update binding policy",
      });
    }
  },

  /**
   * 批量更新绑定优先级
   */
  "channels.bindings.updatePriorities": async ({ params, respond }) => {
    try {
      const { agentId, priorities } = params as {
        agentId: string;
        priorities: Record<string, number>;
      };

      const result = await channelManager.updateBindingPriorities(agentId, priorities);

      respond(true, result);
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to update binding priorities",
      });
    }
  },

  /**
   * 获取默认策略
   */
  "channels.defaultPolicy.get": async ({ params, respond }) => {
    try {
      const { agentId } = params as { agentId: string };

      const policy = await channelManager.getDefaultPolicy(agentId);

      respond(true, { policy });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to get default policy",
      });
    }
  },

  /**
   * 设置默认策略
   */
  "channels.defaultPolicy.set": async ({ params, respond }) => {
    try {
      const { agentId, policy } = params as {
        agentId: string;
        policy: ChannelPolicyConfig;
      };

      const result = await channelManager.setDefaultPolicy(agentId, policy);

      respond(true, result);
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to set default policy",
      });
    }
  },

  /**
   * 获取指定绑定
   */
  "channels.bindings.get": async ({ params, respond }) => {
    try {
      const { agentId, bindingId } = params as {
        agentId: string;
        bindingId: string;
      };

      const binding = await channelManager.getBinding(agentId, bindingId);

      respond(true, { binding });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to get binding",
      });
    }
  },

  /**
   * 根据通道查找绑定
   */
  "channels.bindings.findByChannel": async ({ params, respond }) => {
    try {
      const { agentId, channelId, accountId } = params as {
        agentId: string;
        channelId: string;
        accountId: string;
      };

      const binding = await channelManager.findBindingByChannel(agentId, channelId, accountId);

      respond(true, { binding });
    } catch (error) {
      respond(false, undefined, {
        code: -32000,
        message: error instanceof Error ? error.message : "Failed to find binding by channel",
      });
    }
  },
};
