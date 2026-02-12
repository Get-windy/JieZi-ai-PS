import { html } from "lit";
import type { ChannelsStatusSnapshot } from "../types.ts";
import type { ChannelBinding, ChannelPolicy } from "./agents.ts";
import { t } from "../i18n.ts";

/**
 * 策略配置对话框（添加/编辑通道策略绑定）
 */
export function renderPolicyBindingDialog(params: {
  agentId: string;
  binding: ChannelBinding | null; // null 表示新增模式
  index?: number;
  channelsSnapshot: ChannelsStatusSnapshot | null; // 添加通道快照参数
  onChange: (field: string, value: any) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const binding = params.binding || {
    channelId: "",
    policy: "private" as ChannelPolicy,
  };
  const isNew = params.binding === null;

  // 从 channelsSnapshot 提取可用通道和账号
  const availableChannels: Array<{
    id: string;
    label: string;
    accounts: Array<{ id: string; label: string }>;
  }> = [];

  if (params.channelsSnapshot?.channels) {
    for (const [channelId, channelData] of Object.entries(params.channelsSnapshot.channels)) {
      const accounts: Array<{ id: string; label: string }> = [];

      // 提取该通道的所有账号
      if ((channelData as any).accounts && typeof (channelData as any).accounts === "object") {
        for (const [accountId, accountData] of Object.entries((channelData as any).accounts)) {
          accounts.push({
            id: accountId,
            label: (accountData as any).label || accountId,
          });
        }
      }

      availableChannels.push({
        id: channelId,
        label: (channelData as any).label || channelId,
        accounts,
      });
    }
  }

  // 当前选中通道的账号列表
  const currentChannelAccounts =
    availableChannels.find((c) => c.id === binding.channelId)?.accounts || [];

  const policyOptions: Array<{ value: ChannelPolicy; label: string; description: string }> = [
    {
      value: "private",
      label: t("agents.channel_policies.policy.private"),
      description: "智能助手专属通道，不对外暴露",
    },
    {
      value: "monitor",
      label: t("agents.channel_policies.policy.monitor"),
      description: "长通模式，接收所有消息并带来源标记",
    },
    {
      value: "listen_only",
      label: t("agents.channel_policies.policy.listen_only"),
      description: "仅监听，不回复",
    },
    {
      value: "filter",
      label: t("agents.channel_policies.policy.filter"),
      description: "基于规则过滤消息",
    },
    {
      value: "scheduled",
      label: t("agents.channel_policies.policy.scheduled"),
      description: "根据时间表响应消息",
    },
    {
      value: "forward",
      label: t("agents.channel_policies.policy.forward"),
      description: "自动转发消息到其他通道",
    },
    {
      value: "smart_route",
      label: t("agents.channel_policies.policy.smart_route"),
      description: "根据内容智能选择通道",
    },
    {
      value: "broadcast",
      label: t("agents.channel_policies.policy.broadcast"),
      description: "一条消息发送到多个通道",
    },
    {
      value: "round_robin",
      label: t("agents.channel_policies.policy.round_robin"),
      description: "多通道负载均衡",
    },
    {
      value: "queue",
      label: t("agents.channel_policies.policy.queue"),
      description: "消息排队，批量处理",
    },
    {
      value: "moderate",
      label: t("agents.channel_policies.policy.moderate"),
      description: "需要审核后才发送",
    },
    {
      value: "echo",
      label: t("agents.channel_policies.policy.echo"),
      description: "记录日志，不处理",
    },
  ];

  // 根据策略类型渲染不同的配置表单
  const renderPolicyConfig = () => {
    switch (binding.policy) {
      case "filter":
        return html`
          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">允许关键词（逗号分隔）</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.filterConfig?.allowKeywords?.join(", ") || ""}
              placeholder="例：测试, 反馈, 帮助"
              @input=${(e: Event) => {
                const keywords = (e.target as HTMLInputElement).value
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k);
                params.onChange("filterConfig", {
                  ...binding.filterConfig,
                  allowKeywords: keywords,
                });
              }}
            />
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">拦截关键词（逗号分隔）</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.filterConfig?.blockKeywords?.join(", ") || ""}
              placeholder="例：广告, 垃圾, 诈骗"
              @input=${(e: Event) => {
                const keywords = (e.target as HTMLInputElement).value
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k);
                params.onChange("filterConfig", {
                  ...binding.filterConfig,
                  blockKeywords: keywords,
                });
              }}
            />
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">允许发送者（逗号分隔）</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.filterConfig?.allowSenders?.join(", ") || ""}
              placeholder="例：user1, user2"
              @input=${(e: Event) => {
                const senders = (e.target as HTMLInputElement).value
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s);
                params.onChange("filterConfig", { ...binding.filterConfig, allowSenders: senders });
              }}
            />
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">屏蔽发送者（逗号分隔）</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.filterConfig?.blockSenders?.join(", ") || ""}
              placeholder="例：spammer1, spammer2"
              @input=${(e: Event) => {
                const senders = (e.target as HTMLInputElement).value
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s);
                params.onChange("filterConfig", { ...binding.filterConfig, blockSenders: senders });
              }}
            />
          </div>
        `;

      case "scheduled":
        return html`
          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">时区</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.scheduledConfig?.timezone || "Asia/Shanghai"}
              placeholder="例：Asia/Shanghai"
              @input=${(e: Event) => {
                params.onChange("scheduledConfig", {
                  ...binding.scheduledConfig,
                  timezone: (e.target as HTMLInputElement).value,
                });
              }}
            />
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">工作时间表（周一至周五 9:00-18:00）</label>
            <div class="muted" style="font-size: 0.875rem; margin-top: 4px;">
              当前仅支持预设规则，高级配置正在开发中
            </div>
          </div>
        `;

      case "forward":
        return html`
          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">目标通道 ID</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.forwardConfig?.targetChannelId || ""}
              placeholder="例：discord, telegram"
              @input=${(e: Event) => {
                params.onChange("forwardConfig", {
                  ...binding.forwardConfig,
                  targetChannelId: (e.target as HTMLInputElement).value,
                });
              }}
            />
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">目标账号 ID（可选）</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.forwardConfig?.targetAccountId || ""}
              placeholder="例：account-123"
              @input=${(e: Event) => {
                params.onChange("forwardConfig", {
                  ...binding.forwardConfig,
                  targetAccountId: (e.target as HTMLInputElement).value,
                });
              }}
            />
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="cfg-toggle">
              <input
                type="checkbox"
                .checked=${binding.forwardConfig?.includeSource ?? true}
                @change=${(e: Event) => {
                  params.onChange("forwardConfig", {
                    ...binding.forwardConfig,
                    includeSource: (e.target as HTMLInputElement).checked,
                  });
                }}
              />
              <span class="cfg-toggle__track"></span>
              <span style="margin-left: 8px;">包含源标记</span>
            </label>
          </div>
        `;

      case "broadcast":
        return html`
          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">目标通道列表（格式：channelId:accountId，逗号分隔）</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.broadcastConfig?.targetChannels?.map((t) => (t.accountId ? `${t.channelId}:${t.accountId}` : t.channelId)).join(", ") || ""}
              placeholder="例：discord:account1, telegram:account2"
              @input=${(e: Event) => {
                const raw = (e.target as HTMLInputElement).value;
                const targets = raw
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s)
                  .map((s) => {
                    const [channelId, accountId] = s.split(":");
                    return accountId ? { channelId, accountId } : { channelId };
                  });
                params.onChange("broadcastConfig", { targetChannels: targets });
              }}
            />
          </div>
        `;

      case "queue":
        return html`
          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">批处理大小</label>
            <input
              type="number"
              class="form-control"
              .value=${String(binding.queueConfig?.batchSize || 10)}
              min="1"
              max="100"
              @input=${(e: Event) => {
                params.onChange("queueConfig", {
                  ...binding.queueConfig,
                  batchSize: parseInt((e.target as HTMLInputElement).value),
                });
              }}
            />
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">最大等待时间（毫秒）</label>
            <input
              type="number"
              class="form-control"
              .value=${String(binding.queueConfig?.maxWaitMs || 5000)}
              min="100"
              max="60000"
              @input=${(e: Event) => {
                params.onChange("queueConfig", {
                  ...binding.queueConfig,
                  maxWaitMs: parseInt((e.target as HTMLInputElement).value),
                });
              }}
            />
          </div>
        `;

      case "moderate":
        return html`
          <div class="form-group" style="margin-top: 16px;">
            <label class="form-label">审核人 ID 列表（逗号分隔）</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.moderateConfig?.requireApprovalFrom?.join(", ") || ""}
              placeholder="例：admin1, admin2"
              @input=${(e: Event) => {
                const approvers = (e.target as HTMLInputElement).value
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s);
                params.onChange("moderateConfig", {
                  ...binding.moderateConfig,
                  requireApprovalFrom: approvers,
                });
              }}
            />
          </div>
          <div class="form-group" style="margin-top: 12px;">
            <label class="form-label">自动批准关键词（逗号分隔）</label>
            <input
              type="text"
              class="form-control"
              .value=${binding.moderateConfig?.autoApproveKeywords?.join(", ") || ""}
              placeholder="例：紧急, 重要"
              @input=${(e: Event) => {
                const keywords = (e.target as HTMLInputElement).value
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k);
                params.onChange("moderateConfig", {
                  ...binding.moderateConfig,
                  autoApproveKeywords: keywords,
                });
              }}
            />
          </div>
        `;

      default:
        return html`
          <div class="muted" style="margin-top: 16px; font-size: 0.875rem">该策略暂无额外配置项</div>
        `;
    }
  };

  return html`
    <div class="modal-overlay" @click=${params.onCancel}>
      <div class="modal-content" @click=${(e: Event) => e.stopPropagation()} style="max-width: 600px;">
        <div class="card" style="margin: 0;">
          <div class="card-title">${isNew ? "添加" : "编辑"}通道策略绑定</div>
          <div class="card-sub">配置通道的策略和行为</div>
          
          <div style="margin-top: 20px;">
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">通道</label>
              <select
                class="form-control"
                .value=${binding.channelId}
                @change=${(e: Event) => {
                  const newChannelId = (e.target as HTMLSelectElement).value;
                  params.onChange("channelId", newChannelId);
                  // 切换通道时清空账号选择
                  params.onChange("accountId", "");
                }}
              >
                <option value="">请选择通道...</option>
                ${availableChannels.map(
                  (channel) => html`
                  <option value=${channel.id} ?selected=${binding.channelId === channel.id}>
                    ${channel.label} (${channel.id})
                  </option>
                `,
                )}
              </select>
              ${
                availableChannels.length === 0
                  ? html`
                      <small class="form-text muted" style="margin-top: 4px; color: #f59e0b">
                        ⚠️ 暂无可用通道，请先配置通道账号
                      </small>
                    `
                  : html``
              }
            </div>
            
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">账号（可选）</label>
              <select
                class="form-control"
                .value=${binding.accountId || ""}
                ?disabled=${!binding.channelId || currentChannelAccounts.length === 0}
                @change=${(e: Event) => params.onChange("accountId", (e.target as HTMLSelectElement).value)}
              >
                <option value="">默认账号</option>
                ${currentChannelAccounts.map(
                  (account) => html`
                  <option value=${account.id} ?selected=${binding.accountId === account.id}>
                    ${account.label} (${account.id})
                  </option>
                `,
                )}
              </select>
              ${
                binding.channelId && currentChannelAccounts.length === 0
                  ? html`
                      <small class="form-text muted" style="margin-top: 4px; color: #f59e0b">
                        ⚠️ 该通道暂无配置账号
                      </small>
                    `
                  : html``
              }
            </div>
            
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">策略类型</label>
              <select
                class="form-control"
                .value=${binding.policy}
                @change=${(e: Event) => params.onChange("policy", (e.target as HTMLSelectElement).value)}
              >
                ${policyOptions.map(
                  (opt) => html`
                  <option value=${opt.value} ?selected=${binding.policy === opt.value}>
                    ${opt.label}
                  </option>
                `,
                )}
              </select>
              <small class="form-text muted" style="margin-top: 4px;">
                ${policyOptions.find((p) => p.value === binding.policy)?.description || ""}
              </small>
            </div>
            
            ${renderPolicyConfig()}
          </div>
          
          <div class="row" style="gap: 8px; margin-top: 20px;">
            <button class="btn" @click=${params.onCancel}>
              取消
            </button>
            <button 
              class="btn btn--primary" 
              ?disabled=${!binding.channelId}
              @click=${params.onSave}
            >
              ${isNew ? "添加" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
