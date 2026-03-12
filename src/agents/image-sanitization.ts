// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
export {
  DEFAULT_IMAGE_MAX_DIMENSION_PX,
  DEFAULT_IMAGE_MAX_BYTES,
  resolveImageSanitizationLimits,
} from "../../upstream/src/agents/image-sanitization.js";
export type { ImageSanitizationLimits } from "../../upstream/src/agents/image-sanitization.js";
