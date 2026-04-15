/**
 * 确定性脚本执行模式（Deterministic Script Pattern）
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  对标 Amazon Harness 理念：                                                  ║
 * ║  精度要求高的操作（修改配置文件、结构化数据处理）用确定性脚本完成           ║
 * ║  AI 只负责"意图表达"（输入参数 schema），脚本负责精确执行                  ║
 * ║                                                                              ║
 * ║  核心设计：                                                                  ║
 * ║  1. Schema 校验：执行前用 Zod 式轻量校验器验证 AI 传入的意图参数           ║
 * ║  2. 类型安全执行器：每个确定性脚本都是纯函数 + 输出类型保证                ║
 * ║  3. 沙箱隔离：脚本内不允许调用外部 AI，只做数据变换                        ║
 * ║  4. 完整审计：每次调用自动写入 tool-chain-audit                             ║
 * ║  5. 失败即结构化错误：脚本失败返回带 code/message 的结构化错误             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import {
  auditDeterministicScriptStart,
  auditDeterministicScriptEnd,
  type StructuredValidationError,
} from "./tool-chain-audit.js";

// ============================================================================
// 类型定义
// ============================================================================

/** 脚本执行成功结果 */
export interface DeterministicScriptSuccess<TOutput> {
  ok: true;
  output: TOutput;
  durationMs: number;
}

/** 脚本执行失败结果 */
export interface DeterministicScriptFailure {
  ok: false;
  error: StructuredValidationError;
  durationMs: number;
}

export type DeterministicScriptResult<TOutput> =
  | DeterministicScriptSuccess<TOutput>
  | DeterministicScriptFailure;

/**
 * 参数字段验证规则
 */
export type FieldValidator<T> = {
  /** 字段是否必填 */
  required?: boolean;
  /** 字段类型 */
  type?: "string" | "number" | "boolean" | "object" | "array";
  /** 自定义验证函数，返回 null 表示通过，返回字符串表示错误消息 */
  validate?: (value: T) => string | null;
  /** 字段描述（用于错误提示） */
  description?: string;
};

/**
 * 参数 Schema 定义（轻量 Zod 替代，避免额外依赖）
 */
export type ParamsSchema<TParams extends Record<string, unknown>> = {
  [K in keyof TParams]?: FieldValidator<TParams[K]>;
};

/**
 * 确定性脚本定义
 *
 * TIntent: AI 意图参数类型（松散，允许 unknown 字段）
 * TOutput: 脚本输出类型（强类型保证）
 */
export interface DeterministicScript<
  TIntent extends Record<string, unknown>,
  TOutput,
> {
  /** 脚本唯一名称（用于审计追踪） */
  name: string;

  /** 脚本描述 */
  description: string;

  /**
   * 适用场景标签（用于路由决策）
   * 例：["config-file-edit", "json-transform", "structured-data"]
   */
  tags: string[];

  /** 入参 Schema（AI 意图参数校验） */
  schema: ParamsSchema<TIntent>;

  /**
   * 确定性执行函数
   * - 必须是纯函数（相同输入 → 相同输出）
   * - 禁止调用 AI/LLM API
   * - 允许读写文件系统、调用本地工具
   * - 抛出异常会被捕获并转为 StructuredValidationError
   */
  execute: (intent: TIntent) => Promise<TOutput> | TOutput;

  /**
   * 输出验证函数（可选）
   * 执行完成后对输出做确定性校验
   * 返回 null 表示通过，返回错误对象表示失败
   */
  validateOutput?: (output: TOutput, intent: TIntent) => StructuredValidationError | null;
}

// ============================================================================
// 参数校验引擎
// ============================================================================

/**
 * 验证 AI 意图参数是否符合 Schema
 *
 * @returns null 表示校验通过，StructuredValidationError 表示失败
 */
export function validateIntentParams<TParams extends Record<string, unknown>>(
  params: Record<string, unknown>,
  schema: ParamsSchema<TParams>,
): StructuredValidationError | null {
  const keys = Object.keys(schema) as (keyof TParams)[];

  for (const key of keys) {
    const rule = schema[key];
    if (!rule) continue;

    const value = params[key as string];
    const fieldLabel = String(key);

    // 必填检查
    if (rule.required && (value === undefined || value === null)) {
      return {
        code: "MISSING_REQUIRED_PARAM",
        message: `必填参数 "${fieldLabel}" 缺失`,
        criterion: `param.${fieldLabel}.required`,
        expected: `非空 ${rule.type ?? "值"}`,
        actual: value,
        retryHint: `请提供参数 "${fieldLabel}"${rule.description ? `（${rule.description}）` : ""}`,
      };
    }

    if (value === undefined || value === null) continue;

    // 类型检查
    if (rule.type) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (actualType !== rule.type) {
        return {
          code: "INVALID_PARAM_TYPE",
          message: `参数 "${fieldLabel}" 类型错误：期望 ${rule.type}，实际 ${actualType}`,
          criterion: `param.${fieldLabel}.type`,
          expected: rule.type,
          actual: actualType,
          retryHint: `参数 "${fieldLabel}" 必须是 ${rule.type} 类型`,
        };
      }
    }

    // 自定义校验
    if (rule.validate) {
      const errMsg = rule.validate(value as TParams[typeof key]);
      if (errMsg !== null) {
        return {
          code: "PARAM_VALIDATION_FAILED",
          message: `参数 "${fieldLabel}" 校验失败：${errMsg}`,
          criterion: `param.${fieldLabel}.custom`,
          actual: value,
          retryHint: errMsg,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// 脚本注册表
// ============================================================================

// oxlint-disable-next-line typescript/no-explicit-any
const scriptRegistry = new Map<string, DeterministicScript<any, any>>();

/**
 * 注册一个确定性脚本
 */
export function registerDeterministicScript<
  TIntent extends Record<string, unknown>,
  TOutput,
>(script: DeterministicScript<TIntent, TOutput>): void {
  if (scriptRegistry.has(script.name)) {
    throw new Error(`[DeterministicScript] 脚本 "${script.name}" 已注册，不允许重复注册`);
  }
  scriptRegistry.set(script.name, script);
}

/**
 * 根据名称获取已注册脚本
 */
export function getDeterministicScript(name: string): DeterministicScript<Record<string, unknown>, unknown> | undefined {
  return scriptRegistry.get(name);
}

/**
 * 根据 tag 查找匹配的脚本（用于 AI 意图路由）
 */
export function findScriptsByTag(tag: string): DeterministicScript<Record<string, unknown>, unknown>[] {
  const results: DeterministicScript<Record<string, unknown>, unknown>[] = [];
  for (const script of scriptRegistry.values()) {
    if (script.tags.includes(tag)) {
      results.push(script);
    }
  }
  return results;
}

// ============================================================================
// 核心执行器
// ============================================================================

/**
 * 执行确定性脚本
 *
 * 流程：
 * 1. 从注册表查找脚本
 * 2. 校验 AI 意图参数
 * 3. 执行确定性脚本（沙箱化）
 * 4. 校验输出
 * 5. 写入审计日志
 */
export async function executeDeterministicScript<TOutput>(params: {
  scriptName: string;
  intent: Record<string, unknown>;
  runId: string;
  toolCallId: string;
  toolName: string;
}): Promise<DeterministicScriptResult<TOutput>> {
  const { scriptName, intent, runId, toolCallId, toolName } = params;
  const startTime = Date.now();

  // 查找脚本
  const script = getDeterministicScript(scriptName);
  if (!script) {
    const error: StructuredValidationError = {
      code: "SCRIPT_NOT_FOUND",
      message: `确定性脚本 "${scriptName}" 未注册`,
      criterion: "script.exists",
      retryHint: `请使用已注册的脚本名称，可用脚本：${Array.from(scriptRegistry.keys()).join(", ")}`,
    };
    return { ok: false, error, durationMs: Date.now() - startTime };
  }

  // 审计：脚本开始
  void auditDeterministicScriptStart({
    runId,
    toolCallId,
    toolName,
    scriptName,
    args: intent,
  });

  // 参数 Schema 校验
  const paramError = validateIntentParams(intent, script.schema);
  if (paramError) {
    const durationMs = Date.now() - startTime;
    void auditDeterministicScriptEnd({
      runId,
      toolCallId,
      toolName,
      scriptName,
      output: paramError,
      durationMs,
      isError: true,
      meta: { phase: "param_validation" },
    });
    return { ok: false, error: paramError, durationMs };
  }

  // 执行脚本
  let output: TOutput;
  try {
    output = (await script.execute(intent)) as TOutput;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const error: StructuredValidationError = {
      code: "SCRIPT_EXECUTION_ERROR",
      message: err instanceof Error ? err.message : String(err),
      criterion: "script.execute",
      details: {
        stack: err instanceof Error ? err.stack : undefined,
      },
      retryHint: "脚本执行时发生异常，请检查入参是否符合业务约束",
    };
    void auditDeterministicScriptEnd({
      runId,
      toolCallId,
      toolName,
      scriptName,
      output: error,
      durationMs,
      isError: true,
    });
    return { ok: false, error, durationMs };
  }

  // 输出校验
  if (script.validateOutput) {
    const outputError = script.validateOutput(output, intent);
    if (outputError) {
      const durationMs = Date.now() - startTime;
      void auditDeterministicScriptEnd({
        runId,
        toolCallId,
        toolName,
        scriptName,
        output: outputError,
        durationMs,
        isError: true,
        meta: { phase: "output_validation" },
      });
      return { ok: false, error: outputError, durationMs };
    }
  }

  const durationMs = Date.now() - startTime;

  // 审计：脚本成功结束
  void auditDeterministicScriptEnd({
    runId,
    toolCallId,
    toolName,
    scriptName,
    output,
    durationMs,
    isError: false,
  });

  return { ok: true, output, durationMs };
}

// ============================================================================
// 内置确定性脚本（开箱即用）
// ============================================================================

/**
 * JSON 安全合并脚本
 * 用途：将 AI 生成的 JSON patch 安全合并到目标对象
 *
 * AI 意图：{ target: object, patch: object, arrayMerge?: "replace" | "concat" }
 * 输出：合并后的对象
 */
registerDeterministicScript<
  { target: Record<string, unknown>; patch: Record<string, unknown>; arrayMerge?: string },
  Record<string, unknown>
>({
  name: "json-safe-merge",
  description: "将 AI 生成的 JSON patch 安全合并到目标对象（不允许原型污染）",
  tags: ["json-transform", "structured-data", "config-merge"],
  schema: {
    target: { required: true, type: "object", description: "目标 JSON 对象" },
    patch: { required: true, type: "object", description: "要合并的 patch 对象" },
    arrayMerge: {
      type: "string",
      validate: (v) =>
        v === "replace" || v === "concat" || v === undefined
          ? null
          : 'arrayMerge 必须为 "replace" 或 "concat"',
    },
  },
  execute({ target, patch, arrayMerge = "replace" }) {
    // 防止原型污染
    function safeMerge(
      base: Record<string, unknown>,
      delta: Record<string, unknown>,
    ): Record<string, unknown> {
      const result: Record<string, unknown> = { ...base };
      for (const [key, value] of Object.entries(delta)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue; // 防止原型污染
        }
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          result[key] &&
          typeof result[key] === "object" &&
          !Array.isArray(result[key])
        ) {
          result[key] = safeMerge(
            result[key] as Record<string, unknown>,
            value as Record<string, unknown>,
          );
        } else if (Array.isArray(value) && Array.isArray(result[key]) && arrayMerge === "concat") {
          result[key] = [...(result[key] as unknown[]), ...value];
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    return safeMerge(target, patch);
  },
  validateOutput(output) {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      return {
        code: "INVALID_MERGE_OUTPUT",
        message: "合并结果必须是一个对象",
        criterion: "output.isObject",
      };
    }
    return null;
  },
});

/**
 * 键值路径安全写入脚本
 * 用途：按点号路径安全写入嵌套对象字段（如 "server.port" → 8080）
 *
 * AI 意图：{ target: object, path: string, value: unknown }
 * 输出：更新后的对象
 */
registerDeterministicScript<
  { target: Record<string, unknown>; path: string; value: unknown },
  Record<string, unknown>
>({
  name: "json-path-write",
  description: "按点号路径安全写入嵌套对象字段，防止原型污染",
  tags: ["config-file-edit", "structured-data", "json-transform"],
  schema: {
    target: { required: true, type: "object", description: "目标对象" },
    path: {
      required: true,
      type: "string",
      validate: (v) => {
        if (!v.trim()) return "path 不能为空";
        const dangerous = ["__proto__", "constructor", "prototype"];
        const parts = v.split(".");
        for (const part of parts) {
          if (dangerous.includes(part)) {
            return `path 包含危险字段 "${part}"`;
          }
        }
        return null;
      },
      description: "点号分隔的字段路径，例如 server.port",
    },
    value: { required: true, description: "要写入的值" },
  },
  execute({ target, path: fieldPath, value }) {
    const parts = fieldPath.split(".");
    const result = JSON.parse(JSON.stringify(target)) as Record<string, unknown>;
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!current[part] || typeof current[part] !== "object" || Array.isArray(current[part])) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1]!;
    current[lastPart] = value;
    return result;
  },
});
