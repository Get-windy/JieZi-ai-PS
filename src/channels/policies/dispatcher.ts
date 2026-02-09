/**
 * 消息派发器
 *
 * 功能：根据策略结果决定消息如何派发
 */

import type { PolicyResult } from "../policies/types.js";

/**
 * 派发结果
 */
export type DispatchResult = {
  /** 是否成功派发 */
  dispatched: boolean;

  /** 派发的目标列表 */
  targets?: Array<{
    channelId: string;
    accountId: string;
    to?: string;
  }>;

  /** 派发结果（针对每个目标） */
  results?: Array<{
    target: {
      channelId: string;
      accountId: string;
      to?: string;
    };
    success: boolean;
    error?: string;
  }>;

  /** 如果派发失败，失败原因 */
  reason?: string;

  /** 采取的动作 */
  action?: "allow" | "drop" | "auto-reply" | "route" | "broadcast";
};

/**
 * 消息派发器类
 */
export class MessageDispatcher {
  /**
   * 根据策略结果派发消息
   *
   * @param policyResult - 策略处理结果
   * @param message - 原始消息
   * @param sendMessage - 发送消息的函数
   * @returns 派发结果
   */
  async dispatch(
    policyResult: PolicyResult,
    message: any,
    sendMessage: (
      target: {
        channelId: string;
        accountId: string;
        to?: string;
      },
      content: any,
    ) => Promise<void>,
  ): Promise<DispatchResult> {
    // 如果策略不允许处理
    if (!policyResult.allow) {
      // 检查是否需要自动回复
      if (policyResult.autoReply) {
        return await this.handleAutoReply(policyResult, message, sendMessage);
      }

      // 检查是否需要路由到其他通道
      if (policyResult.routeTo && policyResult.routeTo.length > 0) {
        return await this.handleRoute(policyResult, message, sendMessage);
      }

      // 策略拒绝，不做任何处理
      return {
        dispatched: false,
        reason: policyResult.reason || "Policy rejected",
        action: "drop",
      };
    }

    // 策略允许，正常处理
    return {
      dispatched: true,
      action: "allow",
    };
  }

  /**
   * 处理自动回复
   */
  private async handleAutoReply(
    policyResult: PolicyResult,
    message: any,
    sendMessage: (target: any, content: any) => Promise<void>,
  ): Promise<DispatchResult> {
    if (!message.from) {
      return {
        dispatched: false,
        reason: "Cannot auto-reply: no sender information",
        action: "auto-reply",
      };
    }

    try {
      const target = {
        channelId: message.channelId,
        accountId: message.accountId,
        to: message.from,
      };

      await sendMessage(target, {
        content: policyResult.autoReply,
        type: "text",
      });

      return {
        dispatched: true,
        targets: [target],
        action: "auto-reply",
      };
    } catch (error) {
      return {
        dispatched: false,
        reason: `Auto-reply failed: ${error instanceof Error ? error.message : String(error)}`,
        action: "auto-reply",
      };
    }
  }

  /**
   * 处理路由（转发或广播）
   */
  private async handleRoute(
    policyResult: PolicyResult,
    message: any,
    sendMessage: (target: any, content: any) => Promise<void>,
  ): Promise<DispatchResult> {
    const targets = policyResult.routeTo || [];

    if (targets.length === 0) {
      return {
        dispatched: false,
        reason: "No routing targets specified",
        action: "route",
      };
    }

    // 准备发送的消息内容
    const messageContent = policyResult.transformedMessage || {
      content: message.content,
      type: message.type,
      attachments: message.attachments,
      metadata: message.metadata,
    };

    // 检查是否需要延迟
    const delayMs = policyResult.metadata?.delayMs as number | undefined;
    if (delayMs && delayMs > 0) {
      await this.delay(delayMs);
    }

    // 检查是否为广播模式
    const isBroadcast = policyResult.metadata?.broadcast === true;
    const isConcurrent = policyResult.metadata?.concurrent !== false;

    const results: DispatchResult["results"] = [];

    if (isBroadcast && isConcurrent) {
      // 并发广播
      const promises = targets.map(async (target) => {
        try {
          await sendMessage(target, messageContent);
          return {
            target,
            success: true,
          };
        } catch (error) {
          return {
            target,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const settled = await Promise.allSettled(promises);
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            target: targets[index],
            success: false,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      });
    } else {
      // 串行发送
      const intervalMs = (policyResult.metadata?.intervalMs as number) || 0;

      for (const target of targets) {
        try {
          await sendMessage(target, messageContent);
          results.push({
            target,
            success: true,
          });

          // 如果有间隔，等待
          if (intervalMs > 0) {
            await this.delay(intervalMs);
          }
        } catch (error) {
          results.push({
            target,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return {
      dispatched: successCount > 0,
      targets,
      results,
      action: isBroadcast ? "broadcast" : "route",
      reason: successCount === 0 ? "All routing attempts failed" : undefined,
    };
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 导出单例实例
 */
export const messageDispatcher = new MessageDispatcher();
