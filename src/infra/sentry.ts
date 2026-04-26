/**
 * Sentry错误追踪集成
 * 
 * 业界标准（2025-2026）：
 * - 全栈错误追踪
 * - 性能监控
 * - 用户行为追踪
 * - 发布追踪
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

/**
 * 初始化Sentry（后端）
 */
export function initSentryBackend() {
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.warn('⚠️  Sentry DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || 'unknown',
    
    // 性能监控
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // 集成
    integrations: [
      nodeProfilingIntegration(),
    ],
    
    // 忽略的健康检查端点
    ignoreTransactions: [
      'GET /health',
      'GET /ready',
      'GET /metrics',
    ],
    
    // 错误过滤
    beforeSend(event, hint) {
      // 过滤掉已知的可忽略错误
      const error = hint.originalException;
      if (error instanceof Error) {
        // 忽略网络错误（客户端断开）
        if (error.message.includes('ECONNRESET') ||
            error.message.includes('EPIPE') ||
            error.message.includes('socket hang up')) {
          return null;
        }
        
        // 忽略验证错误（太多噪音）
        if (error.name === 'ValidationError') {
          // 可以采样记录
          if (Math.random() > 0.01) { // 1%采样率
            return null;
          }
        }
      }
      
      return event;
    },
  });

  console.log('✅ Sentry initialized');
}

/**
 * 请求处理中间件
 */
export const sentryRequestHandler = Sentry.Handlers.requestHandler({
  ip: true,
  user: true,
});

/**
 * 错误处理中间件
 */
export const sentryErrorHandler = Sentry.Handlers.errorHandler({
  shouldHandleError: (error) => {
    // 仅捕获5xx错误
    return !error.statusCode || error.statusCode >= 500;
  },
});

/**
 * 追踪事务
 */
export function startTransaction(name: string, op: string = 'function') {
  return Sentry.startSpan({
    name,
    op,
  });
}

/**
 * 设置用户信息
 */
export function setUser(userId: string, email?: string) {
  Sentry.setUser({
    id: userId,
    email,
  });
}

/**
 * 设置标签
 */
export function setTag(key: string, value: string) {
  Sentry.setTag(key, value);
}

/**
 * 添加面包屑
 */
export function addBreadcrumb(message: string, category?: string, level?: string) {
  Sentry.addBreadcrumb({
    message,
    category,
    level: level as Sentry.SeverityLevel || 'info',
    timestamp: Date.now() / 1000,
  });
}

/**
 * 捕获异常
 */
export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('extra', context);
    }
    Sentry.captureException(error);
  });
}

/**
 * 捕获消息
 */
export function captureMessage(message: string, level?: string) {
  Sentry.captureMessage(message, level as Sentry.SeverityLevel || 'info');
}
