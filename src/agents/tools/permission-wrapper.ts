/**
 * Phase 3: 工具权限包装器
 *
 * 职责：
 * 1. 为工具执行添加权限检查拦截
 * 2. 集成PermissionChecker到工具执行流程
 * 3. 处理审批请求和权限拒绝
 * 4. 提供统一的工具包装接口
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { PermissionCheckContext, PermissionCheckResult } from "../../permissions/checker.js";
import { permissionIntegrator } from "../../permissions/integration.js";

/**
 * 工具权限包装配置
 */
export interface ToolPermissionWrapperConfig {
  // 智能助手ID
  agentId?: string;
  // 会话Key
  sessionKey?: string;
  // 工具名称（如果不同于tool.name）
  toolName?: string;
  // 是否跳过权限检查（用于系统工具）
  skipPermissionCheck?: boolean;
  // 额外的上下文信息
  metadata?: Record<string, any>;
}

/**
 * 权限检查错误
 */
export class PermissionDeniedError extends Error {
  constructor(
    message: string,
    public readonly result: PermissionCheckResult,
  ) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

/**
 * 审批请求错误
 */
export class ApprovalRequiredError extends Error {
  constructor(
    message: string,
    public readonly result: PermissionCheckResult,
    public readonly approvalRequest: any,
  ) {
    super(message);
    this.name = "ApprovalRequiredError";
  }
}

/**
 * 包装工具以添加权限检查
 *
 * @param tool 原始工具
 * @param config 权限包装配置
 * @returns 包装后的工具
 */
export function wrapToolWithPermission<T extends AgentTool<any, any>>(
  tool: T,
  config?: ToolPermissionWrapperConfig,
): T {
  // 如果配置为跳过权限检查，直接返回原工具
  if (config?.skipPermissionCheck) {
    return tool;
  }

  const originalExecute = tool.execute;

  // 创建新的execute函数，添加权限检查
  const wrappedExecute = async (
    toolCallId: string,
    args: any,
    signal?: AbortSignal,
    onUpdate?: (result: AgentToolResult<any>) => void,
  ) => {
    // 构建权限检查上下文
    const toolName = config?.toolName || tool.name;
    const agentId = config?.agentId || "unknown";

    const permissionContext: PermissionCheckContext = {
      subject: {
        type: "user",
        id: agentId,
        name: agentId,
      },
      toolName,
      toolParams: args,
      sessionId: config?.sessionKey,
      agentId,
      timestamp: Date.now(),
      metadata: config?.metadata,
    };

    // 执行权限检查
    const result = await permissionIntegrator.checkToolPermission(permissionContext);

    // 处理权限检查结果
    if (!result.allowed) {
      if (result.requiresApproval) {
        // 需要审批
        const approvalRequest = await permissionIntegrator.createApprovalRequest(
          permissionContext,
          result.approvalId,
        );

        throw new ApprovalRequiredError(
          `Tool '${toolName}' requires approval. Request ID: ${approvalRequest.id}`,
          result,
          approvalRequest,
        );
      } else {
        // 直接拒绝
        throw new PermissionDeniedError(
          result.reason || `Permission denied for tool '${toolName}'`,
          result,
        );
      }
    }

    // 权限检查通过，执行原工具
    return originalExecute.call(tool, toolCallId, args, signal, onUpdate);
  };

  // 返回包装后的工具
  return {
    ...tool,
    execute: wrappedExecute,
  };
}

/**
 * 创建工具权限包装器工厂
 *
 * @param defaultConfig 默认配置
 * @returns 工具包装器函数
 */
export function createToolPermissionWrapper(defaultConfig?: ToolPermissionWrapperConfig) {
  return <T extends AgentTool<any, any>>(
    tool: T,
    overrideConfig?: Partial<ToolPermissionWrapperConfig>,
  ): T => {
    const mergedConfig = {
      ...defaultConfig,
      ...overrideConfig,
      metadata: {
        ...defaultConfig?.metadata,
        ...overrideConfig?.metadata,
      },
    };

    return wrapToolWithPermission(tool, mergedConfig);
  };
}

/**
 * 批量包装工具
 *
 * @param tools 工具数组
 * @param config 权限包装配置
 * @returns 包装后的工具数组
 */
export function wrapToolsWithPermission<T extends AgentTool<any, any>>(
  tools: T[],
  config?: ToolPermissionWrapperConfig,
): T[] {
  return tools.map((tool) => wrapToolWithPermission(tool, config));
}

/**
 * 为特定工具类型创建权限包装器
 *
 * @param toolNames 需要包装的工具名称列表
 * @param config 权限包装配置
 * @returns 工具过滤和包装函数
 */
export function createSelectiveToolWrapper(
  toolNames: string[],
  config?: ToolPermissionWrapperConfig,
) {
  const toolNameSet = new Set(toolNames);

  return <T extends AgentTool<any, any>>(tools: T[]): T[] => {
    return tools.map((tool) => {
      // 只包装指定的工具
      if (toolNameSet.has(tool.name)) {
        return wrapToolWithPermission(tool, config);
      }
      return tool;
    });
  };
}

/**
 * 智能工具包装器：根据工具名称自动应用不同的权限配置
 *
 * @param tools 工具数组
 * @param configMap 工具名称到配置的映射
 * @param defaultConfig 默认配置
 * @returns 包装后的工具数组
 */
export function wrapToolsWithSmartPermission<T extends AgentTool<any, any>>(
  tools: T[],
  configMap: Record<string, ToolPermissionWrapperConfig>,
  defaultConfig?: ToolPermissionWrapperConfig,
): T[] {
  return tools.map((tool) => {
    // 查找工具特定的配置
    const specificConfig = configMap[tool.name];

    // 合并配置
    const finalConfig = specificConfig
      ? {
          ...defaultConfig,
          ...specificConfig,
          metadata: {
            ...defaultConfig?.metadata,
            ...specificConfig?.metadata,
          },
        }
      : defaultConfig;

    return finalConfig ? wrapToolWithPermission(tool, finalConfig) : tool;
  });
}
