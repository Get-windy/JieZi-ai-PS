// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
export {
  MEDIA_MAX_BYTES,
  setMediaStoreNetworkDepsForTest,
  extractOriginalFilename,
  getMediaDir,
  ensureMediaDir,
  cleanOldMedia,
  SaveMediaSourceError,
  saveMediaSource,
  saveMediaBuffer,
} from "../../upstream/src/media/store.js";
export type { SavedMedia, SaveMediaSourceErrorCode } from "../../upstream/src/media/store.js";
