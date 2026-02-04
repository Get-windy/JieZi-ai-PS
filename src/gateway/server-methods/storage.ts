import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatError } from "../server-utils.js";

/**
 * 列出系统可用驱动器（Windows）或根目录（Linux/Mac）
 */
async function listDrives(): Promise<{ path: string; label: string; type: string }[]> {
  const platform = os.platform();

  if (platform === "win32") {
    // Windows: 列出所有驱动器
    const drives: { path: string; label: string; type: string }[] = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const drivePath = `${letter}:\\`;
      try {
        await fs.promises.access(drivePath);
        drives.push({
          path: drivePath,
          label: `${letter}: 驱动器`,
          type: "drive",
        });
      } catch {
        // 驱动器不存在，跳过
      }
    }
    return drives;
  } else {
    // Linux/Mac: 返回根目录和常用目录
    return [
      { path: "/", label: "根目录", type: "root" },
      { path: os.homedir(), label: "用户主目录", type: "home" },
    ];
  }
}

/**
 * 列出指定目录下的子目录
 */
async function listDirectories(dirPath: string): Promise<{
  parent: string | null;
  current: string;
  directories: { name: string; path: string }[];
}> {
  const resolvedPath = path.resolve(dirPath);

  const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !entry.name.startsWith(".")) // 过滤隐藏目录
    .map((entry) => ({
      name: entry.name,
      path: path.join(resolvedPath, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = path.dirname(resolvedPath);

  return {
    parent: parent !== resolvedPath ? parent : null,
    current: resolvedPath,
    directories,
  };
}

/**
 * 验证路径是否有效且可写
 */
async function validatePath(targetPath: string): Promise<{
  valid: boolean;
  exists: boolean;
  writable: boolean;
  error?: string;
}> {
  const resolvedPath = path.resolve(targetPath);

  // 检查路径是否存在
  let exists = false;
  try {
    await fs.promises.access(resolvedPath);
    exists = true;
  } catch {
    exists = false;
  }

  // 如果不存在，检查父目录是否可写
  if (!exists) {
    const parentDir = path.dirname(resolvedPath);
    try {
      await fs.promises.access(parentDir, fs.constants.W_OK);
      return { valid: true, exists: false, writable: true };
    } catch {
      return {
        valid: false,
        exists: false,
        writable: false,
        error: "父目录不可写或不存在",
      };
    }
  }

  // 检查是否可写
  try {
    await fs.promises.access(resolvedPath, fs.constants.W_OK);
    return { valid: true, exists: true, writable: true };
  } catch {
    return {
      valid: false,
      exists: true,
      writable: false,
      error: "目录不可写",
    };
  }
}

/**
 * 获取当前会话存储路径
 */
function getCurrentStoragePath(): string {
  const stateDir = resolveStateDir();
  return path.join(stateDir, "agents", "main", "sessions");
}

/**
 * 迁移会话数据到新路径
 * 成功后自动更新配置文件
 */
async function migrateSessionData(params: {
  newPath: string;
  moveFiles: boolean;
}): Promise<{ success: boolean; movedFiles: number; configUpdated: boolean; error?: string }> {
  try {
    const currentPath = getCurrentStoragePath();
    const newStorePath = path.resolve(params.newPath);

    // 确保新目录存在
    await fs.promises.mkdir(newStorePath, { recursive: true });

    // 读取当前会话存储
    const currentSessionsFile = path.join(currentPath, "sessions.json");
    const newSessionsFile = path.join(newStorePath, "sessions.json");

    let movedFiles = 0;

    // 复制或移动 sessions.json
    if (fs.existsSync(currentSessionsFile)) {
      const sessionData = await fs.promises.readFile(currentSessionsFile, "utf-8");
      await fs.promises.writeFile(newSessionsFile, sessionData, "utf-8");
      movedFiles++;

      if (params.moveFiles) {
        await fs.promises.unlink(currentSessionsFile);
      }
    }

    // 复制或移动所有 .jsonl 会话记录文件
    if (fs.existsSync(currentPath)) {
      const files = await fs.promises.readdir(currentPath);
      for (const file of files) {
        if (file.endsWith(".jsonl")) {
          const sourcePath = path.join(currentPath, file);
          const destPath = path.join(newStorePath, file);
          await fs.promises.copyFile(sourcePath, destPath);
          movedFiles++;

          if (params.moveFiles) {
            await fs.promises.unlink(sourcePath);
          }
        }
      }
    }

    // 自动更新配置文件
    let configUpdated = false;
    try {
      const config = loadConfig();
      // 确保 session 对象存在
      if (!config.session) {
        config.session = {};
      }
      // 设置新的存储路径
      config.session.store = newStorePath;
      // 写入配置文件
      await writeConfigFile(config);
      configUpdated = true;
    } catch (configErr) {
      // 配置更新失败不影响迁移成功，但记录错误
      console.error("Failed to update config file:", configErr);
    }

    return { success: true, movedFiles, configUpdated };
  } catch (err) {
    return {
      success: false,
      movedFiles: 0,
      configUpdated: false,
      error: formatError(err),
    };
  }
}

/**
 * 存储管理 RPC handlers
 */
export const storageHandlers: GatewayRequestHandlers = {
  "storage.listDrives": async ({ respond }) => {
    try {
      const drives = await listDrives();
      respond(true, { drives });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatError(err)));
    }
  },

  "storage.listDirectories": async ({ params, respond }) => {
    try {
      const dirPath = (params as { path?: string }).path;
      if (!dirPath) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing path parameter"));
        return;
      }
      const result = await listDirectories(dirPath);
      respond(true, result);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatError(err)));
    }
  },

  "storage.validatePath": async ({ params, respond }) => {
    try {
      const targetPath = (params as { path?: string }).path;
      if (!targetPath) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing path parameter"));
        return;
      }
      const result = await validatePath(targetPath);
      respond(true, result);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatError(err)));
    }
  },

  "storage.getCurrentPath": async ({ respond }) => {
    try {
      const currentPath = getCurrentStoragePath();
      respond(true, { path: currentPath });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatError(err)));
    }
  },

  "storage.migrateData": async ({ params, respond }) => {
    try {
      const { newPath, moveFiles } = params as { newPath?: string; moveFiles?: boolean };
      if (!newPath) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "Missing newPath parameter"),
        );
        return;
      }
      const result = await migrateSessionData({ newPath, moveFiles: moveFiles ?? false });
      respond(true, result);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatError(err)));
    }
  },
};
