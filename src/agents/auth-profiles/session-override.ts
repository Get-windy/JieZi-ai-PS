/**
 * Session Auth Profile Override（本地增强版）
 *
 * 扩展上游的 session-override.ts，增加对 modelAccounts.defaultAccountId 的支持
 *
 * 主要改进：
 * 1. 在选择模型时，优先使用助手配置的 defaultAccountId
 * 2. 如果 defaultAccountId 不可用，则回退到上游的轮询逻辑
 * 3. 保持与上游代码的兼容性，方便未来合并
 */

import type { OpenClawConfig } from "../../config/config.js";
import { updateSessionStore, type SessionEntry } from "../../config/sessions.js";
import { resolveAgentModelAccounts } from "../agent-scope.js";
import {
  ensureAuthProfileStore,
  isProfileInCooldown,
  resolveAuthProfileOrder,
} from "../auth-profiles.js";
import { normalizeProviderId } from "../model-selection.js";

function isProfileForProvider(params: {
  provider: string;
  profileId: string;
  store: ReturnType<typeof ensureAuthProfileStore>;
}): boolean {
  const entry = params.store.profiles[params.profileId];
  if (!entry?.provider) {
    return false;
  }
  return normalizeProviderId(entry.provider) === normalizeProviderId(params.provider);
}

export async function clearSessionAuthProfileOverride(params: {
  sessionEntry: SessionEntry;
  sessionStore: Record<string, SessionEntry>;
  sessionKey: string;
  storePath?: string;
}) {
  const { sessionEntry, sessionStore, sessionKey, storePath } = params;
  delete sessionEntry.authProfileOverride;
  delete sessionEntry.authProfileOverrideSource;
  delete sessionEntry.authProfileOverrideCompactionCount;
  sessionEntry.updatedAt = Date.now();
  sessionStore[sessionKey] = sessionEntry;
  if (storePath) {
    await updateSessionStore(storePath, (store) => {
      store[sessionKey] = sessionEntry;
    });
  }
}

/**
 * 解析模型账号ID到authProfileId的映射
 *
 * modelAccounts 中存储的是 modelId（如 "siliconflow/Pro/deepseek-ai/DeepSeek-V3.2"）
 * 但是 authProfileStore 中使用的是 authProfileId（如 "siliconflow:account-xxx"）
 *
 * 需要通过模型的providerId和认证信息来建立映射关系
 */
function resolveModelAccountToAuthProfile(params: {
  modelId: string;
  store: ReturnType<typeof ensureAuthProfileStore>;
}): string | undefined {
  const { modelId, store } = params;

  // 解析 modelId: providerId/modelName
  const slashIndex = modelId.indexOf("/");
  if (slashIndex === -1) {
    return undefined;
  }
  const providerId = modelId.substring(0, slashIndex);

  // 在 authProfileStore 中查找匹配的 profile
  // 匹配规则：provider 相同
  const normalizedProvider = normalizeProviderId(providerId);

  for (const [profileId, profile] of Object.entries(store.profiles)) {
    if (profile.provider && normalizeProviderId(profile.provider) === normalizedProvider) {
      return profileId;
    }
  }

  return undefined;
}

export async function resolveSessionAuthProfileOverride(params: {
  cfg: OpenClawConfig;
  agentId?: string; // 新增：助手ID，用于获取 modelAccounts 配置
  provider: string;
  agentDir: string;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  isNewSession: boolean;
}): Promise<string | undefined> {
  const {
    cfg,
    agentId,
    provider,
    agentDir,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    isNewSession,
  } = params;

  if (!sessionEntry || !sessionStore || !sessionKey) {
    return sessionEntry?.authProfileOverride;
  }

  const store = ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false });
  const order = resolveAuthProfileOrder({ cfg, store, provider });
  let current = sessionEntry.authProfileOverride?.trim();

  if (current && !store.profiles[current]) {
    await clearSessionAuthProfileOverride({ sessionEntry, sessionStore, sessionKey, storePath });
    current = undefined;
  }

  if (current && !isProfileForProvider({ provider, profileId: current, store })) {
    await clearSessionAuthProfileOverride({ sessionEntry, sessionStore, sessionKey, storePath });
    current = undefined;
  }

  if (current && order.length > 0 && !order.includes(current)) {
    await clearSessionAuthProfileOverride({ sessionEntry, sessionStore, sessionKey, storePath });
    current = undefined;
  }

  if (order.length === 0) {
    return undefined;
  }

  const pickFirstAvailable = () =>
    order.find((profileId) => !isProfileInCooldown(store, profileId)) ?? order[0];
  const pickNextAvailable = (active: string) => {
    const startIndex = order.indexOf(active);
    if (startIndex < 0) {
      return pickFirstAvailable();
    }
    for (let offset = 1; offset <= order.length; offset += 1) {
      const candidate = order[(startIndex + offset) % order.length];
      if (!isProfileInCooldown(store, candidate)) {
        return candidate;
      }
    }
    return order[startIndex] ?? order[0];
  };

  const compactionCount = sessionEntry.compactionCount ?? 0;
  const storedCompaction =
    typeof sessionEntry.authProfileOverrideCompactionCount === "number"
      ? sessionEntry.authProfileOverrideCompactionCount
      : compactionCount;

  const source =
    sessionEntry.authProfileOverrideSource ??
    (typeof sessionEntry.authProfileOverrideCompactionCount === "number"
      ? "auto"
      : current
        ? "user"
        : undefined);
  if (source === "user" && current && !isNewSession) {
    return current;
  }

  // ============ 本地增强：优先使用 defaultAccountId ============
  // 如果助手配置了 modelAccounts.defaultAccountId，在新会话时优先使用
  if (isNewSession && agentId) {
    const modelAccountsConfig = resolveAgentModelAccounts(cfg, agentId);
    if (modelAccountsConfig?.defaultAccountId) {
      const defaultModelId = modelAccountsConfig.defaultAccountId;
      // 将 modelId 转换为 authProfileId
      const defaultProfileId = resolveModelAccountToAuthProfile({
        modelId: defaultModelId,
        store,
      });

      if (defaultProfileId && order.includes(defaultProfileId)) {
        // 检查默认账号是否可用（不在冷却期）
        if (!isProfileInCooldown(store, defaultProfileId)) {
          // 使用默认账号
          sessionEntry.authProfileOverride = defaultProfileId;
          sessionEntry.authProfileOverrideSource = "default-account"; // 新来源标记
          sessionEntry.authProfileOverrideCompactionCount = compactionCount;
          sessionEntry.updatedAt = Date.now();
          sessionStore[sessionKey] = sessionEntry;
          if (storePath) {
            await updateSessionStore(storePath, (store) => {
              store[sessionKey] = sessionEntry;
            });
          }
          console.log(
            `[DefaultAccount] Using default account ${defaultProfileId} for model ${defaultModelId}`,
          );
          return defaultProfileId;
        } else {
          console.warn(
            `[DefaultAccount] Default account ${defaultProfileId} is in cooldown, falling back to next available`,
          );
        }
      } else if (defaultProfileId) {
        console.warn(
          `[DefaultAccount] Default account ${defaultProfileId} not in order, falling back to rotation`,
        );
      }
    }
  }
  // ============ 本地增强结束 ============

  let next = current;
  if (isNewSession) {
    next = current ? pickNextAvailable(current) : pickFirstAvailable();
  } else if (current && compactionCount > storedCompaction) {
    next = pickNextAvailable(current);
  } else if (!current || isProfileInCooldown(store, current)) {
    next = pickFirstAvailable();
  }

  if (!next) {
    return current;
  }
  const shouldPersist =
    next !== sessionEntry.authProfileOverride ||
    sessionEntry.authProfileOverrideSource !== "auto" ||
    sessionEntry.authProfileOverrideCompactionCount !== compactionCount;
  if (shouldPersist) {
    sessionEntry.authProfileOverride = next;
    sessionEntry.authProfileOverrideSource = "auto";
    sessionEntry.authProfileOverrideCompactionCount = compactionCount;
    sessionEntry.updatedAt = Date.now();
    sessionStore[sessionKey] = sessionEntry;
    if (storePath) {
      await updateSessionStore(storePath, (store) => {
        store[sessionKey] = sessionEntry;
      });
    }
  }

  return next;
}
