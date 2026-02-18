import fs from "node:fs";
import path from "node:path";
import type { ChannelId } from "./plugins/types.js";
import { resolveOAuthDir, resolveStateDir } from "../config/paths.js";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import os from "node:os";

export type ChannelPairingRequest = {
  id: string;
  code: string;
  createdAt: string;
  lastSeenAt: string;
  meta?: Record<string, string>;
};

type PairingStore = {
  version: 1;
  requests: ChannelPairingRequest[];
};

/**
 * 解析证书目录（与 pairing-store.ts 保持一致）
 */
function resolveCredentialsDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env, () => resolveRequiredHomeDir(env, os.homedir));
  return resolveOAuthDir(env, stateDir);
}

/**
 * 安全的通道ID（防止路径穿越攻击）
 */
function safeChannelKey(channel: ChannelId): string {
  const raw = String(channel).trim().toLowerCase();
  if (!raw) {
    throw new Error("invalid pairing channel");
  }
  const safe = raw.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_");
  if (!safe || safe === "_") {
    throw new Error("invalid pairing channel");
  }
  return safe;
}

/**
 * 获取配对请求文件路径（与 pairing-store.ts 保持一致）
 */
function getPairingPath(channelId: ChannelId, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveCredentialsDir(env), `${safeChannelKey(channelId)}-pairing.json`);
}

/**
 * 读取指定通道的所有配对请求
 */
export function loadChannelPairingRequests(channelId: ChannelId): ChannelPairingRequest[] {
  try {
    const filePath = getPairingPath(channelId);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as PairingStore;
    return Array.isArray(data.requests) ? data.requests : [];
  } catch (err) {
    console.error(`Failed to load pairing requests for ${channelId}:`, err);
    return [];
  }
}

/**
 * 读取所有通道的配对请求
 */
export function loadAllChannelPairingRequests(): Record<string, ChannelPairingRequest[]> {
  const result: Record<string, ChannelPairingRequest[]> = {};
  try {
    const dir = resolveCredentialsDir();
    if (!fs.existsSync(dir)) {
      return result;
    }
    const files = fs.readdirSync(dir);
    for (const file of files) {
      // 匹配 <channelId>-pairing.json 格式
      const match = file.match(/^(.+)-pairing\.json$/);
      if (!match) {
        continue;
      }
      const channelId = match[1] as ChannelId;
      const requests = loadChannelPairingRequests(channelId);
      if (requests.length > 0) {
        result[channelId] = requests;
      }
    }
  } catch (err) {
    console.error("Failed to load all pairing requests:", err);
  }
  return result;
}

/**
 * 保存通道的配对请求（已废弃：使用 pairing-store.ts 的函数）
 * @deprecated 使用 pairing-store.ts 中的 upsertChannelPairingRequest
 */
export function saveChannelPairingRequests(
  channelId: ChannelId,
  requests: ChannelPairingRequest[],
): void {
  try {
    const filePath = getPairingPath(channelId);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const data: PairingStore = {
      version: 1,
      requests,
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  } catch (err) {
    console.error(`Failed to save pairing requests for ${channelId}:`, err);
    throw err;
  }
}

/**
 * 删除指定的配对请求（已废弃：使用 pairing-store.ts 的函数）
 * @deprecated 使用 pairing-store.ts 中的 approveChannelPairingCode
 */
export function removePairingRequest(channelId: ChannelId, code: string): boolean {
  try {
    const requests = loadChannelPairingRequests(channelId);
    const filtered = requests.filter((req) => req.code !== code);
    if (filtered.length === requests.length) {
      return false; // 没有找到对应的请求
    }
    saveChannelPairingRequests(channelId, filtered);
    return true;
  } catch (err) {
    console.error(`Failed to remove pairing request for ${channelId}:`, err);
    throw err;
  }
}
