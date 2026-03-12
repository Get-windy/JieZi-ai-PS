// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
export {
  DEFAULT_IMESSAGE_ATTACHMENT_ROOTS,
  isValidInboundPathRootPattern,
  normalizeInboundPathRoots,
  mergeInboundPathRoots,
  isInboundPathAllowed,
  resolveIMessageAttachmentRoots,
  resolveIMessageRemoteAttachmentRoots,
} from "../../upstream/src/media/inbound-path-policy.js";
