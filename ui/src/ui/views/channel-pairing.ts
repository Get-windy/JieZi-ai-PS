import { html, nothing } from "lit";
import type { ChannelPairingRequest } from "../types.js";
import { t } from "../i18n.js";
import { formatAgo } from "../format.js";

export type ChannelPairingProps = {
  channelId: string;
  channelLabel: string;
  requests: ChannelPairingRequest[];
  onApprovePairing: (channel: string, code: string) => void;
  onRejectPairing: (channel: string, code: string) => void;
};

/**
 * 渲染配对通知栏（显示在通道页面顶部）
 */
export function renderPairingNotificationBar(props: {
  totalCount: number;
  onShowPairingRequests?: () => void;
  onApproveAll?: () => void;
}) {
  if (props.totalCount === 0) {
    return nothing;
  }

  return html`
    <div class="pairing-notification-bar" style="
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
    ">
      <span style="font-size: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">🔔</span>
      <span style="flex: 1; font-weight: 600; color: white; font-size: 15px;">
        ${t("pairing.pending_requests", { count: props.totalCount })}
      </span>
      ${
        props.onShowPairingRequests
          ? html`
        <button 
          class="btn btn--sm" 
          @click=${props.onShowPairingRequests}
          style="
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            font-weight: 600;
            padding: 8px 16px;
            backdrop-filter: blur(10px);
            transition: all 0.2s;
          "
          onmouseover="this.style.background='rgba(255,255,255,0.3)'"
          onmouseout="this.style.background='rgba(255,255,255,0.2)'"
        >
          👁 ${t("pairing.view_all")}
        </button>
      `
          : nothing
      }
      ${
        props.onApproveAll
          ? html`
        <button 
          class="btn btn--sm" 
          @click=${props.onApproveAll}
          style="
            background: white;
            color: #667eea;
            font-weight: 700;
            padding: 8px 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            transition: all 0.2s;
          "
          onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)'"
          onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)'"
        >
          ✓ ${t("pairing.approve_all")}
        </button>
      `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染通道卡片中的配对请求区域
 */
export function renderChannelPairingSection(props: ChannelPairingProps) {
  if (!props.requests || props.requests.length === 0) {
    return nothing;
  }

  return html`
    <div class="channel-pairing-section" style="
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    ">
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        font-weight: 600;
        color: var(--text-primary);
      ">
        <span>🔑</span>
        <span>${t("pairing.requests")} (${props.requests.length})</span>
      </div>

      ${props.requests.map((req) => renderPairingRequestCard(props, req))}
    </div>
  `;
}

/**
 * 渲染单个配对请求卡片
 */
function renderPairingRequestCard(props: ChannelPairingProps, req: ChannelPairingRequest) {
  const userName = req.meta?.userName || req.meta?.displayName || req.id;
  const createdAgo = formatAgo(new Date(req.createdAt).getTime());

  return html`
    <div class="pairing-request-card" style="
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      border: none;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      transition: transform 0.2s, box-shadow 0.2s;
    "
    onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'"
    onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'"
    >
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- 用户信息头部 -->
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">👤</span>
            <span style="font-weight: 600; color: #2d3748; font-size: 15px;">
              ${userName}
            </span>
          </div>
          <span style="
            font-size: 11px;
            color: #718096;
            background: rgba(255, 255, 255, 0.6);
            padding: 4px 8px;
            border-radius: 12px;
          ">
            ${createdAgo}
          </span>
        </div>

        <!-- 配对码显示区 -->
        <div style="
          background: white;
          border-radius: 8px;
          padding: 16px;
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
        ">
          <div style="
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 4px;
            color: #667eea;
            text-align: center;
            text-shadow: 0 2px 4px rgba(102, 126, 234, 0.1);
          ">
            ${req.code}
          </div>
        </div>

        <!-- 用户ID（如果与用户名不同） -->
        ${
          req.id !== userName
            ? html`
          <div style="
            font-size: 11px;
            color: #4a5568;
            font-family: 'Consolas', monospace;
            background: rgba(255, 255, 255, 0.5);
            padding: 6px 10px;
            border-radius: 6px;
          ">
            🆔 ${req.id}
          </div>
        `
            : nothing
        }

        <!-- 操作按钮组 -->
        <div style="display: flex; gap: 10px; margin-top: 4px;">
          <button
            class="btn btn--sm"
            style="
              flex: 1;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              font-weight: 700;
              padding: 10px;
              border: none;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
              transition: all 0.2s;
            "
            @click=${() => props.onApprovePairing(props.channelId, req.code)}
            onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 16px rgba(102,126,234,0.4)'"
            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(102,126,234,0.3)'"
          >
            ✓ ${t("pairing.approve")}
          </button>
          <button
            class="btn btn--sm"
            style="
              flex: 1;
              background: white;
              color: #e53e3e;
              font-weight: 600;
              padding: 10px;
              border: 2px solid #fc8181;
              border-radius: 8px;
              transition: all 0.2s;
            "
            @click=${() => props.onRejectPairing(props.channelId, req.code)}
            onmouseover="this.style.background='#fff5f5'; this.style.borderColor='#e53e3e'"
            onmouseout="this.style.background='white'; this.style.borderColor='#fc8181'"
          >
            ✗ ${t("pairing.reject")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 渲染配对请求列表模态框（可选，用于查看所有请求）
 */
export function renderPairingRequestsModal(props: {
  open: boolean;
  allRequests: Record<string, ChannelPairingRequest[]>;
  channelLabels: Record<string, string>;
  onClose: () => void;
  onApprovePairing: (channel: string, code: string) => void;
  onRejectPairing: (channel: string, code: string) => void;
}) {
  if (!props.open) {
    return nothing;
  }

  const channelsWithRequests = Object.entries(props.allRequests).filter(
    ([_, reqs]) => reqs.length > 0,
  );

  return html`
    <div
      class="modal-overlay"
      style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      "
      @click=${(e: MouseEvent) => {
        if (e.target === e.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div
        class="modal-content"
        style="
          background: var(--bg-primary);
          border-radius: 12px;
          max-width: 600px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          padding: 24px;
        "
      >
        <!-- 标题栏 -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 600;">
            ${t("pairing.all_requests")}
          </h2>
          <button
            class="btn btn--sm"
            @click=${props.onClose}
            style="background: transparent; border: none; font-size: 24px; cursor: pointer;"
          >
            ×
          </button>
        </div>

        <!-- 配对请求列表 -->
        ${
          channelsWithRequests.length === 0
            ? html`
          <div style="text-align: center; padding: 40px 0; color: var(--text-secondary);">
            ${t("pairing.no_requests")}
          </div>
        `
            : channelsWithRequests.map(
                ([channelId, requests]) => html`
            <div style="margin-bottom: 24px;">
              <h3 style="
                margin: 0 0 12px 0;
                font-size: 16px;
                font-weight: 600;
                color: var(--text-primary);
              ">
                ${props.channelLabels[channelId] || channelId}
              </h3>
              ${requests.map(
                (req) =>
                  renderPairingRequestCard(
                    {
                      channelId,
                      channelLabel: props.channelLabels[channelId] || channelId,
                      requests,
                      onApprovePairing: props.onApprovePairing,
                      onRejectPairing: props.onRejectPairing,
                    },
                    req,
                  ),
              )}
            </div>
          `,
              )
        }
      </div>
    </div>
  `;
}
