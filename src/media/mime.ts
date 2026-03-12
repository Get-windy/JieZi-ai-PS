// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
// 构建时：overlay-plugin 自循环保护确保不会循环引用
export {
  normalizeMimeType,
  getFileExtension,
  isAudioFileName,
  detectMime,
  extensionForMime,
  isGifMedia,
  imageMimeFromFormat,
  kindFromMime,
} from "../../upstream/src/media/mime.js";
