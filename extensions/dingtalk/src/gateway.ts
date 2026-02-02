import type { RuntimeApi, OpenClawConfig } from "openclaw/plugin-sdk";
import { getDingtalkRuntime } from "./runtime.js";

export interface DingtalkMonitorOptions {
  accountId: string;
  config: OpenClawConfig;
  runtime: RuntimeApi;
  abortSignal: AbortSignal;
}

export async function monitorDingtalkProvider(
  options: DingtalkMonitorOptions
): Promise<() => void> {
  const { accountId, config, runtime, abortSignal } = options;
  
  const dingtalkConfig = config.channels?.dingtalk?.accounts?.[accountId];
  if (!dingtalkConfig) {
    throw new Error(`DingTalk account '${accountId}' not found in configuration`);
  }

  const { appKey, appSecret } = dingtalkConfig;
  if (!appKey || !appSecret) {
    throw new Error("DingTalk appKey and appSecret are required");
  }

  // 导入钉钉 Stream SDK
  const DWClient = (await import("dingtalk-stream-sdk-nodejs")).default;

  const client = new DWClient({
    clientId: appKey,
    clientSecret: appSecret,
  });

  // 注册消息监听器
  client.registerCallbackListener("/v1.0/im/bot/messages/get", async (res: any) => {
    try {
      const { text, senderStaffId, conversationId, conversationType } = res;
      
      // 构建消息上下文
      const messageContext = {
        channel: "dingtalk" as const,
        accountId,
        from: senderStaffId,
        to: conversationId,
        text: text?.content || "",
        chatType: conversationType === "1" ? "direct" : "group",
      };

      // 通过 runtime 处理消息
      const reply = await runtime.channel.processInboundMessage?.(messageContext);
      
      if (reply?.text) {
        await sendDingtalkMessage({
          client,
          conversationId,
          message: reply.text,
        });
      }
    } catch (error) {
      runtime.logging.error("DingTalk message processing error:", error);
    }
  });

  // 启动客户端
  await client.connect();

  // 监听 abort 信号
  const cleanup = () => {
    client.disconnect();
  };

  abortSignal.addEventListener("abort", cleanup);

  return () => {
    abortSignal.removeEventListener("abort", cleanup);
    cleanup();
  };
}

async function sendDingtalkMessage(params: {
  client: any;
  conversationId: string;
  message: string;
}) {
  const { client, conversationId, message } = params;
  
  // 使用钉钉 API 发送消息
  await client.socketCallBack({
    conversationId,
    msgtype: "text",
    text: {
      content: message,
    },
  });
}

export async function sendMessageDingtalk(
  to: string,
  text: string,
  options: {
    accountId?: string;
    config?: OpenClawConfig;
  }
): Promise<{ messageId?: string; ok: boolean }> {
  const runtime = getDingtalkRuntime();
  const cfg = options.config ?? (await runtime.config.loadConfig());
  const accountId = options.accountId ?? "default";
  
  const dingtalkConfig = cfg.channels?.dingtalk?.accounts?.[accountId];
  if (!dingtalkConfig) {
    throw new Error(`DingTalk account '${accountId}' not found`);
  }

  const { appKey, appSecret } = dingtalkConfig;
  if (!appKey || !appSecret) {
    throw new Error("DingTalk appKey and appSecret are required");
  }

  // 获取 access_token 并发送消息
  // 这里需要实现钉钉的消息发送逻辑
  // 暂时返回成功标记
  return { ok: true };
}
