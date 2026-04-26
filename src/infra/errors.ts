/**
 * 统一错误处理体系
 * 
 * 业界标准（OWASP Error Handling Guide 2025-2026）：
 * - 操作错误 vs 编程错误
 * - 错误类层次结构
 * - 安全的错误响应
 * - 详细的错误日志
 */

// ============ 基础错误类 ============

/**
 * 应用基础错误类
 * 所有业务错误都应继承此类
 */
export class AppError extends Error {
  /** 错误代码（机器可读） */
  public readonly code: string;
  /** HTTP状态码 */
  public readonly statusCode: number;
  /** 是否为操作错误（预期内的错误） */
  public readonly isOperational: boolean;
  /** 错误元数据 */
  public readonly meta?: Record<string, any>;
  /** 原始错误（用于包装） */
  public readonly originalError?: Error;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    meta?: Record<string, any>,
    originalError?: Error,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.meta = meta;
    this.originalError = originalError;

    // 维护原型链
    Object.setPrototypeOf(this, AppError.prototype);

    // 捕获堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /** 转换为JSON（用于日志） */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      stack: this.stack,
      meta: this.meta,
      originalError: this.originalError?.message,
    };
  }
}

// ============ 客户端错误（4xx） ============

/**
 * 验证错误
 * 用于输入验证失败
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field?: string,
    meta?: Record<string, any>,
  ) {
    super(
      message,
      'VALIDATION_ERROR',
      400,
      true,
      { field, ...meta },
    );
  }
}

/**
 * 认证错误
 * 用于身份验证失败
 */
export class AuthenticationError extends AppError {
  constructor(message: string = '未授权访问') {
    super(message, 'AUTHENTICATION_ERROR', 401, true);
  }
}

/**
 * 授权错误
 * 用于权限不足
 */
export class AuthorizationError extends AppError {
  constructor(message: string = '权限不足') {
    super(message, 'AUTHORIZATION_ERROR', 403, true);
  }
}

/**
 * 资源未找到错误
 */
export class NotFoundError extends AppError {
  constructor(resource: string = '资源') {
    super(`${resource}未找到`, 'NOT_FOUND_ERROR', 404, true);
  }
}

/**
 * 请求冲突错误
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT_ERROR', 409, true);
  }
}

/**
 * 请求超时错误
 */
export class TimeoutError extends AppError {
  constructor(message: string = '请求超时') {
    super(message, 'TIMEOUT_ERROR', 408, true);
  }
}

/**
 * 速率限制错误
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = '请求过于频繁',
    public readonly retryAfter?: number,
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429, true, { retryAfter });
  }
}

// ============ 服务端错误（5xx） ============

/**
 * 内部服务器错误
 */
export class InternalServerError extends AppError {
  constructor(
    message: string = '服务器内部错误',
    originalError?: Error,
  ) {
    super(
      message,
      'INTERNAL_SERVER_ERROR',
      500,
      false, // 编程错误
      undefined,
      originalError,
    );
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    originalError?: Error,
  ) {
    super(
      message,
      'DATABASE_ERROR',
      500,
      false,
      undefined,
      originalError,
    );
  }
}

/**
 * 外部服务错误
 */
export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string,
  ) {
    super(
      `${service}: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      false,
      { service },
    );
  }
}

/**
 * 超时错误（服务端）
 */
export class ServerTimeoutError extends AppError {
  constructor(
    operation: string,
    timeoutMs: number,
  ) {
    super(
      `操作超时: ${operation} (${timeoutMs}ms)`,
      'SERVER_TIMEOUT_ERROR',
      504,
      false,
      { operation, timeoutMs },
    );
  }
}

// ============ 业务错误 ============

/**
 * 任务错误
 */
export class TaskError extends AppError {
  constructor(
    message: string,
    public readonly taskId?: string,
  ) {
    super(
      message,
      'TASK_ERROR',
      400,
      true,
      { taskId },
    );
  }
}

/**
 * Agent错误
 */
export class AgentError extends AppError {
  constructor(
    message: string,
    public readonly agentId?: string,
  ) {
    super(
      message,
      'AGENT_ERROR',
      400,
      true,
      { agentId },
    );
  }
}

/**
 * 权限错误
 */
export class PermissionError extends AppError {
  constructor(
    action: string,
    resource: string,
  ) {
    super(
      `无权限执行 ${action} 操作于 ${resource}`,
      'PERMISSION_ERROR',
      403,
      true,
      { action, resource },
    );
  }
}

/**
 * 文件访问错误
 */
export class FileAccessError extends AppError {
  constructor(
    message: string,
    public readonly filePath?: string,
  ) {
    super(
      message,
      'FILE_ACCESS_ERROR',
      403,
      true,
      { filePath },
    );
  }
}

// ============ 安全错误 ============

/**
 * 注入攻击错误
 */
export class InjectionError extends AppError {
  constructor(
    type: string,
    public readonly details?: string,
  ) {
    super(
      `检测到${type}注入攻击`,
      'INJECTION_ERROR',
      400,
      true,
      { type, details },
    );
  }
}

// ============ 工具函数 ============

/**
 * 判断是否为AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * 将未知错误转换为AppError
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalServerError(error.message, error);
  }

  return new InternalServerError(String(error));
}

/**
 * 创建错误响应（安全的，不暴露敏感信息）
 */
export function createErrorResponse(
  error: unknown,
  includeStack: boolean = false,
) {
  // 生产环境不暴露堆栈跟踪
  const isProduction = process.env.NODE_ENV === 'production';

  if (isAppError(error)) {
    // 操作错误：返回详细信息
    const response: any = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.meta && { meta: error.meta }),
      },
    };

    // 仅开发环境返回堆栈
    if (!isProduction && includeStack) {
      response.error.stack = error.stack;
    }

    return response;
  }

  // 编程错误：仅返回通用消息
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? '服务器内部错误' : String(error),
      ...(isProduction ? {} : { stack: includeStack ? (error as Error).stack : undefined }),
    },
  };
}

/**
 * 提取错误HTTP状态码
 */
export function getErrorStatusCode(error: unknown): number {
  if (isAppError(error)) {
    return error.statusCode;
  }
  return 500;
}

/**
 * 记录错误日志（结构化）
 */
export function logError(
  error: unknown,
  context: Record<string, any> = {},
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    error: isAppError(error) ? error.toJSON() : {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack,
    },
    context,
  };

  // 生产环境使用JSON结构化日志
  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify(logEntry));
  } else {
    // 开发环境使用可读格式
    console.error('❌ Error:', error);
    if (Object.keys(context).length > 0) {
      console.error('Context:', context);
    }
  }
}
