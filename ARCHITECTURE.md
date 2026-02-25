# JieZi AI-PS 三层架构设计

## 架构概述

为了彻底解决上游代码合并时的冲突问题，我们采用了三层架构设计：

```
第1层：上游原始代码 (src/, ui/)
  ↓
第2层：本地功能开发 (src-local/, ui-local/)
  ↓  
第3层：国际化包装层 (i18n/)
  ↓
最终构建输出 (dist/)
```

## 目录结构

```
JieZi-ai-PS/
├── src/                      # 第1层：上游后端代码（只读，合并时可覆盖）
│   ├── gateway/
│   ├── agents/
│   └── ...
│
├── ui/                       # 第1层：上游前端代码（只读，合并时可覆盖）
│   └── src/ui/views/
│       ├── overview.ts
│       ├── usage.ts
│       └── ...
│
├── src-local/               # 第2层：本地后端功能开发
│   ├── gateway/
│   │   └── auto-open-browser.ts  # 自动打开浏览器功能
│   └── ...
│
├── ui-local/                # 第2层：本地前端功能开发
│   └── src/ui/views/
│       ├── overview.local.ts      # 扩展 overview 功能
│       ├── usage.local.ts         # 扩展 usage 功能
│       ├── organization-management.ts  # 纯本地功能
│       ├── system-management-panel.ts  # 纯本地功能
│       └── ...
│
└── i18n/                    # 第3层：国际化独立模块
    ├── lib/                 # i18n 核心库
    │   ├── locale-manager.ts
    │   └── translator.ts
    │
    ├── locales/             # 翻译数据
    │   ├── en.ts
    │   ├── zh-CN.ts
    │   ├── zh-TW.ts
    │   └── pt-BR.ts
    │
    ├── backend/             # 后端国际化包装
    │   └── ...
    │
    └── frontend/            # 前端国际化包装
        └── views/
            ├── overview.ts   # 包装 overview 的国际化
            └── usage.ts      # 包装 usage 的国际化
```

## 合并上游代码流程

```bash
# 1. 拉取上游更新
git fetch upstream main
git merge upstream/main

# 2. src/ 和 ui/ 目录被覆盖
# ✅ 没关系！我们的代码在 src-local/ 和 ui-local/

# 3. src-local/、ui-local/、i18n/ 完全不受影响

# 4. 重新构建（自动三层合并）
pnpm build
```

## 构建系统

构建时按照以下优先级合并代码：

```
upstream (src/, ui/)  →  local (src-local/, ui-local/)  →  i18n (i18n/)  →  dist/
```

### TypeScript 路径别名配置

```json
{
  "compilerOptions": {
    "paths": {
      "@src/*": [
        "./i18n/backend/*",
        "./src-local/*",
        "./src/*"
      ],
      "@views/*": [
        "./i18n/frontend/views/*",
        "./ui-local/src/ui/views/*",
        "./ui/src/ui/views/*"
      ]
    }
  }
}
```

## 本地开发规范

### 1. 修改上游功能

**错误做法❌**：直接修改 `src/` 或 `ui/` 中的文件

**正确做法✅**：
1. 在 `src-local/` 或 `ui-local/` 中创建同名文件
2. 导入上游版本并扩展
3. 导出增强版本

示例：
```typescript
// ui-local/src/ui/views/overview.local.ts
import { renderOverview as renderOverviewUpstream } from '../../../ui/src/ui/views/overview.ts';

export function renderOverview(props) {
  // 扩展上游功能
  return enhanceOverview(renderOverviewUpstream(props));
}
```

### 2. 添加纯本地功能

直接在 `src-local/` 或 `ui-local/` 中创建新文件。

示例：
```typescript
// ui-local/src/ui/views/organization-management.ts
export function renderOrganizationManagement(props) {
  // 纯本地功能代码
}
```

### 3. 国际化

所有国际化代码统一放在 `i18n/` 目录：

```typescript
// i18n/frontend/views/overview.ts
import { t } from '../../lib/translator.ts';
import { renderOverview as renderOverviewLocal } from '../../../ui-local/src/ui/views/overview.local.ts';

export function renderOverview(props) {
  // 包装本地版本，添加国际化
  return translateView(renderOverviewLocal(props));
}
```

## 优势

1. **✅ 合并上游零冲突** - 上游代码独立，合并时直接覆盖
2. **✅ 本地开发独立** - 本地代码不受上游影响
3. **✅ 国际化自成体系** - i18n 独立模块，易于维护
4. **✅ 清晰的职责分离** - 每一层职责明确
5. **✅ 易于回滚** - 可以单独禁用某一层

## 维护说明

### 查看当前使用的代码层

```bash
# 检查某个文件来自哪一层
ls -la src/gateway/server-startup-log.ts        # 上游
ls -la src-local/gateway/auto-open-browser.ts   # 本地
ls -la i18n/backend/gateway/                    # 国际化
```

### 禁用某一层

```typescript
// vite.config.ts - 禁用国际化层
export default {
  resolve: {
    alias: {
      '@views': [
        // './i18n/frontend/views',  // 注释掉即禁用国际化
        './ui-local/src/ui/views',
        './ui/src/ui/views',
      ]
    }
  }
}
```

## 迁移日期

- 架构设计：2026-02-24
- 实施重构：2026-02-24

