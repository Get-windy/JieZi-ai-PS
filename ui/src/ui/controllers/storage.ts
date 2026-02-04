import type { OpenClawApp } from "../app.ts";
import type { GatewayBrowserClient } from "../gateway.ts";

/**
 * 加载当前存储路径
 */
export async function loadCurrentStoragePath(
  state: OpenClawApp,
  gateway: GatewayBrowserClient | null,
) {
  if (!gateway) {
    state.storageError = "未连接到 Gateway";
    return;
  }

  state.storageLoading = true;
  state.storageError = null;

  try {
    const result = await gateway.request<{ path: string }>("storage.getCurrentPath");
    state.storageCurrentPath = result.path;
    if (!state.storageNewPath) {
      state.storageNewPath = result.path;
    }
  } catch (err) {
    state.storageError = String(err);
  } finally {
    state.storageLoading = false;
  }
}

/**
 * 加载可用驱动器列表
 */
export async function loadStorageDrives(state: OpenClawApp, gateway: GatewayBrowserClient | null) {
  if (!gateway) {
    state.storageBrowserError = "未连接到 Gateway";
    return;
  }

  state.storageBrowserLoading = true;
  state.storageBrowserError = null;

  try {
    const result = await gateway.request<{
      drives: { path: string; label: string; type: string }[];
    }>("storage.listDrives");
    state.storageBrowserDrives = result.drives;

    // 默认导航到第一个驱动器
    if (result.drives.length > 0 && !state.storageBrowserPath) {
      state.storageBrowserPath = result.drives[0].path;
      await loadStorageDirectories(state, gateway, result.drives[0].path);
    }
  } catch (err) {
    state.storageBrowserError = String(err);
  } finally {
    state.storageBrowserLoading = false;
  }
}

/**
 * 加载指定目录的子目录列表
 */
export async function loadStorageDirectories(
  state: OpenClawApp,
  gateway: GatewayBrowserClient | null,
  path: string,
) {
  if (!gateway) {
    state.storageBrowserError = "未连接到 Gateway";
    return;
  }

  state.storageBrowserLoading = true;
  state.storageBrowserError = null;

  try {
    const result = await gateway.request<{
      parent: string | null;
      current: string;
      directories: { name: string; path: string }[];
    }>("storage.listDirectories", { path });

    state.storageBrowserPath = result.current;
    state.storageBrowserParent = result.parent;
    state.storageBrowserDirectories = result.directories;
  } catch (err) {
    state.storageBrowserError = String(err);
  } finally {
    state.storageBrowserLoading = false;
  }
}

/**
 * 验证路径是否有效
 */
export async function validateStoragePath(
  state: OpenClawApp,
  gateway: GatewayBrowserClient | null,
  path: string,
) {
  if (!gateway) {
    state.storageError = "未连接到 Gateway";
    return false;
  }

  state.storageLoading = true;
  state.storageError = null;
  state.storageSuccess = null;

  try {
    const result = await gateway.request<{
      valid: boolean;
      exists: boolean;
      writable: boolean;
      error?: string;
    }>("storage.validatePath", { path });

    if (!result.valid) {
      state.storageError = result.error || "路径无效";
      return false;
    }

    if (!result.writable) {
      state.storageError = "路径不可写";
      return false;
    }

    state.storageSuccess = result.exists ? "路径有效且可写" : "路径有效（将自动创建）";
    return true;
  } catch (err) {
    state.storageError = String(err);
    return false;
  } finally {
    state.storageLoading = false;
  }
}

/**
 * 迁移会话数据
 */
export async function migrateStorageData(
  state: OpenClawApp,
  gateway: GatewayBrowserClient | null,
  newPath: string,
  moveFiles: boolean,
) {
  if (!gateway) {
    state.storageError = "未连接到 Gateway";
    return;
  }

  if (!newPath.trim()) {
    state.storageError = "请输入新的存储路径";
    return;
  }

  const confirmMessage = moveFiles
    ? `确定要移动会话数据到新位置吗？

新位置: ${newPath}

原数据将被删除，此操作不可恢复！`
    : `确定要复制会话数据到新位置吗？

新位置: ${newPath}

原数据将保留`;

  if (!confirm(confirmMessage)) {
    return;
  }

  state.storageMigrating = true;
  state.storageError = null;
  state.storageSuccess = null;

  try {
    const result = await gateway.request<{
      success: boolean;
      movedFiles: number;
      configUpdated: boolean;
      error?: string;
    }>("storage.migrateData", { newPath, moveFiles });

    if (!result.success) {
      state.storageError = result.error || "迁移失败";
      return;
    }

    // 根据配置是否更新显示不同的消息
    if (result.configUpdated) {
      state.storageSuccess = `✅ 成功${moveFiles ? "移动" : "复制"}了 ${result.movedFiles} 个文件到新位置！

✅ 已自动更新配置文件（session.store: "${newPath}"）

请重启 Gateway 以应用新配置。`;
    } else {
      state.storageSuccess = `✅ 成功${moveFiles ? "移动" : "复制"}了 ${result.movedFiles} 个文件到新位置！

⚠️ 配置文件未能自动更新，请手动在 ~/.openclaw/openclaw.json 中设置：

{
  "session": {
    "store": "${newPath}"
  }
}`;
    }

    state.storageCurrentPath = newPath;

    // 10秒后自动清除成功消息
    setTimeout(() => {
      if (state.storageSuccess) {
        state.storageSuccess = null;
        state.requestUpdate();
      }
    }, 10000);
  } catch (err) {
    state.storageError = String(err);
  } finally {
    state.storageMigrating = false;
  }
}

/**
 * 打开文件浏览器
 */
export async function openStorageBrowser(state: OpenClawApp, gateway: GatewayBrowserClient | null) {
  state.storageShowBrowser = true;
  state.storageBrowserError = null;

  // 加载驱动器列表
  await loadStorageDrives(state, gateway);
}

/**
 * 关闭文件浏览器
 */
export function closeStorageBrowser(state: OpenClawApp) {
  state.storageShowBrowser = false;
  state.storageBrowserPath = "";
  state.storageBrowserParent = null;
  state.storageBrowserDirectories = [];
  state.storageBrowserDrives = [];
  state.storageBrowserError = null;
}

/**
 * 选择文件夹
 */
export function selectStorageFolder(state: OpenClawApp, path: string) {
  state.storageNewPath = path;
  closeStorageBrowser(state);
  state.storageSuccess = `已选择路径: ${path}`;

  // 3秒后自动清除消息
  setTimeout(() => {
    if (state.storageSuccess?.includes("已选择路径")) {
      state.storageSuccess = null;
      state.requestUpdate();
    }
  }, 3000);
}
