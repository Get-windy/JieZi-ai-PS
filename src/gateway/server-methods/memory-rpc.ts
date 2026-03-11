// oxlint-disable typescript/no-base-to-string -- params values are unknown but safe to stringify
/**
 * Memory Blocks RPC Handlers
 * 主动记忆写入层（借鉴 Letta + Mem0 + LangMem）
 *
 * 借鉴要点：
 * 1. 热路径主动写入（Letta core_memory_append）：
 *    Agent 在对话中途随时调用 memory.save，无需等待 /new 或 context 溢出。
 *
 * 2. 语义去重（Mem0 ADD/UPDATE/DELETE）：
 *    写入前扫描同 namespace 记忆，Jaccard 相似度判断：
 *    - 相似度 >= 0.85 → SKIP（几乎相同，不重复写）
 *    - 相似度 0.55~0.84 → UPDATE（合并更新）
 *    - 相似度 < 0.55 → ADD（全新条目）
 *    不需要外部 embedding API，纯本地计算。
 *
 * 3. 结构化分区（Letta memory blocks）：
 *    4 个 namespace：preferences / decisions / context / facts
 *    各自独立 JSON 文件，精准定向检索。
 *
 * 存储路径：{stateDir}/memory-blocks/{agentId}/{namespace}.json
 */

import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

// ============================================================================
// 类型定义
// ============================================================================

type MemoryNamespace = "preferences" | "decisions" | "context" | "facts";

interface MemoryEntry {
  id: string;
  content: string;
  namespace: MemoryNamespace;
  tags: string[];
  agentId?: string;
  savedAt: number;
  updatedAt?: number;
}

interface MemoryStore {
  version: 1;
  entries: MemoryEntry[];
}

// ============================================================================
// 语义去重引擎（Jaccard 相似度，Mem0 风格）
// ============================================================================

/** 相似度 >= 这个阈值 → UPDATE（更新已有条目） */
const DEDUP_UPDATE_THRESHOLD = 0.55;
/** 相似度 >= 这个阈值 → SKIP（几乎相同，跳过写入） */
const DEDUP_SKIP_THRESHOLD = 0.85;

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
  "but",
  "with",
  "that",
  "this",
  "it",
  "be",
  "as",
  "by",
  "are",
  "was",
  "has",
  "have",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "的",
  "了",
  "是",
  "在",
  "和",
  "与",
  "我",
  "你",
  "他",
  "她",
  "它",
  "我们",
  "你们",
  "他们",
  "这",
  "那",
  "一",
  "个",
  "不",
  "也",
  "都",
  "很",
  "就",
]);

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  // 英文单词 + 中文字符分词
  const words = text.toLowerCase().match(/[\u4e00-\u9fff]|[a-z0-9]+/g) ?? [];
  for (const w of words) {
    if (w.length > 1 && !STOP_WORDS.has(w)) {
      tokens.add(w);
    }
  }
  return tokens;
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

type DedupDecision =
  | { action: "add" }
  | { action: "update"; existingId: string; similarity: number }
  | { action: "skip"; existingId: string; similarity: number };

function decideDedupAction(newContent: string, store: MemoryStore): DedupDecision {
  let bestSimilarity = 0;
  let bestId = "";

  for (const entry of store.entries) {
    const sim = jaccardSimilarity(newContent, entry.content);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestId = entry.id;
    }
  }

  if (bestSimilarity >= DEDUP_SKIP_THRESHOLD) {
    return { action: "skip", existingId: bestId, similarity: bestSimilarity };
  }
  if (bestSimilarity >= DEDUP_UPDATE_THRESHOLD) {
    return { action: "update", existingId: bestId, similarity: bestSimilarity };
  }
  return { action: "add" };
}

// ============================================================================
// 存储层
// ============================================================================

function resolveMemoryDir(agentId?: string): string {
  const stateDir = resolveStateDir(process.env);
  const base = path.join(stateDir, "memory-blocks");
  return agentId ? path.join(base, agentId) : path.join(base, "_global");
}

function resolveMemoryFile(agentId: string | undefined, namespace: MemoryNamespace): string {
  return path.join(resolveMemoryDir(agentId), `${namespace}.json`);
}

function loadMemoryStore(filePath: string): MemoryStore {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as MemoryStore;
      if (parsed && Array.isArray(parsed.entries)) {
        return parsed;
      }
    }
  } catch {
    // 文件损坏或格式错误时重置
  }
  return { version: 1, entries: [] };
}

function saveMemoryStore(filePath: string, store: MemoryStore): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
}

// ============================================================================
// RPC Handler 注册
// ============================================================================

export const memoryRpc: GatewayRequestHandlers = {
  /**
   * memory.save — 主动写入一条记忆（带语义去重）
   */
  "memory.save": async ({ params, respond }) => {
    try {
      const content = params?.content ? String(params.content) : "";
      if (!content.trim()) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "content is required"));
        return;
      }

      const namespace = (
        params?.namespace &&
        ["preferences", "decisions", "context", "facts"].includes(String(params.namespace))
          ? String(params.namespace)
          : "context"
      ) as MemoryNamespace;

      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const tags = Array.isArray(params?.tags) ? params.tags.map(String) : [];
      const force = params?.force === true;

      const filePath = resolveMemoryFile(agentId, namespace);
      const store = loadMemoryStore(filePath);

      // 语义去重（force=true 时跳过）
      if (!force) {
        const decision = decideDedupAction(content, store);

        if (decision.action === "skip") {
          respond(
            true,
            {
              action: "skipped",
              id: decision.existingId,
              merged: false,
              similarity: decision.similarity,
            },
            undefined,
          );
          return;
        }

        if (decision.action === "update") {
          const idx = store.entries.findIndex((e) => e.id === decision.existingId);
          if (idx !== -1) {
            const existing = store.entries[idx];
            if (existing) {
              // 合并：保留旧内容 + 追加新内容摘要
              existing.content = `${existing.content}\n\n[Updated] ${content}`;
              existing.updatedAt = Date.now();
              // 合并标签（去重）
              const mergedTags = Array.from(new Set([...existing.tags, ...tags]));
              existing.tags = mergedTags;
              store.entries[idx] = existing;
              saveMemoryStore(filePath, store);
              respond(
                true,
                {
                  action: "updated",
                  id: existing.id,
                  merged: true,
                  mergedWith: existing.id,
                  similarity: decision.similarity,
                },
                undefined,
              );
              return;
            }
          }
        }
      }

      // ADD：新增条目
      const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const entry: MemoryEntry = {
        id,
        content,
        namespace,
        tags,
        agentId,
        savedAt: params?.savedAt ? Number(params.savedAt) : Date.now(),
      };
      store.entries.push(entry);
      saveMemoryStore(filePath, store);

      respond(
        true,
        {
          action: "added",
          id,
          merged: false,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `memory.save failed: ${String(err)}`),
      );
    }
  },

  /**
   * memory.delete — 删除指定 ID 的记忆条目
   */
  "memory.delete": async ({ params, respond }) => {
    try {
      const memoryId = params?.memoryId ? String(params.memoryId) : "";
      if (!memoryId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "memoryId is required"));
        return;
      }

      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const namespaces: MemoryNamespace[] = ["preferences", "decisions", "context", "facts"];

      let deleted = false;
      for (const ns of namespaces) {
        const filePath = resolveMemoryFile(agentId, ns);
        const store = loadMemoryStore(filePath);
        const before = store.entries.length;
        store.entries = store.entries.filter((e) => e.id !== memoryId);
        if (store.entries.length < before) {
          saveMemoryStore(filePath, store);
          deleted = true;
          break;
        }
      }

      if (!deleted) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Memory entry "${memoryId}" not found`),
        );
        return;
      }

      respond(true, { success: true, memoryId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `memory.delete failed: ${String(err)}`),
      );
    }
  },

  /**
   * memory.list — 列出记忆条目（可按 namespace / tag 过滤）
   */
  "memory.list": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const filterNamespace = params?.namespace
        ? (String(params.namespace) as MemoryNamespace)
        : undefined;
      const filterTag = params?.tag ? String(params.tag) : undefined;
      const limit = typeof params?.limit === "number" ? Math.min(params.limit, 100) : 20;

      const namespaces: MemoryNamespace[] = filterNamespace
        ? [filterNamespace]
        : ["preferences", "decisions", "context", "facts"];

      const entries: MemoryEntry[] = [];
      for (const ns of namespaces) {
        const filePath = resolveMemoryFile(agentId, ns);
        const store = loadMemoryStore(filePath);
        entries.push(...store.entries);
      }

      // 标签过滤
      const filtered = filterTag ? entries.filter((e) => e.tags.includes(filterTag)) : entries;

      // 按 savedAt 倒序，取最新的 limit 条
      const sorted = filtered.toSorted(
        (a, b) => (b.updatedAt ?? b.savedAt) - (a.updatedAt ?? a.savedAt),
      );
      const page = sorted.slice(0, limit);

      respond(
        true,
        {
          entries: page,
          total: filtered.length,
          returned: page.length,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `memory.list failed: ${String(err)}`),
      );
    }
  },

  /**
   * memory.namespace.stats — 统计各 namespace 记忆条目数量
   */
  "memory.namespace.stats": async ({ params, respond }) => {
    try {
      const agentId = params?.agentId ? String(params.agentId) : undefined;
      const namespaces: MemoryNamespace[] = ["preferences", "decisions", "context", "facts"];

      const stats: Record<string, number> = {};
      let total = 0;

      for (const ns of namespaces) {
        const filePath = resolveMemoryFile(agentId, ns);
        const store = loadMemoryStore(filePath);
        stats[ns] = store.entries.length;
        total += store.entries.length;
      }

      respond(true, { stats, total, agentId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `memory.namespace.stats failed: ${String(err)}`),
      );
    }
  },
};
