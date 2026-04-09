import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import type { AgentPhase5State } from "../controllers/agent-phase5.ts";
import { loadChannelPolicies, saveChannelPolicies } from "../controllers/agent-phase5.ts";

/**
 * 渲染通道策略配置对话框
 */
export function renderChannelPolicyDialog(state: AppViewState) {
  if (!state.configuringChannelPolicy) {
    return nothing;
  }

  const { agentId, channelId, accountId, currentPolicy } = state.configuringChannelPolicy;

  const policyOptions: Array<{ value: string; label: string; description: string }> = [
    {
      value: "private",
      label: "🔒 私密模式",
      description: "智能助手专属通道，不对外暴露",
    },
    {
      value: "monitor",
      label: "👁️ 监控模式",
      description: "长通模式，接收所有消息并带来源标记",
    },
    {
      value: "listen_only",
      label: "👂 仅监听",
      description: "只监听消息，不进行回复",
    },
    {
      value: "filter",
      label: "🔍 过滤模式",
      description: "基于规则过滤消息",
    },
    {
      value: "scheduled",
      label: "⏰ 定时响应",
      description: "根据时间表响应消息",
    },
    {
      value: "forward",
      label: "➡️ 转发模式",
      description: "自动转发消息到其他通道",
    },
    {
      value: "smart_route",
      label: "🧭 智能路由",
      description: "根据内容智能选择通道",
    },
    {
      value: "broadcast",
      label: "📢 广播模式",
      description: "一条消息发送到多个通道",
    },
    {
      value: "round_robin",
      label: "⚖️ 负载均衡",
      description: "多通道负载均衡",
    },
    {
      value: "queue",
      label: "📋 队列模式",
      description: "消息排队，批量处理",
    },
    {
      value: "moderate",
      label: "✅ 审核模式",
      description: "需要审核后才发送",
    },
    {
      value: "echo",
      label: "📝 日志模式",
      description: "记录日志，不处理",
    },
  ];

  const selectedPolicy = currentPolicy || "private";

  const handleSave = async (selectedValue: string) => {
    try {
      // oxlint-disable-next-line typescript/no-explicit-any
      const config = state.channelPoliciesConfig as any;
      if (!config) {
        return;
      }

      const bindings = Array.isArray(config.bindings) ? [...config.bindings] : [];
      const existingIndex = bindings.findIndex(
        // oxlint-disable-next-line typescript/no-explicit-any
        (b: any) => b.channelId === channelId && b.accountId === accountId,
      );

      if (existingIndex >= 0) {
        // 更新现有绑定
        bindings[existingIndex] = {
          ...bindings[existingIndex],
          policy: selectedValue,
        };
      } else {
        // 添加新绑定
        bindings.push({
          channelId,
          accountId,
          policy: selectedValue,
        });
      }

      await saveChannelPolicies(state as unknown as AgentPhase5State, agentId, {
        ...config,
        bindings,
      });

      // 重新加载配置
      await loadChannelPolicies(state as unknown as AgentPhase5State, agentId);

      // 关闭对话框
      state.configuringChannelPolicy = null;
    } catch (err) {
      console.error("Failed to save channel policy:", err);
      alert(`保存失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCancel = () => {
    state.configuringChannelPolicy = null;
  };

  return html`
    <div class="modal-overlay" @click=${handleCancel}>
      <div class="modal-dialog" style="max-width: 600px; background: var(--bg); border: 1px solid var(--border);" @click=${(e: Event) => e.stopPropagation()}>
        <div class="modal-header">
          <h3 class="modal-title">配置通道策略</h3>
          <button class="modal-close" @click=${handleCancel}>&times;</button>
        </div>
        
        <div class="modal-body">
          <div style="margin-bottom: 16px;">
            <div class="label">通道账号</div>
            <div class="mono" style="font-size: 0.95rem; color: var(--text-2); margin-top: 4px;">
              ${channelId} / ${accountId}
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <div class="label">当前策略</div>
            <div style="margin-top: 4px;">
              <span class="agent-pill">
                ${policyOptions.find((p) => p.value === currentPolicy)?.label || currentPolicy}
              </span>
            </div>
          </div>

          <div style="margin-bottom: 8px;">
            <div class="label">选择新策略</div>
          </div>

          <div class="policy-options" style="
            display: grid;
            gap: 12px;
            max-height: 400px;
            overflow-y: auto;
          ">
            ${policyOptions.map((option) => {
              const isSelected = option.value === selectedPolicy;
              return html`
                <div
                  class="policy-option ${isSelected ? "selected" : ""}"
                  style="
                    padding: 12px 16px;
                    border: 2px solid ${isSelected ? "var(--color-primary)" : "var(--border)"};
                    border-radius: 8px;
                    cursor: pointer;
                    background: ${isSelected ? "var(--bg-2)" : "var(--bg-1)"};
                    transition: all 0.2s;
                  "
                  @click=${() => {
                    const newPolicy = option.value;
                    void handleSave(newPolicy);
                  }}
                  @mouseenter=${(e: Event) => {
                    const target = e.currentTarget as HTMLElement;
                    if (!isSelected) {
                      target.style.borderColor = "var(--text-3)";
                      target.style.background = "var(--bg-2)";
                    }
                  }}
                  @mouseleave=${(e: Event) => {
                    const target = e.currentTarget as HTMLElement;
                    if (!isSelected) {
                      target.style.borderColor = "var(--border)";
                      target.style.background = "var(--bg-1)";
                    }
                  }}
                >
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="font-weight: 500; font-size: 1rem;">
                      ${option.label}
                    </div>
                    ${
                      isSelected
                        ? html`
                            <span style="color: var(--color-primary); font-size: 1.2rem">✓</span>
                          `
                        : nothing
                    }
                  </div>
                  <div style="font-size: 0.875rem; color: var(--text-3);">
                    ${option.description}
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn" @click=${handleCancel}>取消</button>
        </div>
      </div>
    </div>
  `;
}
