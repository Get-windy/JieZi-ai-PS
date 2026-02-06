/**
 * 通用的基于 JSON Schema 的表单渲染器
 * 用于动态渲染通道账号配置字段
 */

import { html, nothing, type TemplateResult } from "lit";

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  enum?: unknown[];
  items?: JsonSchema;
  [key: string]: unknown;
};

export type SchemaFormProps = {
  schema: JsonSchema;
  config: Record<string, unknown>;
  onFieldChange: (fieldPath: string, value: unknown) => void;
  fieldPrefix?: string;
};

/**
 * 渲染基于 schema 的表单字段
 */
export function renderSchemaForm(props: SchemaFormProps): TemplateResult | typeof nothing {
  const { schema, config, onFieldChange, fieldPrefix = "config" } = props;

  if (!schema.properties) {
    return nothing;
  }

  const fields: TemplateResult[] = [];

  // 需要跳过的通用字段（这些字段在UI管理层处理）
  const skipFields = new Set(["enabled"]);

  for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
    if (skipFields.has(fieldName)) {
      continue;
    }

    const fieldPath = `${fieldPrefix}.${fieldName}`;
    const fieldValue = config[fieldName];

    fields.push(
      renderSchemaField({
        fieldName,
        fieldSchema,
        fieldPath,
        fieldValue,
        onFieldChange,
      }),
    );
  }

  return html`${fields}`;
}

type RenderFieldProps = {
  fieldName: string;
  fieldSchema: JsonSchema;
  fieldPath: string;
  fieldValue: unknown;
  onFieldChange: (path: string, value: unknown) => void;
};

/**
 * 渲染单个字段
 */
function renderSchemaField(props: RenderFieldProps): TemplateResult {
  const { fieldName, fieldSchema, fieldPath, fieldValue, onFieldChange } = props;

  // 提取字段元信息
  const label = humanizeFieldName(fieldName);
  const placeholder = getPlaceholder(fieldName, fieldSchema);
  const inputType = getInputType(fieldName, fieldSchema);
  const isPassword =
    fieldName.toLowerCase().includes("secret") ||
    fieldName.toLowerCase().includes("token") ||
    fieldName.toLowerCase().includes("password");

  // 枚举类型 - 渲染下拉选择
  if (fieldSchema.enum && Array.isArray(fieldSchema.enum)) {
    return html`
      <div class="form-group" style="margin-bottom: 24px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; color: var(--text-strong);">
          ${label}
        </label>
        <select
          class="form-control"
          style="width: 100%; padding: 10px 14px; font-size: 14px; border-radius: var(--radius-md); border: 1px solid var(--input); background: var(--card);"
          .value=${String(fieldValue ?? "")}
          @change=${(e: Event) => onFieldChange(fieldPath, (e.target as HTMLSelectElement).value)}
        >
          ${fieldSchema.enum.map((enumValue) => {
            const enumStr = String(enumValue);
            return html`<option value=${enumStr}>${humanizeEnumValue(enumStr)}</option>`;
          })}
        </select>
      </div>
    `;
  }

  // 数字类型
  if (fieldSchema.type === "integer" || fieldSchema.type === "number") {
    return html`
      <div class="form-group" style="margin-bottom: 24px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; color: var(--text-strong);">
          ${label}
        </label>
        <input
          type="number"
          class="form-control"
          style="width: 100%; padding: 10px 14px; font-size: 14px; border-radius: var(--radius-md); border: 1px solid var(--input); background: var(--card);"
          .value=${String(fieldValue ?? "")}
          placeholder=${placeholder}
          @input=${(e: Event) => {
            const value = (e.target as HTMLInputElement).value;
            onFieldChange(
              fieldPath,
              value
                ? fieldSchema.type === "integer"
                  ? parseInt(value, 10)
                  : parseFloat(value)
                : null,
            );
          }}
        />
      </div>
    `;
  }

  // 布尔类型
  if (fieldSchema.type === "boolean") {
    return html`
      <div class="form-group" style="margin-bottom: 24px;">
        <label style="display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: var(--text-strong); cursor: pointer;">
          <input
            type="checkbox"
            .checked=${Boolean(fieldValue)}
            @change=${(e: Event) => onFieldChange(fieldPath, (e.target as HTMLInputElement).checked)}
            style="width: 18px; height: 18px; cursor: pointer;"
          />
          <span>${label}</span>
        </label>
      </div>
    `;
  }

  // 数组类型 - 简化处理：显示为文本域
  if (fieldSchema.type === "array") {
    const arrayValue = Array.isArray(fieldValue) ? fieldValue.join("\n") : "";
    return html`
      <div class="form-group" style="margin-bottom: 24px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; color: var(--text-strong);">
          ${label}
          <small style="font-weight: normal; color: var(--muted); margin-left: 8px;">(每行一个)</small>
        </label>
        <textarea
          class="form-control"
          style="width: 100%; padding: 10px 14px; font-size: 14px; border-radius: var(--radius-md); border: 1px solid var(--input); background: var(--card); min-height: 100px; font-family: var(--mono);"
          placeholder=${placeholder || "每行输入一个值"}
          .value=${arrayValue}
          @input=${(e: Event) => {
            const text = (e.target as HTMLTextAreaElement).value;
            const array = text
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            onFieldChange(fieldPath, array);
          }}
        ></textarea>
      </div>
    `;
  }

  // 字符串类型（默认）
  const useMonoFont =
    isPassword ||
    fieldName.toLowerCase().includes("id") ||
    fieldName.toLowerCase().includes("key") ||
    fieldName.toLowerCase().includes("url");

  return html`
    <div class="form-group" style="margin-bottom: 24px;">
      <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500; color: var(--text-strong);">
        ${label}
      </label>
      <input
        type=${inputType}
        class="form-control"
        style="width: 100%; padding: 10px 14px; font-size: 14px; border-radius: var(--radius-md); border: 1px solid var(--input); background: var(--card); ${useMonoFont ? "font-family: var(--mono);" : ""}"
        .value=${String(fieldValue ?? "")}
        placeholder=${placeholder}
        @input=${(e: Event) => onFieldChange(fieldPath, (e.target as HTMLInputElement).value)}
      />
    </div>
  `;
}

/**
 * 人性化字段名称
 */
function humanizeFieldName(fieldName: string): string {
  // 处理常见的缩写和命名
  const specialCases: Record<string, string> = {
    appId: "应用 ID",
    appKey: "应用 Key",
    appSecret: "应用密钥",
    corpid: "企业 ID",
    corpsecret: "企业密钥",
    agentid: "应用 Agent ID",
    domain: "服务域名",
    webhookPath: "Webhook 路径",
    webhookPort: "Webhook 端口",
    encryptKey: "加密密钥",
    verificationToken: "验证 Token",
    connectionMode: "连接模式",
    dmPolicy: "私聊策略",
    groupPolicy: "群组策略",
    allowFrom: "白名单",
    groupAllowFrom: "群组白名单",
    requireMention: "需要@提及",
    historyLimit: "历史消息限制",
    dmHistoryLimit: "私聊历史限制",
    textChunkLimit: "文本分块限制",
    chunkMode: "分块模式",
    mediaMaxMb: "媒体文件大小限制(MB)",
    renderMode: "渲染模式",
  };

  if (specialCases[fieldName]) {
    return specialCases[fieldName];
  }

  // 通用转换：camelCase -> 标题格式
  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * 人性化枚举值
 */
function humanizeEnumValue(value: string): string {
  const translations: Record<string, string> = {
    feishu: "飞书 (feishu.cn)",
    lark: "Lark (larksuite.com)",
    websocket: "WebSocket 长连接",
    webhook: "Webhook 回调",
    open: "开放",
    pairing: "配对模式",
    allowlist: "白名单",
    disabled: "禁用",
    length: "按长度",
    newline: "按换行",
    auto: "自动",
    raw: "原始文本",
    card: "卡片模式",
  };

  return translations[value] || value;
}

/**
 * 获取输入框类型
 */
function getInputType(fieldName: string, schema: JsonSchema): string {
  const lowerName = fieldName.toLowerCase();

  if (
    lowerName.includes("secret") ||
    lowerName.includes("password") ||
    lowerName.includes("token")
  ) {
    return "password";
  }

  if (lowerName.includes("url") || lowerName.includes("path")) {
    return "url";
  }

  if (schema.type === "integer" || schema.type === "number") {
    return "number";
  }

  return "text";
}

/**
 * 获取占位符文本
 */
function getPlaceholder(fieldName: string, schema: JsonSchema): string {
  const placeholders: Record<string, string> = {
    appId: "cli_xxxxx",
    appKey: "dingxxxxx",
    corpid: "ww1234567890abcdef",
    webhookPath: "/webhook",
    webhookPort: "8080",
  };

  return placeholders[fieldName] || "";
}
