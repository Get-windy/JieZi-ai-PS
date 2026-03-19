/**
 * heartbeat-bootstrap-compact.ts
 *
 * 心跳结束后对 HEARTBEAT.md 执行滚动摘要（Hierarchical Summarization）：
 *   - 文件大小 <= COMPACT_THRESHOLD_BYTES 时不做任何处理
 *   - 超过阈值时：保留最近 KEEP_RECENT_BLOCKS 个完整心跳记录块，
 *     更早的块压缩为一段滚动摘要，将文件控制在目标大小以内
 *
 * 记录块识别规则（宽容策略）：
 *   以 "## " 或 "# " 开头的行视为块分隔符（Markdown 二级/一级标题）。
 *   若文件中无任何标题行，则按空行段落分割，每段视为一个块。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_HEARTBEAT_FILENAME } from "../../upstream/src/agents/workspace.js";
import { createSubsystemLogger } from "../../upstream/src/logging/subsystem.js";

const log = createSubsystemLogger("heartbeat-compact");

/** 触发压缩的文件大小阈值（字节，约 15KB）*/
const COMPACT_THRESHOLD_BYTES = 15_000;

/** 保留的最近完整心跳记录块数 */
const KEEP_RECENT_BLOCKS = 3;

/** 压缩摘要的最大字符数 */
const SUMMARY_MAX_CHARS = 2_000;

/** 压缩后的目标最大字节数（略低于阈值，留余量）*/
const TARGET_MAX_BYTES = 12_000;

// ────────────────────────────────────────────────────────────────────────────

/**
 * 将 HEARTBEAT.md 内容按 Markdown 标题行切分为多个记录块。
 * 每个块以标题行开头（包含标题行本身）。
 * 若无标题行，则按空行段落分割。
 */
function splitIntoBlocks(content: string): string[] {
  const lines = content.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  const headingPattern = /^#{1,3} /;

  let hasHeadings = false;
  for (const line of lines) {
    if (headingPattern.test(line)) {
      hasHeadings = true;
      break;
    }
  }

  if (!hasHeadings) {
    // 无标题：按双空行段落分割
    const paragraphs = content.split(/\n{2,}/);
    return paragraphs.map((p) => p.trim()).filter((p) => p.length > 0);
  }

  for (const line of lines) {
    if (headingPattern.test(line) && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks.filter((b) => b.trim().length > 0);
}

/**
 * 将旧的记录块生成一段滚动摘要。
 * 摘要只保留每个块的首行（标题/首句）加少量内容，截断到 SUMMARY_MAX_CHARS。
 */
function buildRollingSummary(oldBlocks: string[], generatedAt: string): string {
  const excerpts: string[] = [];
  for (const block of oldBlocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      continue;
    }
    // 取前两行作为摘要代表
    const excerpt = lines.slice(0, 2).join(" ").slice(0, 200);
    excerpts.push(`- ${excerpt}`);
  }
  const body = excerpts.join("\n").slice(0, SUMMARY_MAX_CHARS);
  return [
    `## [历史摘要 · 自动压缩于 ${generatedAt}]`,
    "",
    `> 以下为较早记录的滚动摘要（共 ${oldBlocks.length} 条），已压缩以控制文件大小。`,
    "",
    body,
    "",
  ].join("\n");
}

/**
 * 检查 HEARTBEAT.md 是否超过阈值，若超过则执行滚动摘要压缩并写回。
 * 此函数会捕获所有错误，不会抛出，确保不影响心跳主流程。
 */
export async function compactHeartbeatFileIfNeeded(workspaceDir: string): Promise<void> {
  const filePath = path.join(workspaceDir, DEFAULT_HEARTBEAT_FILENAME);

  let stat: { size: number } | null = null;
  try {
    stat = await fs.stat(filePath);
  } catch {
    // 文件不存在，跳过
    return;
  }

  if (stat.size <= COMPACT_THRESHOLD_BYTES) {
    return;
  }

  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    log.warn(`heartbeat-compact: failed to read ${filePath}: ${String(err)}`);
    return;
  }

  const blocks = splitIntoBlocks(content);
  if (blocks.length <= KEEP_RECENT_BLOCKS) {
    // 块数量已经很少，无法压缩
    log.info(
      `heartbeat-compact: ${filePath} is ${stat.size} bytes with only ${blocks.length} block(s), skipping compact`,
    );
    return;
  }

  const oldBlocks = blocks.slice(0, blocks.length - KEEP_RECENT_BLOCKS);
  const recentBlocks = blocks.slice(blocks.length - KEEP_RECENT_BLOCKS);

  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  const summary = buildRollingSummary(oldBlocks, generatedAt);
  const newContent = [summary, ...recentBlocks].join("\n\n");

  // 如果压缩后仍然超过目标大小，截断摘要部分（保护最近块不被截断）
  const recentContent = recentBlocks.join("\n\n");
  let finalContent = newContent;
  if (Buffer.byteLength(newContent, "utf-8") > TARGET_MAX_BYTES) {
    const recentBytes = Buffer.byteLength(recentContent, "utf-8");
    if (recentBytes >= TARGET_MAX_BYTES) {
      // 最近块本身就超了，只写最近块
      finalContent = recentContent;
    } else {
      const summaryBudget = TARGET_MAX_BYTES - recentBytes - 4; // 4 bytes for "\n\n"
      const truncatedSummary = Buffer.from(summary, "utf-8")
        .slice(0, summaryBudget)
        .toString("utf-8");
      finalContent = [truncatedSummary, recentContent].join("\n\n");
    }
  }

  try {
    await fs.writeFile(filePath, finalContent, "utf-8");
    const newSize = Buffer.byteLength(finalContent, "utf-8");
    log.info(
      `heartbeat-compact: compacted ${filePath} ` +
        `${stat.size} → ${newSize} bytes ` +
        `(${oldBlocks.length} old blocks summarized, ${recentBlocks.length} recent blocks kept)`,
    );
  } catch (err) {
    log.warn(`heartbeat-compact: failed to write compacted ${filePath}: ${String(err)}`);
  }
}
