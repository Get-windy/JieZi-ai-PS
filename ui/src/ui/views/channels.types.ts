import type {
  ChannelAccountSnapshot,
  ChannelsStatusSnapshot,
  ConfigUiHints,
  NostrProfile,
} from "../types.js";
import type { NostrProfileFormState } from "./channels.nostr-profile-form.ts";

export type ChannelKey = string;

/**
 * 本地扩展的 ChannelsProps，在 upstream 基础上增加了：
 * - 账号管理相关 props
 * - 配对管理相关 props
 * - 通道可见性管理 props
 * - 调试弹窗 props
 * - 通道全局配置 props
 * - 账号编辑/查看/创建 props
 */
export type ChannelsProps = {
  connected: boolean;
  loading: boolean;
  snapshot: ChannelsStatusSnapshot | null;
  lastError: string | null;
  lastSuccessAt: number | null;
  whatsappMessage: string | null;
  whatsappQrDataUrl: string | null;
  whatsappConnected: boolean | null;
  whatsappBusy: boolean;
  configSchema: unknown;
  configSchemaLoading: boolean;
  configForm: Record<string, unknown> | null;
  configUiHints: ConfigUiHints;
  configSaving: boolean;
  configFormDirty: boolean;
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;
  // 账号管理状态
  editingChannelAccount: {
    channelId: string;
    accountId: string;
    name?: string;
    config: Record<string, unknown>;
  } | null;
  viewingChannelAccount: {
    channelId: string;
    accountId: string;
  } | null;
  creatingChannelAccount: boolean;
  deletingChannelAccount: boolean;
  managingChannelId: string | null;
  showAllChannelsModal: boolean;
  debuggingChannel: { channelId: string; accountId?: string } | null;
  editingChannelGlobalConfig: string | null;
  showPairingModal: boolean;
  onAccountFormChange: (field: string, value: unknown) => void;
  onRefresh: (probe: boolean) => void;
  onWhatsAppStart: (force: boolean) => void;
  onWhatsAppWait: () => void;
  onWhatsAppLogout: () => void;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
  onConfigSave: () => void;
  onConfigReload: () => void;
  onNostrProfileEdit: (accountId: string, profile: NostrProfile | null) => void;
  onNostrProfileCancel: () => void;
  onNostrProfileFieldChange: (field: keyof NostrProfile, value: string) => void;
  onNostrProfileSave: () => void;
  onNostrProfileImport: () => void;
  onNostrProfileToggleAdvanced: () => void;
  // 账号管理回调
  onManageAccounts: (channelId: string) => void;
  onAddAccount: (channelId: string) => void;
  onCloseAccountManager?: () => void;
  onViewAccount: (channelId: string, accountId: string) => void;
  onCloseAccountView: () => void;
  onEditAccount: (channelId: string, accountId: string) => void;
  onCloseAccountEdit: () => void;
  onSaveAccount: () => void;
  onDeleteAccount: (channelId: string, accountId: string) => void;
  onCreateAccount?: (channelId: string) => void;
  onSaveNewAccount?: () => void;
  onCancelCreateAccount?: () => void;
  // 调试弹窗回调
  onDebugChannel: (channelId: string, accountId?: string) => void;
  onCloseDebug: () => void;
  // 通道全局配置回调
  onEditChannelGlobalConfig: (channelId: string) => void;
  onCancelChannelGlobalConfig: () => void;
  onSaveChannelGlobalConfig: () => void;
  // 显示所有通道弹窗回调
  onToggleAllChannelsModal: () => void;
  onToggleChannelVisibility: (channelId: string) => void;
  // 配对管理回调
  onShowPairingModal: () => void;
  onClosePairingModal: () => void;
  onApproveAllPairing: () => void;
  onApprovePairing?: (channelId: string, code: string) => Promise<void>;
  onRejectPairing?: (channelId: string, code: string) => Promise<void>;
};

export type ChannelsChannelData = {
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null;
  [key: string]: unknown;
};
