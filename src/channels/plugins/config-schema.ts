import { z, type ZodTypeAny } from "zod";
import { DmPolicySchema } from "../../config/zod-schema.core.js";
import type { ChannelConfigSchema } from "./types.plugin.js";

type ZodSchemaWithToJsonSchema = ZodTypeAny & {
  toJSONSchema?: (params?: Record<string, unknown>) => unknown;
};

type ExtendableZodObject = ZodTypeAny & {
  extend: (shape: Record<string, ZodTypeAny>) => ZodTypeAny;
};

export const AllowFromEntrySchema = z.union([z.string(), z.number()]);
export const AllowFromListSchema = z.array(AllowFromEntrySchema).optional();

export function buildNestedDmConfigSchema() {
  return z
    .object({
      enabled: z.boolean().optional(),
      policy: DmPolicySchema.optional(),
      allowFrom: AllowFromListSchema,
    })
    .optional();
}

export function buildCatchallMultiAccountChannelSchema<T extends ExtendableZodObject>(
  accountSchema: T,
): T {
  return accountSchema.extend({
    accounts: z.object({}).catchall(accountSchema).optional(),
    defaultAccount: z.string().optional(),
  }) as T;
}

// Zod v3 internal type markers
type ZodV3Object = ZodTypeAny & {
  _def: {
    typeName?: string;
    shape?: () => Record<string, ZodTypeAny>;
    innerType?: ZodTypeAny;
    schema?: ZodTypeAny;
    type?: ZodTypeAny;
    options?: ZodTypeAny[];
  };
};

/**
 * Extract a simplified JSON Schema properties map from a Zod v3 schema.
 * Handles ZodObject, ZodOptional, ZodDefault, ZodEffects wrappers.
 */
function zodV3ToJsonSchemaProperties(
  schema: ZodTypeAny,
): Record<string, Record<string, unknown>> | undefined {
  const s = schema as ZodV3Object;
  if (!s._def) return undefined;
  const typeName = s._def.typeName;

  // Unwrap ZodOptional / ZodDefault / ZodEffects / ZodBranded
  if (
    typeName === "ZodOptional" ||
    typeName === "ZodDefault" ||
    typeName === "ZodNullable" ||
    typeName === "ZodBranded"
  ) {
    const inner = s._def.innerType;
    return inner ? zodV3ToJsonSchemaProperties(inner) : undefined;
  }
  if (typeName === "ZodEffects") {
    const inner = s._def.schema;
    return inner ? zodV3ToJsonSchemaProperties(inner) : undefined;
  }

  if (typeName !== "ZodObject") return undefined;

  const shape = typeof s._def.shape === "function" ? s._def.shape() : undefined;
  if (!shape) return undefined;

  const properties: Record<string, Record<string, unknown>> = {};
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const fieldDef = (fieldSchema as ZodV3Object)._def;
    if (!fieldDef) continue;
    properties[key] = zodV3FieldToJsonSchema(fieldSchema as ZodTypeAny);
  }
  return properties;
}

function zodV3FieldToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const s = schema as ZodV3Object;
  const typeName = s._def?.typeName;

  if (typeName === "ZodOptional" || typeName === "ZodNullable" || typeName === "ZodBranded") {
    const inner = s._def.innerType;
    return inner ? zodV3FieldToJsonSchema(inner) : {};
  }
  if (typeName === "ZodDefault") {
    const inner = s._def.innerType;
    return inner ? zodV3FieldToJsonSchema(inner) : {};
  }
  if (typeName === "ZodEffects") {
    const inner = s._def.schema;
    return inner ? zodV3FieldToJsonSchema(inner) : {};
  }
  if (typeName === "ZodString") return { type: "string" };
  if (typeName === "ZodNumber") return { type: "number" };
  if (typeName === "ZodBoolean") return { type: "boolean" };
  if (typeName === "ZodEnum") {
    const values = (s._def as { values?: string[] }).values ?? [];
    return { type: "string", enum: values };
  }
  if (typeName === "ZodUnion") {
    const options = (s._def as { options?: ZodTypeAny[] }).options ?? [];
    // If all options are ZodLiteral strings → enum
    const literals = options
      .map((o) => {
        const od = (o as ZodV3Object)._def;
        return od?.typeName === "ZodLiteral" ? (od as { value?: unknown }).value : undefined;
      })
      .filter((v): v is string => typeof v === "string");
    if (literals.length === options.length && literals.length > 0) {
      return { type: "string", enum: literals };
    }
    return { type: "string" };
  }
  if (typeName === "ZodObject") {
    const props = zodV3ToJsonSchemaProperties(schema);
    // Handle .catchall() — Zod stores it in _def.catchall
    const catchallSchema = (s._def as { catchall?: ZodTypeAny }).catchall as
      | ZodV3Object
      | undefined;
    const hasCatchall =
      catchallSchema &&
      catchallSchema._def?.typeName !== "ZodNever" &&
      catchallSchema._def?.typeName !== undefined;
    if (hasCatchall) {
      const additionalProperties = zodV3FieldToJsonSchema(catchallSchema as ZodTypeAny);
      return {
        type: "object",
        ...(props && Object.keys(props).length > 0 ? { properties: props } : {}),
        additionalProperties,
      };
    }
    return props && Object.keys(props).length > 0
      ? { type: "object", properties: props }
      : { type: "object" };
  }
  if (typeName === "ZodArray") return { type: "array" };
  if (typeName === "ZodRecord") {
    // ZodRecord<string, T> — extract value type as additionalProperties
    const valueType = (s._def as { valueType?: ZodTypeAny }).valueType;
    if (valueType) {
      const additionalProperties = zodV3FieldToJsonSchema(valueType);
      return { type: "object", additionalProperties };
    }
    return { type: "object" };
  }
  if (typeName === "ZodLiteral") {
    const val = (s._def as { value?: unknown }).value;
    return typeof val === "string"
      ? { type: "string", enum: [val] }
      : { type: typeof val === "number" ? "number" : "string" };
  }
  return {};
}

export function buildChannelConfigSchema(schema: ZodTypeAny): ChannelConfigSchema {
  const schemaWithJson = schema as ZodSchemaWithToJsonSchema;
  if (typeof schemaWithJson.toJSONSchema === "function") {
    return {
      schema: schemaWithJson.toJSONSchema({
        target: "draft-07",
        unrepresentable: "any",
      }) as Record<string, unknown>,
    };
  }

  // Compatibility fallback for Zod v3 schemas where `.toJSONSchema()` is unavailable.
  // Extract properties from the ZodObject shape directly.
  const properties = zodV3ToJsonSchemaProperties(schema);
  if (properties && Object.keys(properties).length > 0) {
    return {
      schema: {
        type: "object",
        properties,
      },
    };
  }

  return {
    schema: {
      type: "object",
      additionalProperties: true,
    },
  };
}
