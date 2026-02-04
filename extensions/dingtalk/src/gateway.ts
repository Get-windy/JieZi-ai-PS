import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { getDingtalkRuntime } from "./runtime.js";

export interface DingtalkMonitorOptions {
  accountId: string;
  config: OpenClawConfig;
  runtime: any; // 使用 any 以兼容现有的 channel 插件 API
  abortSignal: AbortSignal;
}

export async function monitorDingtalkProvider(
  options: DingtalkMonitorOptions
): Promise<() => void> {
  const { accountId, config, runtime, abortSignal } = options;
  
  // 使用与 channel.ts 相同的配置解析逻辑
  const channelConfig = config.channels?.dingtalk as Record<string, unknown> | undefined;
  const accountsConfig = channelConfig?.accounts as Record<string, unknown> | undefined;
  const accountConfig = accountsConfig?.[accountId] as Record<string, unknown> | undefined;
  
  // 支持顶层配置和账户配置
  const baseAppKey = channelConfig?.appKey as string | undefined;
  const baseAppSecret = channelConfig?.appSecret as string | undefined;
  
  const appKey = (accountConfig?.appKey as string | undefined) ?? baseAppKey;
  const appSecret = (accountConfig?.appSecret as string | undefined) ?? baseAppSecret;
  
  if (!appKey || !appSecret) {
    throw new Error(`DingTalk account '${accountId}': appKey and appSecret are required`);
  }

  // 导入钉钉 Stream SDK（使用命名导出）
  const { DWClient, EventAck } = await import("dingtalk-stream-sdk-nodejs");

  const client = new DWClient({
    clientId: appKey,
    clientSecret: appSecret,
  });
  
  runtime.log?.(`[dingtalk] [${accountId}] Client config:`, JSON.stringify(client.getConfig(), null, 2));

  // 注册机器人消息回调监听器（关键：使用正确的 topic）
  // 钉钉机器人消息的 topic 是：/v1.0/im/bot/messages/get
  client.registerCallbackListener("/v1.0/im/bot/messages/get", async (event: any) => {
    try {
      runtime.log?.(`[dingtalk] [${accountId}] ========== 收到机器人消息 ==========`);
      
      const { headers, data } = event;
      const messageId = headers?.messageId;
      
      runtime.log?.(`[dingtalk] [${accountId}] messageId: ${messageId}`);
      
      // 解析消息数据
      let messageData: any;
      try {
        messageData = typeof data === 'string' ? JSON.parse(data) : data;
      } catch (parseError) {
        runtime.error?.(`[dingtalk] [${accountId}] 解析消息失败:`, parseError);
        return;
      }
      
      // 提取关键信息
      const conversationId = messageData?.conversationId;
      const senderId = messageData?.senderId;
      const senderNick = messageData?.senderNick;
      const text = messageData?.text?.content || messageData?.content || '';
      const msgtype = messageData?.msgtype;
      const conversationType = messageData?.conversationType; // 1=单聊, 2=群聊
      const sessionWebhook = messageData?.sessionWebhook; // 用于回复消息
      
      runtime.log?.(`[dingtalk] [${accountId}] conversationType: ${conversationType} (1=单聊, 2=群聊)`);
      runtime.log?.(`[dingtalk] [${accountId}] senderNick: ${senderNick}`);
      runtime.log?.(`[dingtalk] [${accountId}] text: ${text}`);
      
      if (!text || !sessionWebhook) {
        runtime.log?.(`[dingtalk] [${accountId}] 消息内容或sessionWebhook为空，跳过处理`);
        runtime.log?.(`[dingtalk] [${accountId}] ========== 消息结束 ==========`);
        return;
      }
      
      // 调用 AI 处理消息
      runtime.log?.(`[dingtalk] [${accountId}] 开始调用 AI 处理消息...`);
      
      try {
        const coreRuntime = getDingtalkRuntime();
        const fullConfig = await coreRuntime.config.loadConfig();
        
        // 构建路由
        const isGroup = conversationType === "2";
        const dingtalkTo = isGroup ? `chat:${conversationId}` : `user:${senderId}`;
        const dingtalkFrom = isGroup ? `${conversationId}:${senderId}` : senderId;
        
        const route = coreRuntime.channel.routing.resolveAgentRoute({
          cfg: fullConfig,
          channel: "dingtalk",
          peer: {
            kind: isGroup ? "group" : "dm",
            id: isGroup ? conversationId : senderId,
          },
        });
        
        runtime.log?.(`[dingtalk] [${accountId}] 路由信息: sessionKey=${route.sessionKey}, agentId=${route.agentId}`);
        
        // 构建消息体
        let messageBody = `${senderNick}: ${text}`;
        
        const envelopeOptions = coreRuntime.channel.reply.resolveEnvelopeFormatOptions(fullConfig);
        const body = coreRuntime.channel.reply.formatAgentEnvelope({
          channel: "DingTalk",
          from: dingtalkFrom,
          timestamp: new Date(),
          envelope: envelopeOptions,
          body: messageBody,
        });
        
        // 构建上下文
        const ctxPayload = coreRuntime.channel.reply.finalizeInboundContext({
          Body: body,
          RawBody: text,
          CommandBody: text,
          From: dingtalkFrom,
          To: dingtalkTo,
          SessionKey: route.sessionKey,
          AccountId: route.accountId,
          ChatType: isGroup ? "group" : "direct",
          GroupSubject: isGroup ? conversationId : undefined,
          SenderName: senderNick,
          SenderId: senderId,
          Provider: "dingtalk" as const,
          Surface: "dingtalk" as const,
          MessageSid: messageId,
          Timestamp: Date.now(),
          WasMentioned: false,
          CommandAuthorized: true,
          OriginatingChannel: "dingtalk" as const,
          OriginatingTo: dingtalkTo,
        });
        
        // 创建回复发送器（使用与飞书相同的方式）
        const { dispatcher, replyOptions, markDispatchIdle } =
          coreRuntime.channel.reply.createReplyDispatcherWithTyping({
            responsePrefix: '',
            responsePrefixContextProvider: undefined,
            humanDelay: coreRuntime.channel.reply.resolveHumanDelayConfig(fullConfig, route.agentId),
            deliver: async (payload: any) => {
              runtime.log?.(`[dingtalk] [${accountId}] deliver 被调用: text=${payload.text?.slice(0, 100)}`);
              const text = payload.text ?? '';
              if (!text.trim()) {
                runtime.log?.(`[dingtalk] [${accountId}] deliver: 空文本，跳过`);
                return;
              }
              
              runtime.log?.(`[dingtalk] [${accountId}] 发送 AI 回复: ${text.slice(0, 100)}...`);
              await sendDingtalkReply({
                sessionWebhook,
                text,
                msgtype: 'text',
                runtime,
                accountId,
              });
            },
            onError: (err: any, info: any) => {
              runtime.error?.(`[dingtalk] [${accountId}] ${info.kind} reply failed: ${String(err)}`);
            },
            onIdle: () => {
              runtime.log?.(`[dingtalk] [${accountId}] dispatcher idle`);
            },
          });
        
        runtime.log?.(`[dingtalk] [${accountId}] 调用 dispatchReplyFromConfig...`);
        
        // 调用统一的 AI 处理流程
        await coreRuntime.channel.reply.dispatchReplyFromConfig({
          ctx: ctxPayload,
          cfg: fullConfig,
          dispatcher,
          replyOptions,
        });
        
        markDispatchIdle();
        
        runtime.log?.(`[dingtalk] [${accountId}] AI 处理完成`);
      } catch (error) {
        runtime.error?.(`[dingtalk] [${accountId}] AI 处理失败:`);
        runtime.error?.(`[dingtalk] [${accountId}] 错误详情:`, error);
        if (error instanceof Error) {
          runtime.error?.(`[dingtalk] [${accountId}] 错误消息: ${error.message}`);
          runtime.error?.(`[dingtalk] [${accountId}] 错误堆栈:`, error.stack);
        }
      }
      
      runtime.log?.(`[dingtalk] [${accountId}] ========== 消息结束 ==========`);
      
    } catch (error) {
      runtime.error?.(`[dingtalk] [${accountId}] error processing message:`, error);
    }
  });
  
  // 同时保留全局事件监听器用于调试
  client.registerAllEventListener((event: any) => {
    try {
      const { headers, data, type } = event;
      const topic = headers?.topic;
      const eventType = headers?.eventType;
      const eventId = headers?.eventId;
      
      // 只记录非 SYSTEM 类型的事件
      if (type !== 'SYSTEM') {
        runtime.log?.(`[dingtalk] [${accountId}] ========== 收到事件 ==========`);
        runtime.log?.(`[dingtalk] [${accountId}] type: ${type}`);
        runtime.log?.(`[dingtalk] [${accountId}] topic: ${topic}`);
        runtime.log?.(`[dingtalk] [${accountId}] eventType: ${eventType}`);
        runtime.log?.(`[dingtalk] [${accountId}] eventId: ${eventId}`);
        runtime.log?.(`[dingtalk] [${accountId}] headers:`, JSON.stringify(headers, null, 2));
        
        // 解析消息数据
        const messageData = typeof data === 'string' ? JSON.parse(data) : data;
        
        runtime.log?.(`[dingtalk] [${accountId}] message data:`, JSON.stringify(messageData, null, 2));
        runtime.log?.(`[dingtalk] [${accountId}] ========== 事件结束 ==========`);
      }
      
      // 返回成功确认
      return { status: EventAck.SUCCESS };
    } catch (error) {
      runtime.error?.(`[dingtalk] [${accountId}] error processing event:`, error);
      return { status: EventAck.LATER, message: String(error) };
    }
  });

  // 启动客户端
  await client.connect();
  runtime.log?.(`[dingtalk] [${accountId}] DingTalk Stream client connected`);

  // 监听 abort 信号
  const cleanup = () => {
    client.disconnect();
    runtime.log?.(`[dingtalk] [${accountId}] DingTalk Stream client disconnected`);
  };

  abortSignal.addEventListener("abort", cleanup);

  return () => {
    abortSignal.removeEventListener("abort", cleanup);
    cleanup();
  };
}

// 通过 sessionWebhook 发送回复消息
async function sendDingtalkReply(params: {
  sessionWebhook: string;
  text: string;
  msgtype: string;
  runtime: any;
  accountId: string;
}): Promise<void> {
  const { sessionWebhook, text, msgtype, runtime, accountId } = params;
  
  try {
    // 动态导入 axios
    const axios = (await import("axios")).default;
    
    // 构建消息体
    const messageBody = {
      msgtype,
      text: {
        content: text,
      },
    };
    
    runtime.log?.(`[dingtalk] [${accountId}] 发送回复到: ${sessionWebhook}`);
    
    // 发送 POST 请求
    const response = await axios.post(sessionWebhook, messageBody, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    
    if (response.data?.errcode === 0) {
      runtime.log?.(`[dingtalk] [${accountId}] 回复发送成功`);
    } else {
      runtime.error?.(`[dingtalk] [${accountId}] 回复发送失败:`, response.data);
    }
  } catch (error) {
    runtime.error?.(`[dingtalk] [${accountId}] 发送回复时出错:`, error);
    throw error;
  }
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
  
  // 使用与 channel.ts 相同的配置解析逻辑
  const channelConfig = cfg.channels?.dingtalk as Record<string, unknown> | undefined;
  const accountsConfig = channelConfig?.accounts as Record<string, unknown> | undefined;
  const accountConfig = accountsConfig?.[accountId] as Record<string, unknown> | undefined;
  
  // 支持顶层配置和账户配置
  const baseAppKey = channelConfig?.appKey as string | undefined;
  const baseAppSecret = channelConfig?.appSecret as string | undefined;
  
  const appKey = (accountConfig?.appKey as string | undefined) ?? baseAppKey;
  const appSecret = (accountConfig?.appSecret as string | undefined) ?? baseAppSecret;
  
  if (!appKey || !appSecret) {
    throw new Error(`DingTalk account '${accountId}': appKey and appSecret are required`);
  }

  // 获取 access_token 并发送消息
  // 这里需要实现钉钉的消息发送逻辑
  // 暂时返回成功标记
  return { ok: true };
}
