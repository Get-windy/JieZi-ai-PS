import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

// 外部化原生模块和问题依赖，避免 rolldown 尝试打包它们
const external = [
  /^@reflink\//,
  /\.node$/,
  // 外部化 @mariozechner/pi-coding-agent，避免 __exportAll 错误
  // 该包是纯 ESM 模块，必须在运行时动态加载
  /^@mariozechner\/pi-coding-agent$/,
  /^@mariozechner\/pi-ai$/,
  /^@mariozechner\/pi-agent-core$/,
  /^@mariozechner\/pi-tui$/,
];

// 禁用 chunkOptimization 解决 __exportAll is not a function 错误
// 参考: https://github.com/rolldown/rolldown/issues/8184
// 该选项会尝试将公共模块直接插入现有 chunk，可能导致循环依赖
const inputOptions = {
  experimental: {
    chunkOptimization: false,
  },
};

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    external,
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: "src/entry.ts",
    env,
    external,
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: "src/infra/warning-filter.ts",
    env,
    external,
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    external,
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    external,
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
  {
    entry: ["src/hooks/bundled/*/handler.ts", "src/hooks/llm-slug-generator.ts"],
    env,
    external,
    fixedExtension: false,
    platform: "node",
    inputOptions,
  },
]);
