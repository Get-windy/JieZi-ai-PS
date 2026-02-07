/**
 * 模型管理相关类型定义（新架构）
 * 数据结构：认证（Auth） + 模型配置（ModelConfig）分离
 */

import type { ModelsStatusSnapshot, ProviderAuthSnapshot, ModelConfigSnapshot } from "../types.js";

/** 模型管理Props */
export type ModelsProps = {
  snapshot: ModelsStatusSnapshot | null;
  loading: boolean;
  error: string | null;

  // ============ 认证管理状态 ============
  managingAuthProvider: string | null; // 当前管理认证的供应商ID
  editingAuth: {
    authId?: string; // 编辑现有认证时有值，添加新认证时为空
    provider: string;
    name: string;
    apiKey: string;
    baseUrl?: string;
  } | null;
  viewingAuth: {
    authId: string;
    provider: string;
  } | null;

  // ============ 模型列表状态 ============
  managingModelsProvider: string | null; // 当前查看模型列表的供应商ID

  // ============ 模型配置状态 ============
  editingModelConfig: {
    configId?: string; // 编辑现有配置时有值，添加新配置时为空
    authId: string;
    provider: string;
    modelName: string;
    nickname?: string;
    enabled: boolean;
    // 参数
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    frequencyPenalty?: number;
    systemPrompt?: string;
    conversationRounds?: number;
    maxIterations?: number;
    usageLimits?: {
      maxRequestsPerDay?: number;
      maxTokensPerRequest?: number;
    };
  } | null;

  // ============ 认证操作回调 ============
  onManageAuths: (provider: string) => void; // 打开认证管理弹窗
  onAddAuth: (provider: string) => void; // 添加认证
  onEditAuth: (authId: string) => void; // 编辑认证
  onDeleteAuth: (authId: string) => void; // 删除认证
  onSetDefaultAuth: (authId: string) => void; // 设置默认认证
  onSaveAuth: (params: {
    authId?: string;
    provider: string;
    name: string;
    apiKey: string;
    baseUrl?: string;
  }) => void; // 保存认证
  onCancelAuthEdit: () => void; // 取消编辑认证
  onTestAuth: (authId: string) => void; // 测试认证连接
  onRefreshAuthBalance: (authId: string) => void; // 刷新认证余额

  // ============ 模型列表操作回调 ============
  onManageModels: (provider: string) => void; // 打开模型列表弹窗
  onCloseModelsList: () => void; // 关闭模型列表弹窗

  // ============ 模型配置操作回调 ============
  onAddModelConfig: (authId: string, modelName: string) => void; // 添加模型配置
  onEditModelConfig: (configId: string) => void; // 编辑模型配置
  onDeleteModelConfig: (configId: string) => void; // 删除模型配置
  onToggleModelConfig: (configId: string, enabled: boolean) => void; // 启用/禁用模型
  onRefreshAuthModels: (authId: string) => void; // 刷新认证的可用模型列表
  onImportModels: (authId: string, modelNames: string[]) => void; // 批量导入模型
  onSaveModelConfig: (params: {
    configId?: string;
    authId: string;
    provider: string;
    modelName: string;
    nickname?: string;
    enabled: boolean;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    frequencyPenalty?: number;
    systemPrompt?: string;
    conversationRounds?: number;
    maxIterations?: number;
    usageLimits?: {
      maxRequestsPerDay?: number;
      maxTokensPerRequest?: number;
    };
  }) => void; // 保存模型配置
  onCancelModelConfigEdit: () => void; // 取消编辑模型配置

  // ============ 供应商管理回调 ============
  onAddProvider: () => void; // 打开添加供应商弹窗
  onViewProvider: (id: string) => void; // 查看供应商详情（只读）
  onEditProvider: (id: string) => void; // 编辑供应商
  onTemplateSelect: (templateId: string) => void; // 选择模板
  onProviderFormChange: (patch: any) => void; // 更新供应商表单字段
  onSaveProvider: (params: {
    id: string;
    name: string;
    icon?: string;
    website?: string;
    templateId?: string;
    defaultBaseUrl: string;
    apiKeyPlaceholder?: string;
  }) => void; // 保存供应商
  onDeleteProvider: (id: string) => void; // 删除供应商
  onCancelProviderEdit: () => void; // 取消添加供应商
  onCancelProviderView: () => void; // 取消查看供应商

  // ============ 通用操作回调 ============
  onRefresh: () => void; // 刷新数据
};

// 导出快照类型供外部使用
export type { ModelsStatusSnapshot, ProviderAuthSnapshot, ModelConfigSnapshot };
