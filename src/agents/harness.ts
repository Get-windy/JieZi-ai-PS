/**
 * Harness 增强模块统一出口
 *
 * 对标 Stripe / Shopify / Amazon 的 Agent Harness 理念，提供三大核心能力：
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  1. 输出验证反馈环 (Output Validation Loop)                              │
 * │     来源：tool-output-validator.ts                                       │
 * │     Stripe 模式：先定义验收标准 → 执行后立即校验 → 失败结构化重试        │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  2. 确定性脚本执行 (Deterministic Script Pattern)                        │
 * │     来源：deterministic-tool-executor.ts                                 │
 * │     Amazon 模式：高精度操作用脚本，AI 只做意图表达                       │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  3. 可观测性审计链 (Observability / Audit Trail)                         │
 * │     来源：tool-chain-audit.ts                                            │
 * │     Stripe/Shopify 模式：prompt→toolcall→output→validation 全链追踪     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 用法示例：
 *
 * ```typescript
 * import {
 *   // 验证反馈环
 *   executeWithValidationLoop,
 *   createDefaultToolSuite,
 *   createObjectOutputSuite,
 *   criterionCustom,
 *   buildRetryContext,
 *
 *   // 确定性脚本
 *   registerDeterministicScript,
 *   executeDeterministicScript,
 *   findScriptsByTag,
 *
 *   // 审计追踪
 *   getToolChainTrace,
 *   getToolCallTrace,
 *   listAuditFiles,
 * } from "./harness.js";
 *
 * // ── 场景 1：对工具调用套上验证反馈环 ──
 * const result = await executeWithValidationLoop(
 *   async (retryCtx) => {
 *     // retryCtx 是上一次失败的结构化错误上下文（首次为 undefined）
 *     // 可以把 retryCtx 注入到 AI prompt 前缀，让 AI 知道上次哪里错了
 *     return await myTool.execute({ ...args });
 *   },
 *   createDefaultToolSuite("my-tool-suite"),
 *   { runId, toolCallId, toolName: "myTool" },
 *   { maxRetries: 3, initialDelayMs: 300 },
 * );
 * if (!result.ok) {
 *   console.error("最终失败：", result.finalRetryContext);
 * }
 *
 * // ── 场景 2：注册并执行确定性脚本（高精度配置文件写入）──
 * registerDeterministicScript({
 *   name: "update-agent-config",
 *   description: "更新 Agent 配置字段",
 *   tags: ["config-file-edit"],
 *   schema: {
 *     configPath: { required: true, type: "string" },
 *     updates: { required: true, type: "object" },
 *   },
 *   async execute({ configPath, updates }) {
 *     const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
 *     const merged = { ...config, ...updates };
 *     await fs.writeFile(configPath, JSON.stringify(merged, null, 2));
 *     return merged;
 *   },
 * });
 * const scriptResult = await executeDeterministicScript({
 *   scriptName: "update-agent-config",
 *   intent: { configPath: "./agent.json", updates: { maxTokens: 4096 } },
 *   runId, toolCallId, toolName: "agent-config",
 * });
 *
 * // ── 场景 3：回放某次 run 的完整工具链路 ──
 * const trace = await getToolChainTrace(runId);
 * console.log(`工具链追踪：${trace.length} 条记录`);
 * ```
 */

// ── 输出验证反馈环 ──────────────────────────────────────────────────────────
export type {
  AcceptanceCriterion,
  ValidationSuite,
  ValidationResult,
  ValidationRetryPolicy,
  ValidatedToolResult,
} from "./tool-output-validator.js";

export {
  validateToolOutput,
  executeWithValidationLoop,
  buildRetryContext,
  criterionNonEmpty,
  criterionNoToolError,
  criterionHasFields,
  criterionCustom,
  createDefaultToolSuite,
  createObjectOutputSuite,
} from "./tool-output-validator.js";

// ── 确定性脚本执行 ──────────────────────────────────────────────────────────
export type {
  DeterministicScript,
  DeterministicScriptResult,
  DeterministicScriptSuccess,
  DeterministicScriptFailure,
  ParamsSchema,
  FieldValidator,
} from "./deterministic-tool-executor.js";

export {
  registerDeterministicScript,
  getDeterministicScript,
  findScriptsByTag,
  executeDeterministicScript,
  validateIntentParams,
} from "./deterministic-tool-executor.js";

// ── 工具链审计追踪 ──────────────────────────────────────────────────────────
export type {
  ToolChainPhase,
  ToolChainAuditRecord,
  StructuredValidationError,
} from "./tool-chain-audit.js";

export {
  appendToolChainRecord,
  auditToolStart,
  auditToolOutput,
  auditToolError,
  auditValidationPass,
  auditValidationFail,
  auditRetryScheduled,
  auditRetryExhausted,
  auditDeterministicScriptStart,
  auditDeterministicScriptEnd,
  getToolChainTrace,
  getToolCallTrace,
  listAuditFiles,
} from "./tool-chain-audit.js";
