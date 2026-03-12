// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
export {
  normalizeMimeType,
  getFileExtension,
  isAudioFileName,
  detectMime,
  extensionForMime,
} from "../../upstream/src/media/mime.js";
