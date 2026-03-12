// 转发到 upstream 实现，供运行时（tsx）动态加载时使用
// 构建时：overlay-plugin 将此文件加入跳过列表，避免自循环
export * from "../upstream/src/version.js";
