import fs from "node:fs";

/**
 * 同步读取文件的 mtime（毫秒时间戳）。
 * 文件不存在或读取失败时返回 undefined。
 */
export function getFileMtimeMs(filePath: string): number | undefined {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return undefined;
  }
}

/**
 * 判断缓存是否启用（TTL > 0 表示启用）。
 */
export function isCacheEnabled(ttlMs: number): boolean {
  return ttlMs > 0;
}

/**
 * 解析缓存 TTL（毫秒）。
 * 优先读取环境变量，解析失败或未设置时使用默认值。
 */
export function resolveCacheTtlMs(opts: {
  envValue: string | undefined;
  defaultTtlMs: number;
}): number {
  if (opts.envValue !== undefined && opts.envValue !== "") {
    const parsed = parseInt(opts.envValue, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return opts.defaultTtlMs;
}
