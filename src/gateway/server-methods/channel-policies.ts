/**
 * Phase 2: 通道策略管理 Gateway RPC 方法
 *
 * 提供通道策略的查询、设置、测试等操作
 */

import type { ChannelPolicy } from "../../config/types.channel-policies.js";
import type { GatewayRequestHandlers } from "./types.js";
import { policyEngineManager } from "../../channels/policy-integration.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * 通道策略管理 RPC Handlers
 */
export const channelPoliciesHandlers: GatewayRequestHandlers = {
  /**
   * channel.policy.get - 获取智能助手的通道策略配置
   */
  "channel.policy.get": async ({ params, respond }) => {
    const agentId = (params as { agentId?: unknown }).agentId;
    const channelId = (params as { channelId?: unknown }).channelId;

    // 参数验证
    if (!agentId || typeof agentId !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required and must be a string"),
      );
      return;
    }

    // 获取策略引擎
    const engine = policyEngineManager.getEngine(agentId);
    if (!engine) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `No policy engine found for agent: ${agentId}`),
      );
      return;
    }

    // 如果指定了 channelId，返回该通道的策略
    if (channelId && typeof channelId === "string") {
      const policy = engine.getPolicy(channelId);
      respond(true, {
        ok: true,
        policy: policy ?? null,
      });
      return;
    }

    // 否则返回所有通道的策略
    const config = loadConfig();
    const agent = config.agents?.list?.find((a: any) => a.id === agentId);
    const channelPolicies = (agent as any)?.channelPolicies;

    respond(true, {
      ok: true,
      policies: channelPolicies?.policies || {},
      defaultPolicy: channelPolicies?.defaultPolicy || null,
    });
  },

  /**
   * channel.policy.set - 设置智能助手的通道策略
   */
  "channel.policy.set": async ({ params, respond }) => {
    const agentId = (params as { agentId?: unknown }).agentId;
    const channelId = (params as { channelId?: unknown }).channelId;
    const policy = (params as { policy?: unknown }).policy;

    // 参数验证
    if (!agentId || typeof agentId !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required and must be a string"),
      );
      return;
    }

    if (!channelId || typeof channelId !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "channelId is required and must be a string"),
      );
      return;
    }

    if (!policy || typeof policy !== "object") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "policy is required and must be an object"),
      );
      return;
    }

    // 验证策略类型
    const validPolicyTypes = [
      "private",
      "monitor",
      "listen-only",
      "filter",
      "scheduled",
      "forward",
      "smart-route",
      "broadcast",
      "round-robin",
      "queue",
      "moderate",
      "echo",
    ];

    if (!validPolicyTypes.includes((policy as ChannelPolicy).type)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Invalid policy type: ${(policy as ChannelPolicy).type}`,
        ),
      );
      return;
    }

    // 设置策略
    try {
      policyEngineManager.setPolicy(agentId, channelId, policy as ChannelPolicy);

      respond(true, {
        ok: true,
        message: `Policy set successfully for agent ${agentId}, channel ${channelId}`,
      });
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Failed to set policy: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  },

  /**
   * channel.policy.test - 测试策略配置
   */
  "channel.policy.test": async ({ params, respond }) => {
    const agentId = (params as { agentId?: unknown }).agentId;
    const channelId = (params as { channelId?: unknown }).channelId;
    const testMessage = (params as { testMessage?: unknown }).testMessage;

    // 参数验证
    if (!agentId || typeof agentId !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required and must be a string"),
      );
      return;
    }

    if (!channelId || typeof channelId !== "string") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "channelId is required and must be a string"),
      );
      return;
    }

    if (!testMessage || typeof testMessage !== "object") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "testMessage is required and must be an object"),
      );
      return;
    }

    // 获取策略引擎
    const engine = policyEngineManager.getEngine(agentId);
    if (!engine) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `No policy engine found for agent: ${agentId}`),
      );
      return;
    }

    // 构造测试上下文
    const testContext = {
      agentId,
      channelId,
      accountId: (testMessage as any).accountId || "test-account",
      message: (testMessage as any).content || "test message",
      senderId: (testMessage as any).senderId || "test-sender",
      timestamp: Date.now(),
      metadata: {
        test: true,
        ...(testMessage as any).metadata,
      },
    };

    // 执行策略测试
    try {
      const result = await engine.execute(testContext);

      respond(true, {
        ok: true,
        result: {
          allow: result.allow,
          reason: result.reason,
          policyType: result.policyType,
          transformedMessage: result.transformedMessage,
          forwardTargets: result.forwardTargets,
          metadata: result.metadata,
        },
      });
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Failed to test policy: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  },

  /**
   * channel.policy.list - 列出所有可用的策略类型
   */
  "channel.policy.list": async ({ respond }) => {
    const policyTypes = [
      {
        type: "private",
        name: "私有模式",
        description: "消息只在当前通道处理，不转发",
      },
      {
        type: "monitor",
        name: "长通模式",
        description: "监控指定通道消息并转发到监控通道，标记来源",
      },
      {
        type: "listen-only",
        name: "监听模式",
        description: "只接收消息不回复，记录日志",
      },
      {
        type: "filter",
        name: "过滤模式",
        description: "根据关键词、发送者、时间范围过滤消息",
      },
      {
        type: "scheduled",
        name: "定时模式",
        description: "只在工作时间处理消息，支持节假日配置",
      },
      {
        type: "forward",
        name: "转发模式",
        description: "将消息转发到其他通道",
      },
      {
        type: "smart-route",
        name: "智能路由",
        description: "根据消息内容智能选择目标通道",
      },
      {
        type: "broadcast",
        name: "广播模式",
        description: "一条消息同时发送到多个通道",
      },
      {
        type: "round-robin",
        name: "轮询模式",
        description: "消息轮流分配到不同通道",
      },
      {
        type: "queue",
        name: "队列模式",
        description: "消息排队批量处理",
      },
      {
        type: "moderate",
        name: "审核模式",
        description: "消息需要审核后才能发送",
      },
      {
        type: "echo",
        name: "回声模式",
        description: "自动回复原消息内容（用于测试）",
      },
    ];

    respond(true, {
      ok: true,
      policyTypes,
    });
  },

  /**
   * channel.policy.status - 查询策略引擎状态
   */
  "channel.policy.status": async ({ params, respond }) => {
    const agentId = (params as { agentId?: unknown }).agentId;
    const allEngines = policyEngineManager.getAllEngines();

    // 如果指定了 agentId，只返回该智能助手的状态
    if (agentId && typeof agentId === "string") {
      const engine = allEngines.get(agentId);
      if (!engine) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `No policy engine found for agent: ${agentId}`),
        );
        return;
      }

      respond(true, {
        ok: true,
        status: {
          agentId,
          hasEngine: true,
          policyCount: 0, // TODO: 添加 policy count 方法
        },
      });
      return;
    }

    // 否则返回所有智能助手的状态
    const statuses = Array.from(allEngines.entries()).map(([id, engine]) => ({
      agentId: id,
      hasEngine: !!engine,
      policyCount: 0, // TODO: 添加 policy count 方法
    }));

    respond(true, {
      ok: true,
      statuses,
    });
  },
};
