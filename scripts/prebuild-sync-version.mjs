// prebuild 阶段：从 upstream/package.json 自动同步版本号到根 package.json
// 确保每次构建前版本号与上游对齐，无需手动维护硬编码版本号

import { syncVersionFromUpstream } from "./postinstall-local.mjs";

syncVersionFromUpstream();
