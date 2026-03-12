// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
export {
  MAX_IMAGE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
  MAX_DOCUMENT_BYTES,
  mediaKindFromMime,
  maxBytesForKind,
} from "../../upstream/src/media/constants.js";
export type { MediaKind } from "../../upstream/src/media/constants.js";
