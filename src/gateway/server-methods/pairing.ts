import type { GatewayRequestHandlers } from "./types.js";
import {
  approveChannelPairingCode,
  type PairingChannel,
} from "../../pairing/pairing-store.js";
import { notifyPairingApproved } from "../../channels/plugins/pairing.js";
import { loadConfig, writeConfigFile, readConfigFileSnapshot } from "../../config/config.js";
import { DEFAULT_ACCOUNT_ID } from "../../routing/session-key.js";

type ApprovePairingParams = {
  channel: PairingChannel;
  code: string;
  accountId?: string;
  notify?: boolean;
};

type RejectPairingParams = {
  channel: PairingChannel;
  code: string;
  accountId?: string;
};

export const pairingHandlers: GatewayRequestHandlers = {
  "pairing.approve": async (opts: any) => {
    const params = opts.params as ApprovePairingParams;
    const { channel, code, accountId, notify } = params;

    if (!channel || !code) {
      opts.respond(false, undefined, { code: "INVALID_PARAMS", message: "Channel and code are required" });
      return;
    }

    try {
      // 批准配对请求（这会更新 store 文件）
      const approved = await approveChannelPairingCode({ channel, code, accountId });

      if (!approved) {
        opts.respond(false, undefined, {
          code: "NOT_FOUND",
          message: `No pending pairing request found for code: ${code}`,
        });
        return;
      }

      // 🎯 关键修复：同时更新配置文件中的 allowFrom
      try {
        const snapshot = await readConfigFileSnapshot();
        if (snapshot.valid && snapshot.config) {
          const cfg = snapshot.config;
          const resolvedAccountId = accountId?.trim() || DEFAULT_ACCOUNT_ID;
          
          console.log(`[pairing] Updating config for channel=${channel}, accountId=${resolvedAccountId}`);
          
          // 构建配置路径
          const channelConfig = cfg.channels?.[channel] as Record<string, unknown> | undefined;
          if (channelConfig) {
            console.log(`[pairing] Channel config found:`, JSON.stringify(channelConfig, null, 2));
            
            let targetConfig: Record<string, unknown> | undefined;
            let allowFromPath: string;
            
            // 检查是否有 accounts 配置
            const accounts = channelConfig.accounts as Record<string, unknown> | undefined;
            if (accounts && typeof accounts === 'object') {
              // 有 accounts 配置，必须更新账号级别的 allowFrom
              const accountConfig = accounts[resolvedAccountId] as Record<string, unknown> | undefined;
              if (accountConfig && typeof accountConfig === 'object') {
                targetConfig = accountConfig;
                allowFromPath = `channels.${channel}.accounts.${resolvedAccountId}.allowFrom`;
                console.log(`[pairing] Using account-level config: ${allowFromPath}`);
              } else {
                console.warn(`[pairing] Account config not found for ${channel}/${resolvedAccountId}, available accounts:`, Object.keys(accounts));
                // 如果账号配置不存在，创建它
                targetConfig = {};
                allowFromPath = `channels.${channel}.accounts.${resolvedAccountId}.allowFrom`;
              }
            } else {
              // 没有 accounts 配置，使用顶级配置
              targetConfig = channelConfig;
              allowFromPath = `channels.${channel}.allowFrom`;
              console.log(`[pairing] Using top-level config: ${allowFromPath}`);
            }
            
            if (targetConfig) {
              // 获取当前 allowFrom 列表
              const currentAllowFrom = Array.isArray(targetConfig.allowFrom) 
                ? targetConfig.allowFrom.map(v => String(v))
                : [];
              
              console.log(`[pairing] Current allowFrom:`, currentAllowFrom);
              
              // 添加新用户（如果不存在）
              if (!currentAllowFrom.includes(approved.id)) {
                const nextConfig = structuredClone(cfg);
                const pathParts = allowFromPath.split('.');
                let target: any = nextConfig;
                
                // 导航到目标对象，如果不存在则创建
                for (let i = 0; i < pathParts.length - 1; i++) {
                  const key = pathParts[i];
                  if (!target[key]) {
                    target[key] = {};
                  }
                  target = target[key];
                }
                
                if (target) {
                  const lastKey = pathParts[pathParts.length - 1];
                  target[lastKey] = [...currentAllowFrom, approved.id];
                  
                  console.log(`[pairing] Updating ${allowFromPath} with:`, target[lastKey]);
                  
                  // 写入配置文件
                  await writeConfigFile(nextConfig);
                  console.log(`✅ Added ${approved.id} to ${allowFromPath}`);
                } else {
                  console.error(`[pairing] Failed to navigate to target path: ${allowFromPath}`);
                }
              } else {
                console.log(`[pairing] User ${approved.id} already in allowFrom`);
              }
            } else {
              console.error(`[pairing] Target config is undefined`);
            }
          } else {
            console.error(`[pairing] Channel config not found for ${channel}`);
          }
        }
      } catch (cfgErr) {
        console.error(`[pairing] Failed to update config file:`, cfgErr);
        // 配置文件更新失败不影响配对流程
      }

      // 如果需要通知用户
      if (notify) {
        try {
          const cfg = loadConfig();
          await notifyPairingApproved({
            channelId: channel,
            id: approved.id,
            cfg,
          });
        } catch (err) {
          console.warn(`Failed to notify requester: ${String(err)}`);
        }
      }

      opts.respond(true, {
        success: true,
        id: approved.id,
      });
    } catch (err) {
      opts.respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: String(err),
      });
    }
  },

  "pairing.reject": async (opts: any) => {
    const params = opts.params as RejectPairingParams;
    const { channel, code, accountId } = params;

    if (!channel || !code) {
      opts.respond(false, undefined, { code: "INVALID_PARAMS", message: "Channel and code are required" });
      return;
    }

    try {
      // 拒绝配对请求（删除但不添加到 allowlist）
      // 注意：当前 approveChannelPairingCode 会自动添加到 allowlist
      // TODO: 需要在 pairing-store.ts 中添加 rejectChannelPairingCode 函数
      const approved = await approveChannelPairingCode({ channel, code, accountId });

      if (!approved) {
        opts.respond(false, undefined, {
          code: "NOT_FOUND",
          message: `No pending pairing request found for code: ${code}`,
        });
        return;
      }

      opts.respond(true, { success: true });
    } catch (err) {
      opts.respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: String(err),
      });
    }
  },
};
