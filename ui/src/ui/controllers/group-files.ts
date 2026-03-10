import type { GatewayBrowserClient } from "../gateway.ts";

export type GroupFileEntry = {
  name: string;
  path: string;
  size: number;
  updatedAtMs: number | null;
  missing: boolean;
};

export type GroupFilesListResult = {
  groupId: string;
  workspace: string;
  files: GroupFileEntry[];
};

export type GroupFilesGetResult = {
  file: GroupFileEntry & { content: string };
};

export type GroupFilesState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  groupFilesLoading: boolean;
  groupFileContentLoading: boolean;
  groupFilesError: string | null;
  groupFilesList: GroupFilesListResult | null;
  groupFileContents: Record<string, string>;
  groupFileDrafts: Record<string, string>;
  groupFileActive: string | null;
  groupFileSaving: boolean;
  groupWorkspaceMigrating: boolean;
};

function mergeGroupFileEntry(
  list: GroupFilesListResult | null,
  entry: GroupFileEntry & { content?: string },
): GroupFilesListResult | null {
  if (!list) {return list;}
  const { content: _content, ...fileEntry } = entry;
  const hasEntry = list.files.some((f) => f.name === fileEntry.name);
  const nextFiles = hasEntry
    ? list.files.map((f) => (f.name === fileEntry.name ? fileEntry : f))
    : [...list.files, fileEntry];
  return { ...list, files: nextFiles };
}

export async function loadGroupFiles(state: GroupFilesState, groupId: string) {
  if (!state.client || !state.connected || state.groupFilesLoading) {return;}
  state.groupFilesLoading = true;
  state.groupFilesError = null;
  try {
    const res = await state.client.request<GroupFilesListResult | null>("groups.files.list", {
      groupId,
    });
    if (res) {
      state.groupFilesList = res;
      if (
        state.groupFileActive &&
        !res.files.some((f) => f.name === state.groupFileActive)
      ) {
        state.groupFileActive = null;
      }
    }
  } catch (err) {
    state.groupFilesError = String(err);
  } finally {
    state.groupFilesLoading = false;
  }
}

export async function loadGroupFileContent(
  state: GroupFilesState,
  groupId: string,
  name: string,
  opts?: { force?: boolean },
) {
  if (!state.client || !state.connected) {return;}
  // 已缓存且非强制刷新时跳过，但 missing 文件不缓存（路径可能已修复）
  const cachedEntry = state.groupFilesList?.files.find((f) => f.name === name);
  if (!opts?.force && Object.hasOwn(state.groupFileContents, name) && !cachedEntry?.missing) {return;}
  state.groupFileContentLoading = true;
  state.groupFilesError = null;
  try {
    const res = await state.client.request<GroupFilesGetResult | null>("groups.files.get", {
      groupId,
      name,
    });
    if (res?.file) {
      const content = res.file.content ?? "";
      const previousBase = state.groupFileContents[name] ?? "";
      const currentDraft = state.groupFileDrafts[name];
      state.groupFilesList = mergeGroupFileEntry(state.groupFilesList, res.file);
      if (!res.file.missing) {
        state.groupFileContents = { ...state.groupFileContents, [name]: content };
        // 若 draft 未改动过（等于旧内容），则同步更新 draft；否则保留用户编辑
        if (!Object.hasOwn(state.groupFileDrafts, name) || currentDraft === previousBase) {
          state.groupFileDrafts = { ...state.groupFileDrafts, [name]: content };
        }
      }
    }
  } catch (err) {
    state.groupFilesError = String(err);
  } finally {
    state.groupFileContentLoading = false;
  }
}

export async function saveGroupFile(
  state: GroupFilesState,
  groupId: string,
  name: string,
  content: string,
) {
  if (!state.client || !state.connected || state.groupFileSaving) {return;}
  state.groupFileSaving = true;
  state.groupFilesError = null;
  try {
    const res = await state.client.request<GroupFilesGetResult | null>("groups.files.set", {
      groupId,
      name,
      content,
    });
    if (res?.file) {
      state.groupFilesList = mergeGroupFileEntry(state.groupFilesList, res.file);
      state.groupFileContents = { ...state.groupFileContents, [name]: content };
      state.groupFileDrafts = { ...state.groupFileDrafts, [name]: content };
    }
  } catch (err) {
    state.groupFilesError = String(err);
  } finally {
    state.groupFileSaving = false;
  }
}

export async function deleteGroupFile(
  state: GroupFilesState,
  groupId: string,
  name: string,
) {
  if (!state.client || !state.connected) {return;}
  state.groupFilesError = null;
  try {
    await state.client.request("groups.files.delete", { groupId, name });
    if (state.groupFilesList) {
      state.groupFilesList = {
        ...state.groupFilesList,
        files: state.groupFilesList.files.filter((f) => f.name !== name),
      };
    }
    if (state.groupFileActive === name) {
      state.groupFileActive = null;
    }
    const { [name]: _c, ...restContents } = state.groupFileContents;
    state.groupFileContents = restContents;
    const { [name]: _d, ...restDrafts } = state.groupFileDrafts;
    state.groupFileDrafts = restDrafts;
  } catch (err) {
    state.groupFilesError = String(err);
  }
}

export type MigrateGroupWorkspaceResult = {
  success: boolean;
  groupId: string;
  oldDir: string;
  newDir: string;
  migrated: boolean;
  fileCount: number;
};

export async function migrateGroupWorkspace(
  state: GroupFilesState,
  groupId: string,
  newDir: string,
): Promise<MigrateGroupWorkspaceResult | null> {
  if (!state.client || !state.connected || state.groupWorkspaceMigrating) {return null;}
  state.groupWorkspaceMigrating = true;
  state.groupFilesError = null;
  try {
    const res = await state.client.request<MigrateGroupWorkspaceResult>(
      "groups.workspace.migrate",
      { groupId, newDir },
    );
    // 迁移成功后重新加载文件列表
    if (res?.success) {
      await loadGroupFiles(state, groupId);
    }
    return res ?? null;
  } catch (err) {
    state.groupFilesError = String(err);
    return null;
  } finally {
    state.groupWorkspaceMigrating = false;
  }
}
