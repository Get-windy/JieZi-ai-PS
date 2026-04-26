/**
 * 全局错误处理中间件
 * 
 * 业界标准（OWASP 2025-2026）：
 * - 统一错误格式
 * - 安全的错误响应（不暴露敏感信息）
 * - 详细的错误日志
 * - 错误分类处理
 */

import type { Middleware, Context } from 'hono';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  InternalServerError,
  isAppError,
  createErrorResponse,
  logError,
  getErrorStatusCode,
} from '../../infra/errors';

/**
 * 全局错误处理中间件
 */
export const errorHandler: Middleware = async (c, next) => {
  try {
    await next();
  } catch (error) {
    // 记录错误
    logError(error, {
      path: c.req.path,
      method: c.req.method,
      userAgent: c.req.header('user-agent'),
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    });

    // 判断错误类型并返回适当响应
    if (isAppError(error)) {
      // 操作错误（预期内的错误）
      return c.json(
        createErrorResponse(error),
        getErrorStatusCode(error),
      );
    }

    // 编程错误（意外错误）
    const internalError = new InternalServerError(
      error instanceof Error ? error.message : '未知错误',
      error instanceof Error ? error : undefined,
    );

    return c.json(
      createErrorResponse(internalError),
      500,
    );
  }
};

/**
 * 404错误处理
 */
export const notFoundHandler: Middleware = (c) => {
  const error = new NotFoundError('请求的资源');

  return c.json(
    createErrorResponse(error),
    404,
  );
};

/**
 * 验证错误处理辅助函数
 */
export function handleValidationError(field: string, message: string): never {
  throw new ValidationError(message, field);
}

/**
 * 认证检查辅助函数
 */
export function requireAuth(userId?: string): void {
  if (!userId) {
    throw new AuthenticationError('请先登录');
  }
}

/**
 * 授权检查辅助函数
 */
export function requirePermission(
  hasPermission: boolean,
  resource: string = '此资源',
): void {
  if (!hasPermission) {
    throw new AuthorizationError(`无权限访问${resource}`);
  }
}
