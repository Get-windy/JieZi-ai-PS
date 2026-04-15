/**
 * 输出验证反馈环（Output Validation Loop）
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  对标 Stripe Harness 理念：                                                  ║
 * ║  "先定义验收标准，执行后立即校验，失败则结构化错误反馈重试"                 ║
 * ║                                                                              ║
 * ║  核心特性：                                                                  ║
 * ║  1. AcceptanceCriteria 接口：先声明验收标准，后执行工具                      ║
 * ║  2. 立即校验：工具执行完成后同步调用验证器                                   ║
 * ║  3. 结构化错误上下文注入：失败时生成带 retryHint 的错误，注入下一轮提示词   ║
 * ║  4. 自动重试闭环：内置指数退避重试，最终失败有完整错误汇总                  ║
 * ║  5. 审计钩子：全过程写入 tool-chain-audit                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import {
  auditValidationPass,
  auditValidationFail,
  auditRetryScheduled,
  auditRetryExhausted,
  type StructuredValidationError,
} from "./tool-chain-audit.js";

// ============================================================================
// 验收标准接口
// ============================================================================

/**
 * 验收标准（Acceptance Criterion）
 *
 * 对标 Stripe 的"先定义验收标准"模式——
 * 工具调用前先声明期望的输出特征，调用后立即校验。
 */
export interface AcceptanceCriterion<TOutput> {
  /** 验收标准唯一名称（用于审计和错误定位） */
  name: string;

  /** 验收标准描述（人类可读） */
  description: string;

  /**
   * 校验函数
   * - 返回 null：校验通过
   * - 返回 StructuredValidationError：校验失败，含 retryHint
   */
  validate: (output: TOutput) => StructuredValidationError | null;
}

/**
 * 验证套件——一组验收标准的集合
 */
export interface ValidationSuite<TOutput> {
  /** 套件名称 */
  name: string;
  /** 验收标准列表（按顺序执行，第一个失败即停止） */
  criteria: AcceptanceCriterion<TOutput>[];
  /**
   * 是否全量校验（默认 false = 第一个失败即停止）
   * true = 收集所有失败再汇总
   */
  validateAll?: boolean;
}

/** 单次验证结果 */
export interface ValidationResult {
  /** 是否通过所有验收标准 */
  passed: boolean;
  /** 失败的验收标准列表（validateAll=true 时可能有多个） */
  failures: StructuredValidationError[];
  /** 通过的验收标准数量 */
  passedCount: number;
  /** 失败的验收标准数量 */
  failedCount: number;
}

// ============================================================================
// 重试策略
// ============================================================================

export interface ValidationRetryPolicy {
  /** 最大重试次数（默认 3） */
  maxRetries?: number;
  /** 初始重试延迟 ms（默认 200） */
  initialDelayMs?: number;
  /** 退避倍数（默认 2.0） */
  backoffFactor?: number;
  /** 最大延迟 ms（默认 5000） */
  maxDelayMs?: number;
}

const DEFAULT_RETRY_POLICY: Required<ValidationRetryPolicy> = {
  maxRetries: 3,
  initialDelayMs: 200,
  backoffFactor: 2.0,
  maxDelayMs: 5_000,
};

function resolveRetryPolicy(
  policy?: ValidationRetryPolicy,
): Required<ValidationRetryPolicy> {
  return { ...DEFAULT_RETRY_POLICY, ...policy };
}

function computeRetryDelay(
  attempt: number,
  policy: Required<ValidationRetryPolicy>,
): number {
  const delay = policy.initialDelayMs * Math.pow(policy.backoffFactor, attempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// 核心验证器
// ============================================================================

/**
 * 对工具输出执行验收标准校验
 *
 * @param output  - 工具执行输出
 * @param suite   - 验证套件
 * @param context - 审计上下文（runId、toolCallId 等）
 */
export async function validateToolOutput<TOutput>(
  output: TOutput,
  suite: ValidationSuite<TOutput>,
  context: {
    runId: string;
    toolCallId: string;
    toolName: string;
  },
): Promise<ValidationResult> {
  const failures: StructuredValidationError[] = [];
  let passedCount = 0;

  for (const criterion of suite.criteria) {
    const error = criterion.validate(output);
    if (error === null) {
      passedCount++;
      void auditValidationPass({
        runId: context.runId,
        toolCallId: context.toolCallId,
        toolName: context.toolName,
        validatorName: `${suite.name}::${criterion.name}`,
      });
    } else {
      void auditValidationFail({
        runId: context.runId,
        toolCallId: context.toolCallId,
        toolName: context.toolName,
        validatorName: `${suite.name}::${criterion.name}`,
        validationError: error,
      });

      failures.push(error);

      if (!suite.validateAll) {
        break; // 快速失败模式
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    passedCount,
    failedCount: failures.length,
  };
}

// ============================================================================
// 结构化错误上下文注入
// ============================================================================

/**
 * 将验证失败的结构化错误格式化为 AI 可理解的重试上下文。
 *
 * 用于注入下一轮工具调用的 user 消息前缀，让 AI 知道哪里错了、该怎么改。
 *
 * 对标 Stripe 模式：结构化 error → contextual hint → 重新调用工具
 */
export function buildRetryContext(
  toolName: string,
  attempt: number,
  maxRetries: number,
  failures: StructuredValidationError[],
): string {
  const lines: string[] = [
    `[工具验证失败] 工具 \`${toolName}\` 的输出未通过验收标准（第 ${attempt} 次，共 ${maxRetries} 次机会）`,
    "",
    "失败详情：",
  ];

  for (let i = 0; i < failures.length; i++) {
    const f = failures[i]!;
    lines.push(`  ${i + 1}. [${f.code}] ${f.message}`);
    if (f.criterion) {
      lines.push(`     验收标准：${f.criterion}`);
    }
    if (f.expected !== undefined) {
      lines.push(`     期望：${JSON.stringify(f.expected)}`);
    }
    if (f.actual !== undefined) {
      lines.push(`     实际：${JSON.stringify(f.actual)}`);
    }
    if (f.retryHint) {
      lines.push(`     修复提示：${f.retryHint}`);
    }
  }

  lines.push("");
  lines.push("请根据以上反馈修正工具调用参数后重试。");

  return lines.join("\n");
}

// ============================================================================
// 验证反馈环执行器（带自动重试）
// ============================================================================

/** 带验证的工具执行结果 */
export interface ValidatedToolResult<TOutput> {
  /** 最终是否成功（通过验收标准） */
  ok: boolean;
  /** 最终输出（ok=true 时有值） */
  output?: TOutput;
  /** 总执行次数（含首次） */
  totalAttempts: number;
  /** 最终验证结果 */
  validationResult: ValidationResult;
  /** 重试上下文历史（每次失败的结构化错误上下文，供注入 AI 提示词） */
  retryContextHistory: string[];
  /** 最终错误上下文（ok=false 时，用于注入 AI 提示词） */
  finalRetryContext?: string;
}

/**
 * 带验证反馈环的工具执行器
 *
 * 流程：
 * 1. 执行工具
 * 2. 立即校验输出
 * 3. 通过 → 返回成功
 * 4. 失败 → 构建结构化错误上下文 → 延迟 → 重新执行工具（携带错误上下文）
 * 5. 重试耗尽 → 返回失败 + 完整错误历史
 *
 * @param executeTool   - 工具执行函数（接收可选的错误上下文，返回 TOutput）
 * @param suite         - 验证套件
 * @param auditContext  - 审计上下文
 * @param retryPolicy   - 重试策略
 */
export async function executeWithValidationLoop<TOutput>(
  executeTool: (retryContext?: string) => Promise<TOutput>,
  suite: ValidationSuite<TOutput>,
  auditContext: {
    runId: string;
    toolCallId: string;
    toolName: string;
  },
  retryPolicy?: ValidationRetryPolicy,
): Promise<ValidatedToolResult<TOutput>> {
  const policy = resolveRetryPolicy(retryPolicy);
  const retryContextHistory: string[] = [];
  let lastValidationResult: ValidationResult | null = null;
  let currentRetryContext: string | undefined = undefined;

  for (let attempt = 1; attempt <= policy.maxRetries + 1; attempt++) {
    // 执行工具
    const output = await executeTool(currentRetryContext);

    // 立即校验
    lastValidationResult = await validateToolOutput(output, suite, auditContext);

    if (lastValidationResult.passed) {
      return {
        ok: true,
        output,
        totalAttempts: attempt,
        validationResult: lastValidationResult,
        retryContextHistory,
      };
    }

    // 校验失败 → 是否还有重试次数？
    if (attempt > policy.maxRetries) {
      break;
    }

    // 构建结构化错误上下文
    const retryCtx = buildRetryContext(
      auditContext.toolName,
      attempt,
      policy.maxRetries,
      lastValidationResult.failures,
    );
    retryContextHistory.push(retryCtx);
    currentRetryContext = retryCtx;

    // 计算延迟
    const delayMs = computeRetryDelay(attempt, policy);

    // 审计：安排重试
    void auditRetryScheduled({
      runId: auditContext.runId,
      toolCallId: auditContext.toolCallId,
      toolName: auditContext.toolName,
      retryAttempt: attempt,
      maxRetries: policy.maxRetries,
      retryDelayMs: delayMs,
      validationError: lastValidationResult.failures[0],
    });

    await sleep(delayMs);
  }

  // 重试耗尽
  const finalRetryContext = buildRetryContext(
    auditContext.toolName,
    policy.maxRetries + 1,
    policy.maxRetries,
    lastValidationResult?.failures ?? [],
  );

  void auditRetryExhausted({
    runId: auditContext.runId,
    toolCallId: auditContext.toolCallId,
    toolName: auditContext.toolName,
    maxRetries: policy.maxRetries,
    lastError: lastValidationResult?.failures[0],
  });

  return {
    ok: false,
    totalAttempts: policy.maxRetries + 1,
    validationResult: lastValidationResult ?? {
      passed: false,
      failures: [],
      passedCount: 0,
      failedCount: 0,
    },
    retryContextHistory,
    finalRetryContext,
  };
}

// ============================================================================
// 内置通用验收标准工厂
// ============================================================================

/**
 * 非空输出验收标准
 */
export function criterionNonEmpty<T>(): AcceptanceCriterion<T> {
  return {
    name: "non-empty",
    description: "输出不能为空",
    validate(output) {
      if (output === null || output === undefined) {
        return {
          code: "EMPTY_OUTPUT",
          message: "工具输出为空（null/undefined）",
          criterion: "output.nonEmpty",
          actual: output,
          retryHint: "请确保工具返回了有效的非空输出",
        };
      }
      if (typeof output === "string" && output.trim().length === 0) {
        return {
          code: "EMPTY_STRING_OUTPUT",
          message: "工具输出为空字符串",
          criterion: "output.nonEmpty",
          actual: output,
          retryHint: "请确保工具返回了非空字符串内容",
        };
      }
      return null;
    },
  };
}

/**
 * 无错误状态验收标准（检测 details.status === "error" 模式）
 */
export function criterionNoToolError<T>(): AcceptanceCriterion<T> {
  return {
    name: "no-tool-error",
    description: '输出 details.status 不能为 "error" 或 "timeout"',
    validate(output) {
      if (!output || typeof output !== "object") return null;
      const record = output as Record<string, unknown>;
      const details = record.details;
      if (!details || typeof details !== "object") return null;
      const status =
        typeof (details as Record<string, unknown>).status === "string"
          ? ((details as Record<string, unknown>).status as string).trim().toLowerCase()
          : undefined;
      if (status === "error" || status === "timeout") {
        const errorMsg =
          (details as Record<string, unknown>).error ??
          (details as Record<string, unknown>).message ??
          status;
        return {
          code: "TOOL_ERROR_STATUS",
          message: `工具返回错误状态 "${status}"`,
          criterion: "output.noToolError",
          actual: { status, error: errorMsg },
          retryHint: `工具报错：${String(errorMsg)}，请修正参数后重试`,
        };
      }
      return null;
    },
  };
}

/**
 * 必含字段验收标准
 */
export function criterionHasFields<T>(fields: string[]): AcceptanceCriterion<T> {
  return {
    name: `has-fields(${fields.join(",")})`,
    description: `输出必须包含字段：${fields.join(", ")}`,
    validate(output) {
      if (!output || typeof output !== "object" || Array.isArray(output)) {
        return {
          code: "NOT_AN_OBJECT",
          message: "输出必须是对象类型",
          criterion: "output.isObject",
          actual: typeof output,
          retryHint: "请确保工具返回一个 JSON 对象",
        };
      }
      const record = output as Record<string, unknown>;
      const missing = fields.filter((f) => !(f in record));
      if (missing.length > 0) {
        return {
          code: "MISSING_OUTPUT_FIELDS",
          message: `输出缺少必需字段：${missing.join(", ")}`,
          criterion: `output.hasFields`,
          expected: fields,
          actual: Object.keys(record),
          retryHint: `请确保输出包含以下字段：${missing.join(", ")}`,
        };
      }
      return null;
    },
  };
}

/**
 * 自定义断言验收标准（快捷工厂）
 */
export function criterionCustom<T>(
  name: string,
  description: string,
  validate: (output: T) => StructuredValidationError | null,
): AcceptanceCriterion<T> {
  return { name, description, validate };
}

// ============================================================================
// 预定义验证套件（开箱即用）
// ============================================================================

/**
 * 通用工具输出验证套件（适用于大多数工具调用场景）
 */
export function createDefaultToolSuite<T>(suiteName?: string): ValidationSuite<T> {
  return {
    name: suiteName ?? "default-tool-suite",
    criteria: [criterionNonEmpty<T>(), criterionNoToolError<T>()],
  };
}

/**
 * 结构化对象输出验证套件（适用于返回 JSON 对象的工具）
 */
export function createObjectOutputSuite<T>(
  requiredFields: string[],
  suiteName?: string,
): ValidationSuite<T> {
  return {
    name: suiteName ?? "object-output-suite",
    criteria: [
      criterionNonEmpty<T>(),
      criterionNoToolError<T>(),
      criterionHasFields<T>(requiredFields),
    ],
  };
}
