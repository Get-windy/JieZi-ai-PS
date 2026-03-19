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

import type { OpenClawConfig } from "../../../upstream/src/config/config.js";
import { updateSessionStore, type SessionEntry } from "../../../upstream/src/config/sessions.js";
import { resolveAgentModelAccounts, resolveDefaultAgentId } from "../agent-scope.js";
import {
  ensureAuthProfileStore,
  isProfileInCooldown,
  resolveAuthProfileOrder,
} from "../../../upstream/src/agents/auth-profiles.js";
import { normalizeProviderId } from "../../../upstream/src/agents/model-selection.js";

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
export function resolveModelAccountToAuthProfile(params: {
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

  // ============ 本地增强：过滤 order 只保留 agent 绑定的模型账号 ============
  // 优先级：
  //   1. agent 自身配置了 modelAccounts.accounts → 只在这些账号中轮询
  //   2. agent 未配置，但不是主控 agent → 回退到主控 agent 的 accounts（任务驱动场景）
  //   3. 主控 agent 也未配置，或当前就是主控 agent → 使用全局 order
  let allowedProfiles: string[] | undefined;
  const resolveAccountsForAgent = (targetAgentId: string): string[] | undefined => {
    const mc = resolveAgentModelAccounts(cfg, targetAgentId);
    if (!mc?.accounts || mc.accounts.length === 0) return undefined;
    return mc.accounts
      .map((modelId) => resolveModelAccountToAuthProfile({ modelId, store }))
      .filter((profileId): profileId is string => profileId !== undefined);
  };
  if (agentId) {
    // 先尝试当前 agent 自己的配置
    allowedProfiles = resolveAccountsForAgent(agentId);
    // 若当前 agent 没有配置，且不是主控 agent，则回退到主控 agent 的配置
    if (!allowedProfiles) {
      const defaultAgentId = resolveDefaultAgentId(cfg);
      if (agentId !== defaultAgentId) {
        allowedProfiles = resolveAccountsForAgent(defaultAgentId);
      }
    }
  }
  // 过滤 order 只保留允许的 profiles（如果有配置且非空）
  // 注意：如果 allowedProfiles 是空数组（accounts 配置了但 profile 全部解析失败），
  // 则回退到全局 order，避免无账号可用导致模型调用静默失败。
  // 同理：若 allowedProfiles 非空但与当前 provider 的 order 没有交集（账号属于不同
  // provider，此 provider 调用时 filteredOrder 会为空），也回退到全局 order，
  // 避免 filteredOrder.length === 0 导致 authProfileId 返回 undefined。
  const _filteredByAccounts =
    allowedProfiles && allowedProfiles.length > 0
      ? order.filter((profileId) => allowedProfiles!.includes(profileId))
      : order;
  const filteredOrder = _filteredByAccounts.length > 0 ? _filteredByAccounts : order;
  // ============ 本地增强结束 ============

  if (current && !store.profiles[current]) {
    await clearSessionAuthProfileOverride({ sessionEntry, sessionStore, sessionKey, storePath });
    current = undefined;
  }

  if (current && !isProfileForProvider({ provider, profileId: current, store })) {
    await clearSessionAuthProfileOverride({ sessionEntry, sessionStore, sessionKey, storePath });
    current = undefined;
  }

  if (current && filteredOrder.length > 0 && !filteredOrder.includes(current)) {
    await clearSessionAuthProfileOverride({ sessionEntry, sessionStore, sessionKey, storePath });
    current = undefined;
  }

  if (filteredOrder.length === 0) {
    return undefined;
  }

  const pickFirstAvailable = () =>
    filteredOrder.find((profileId) => !isProfileInCooldown(store, profileId)) ?? filteredOrder[0];
  const pickNextAvailable = (active: string) => {
    const startIndex = filteredOrder.indexOf(active);
    if (startIndex < 0) {
      return pickFirstAvailable();
    }
    for (let offset = 1; offset <= filteredOrder.length; offset += 1) {
      const candidate = filteredOrder[(startIndex + offset) % filteredOrder.length];
      if (!isProfileInCooldown(store, candidate)) {
        return candidate;
      }
    }
    return filteredOrder[startIndex] ?? filteredOrder[0];
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
  // 用户手动固定的账号，仅在非新会话且当前账号可用（不在冷却期）时才尊重，
  // 否则回退到轮询逻辑，避免卡在已报错（401/rate-limit）的账号上。
  if (source === "user" && current && !isNewSession && !isProfileInCooldown(store, current)) {
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

      if (defaultProfileId) {
        // defaultAccount 可能属于不同的 provider（如 siliconflow），
        // 需要用它自己的 provider 构建 order，而不是用当前请求的 provider
        const defaultProfile = store.profiles[defaultProfileId];
        const defaultProvider = defaultProfile?.provider ?? provider;
        const defaultOrder =
          normalizeProviderId(defaultProvider) === normalizeProviderId(provider)
            ? order
            : resolveAuthProfileOrder({ cfg, store, provider: defaultProvider });

        if (defaultOrder.includes(defaultProfileId)) {
          // 检查默认账号是否可用（不在冷却期）
          if (!isProfileInCooldown(store, defaultProfileId)) {
            // 使用默认账号
            sessionEntry.authProfileOverride = defaultProfileId;
            sessionEntry.authProfileOverrideSource = "auto"; // 使用 auto，与主流程一致
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
        } else {
          console.warn(
            `[DefaultAccount] Default account ${defaultProfileId} not in order for provider ${defaultProvider}, falling back to rotation`,
          );
        }
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
