/**
 * Zod输入验证中间件
 * 
 * 业界标准（2025-2026）：
 * - Schema定义验证规则
 * - 自动类型推断
 * - 友好的错误提示
 * - 端到端类型安全
 */

import type { Middleware } from 'hono';
import { z } from 'zod';
import { ValidationError } from '../../infra/errors';

/**
 * 验证请求体
 */
export function validateBody<T extends z.ZodType>(schema: T): Middleware {
  return async (c, next) => {
    try {
      const body = await c.req.json();
      const validated = schema.parse(body);
      
      // 将验证后的数据附加到上下文
      c.set('validatedBody', validated);
      
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstIssue = error.issues[0];
        throw new ValidationError(
          `验证失败: ${firstIssue.message}`,
          firstIssue.path.join('.'),
          { issues: error.issues },
        );
      }
      throw error;
    }
  };
}

/**
 * 验证查询参数
 */
export function validateQuery<T extends z.ZodType>(schema: T): Middleware {
  return async (c, next) => {
    try {
      const query = c.req.query();
      const validated = schema.parse(query);
      
      c.set('validatedQuery', validated);
      
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstIssue = error.issues[0];
        throw new ValidationError(
          `查询参数验证失败: ${firstIssue.message}`,
          firstIssue.path.join('.'),
          { issues: error.issues },
        );
      }
      throw error;
    }
  };
}

/**
 * 验证路径参数
 */
export function validateParams<T extends z.ZodType>(schema: T): Middleware {
  return async (c, next) => {
    try {
      const params = c.req.param();
      const validated = schema.parse(params);
      
      c.set('validatedParams', validated);
      
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstIssue = error.issues[0];
        throw new ValidationError(
          `路径参数验证失败: ${firstIssue.message}`,
          firstIssue.path.join('.'),
          { issues: error.issues },
        );
      }
      throw error;
    }
  };
}

/**
 * 组合验证（body + query + params）
 */
export function validate<TBody extends z.ZodType, TQuery extends z.ZodType, TParams extends z.ZodType>(options: {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
}): Middleware {
  return async (c, next) => {
    const errors: z.ZodIssue[] = [];

    // 验证body
    if (options.body) {
      try {
        const body = await c.req.json();
        const validated = options.body.parse(body);
        c.set('validatedBody', validated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push(...error.issues);
        }
      }
    }

    // 验证query
    if (options.query) {
      try {
        const query = c.req.query();
        const validated = options.query.parse(query);
        c.set('validatedQuery', validated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push(...error.issues);
        }
      }
    }

    // 验证params
    if (options.params) {
      try {
        const params = c.req.param();
        const validated = options.params.parse(params);
        c.set('validatedParams', validated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push(...error.issues);
        }
      }
    }

    // 如果有错误，抛出验证错误
    if (errors.length > 0) {
      throw new ValidationError(
        `请求验证失败 (${errors.length} 个问题)`,
        errors[0].path.join('.'),
        { issues: errors },
      );
    }

    await next();
  };
}

// ============ 常用Schema定义 ============

/**
 * 分页参数Schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * 排序参数Schema
 */
export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * ID参数Schema
 */
export const idParamSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
});

/**
 * 搜索参数Schema
 */
export const searchSchema = z.object({
  q: z.string().min(1).max(200),
  ...paginationSchema.shape,
});

// ============ 类型导出 ============

/** 从Schema推断类型 */
export type InferSchema<T extends z.ZodType> = z.infer<T>;

/** 分页参数类型 */
export type PaginationParams = z.infer<typeof paginationSchema>;

/** 排序参数类型 */
export type SortParams = z.infer<typeof sortSchema>;

/** ID参数类型 */
export type IdParam = z.infer<typeof idParamSchema>;
