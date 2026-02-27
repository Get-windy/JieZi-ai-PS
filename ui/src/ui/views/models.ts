import { html, nothing } from "lit";
import type { ModelsStatusSnapshot, ProviderAuthSnapshot, ModelConfigSnapshot } from "../types.js";
import type { ModelsProps } from "./models.types.js";
import { formatAgo } from "../format.js";
import { t } from "../i18n.js";
import {
  renderAuthManagerModal,
  renderAuthEditModal,
  renderModelsListModal,
  renderModelConfigModal,
  renderImportModelsModal,
  renderAddProviderModal,
  renderViewProviderModal,
  renderOAuthReauthModal,
} from "./models.modals.js";

/**
 * 模型供应商官网 URL 映射
 */
const PROVIDER_WEBSITES: Record<string, string> = {
  openai: "https://platform.openai.com",
  anthropic: "https://console.anthropic.com",
  google: "https://ai.google.dev",
  deepseek: "https://platform.deepseek.com",
  qianwen: "https://dashscope.aliyun.com",
  minimax: "https://api.minimax.chat",
  zhipu: "https://open.bigmodel.cn",
  moonshot: "https://platform.moonshot.cn",
  baichuan: "https://platform.baichuan-ai.com",
  alibaba: "https://dashscope.aliyun.com",
  tencent: "https://cloud.tencent.com/product/hunyuan",
};

/**
 * 模型管理主页面
 * 参照 channels.ts 设计
 */
export function renderModels(
  props: ModelsProps & {
    addingProvider?: boolean;
    viewingProviderId?: string | null;
    providerForm?: {
      selectedTemplateId: string | null;
      id: string;
      name: string;
      icon: string;
      website: string;
      defaultBaseUrl: string;
      apiKeyPlaceholder: string;
      isEditing?: boolean;
      originalId?: string;
    } | null;
  },
) {
  const providers = props.snapshot?.providers as Record<string, unknown> | null;
  const providerOrder = resolveProviderOrder(props.snapshot);

  const orderedProviders = providerOrder
    .map((key, index) => ({
      key,
      hasAccounts: providerHasAccounts(key, props),
      order: index,
    }))
    .toSorted((a, b) => {
      // 有账号的供应商排在前面
      if (a.hasAccounts !== b.hasAccounts) {
        return a.hasAccounts ? -1 : 1;
      }
      return a.order - b.order;
    });

  return html`
    <!-- 顶部操作栏 -->
    <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; gap: 16px;">
      <!-- 查看所有模型使用情况按钮 -->
      <button
        class="btn btn--sm"
        style="font-size: 13px; padding: 8px 16px; display: inline-flex; align-items: center; gap: 6px;"
        @click=${() => {
          const baseP = window.location.pathname.split("/models")[0] || "";
          window.location.href = `${baseP}/usage`;
        }}
        title=${t("models.view_all_usage")}
      >
        📊 ${t("models.view_all_usage")}
      </button>
      
      <!-- 添加供应商按钮 -->
      <button 
        class="btn btn--primary" 
        style="font-size: 14px; padding: 10px 20px; background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
        @click=${() => props.onAddProvider()}
      >
        ➕ ${t("models.add_provider")}
      </button>
    </div>
    
    <section class="grid grid-cols-2">
      ${orderedProviders.map((provider) => renderProvider(provider.key, props))}
    </section>

    ${renderAuthManagerModal(props)}
    ${renderAuthEditModal(props)}
    ${renderModelsListModal(props)}
    ${renderModelConfigModal(props)}
    ${renderImportModelsModal(props as any)}
    ${renderAddProviderModal(props as any)}
    ${renderViewProviderModal(props as any)}
    ${renderOAuthReauthModal(props)}
  `;
}

function resolveProviderOrder(snapshot: ModelsStatusSnapshot | null): string[] {
  if (!snapshot) {
    return [];
  }

  const ids = new Set<string>();

  // 优先使用后端返回的 providerOrder（已从模型目录动态提取）
  for (const id of snapshot.providerOrder ?? []) {
    ids.add(id);
  }

  // 添加 providerInstances 中的所有供应商（包括预置的和用户添加的）
  for (const provider of snapshot.providerInstances ?? []) {
    ids.add(provider.id);
  }

  // 添加 providerMeta 中的供应商（向后兼容）
  for (const entry of snapshot.providerMeta ?? []) {
    ids.add(entry.id);
  }

  // 添加有认证的供应商（新架构）
  for (const id of Object.keys(snapshot.auths ?? {})) {
    ids.add(id);
  }

  // 使用后端的 providerOrder 作为排序基准
  const ordered: string[] = [];
  const seed = snapshot.providerOrder ?? [];

  for (const id of seed) {
    if (ids.has(id)) {
      ordered.push(id);
      ids.delete(id);
    }
  }

  // 剩余的按字母顺序
  for (const id of Array.from(ids).toSorted()) {
    ordered.push(id);
  }

  return ordered;
}

function providerHasAccounts(providerId: string, props: ModelsProps): boolean {
  // 新架构：检查是否有认证
  const auths = props.snapshot?.auths?.[providerId] ?? [];
  return auths.length > 0;
}

/**
 * 渲染单个模型供应商卡片（新架构）
 */
function renderProvider(providerId: string, props: ModelsProps) {
  const providerLabel = resolveProviderLabel(props.snapshot, providerId);
  const auths = props.snapshot?.auths?.[providerId] ?? [];
  const modelConfigs = props.snapshot?.modelConfigs?.[providerId] ?? [];
  const hasAuths = auths.length > 0;

  // 获取默认认证的余额（用于显示）
  const defaultAuth = auths.find((a) => a.isDefault) || auths[0];
  const websiteUrl = PROVIDER_WEBSITES[providerId];
  // 从 providerInstances 读取图标
  const providerIcon = getProviderIcon(providerId, props.snapshot);

  return html`
    <div 
      class="card" 
      style="animation-delay: 0ms; cursor: pointer; transition: all 0.15s ease;"
      @click=${() => props.onViewProvider(providerId)}
      @mouseenter=${(e: MouseEvent) => {
        const target = e.currentTarget as HTMLElement;
        target.style.transform = "translateY(-2px)";
        target.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
      }}
      @mouseleave=${(e: MouseEvent) => {
        const target = e.currentTarget as HTMLElement;
        target.style.transform = "";
        target.style.boxShadow = "";
      }}
    >
      <div class="row" style="align-items: flex-start; gap: 16px;">
        <!-- 供应商图标 -->
        <div style="flex-shrink: 0; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--bg-elevated); border-radius: var(--radius-md); font-size: 24px;">
          ${providerIcon}
        </div>

        <!-- 供应商信息 -->
        <div style="flex: 1; min-width: 0;">
          <div class="row" style="align-items: center; gap: 12px; margin-bottom: 8px;">
            <h3 class="card-title" style="font-size: 18px; margin: 0;">${providerLabel}</h3>
            ${
              websiteUrl
                ? html`
              <a 
                href=${websiteUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                style="color: var(--accent); text-decoration: none; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;"
                title=${t("models.visit_website")}
                @click=${(e: Event) => e.stopPropagation()}
              >
                🌐 ${t("models.visit_website")}
              </a>
            `
                : nothing
            }
          </div>
          
          <!-- 认证数量和模型数量 -->
          ${
            hasAuths
              ? html`
            <div class="card-sub" style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
              ${auths.length} ${t("models.auth_count")} · ${modelConfigs.length} ${t("models.model_count")}
            </div>
          `
              : nothing
          }
          
          <!-- 余额显示 -->
          ${
            defaultAuth?.balance
              ? html`
            <div class="card-sub" style="font-size: 13px; color: var(--text-secondary);">
              ${t("models.balance")}: ${defaultAuth.balance.currency} ${defaultAuth.balance.amount.toFixed(2)}
            </div>
          `
              : nothing
          }
          
          <!-- 操作按钮 -->
          <div 
            class="row" 
            style="margin-top: 16px; align-items: center; gap: 12px; flex-wrap: wrap;"
            @click=${(e: Event) => e.stopPropagation()}
          >
            <!-- 编辑供应商按钮 -->
            <button 
              class="btn btn--sm" 
              style="font-size: 13px; padding: 8px 16px;"
              @click=${() => props.onEditProvider(providerId)}
            >
              ✏️ ${t("models.edit_provider")}
            </button>
            
            ${
              hasAuths
                ? html`
                <button 
                  class="btn btn--sm" 
                  style="font-size: 13px; padding: 8px 16px; color: #000000; font-weight: 600; background: var(--bg-elevated);"
                  @click=${() => props.onManageAuths(providerId)}
                >
                  🔑 ${t("models.manage_auths")}
                </button>
                <button 
                  class="btn btn--primary btn--sm" 
                  style="font-size: 13px; padding: 8px 16px; background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
                  @click=${() => props.onManageModels(providerId)}
                >
                  📊 ${t("models.model_list")}
                </button>
                <!-- 查看该供应商Token使用情况 -->
                <button 
                  class="btn btn--sm" 
                  style="font-size: 13px; padding: 8px 16px; color: #4a9eff; border-color: #4a9eff;"
                  @click=${() => {
                    const baseP = window.location.pathname.split("/models")[0] || "";
                    // 跳转到 usage 页面并传递供应商筛选参数
                    window.location.href = `${baseP}/usage?provider=${providerId}`;
                  }}
                  title="查看 ${providerLabel} 的 Token 使用情况"
                >
                  📈 ${t("models.view_provider_usage")}
                </button>
              `
                : html`
                <button 
                  class="btn btn--primary btn--sm" 
                  style="font-size: 13px; padding: 8px 16px; background: #ff5c5c; border-color: #ff5c5c; color: #ffffff;"
                  @click=${() => props.onAddAuth(providerId)}
                >
                  ➕ ${t("models.add_auth")}
                </button>
              `
            }
            <!-- 删除供应商按钮 -->
            <button 
              class="btn btn--sm" 
              style="font-size: 13px; padding: 8px 16px; background: #dc3545; border-color: #dc3545; color: #ffffff; font-weight: 500;"
              @click=${() => {
                if (
                  confirm(`${t("models.delete_provider_confirm").replace("{name}", providerLabel)}`)
                ) {
                  props.onDeleteProvider(providerId);
                }
              }}
            >
              🗑️ ${t("models.delete_provider")}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染供应商卡片按钮标签
 */
function renderProviderLabel(
  providerId: string,
  meta: any,
  labels: Record<string, string> | undefined,
): string {
  return meta?.label ?? labels?.[providerId] ?? providerId;
}

function resolveProviderLabel(snapshot: ModelsStatusSnapshot | null, providerId: string): string {
  // 1. 优先从 providerInstances 读取用户设置的名称
  const providerInstance = (snapshot?.providerInstances as any[])?.find(
    (p: any) => p.id === providerId,
  );
  if (providerInstance?.name) {
    return providerInstance.name;
  }

  // 2. 向下兼容：从 providerMeta 查找
  const meta = snapshot?.providerMeta?.find((m) => m.id === providerId);
  if (meta?.label) {
    return meta.label;
  }

  // 3. 向下兼容：从 providerLabels 查找
  if (snapshot?.providerLabels?.[providerId]) {
    return snapshot.providerLabels[providerId];
  }

  // 4. 最后回退到显示 ID
  return providerId;
}

function getProviderIcon(providerId: string, snapshot: ModelsStatusSnapshot | null): string {
  // 从 providerInstances 读取图标
  const providerInstance = (snapshot?.providerInstances as any[])?.find(
    (p: any) => p.id === providerId,
  );
  if (providerInstance?.icon) {
    return providerInstance.icon;
  }

  // 如果没有配置，使用默认图标映射（向下兼容）
  const icons: Record<string, string> = {
    openai: "🤖",
    anthropic: "🧠",
    google: "🔍",
    deepseek: "🌊",
    qianwen: "☁️",
    minimax: "⚡",
    zhipu: "🎓",
    moonshot: "🌙",
    baichuan: "🏔️",
    alibaba: "🛒",
    tencent: "🐧",
  };
  return icons[providerId] ?? "🤖"; // 默认使用机器人图标
}
