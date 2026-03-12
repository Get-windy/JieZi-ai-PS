// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
export { MediaFetchError, fetchRemoteMedia } from "../../upstream/src/media/fetch.js";
export type { MediaFetchErrorCode, FetchLike } from "../../upstream/src/media/fetch.js";
