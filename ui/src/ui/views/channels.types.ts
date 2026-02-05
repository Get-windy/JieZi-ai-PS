import type {
  ChannelAccountSnapshot,
  ChannelsStatusSnapshot,
  ConfigUiHints,
  DiscordStatus,
  GoogleChatStatus,
  IMessageStatus,
  NostrProfile,
  NostrStatus,
  SignalStatus,
  SlackStatus,
  TelegramStatus,
  WhatsAppStatus,
} from "../types.ts";
import type { NostrProfileFormState } from "./channels.nostr-profile-form.ts";

export type ChannelKey = string;

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
  } | null; // 查看模式，只读
  creatingChannelAccount: boolean;
  deletingChannelAccount: boolean;
  managingChannelId: string | null; // 当前正在管理账号的通道ID
  showAllChannelsModal: boolean; // 显示所有通道弹窗
  debuggingChannel: { channelId: string; accountId?: string } | null; // 调试状态
  editingChannelGlobalConfig: string | null; // 正在编辑全局配置的通道ID
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
  onViewAccount: (channelId: string, accountId: string) => void; // 查看账号（只读）
  onEditAccount: (channelId: string, accountId: string) => void; // 编辑账号
  onDeleteAccount: (channelId: string, accountId: string) => void;
  onSaveAccount: () => void;
  onCancelAccountEdit: () => void;
  onCancelAccountView: () => void; // 关闭查看页面
  onAccountFormChange: (field: string, value: unknown) => void;
  onToggleAllChannelsModal: () => void; // 切换显示所有通道弹窗
  onToggleChannelVisibility: (channelId: string) => void; // 切换通道显示/隐藏
  onDebugChannel: (channelId: string, accountId?: string) => void; // 调试通道/账号
  onCloseDebug: () => void; // 关闭调试
  onEditChannelGlobalConfig: (channelId: string) => void; // 编辑通道全局配置
  onCancelChannelGlobalConfig: () => void; // 取消编辑全局配置
  onSaveChannelGlobalConfig: () => void; // 保存全局配置
};

export type ChannelsChannelData = {
  whatsapp?: WhatsAppStatus;
  telegram?: TelegramStatus;
  discord?: DiscordStatus | null;
  googlechat?: GoogleChatStatus | null;
  slack?: SlackStatus | null;
  signal?: SignalStatus | null;
  imessage?: IMessageStatus | null;
  nostr?: NostrStatus | null;
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null;
};
