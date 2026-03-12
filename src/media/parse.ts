// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
export {
  MEDIA_TOKEN_RE,
  normalizeMediaSource,
  splitMediaFromOutput,
} from "../../upstream/src/media/parse.js";
