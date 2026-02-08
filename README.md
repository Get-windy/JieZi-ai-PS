# 🦞 OpenClaw — 个人 AI 助手 | Personal AI Assistant

> 🇨🇳 **中文用户**: 本文档为中英文对照版本 | This is a bilingual Chinese-English documentation
> 🇬🇧 **English Users**: Bilingual version for better understanding | 为了更好理解的双语版本

<p align="center">
    <picture>
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text-dark.png">
        <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/docs/assets/openclaw-logo-text.png" alt="OpenClaw" width="500">
    </picture>
</p>

<p align="center">
  <strong>EXFOLIATE! EXFOLIATE!</strong>
</p>

<p align="center">
  <a href="https://github.com/openclaw/openclaw/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/openclaw/openclaw/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="https://github.com/openclaw/openclaw/releases"><img src="https://img.shields.io/github/v/release/openclaw/openclaw?include_prereleases&style=for-the-badge" alt="GitHub release"></a>
  <a href="https://discord.gg/clawd"><img src="https://img.shields.io/discord/1456350064065904867?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

---

## ⚠️ Windows 用户重要提示 | Important Notice for Windows Users

**本项目已完全适配 Windows 环境，无需 bash 或 WSL2！**
**This project is fully adapted for Windows environments - no bash or WSL2 required!**

### 关键改动说明 | Critical Adaptation Details

如果你从上游项目合并代码或更新 `package.json`，请注意以下问题：
If you're merging code from upstream or updating `package.json`, please be aware of the following:

**问题 | Problem**:

- 原项目的 `package.json` 中 `canvas:a2ui:bundle` 脚本使用了 `bash scripts/bundle-a2ui.sh`
- The original project's `package.json` uses `bash scripts/bundle-a2ui.sh` in the `canvas:a2ui:bundle` script
- Windows 系统没有原生 bash 命令，会导致构建失败
- Windows systems don't have native bash command, which causes build failures

**解决方案 | Solution**:

- ✅ 本项目已提供 **Node.js 版本的脚本**：`scripts/bundle-a2ui.mjs`
- ✅ This project provides a **Node.js version of the script**: `scripts/bundle-a2ui.mjs`
- ✅ 所有构建命令已改为使用纯 JavaScript/TypeScript 实现
- ✅ All build commands have been converted to pure JavaScript/TypeScript implementation
- ✅ **直接在 PowerShell 中运行，无需任何额外配置**
- ✅ **Run directly in PowerShell without any additional configuration**

**正确的 package.json 配置 | Correct package.json configuration**:

```json
{
  "scripts": {
    "canvas:a2ui:bundle": "node scripts/bundle-a2ui.mjs"
  }
}
```

**错误的配置（不要使用）| Incorrect configuration (do NOT use)**:

```json
{
  "scripts": {
    "canvas:a2ui:bundle": "bash scripts/bundle-a2ui.sh" // ❌ Windows 不支持 | Not supported on Windows
  }
}
```

### Windows 兼容性保证 | Windows Compatibility Guarantee

- ✅ **PowerShell 原生支持 | Native PowerShell support**: 所有命令在 PowerShell 7+ 中完美运行 | All commands work perfectly in PowerShell 7+
- ✅ **跨平台脚本 | Cross-platform scripts**: `scripts/bundle-a2ui.mjs` 替代了 `scripts/bundle-a2ui.sh` | `scripts/bundle-a2ui.mjs` replaces `scripts/bundle-a2ui.sh`
- ✅ **无需 WSL2 | No WSL2 required**: Windows 用户可以直接构建和运行 | Windows users can build and run natively
- ✅ **TypeScript 编译器 | TypeScript compiler**: 默认使用 `tsc` 而非 `tsgo` | Uses `tsc` by default instead of `tsgo`

### 📌 项目更新记录 | Project Update Log

#### 2026年2月8日 - Phase 5 智能助手管理增强 | 2026-02-08 - Phase 5 Agent Management Enhancement

**🎯 核心功能上线 | Core Features Released:**

- ✅ **智能助手前端管理界面 | Agent Frontend Management Interface**
  - 重构 agents 页面，新增"模型路由"和"通道策略"两个 Tab | Refactored agents page with "Model Routing" and "Channel Policies" tabs
  - 实现完整的智能助手配置管理 | Complete agent configuration management
  - 支持多智能体协作配置 | Multi-agent collaboration support

- ✅ **组织框架可视化系统 | Organization Chart Visualization**
  - 新增 organization-chart 页面 | New organization-chart page
  - 可视化展示智能助手层级结构 | Visualize agent hierarchy structure
  - 支持团队管理和导师系统 | Team management and mentor system

- ✅ **权限管理系统 | Permissions Management System**
  - 新增 permissions-management 页面 | New permissions-management page
  - 完整的权限检查和审批流程 | Complete permission checking and approval workflow
  - 支持权限层级和继承 | Permission hierarchy and inheritance support

- ✅ **模型路由智能调度 | Intelligent Model Routing**
  - 实现智能模型选择算法 | Intelligent model selection algorithm
  - 支持基于复杂度的自动路由 | Complexity-based automatic routing
  - 成本优化和性能平衡 | Cost optimization and performance balancing

- ✅ **通道策略管理 | Channel Policy Management**
  - 13种通道策略实现 | 13 channel policy implementations
  - 灵活的通道绑定配置 | Flexible channel binding configuration

**📊 统计数据 | Statistics:**

- 新增文件 | New files: 106
- 修改文件 | Modified files: 15
- 代码行数 | Lines of code: ~15,000+
- 新增RPC接口 | New RPC interfaces: 8
- 新增UI页面 | New UI pages: 3
- 新增策略类型 | New policy types: 13
- 国际化键 | i18n keys: 100+
- 提交标识 | Commit IDs: dde724b16 + 9c2fdf35f

**🔄 兼容性保证 | Compatibility Guarantee:**

- ✅ 保持与上游 openclaw 的兼容性 | Maintains upstream openclaw compatibility
- ✅ Windows 环境构建优化 | Windows build optimization (PowerShell native)
- ✅ TypeScript 类型安全 | TypeScript type safety
- ✅ 向后兼容现有配置 | Backward compatible with existing configs

**⚠️ 重要说明 | Important Notice:**

This is a major feature iteration that introduces a complete multi-agent management system to OpenClaw. Thorough testing is recommended before production use.
这是一次重大的功能迭代，为 OpenClaw 项目引入了完整的多智能体管理体系。建议在生产环境使用前进行充分测试。

#### 2026年2月7日 - 上游同步更新 | 2026-02-07 - Upstream Sync (2026.2.6-3)

**上游更新内容 | Upstream Updates:**

- 🐛 **修复 | Fix**: BlueBubbles 和通道清理的全面修复 | Comprehensive BlueBubbles and channel cleanup (#11093)
- 📦 **版本 | Version**: 更新至 2026.2.6-3 | Updated to 2026.2.6-3
- ⚙️ **调整 | Adjustment**: xAI + Qianfan 供应商顺序优化 | xAI + Qianfan provider order optimization

**本地改进 | Local Improvements:**

- 🌐 **完善 Usage 页面国际化 | Enhanced Usage Page Internationalization**
  - 新增星期标签翻译 | Added weekday translations (周日-周六 | Sun-Sat)
  - 新增时间标签翻译 | Added time labels (凌晨4点/上午8点/下午4点/晚上8点 | 4am/8am/4pm/8pm)
  - "Activity by Time" 完整中英文支持 | Full bilingual support for "Activity by Time"
  - 时间活动分布图表全面汉化 | Complete localization of time activity charts
- 🛡️ **保护本地特性 | Protected Local Features**
  - 保留所有汉化文件 | Preserved all localized files (UI, config, docs)
  - 保留 Windows PowerShell 兼容性改造 | Maintained Windows PowerShell compatibility
  - 保留 `canvas:a2ui:bundle` 的 Node.js 脚本配置 | Kept Node.js script configuration for `canvas:a2ui:bundle`
  - 保留 README 中英文对照文档 | Maintained bilingual README documentation
- ✅ **合并策略 | Merge Strategy**: 自动合并成功，无冲突 | Automatic merge succeeded, no conflicts
- 📊 **状态 | Status**: 已推送至 Gitee (origin) 和 GitHub (github) 仓库 | Pushed to both Gitee (origin) and GitHub (github) repositories

**测试建议 | Testing Recommendations:**

1. 验证 Usage 页面中英文切换功能 | Verify Usage page language switching
2. 测试 Windows 环境下的项目构建 | Test project build on Windows
3. 检查 BlueBubbles 通道功能 | Check BlueBubbles channel functionality
4. 验证新增的 xAI 和 Qianfan 供应商配置 | Validate new xAI and Qianfan provider configurations

---

## 📖 项目简介 | Project Overview

**OpenClaw** 是一个运行在你自己设备上的**个人 AI 助手**。
**OpenClaw** is a _personal AI assistant_ you run on your own devices.

它通过你日常使用的通讯平台回复你（WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage、Microsoft Teams、WebChat），还支持扩展平台如 BlueBubbles、Matrix、Zalo 和 Zalo Personal。它可以在 macOS/iOS/Android 上语音交互，并可渲染你控制的实时画布。Gateway 只是控制平面——产品的核心是助手本身。
It answers you on the channels you already use (WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, Microsoft Teams, WebChat), plus extension channels like BlueBubbles, Matrix, Zalo, and Zalo Personal. It can speak and listen on macOS/iOS/Android, and can render a live Canvas you control. The Gateway is just the control plane — the product is the assistant.

如果你想要一个本地化、快速响应、始终在线的个人单用户助手，那么它就是你的选择。
If you want a personal, single-user assistant that feels local, fast, and always-on, this is it.

**快速链接 | Quick Links:**
[官网 | Website](https://openclaw.ai) · [文档 | Docs](https://docs.openclaw.ai) · [DeepWiki](https://deepwiki.com/openclaw/openclaw) · [入门指南 | Getting Started](https://docs.openclaw.ai/start/getting-started) · [更新指南 | Updating](https://docs.openclaw.ai/install/updating) · [功能展示 | Showcase](https://docs.openclaw.ai/start/showcase) · [常见问题 | FAQ](https://docs.openclaw.ai/start/faq) · [引导向导 | Wizard](https://docs.openclaw.ai/start/wizard) · [Nix](https://github.com/openclaw/nix-clawdbot) · [Docker](https://docs.openclaw.ai/install/docker) · [Discord](https://discord.gg/clawd)

### 🚀 推荐设置 | Preferred Setup

运行引导向导：`openclaw onboard`。它将引导你完成 gateway、工作区、通道和技能的配置。CLI 向导是推荐路径，支持 **macOS、Linux 和 Windows（通过 WSL2，强烈推荐）**。
Run the onboarding wizard: `openclaw onboard`. It walks through gateway, workspace, channels, and skills. The CLI wizard is the recommended path and works on **macOS, Linux, and Windows (via WSL2; strongly recommended)**.

支持 npm、pnpm 或 bun。
Works with npm, pnpm, or bun.

首次安装？从这里开始：[入门指南 | Getting started](https://docs.openclaw.ai/start/getting-started)
New install? Start here: [Getting started](https://docs.openclaw.ai/start/getting-started)

### 🔑 订阅服务（OAuth）| Subscriptions (OAuth)

- **[Anthropic](https://www.anthropic.com/)** (Claude Pro/Max)
- **[OpenAI](https://openai.com/)** (ChatGPT/Codex)

**模型说明 | Model Note:**
虽然支持任何模型，但我强烈推荐 **Anthropic Pro/Max (100/200) + Opus 4.5**，因其具有强大的长上下文能力和更好的提示注入抵抗能力。
While any model is supported, I strongly recommend **Anthropic Pro/Max (100/200) + Opus 4.5** for long‑context strength and better prompt‑injection resistance.

查看详情：[引导配置 | Onboarding](https://docs.openclaw.ai/start/onboarding)

---

## 🧠 模型配置 | Models (Selection + Auth)

- **模型配置 + CLI** | **Models config + CLI**: [模型文档 | Models](https://docs.openclaw.ai/concepts/models)
- **认证配置轮换（OAuth vs API keys）+ 备用** | **Auth profile rotation (OAuth vs API keys) + fallbacks**: [模型故障转移 | Model failover](https://docs.openclaw.ai/concepts/model-failover)

---

## 📦 安装指南（推荐）| Install (Recommended)

**运行环境 | Runtime**: **Node ≥22**

```bash
# 全局安装 | Global installation
npm install -g openclaw@latest
# 或使用 pnpm | or use pnpm
pnpm add -g openclaw@latest

# 运行引导向导 | Run onboarding wizard
openclaw onboard --install-daemon
```

**说明 | Note**: 引导向导将安装 Gateway 守护进程（launchd/systemd 用户服务）以保持运行。
The wizard installs the Gateway daemon (launchd/systemd user service) so it stays running.

---

## 🚀 快速开始 | Quick Start (TL;DR)

**运行环境 | Runtime**: **Node ≥22**

**完整新手指南（认证、配对、通道）| Full beginner guide (auth, pairing, channels)**: [入门指南 | Getting started](https://docs.openclaw.ai/start/getting-started)

```bash
# 安装守护进程 | Install daemon
openclaw onboard --install-daemon

# 启动 Gateway | Start Gateway
openclaw gateway --port 18789 --verbose

# 发送消息 | Send a message
openclaw message send --to +1234567890 --message "Hello from OpenClaw"

# 与助手对话（可选择回复到任何已连接的通道）
# Talk to the assistant (optionally deliver back to any connected channel)
openclaw agent --message "Ship checklist" --thinking high
```

**升级？ | Upgrading?** [更新指南 | Updating guide](https://docs.openclaw.ai/install/updating)（运行 `openclaw doctor`）

---

## 🔀 开发通道 | Development Channels

- **stable (稳定版)**: 标签发布 (`vYYYY.M.D` or `vYYYY.M.D-<patch>`), npm dist-tag `latest`
- **beta (测试版)**: 预发布标签 (`vYYYY.M.D-beta.N`), npm dist-tag `beta` (macOS 应用可能缺失 | macOS app may be missing)
- **dev (开发版)**: `main` 分支最新版本 | moving head of `main`, npm dist-tag `dev` (发布时 | when published)

**切换通道 | Switch channels** (git + npm): `openclaw update --channel stable|beta|dev`

**详情 | Details**: [开发通道文档 | Development channels](https://docs.openclaw.ai/install/development-channels)

---

## 🛠️ 从源码构建（开发）| From Source (Development)

**推荐 | Prefer**: 使用 `pnpm` 从源码构建。Bun 是可选的，用于直接运行 TypeScript。
Use `pnpm` for builds from source. Bun is optional for running TypeScript directly.

```bash
# 克隆仓库 | Clone repository
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# 安装依赖 | Install dependencies
pnpm install

# 构建 UI（首次运行时自动安装 UI 依赖） | Build UI (auto-installs UI deps on first run)
pnpm ui:build

# 构建项目 | Build project
pnpm build

# 运行引导向导 | Run onboarding wizard
pnpm openclaw onboard --install-daemon

# 开发循环（TS 文件变化时自动重载） | Dev loop (auto-reload on TS changes)
pnpm gateway:watch
```

**说明 | Note**: `pnpm openclaw ...` 通过 `tsx` 直接运行 TypeScript。`pnpm build` 生成 `dist/` 供 Node 或打包的 `openclaw` 二进制文件运行。
`pnpm openclaw ...` runs TypeScript directly (via `tsx`). `pnpm build` produces `dist/` for running via Node / the packaged `openclaw` binary.

### PowerShell Compatibility / PowerShell 兼容性

This fork has been modified to support building directly in Windows PowerShell without requiring bash/WSL2:
本分支已修改为支持在 Windows PowerShell 中直接构建，无需 bash/WSL2：

- ✅ **Cross-platform build script** - Replaced `scripts/bundle-a2ui.sh` with `scripts/bundle-a2ui.mjs` (pure Node.js)
  **跨平台构建脚本** - 将 `scripts/bundle-a2ui.sh` 替换为 `scripts/bundle-a2ui.mjs`（纯 Node.js 实现）
- ✅ **PowerShell support** - Build commands now work in PowerShell, Git Bash, and Unix shells
  **PowerShell 支持** - 构建命令现在可在 PowerShell、Git Bash 和 Unix shell 中运行
- ✅ **No WSL2 required** - Windows users can build natively without Windows Subsystem for Linux
  **无需 WSL2** - Windows 用户可以在不使用 Linux 子系统的情况下原生构建

### Chinese Localization / 中文本地化

The onboarding wizard has been localized to support Chinese (Simplified):
引导向导已实现中文（简体）本地化：

- ✅ **i18n system** - Built-in internationalization support via `src/i18n/`
  **国际化系统** - 通过 `src/i18n/` 提供内置国际化支持
- ✅ **Wizard localization** - All onboarding wizard screens translated to Chinese
  **向导本地化** - 所有引导向导界面已翻译为中文
- ✅ **Language switching** - Automatically detects system locale or can be manually configured
  **语言切换** - 自动检测系统语言或可手动配置
- ✅ **Web UI i18n** - Full Chinese/English support in Control UI and components
  **Web UI 国际化** - Control UI 和组件完整的中英文支持

**Localized files / 本地化文件:**

- `src/i18n/index.ts` - Translation system core / 翻译系统核心
- `src/i18n/types.ts` - Translation key types / 翻译键类型定义
- `src/i18n/translations.ts` - Chinese & English translations / 中英文翻译内容
- `src/wizard/onboarding.ts` - Localized onboarding wizard / 本地化引导向导
- `ui/src/ui/i18n.ts` - Web UI internationalization / Web UI 国际化支持

### 功能特性 | Features

- ✅ **内置国际化支持** | **Built-in i18n system**
  - 通过 `src/i18n/` 提供完整的国际化支持
  - Full internationalization support via `src/i18n/`

- ✅ **向导本地化** | **Wizard localization**
  - 所有引导向导界面已翻译为中文
  - All onboarding wizard screens translated to Chinese

- ✅ **语言切换** | **Language switching**
  - 自动检测系统语言或可手动配置
  - Automatically detects system locale or can be manually configured

- ✅ **Web UI 国际化** | **Web UI i18n**
  - Control UI 和组件完整的中英文支持
  - Full Chinese/English support in Control UI and components

---

## 会话存储迁移 | Session Storage Migration

### 📦 会话数据存储路径可视化迁移

**中文说明：**
本项目实现了**会话数据存储路径的图形化迁移功能**，让普通用户（不懂代码）能够通过可视化界面选择存储位置，避免C盘空间占用过多。

**English Description:**
This project implements **graphical session data storage path migration**, allowing non-technical users to choose storage locations through a visual interface, avoiding excessive C drive space usage.

#### 🎯 Features / 功能特点

1. **Graphical File Browser / 图形化文件浏览器**
   - Display all available drives (Windows) or root directories (Linux/macOS)
     显示所有可用驱动器（Windows）或根目录（Linux/macOS）
   - Support directory navigation and parent directory return
     支持目录导航和上级目录返回
   - Real-time display of current path
     实时显示当前路径

2. **Path Validation / 路径验证**
   - Automatically check if path exists
     自动检查路径是否存在
   - Verify if path is writable
     验证路径是否可写
   - Check parent directory permissions for non-existent paths
     对不存在的路径检查父目录权限

3. **Data Migration Options / 数据迁移选项**
   - **Copy mode**: Copy session data to new location, keep original data
     **复制模式**：将会话数据复制到新位置，保留原数据
   - **Move mode**: Move session data to new location, delete original data
     **移动模式**：将会话数据移动到新位置，删除原数据
   - Auto-copy `sessions.json` and all `.jsonl` session log files
     自动复制 `sessions.json` 和所有 `.jsonl` 会话记录文件
   - **Auto-update configuration file**, no manual JSON editing required
     **自动更新配置文件**，无需手动修改 JSON

4. **User-friendly Interface / 用户友好的界面**
   - Auto-load current storage path after connection
     连接成功后自动加载当前存储路径
   - Real-time success/error message display
     实时显示成功/错误消息
   - Support light/dark themes
     支持明暗主题
   - Full Chinese/English bilingual support
     完整的中英文双语支持

#### 🔧 Usage / 使用方法

1. **Start Gateway and Control UI / 启动 Gateway 和 Control UI**

   ```bash
   pnpm openclaw gateway
   # Visit / 访问 http://localhost:18789
   ```

2. **Open Session Storage Settings / 打开会话存储设置**
   - Navigate to **Overview** page in Control UI
     在 Control UI 中导航到 **Overview（概览）** 页面
   - Scroll down to find **"Session Data Storage"** card
     向下滚动找到 **"会话数据存储"** 卡片

3. **Browse and Select New Location / 浏览并选择新位置**
   - Click **"Browse..."** button to open file browser
     点击 **"浏览..."** 按钮打开文件浏览器
   - Select target drive from drive list
     在驱动器列表中选择目标驱动器
   - Navigate to target folder
     导航到目标文件夹
   - Click **"Select This Location"** to confirm
     点击 **"选择此位置"** 确认

4. **Validate Path / 验证路径**
   - Click **"Validate"** button to check if path is valid
     点击 **"验证"** 按钮检查路径是否有效
   - System will display validation results and permission info
     系统会显示验证结果和权限信息

5. **Migrate Data / 迁移数据**
   - Choose **"Copy to New Location"** (keep original) or **"Move to New Location"** (delete original)
     选择 **"复制到新位置"**（保留原数据）或 **"移动到新位置"**（删除原数据）
   - Wait for migration to complete
     等待迁移完成
   - View migration results (shows number of copied/moved files)
     查看迁移结果（显示已复制/移动的文件数量）
   - **Configuration file will be auto-updated**, no manual editing required!
     **配置文件将自动更新**，无需手动修改！

6. **Restart Gateway / 重启 Gateway**
   - After migration, restart Gateway to apply new storage path:
     迁移完成后，重启 Gateway 以应用新的存储路径：

   ```bash
   # Stop Gateway / 停止 Gateway
   # Ctrl+C or close terminal / Ctrl+C 或关闭终端

   # Restart Gateway / 重新启动 Gateway
   pnpm openclaw gateway
   ```

#### 📁 Technical Implementation / 技术实现

**Backend (Gateway RPC Methods) / 后端（Gateway RPC 方法）**:

- `src/gateway/server-methods/storage.ts` - 5 RPC methods / 5个RPC方法
  - `storage.listDrives()` - List available drives / 列出可用驱动器
  - `storage.listDirectories({ path })` - List directory contents / 列出目录内容
  - `storage.validatePath({ path })` - Validate path validity / 验证路径有效性
  - `storage.getCurrentPath()` - Get current storage path / 获取当前存储路径
  - `storage.migrateData({ newPath, moveFiles })` - Migrate data / 迁移数据

**Frontend (Web UI Components) / 前端（Web UI 组件）**:

- `ui/src/ui/views/storage-browser.ts` - File browser component / 文件浏览器组件
- `ui/src/ui/views/session-storage.ts` - Session storage settings component / 会话存储设置组件
- `ui/src/ui/controllers/storage.ts` - Storage management controller (business logic) / 存储管理控制器（业务逻辑）
- `ui/src/styles/components.css` - File browser styles / 文件浏览器样式

**Integration & State Management / 集成与状态管理**:

- `ui/src/ui/app.ts` - 15 state fields and 7 handler methods / 15个状态字段和7个处理方法
- `ui/src/ui/app-render.ts` - Props passing and callback binding / props传递和回调绑定
- `ui/src/ui/app-gateway.ts` - Auto-load storage path / 自动加载存储路径
- `ui/src/ui/views/overview.ts` - Overview page integration / Overview页面集成

**Internationalization Support / 国际化支持**:

- `ui/src/ui/i18n.ts` - 29 session storage translation keys (Chinese/English) / 29个会话存储相关的翻译键（中英文）
- All UI text supports Chinese/English switching / 所有界面文本支持中英文切换

### 🔒 权限控制 | Permission Control

**读取操作 | Read Operations:**

- 需要 `operator.read` 权限
- Require `operator.read` permission
- 包括：浏览、验证、获取当前路径
- Includes: browse, validate, get current path

**迁移操作 | Migration Operations:**

- 需要 `operator.admin` 权限
- Require `operator.admin` permission

**配置位置 | Configuration Location:**

- 在 `src/gateway/server-methods.ts` 中配置权限
- Permission configuration in `src/gateway/server-methods.ts`

## Security defaults (DM access)

OpenClaw connects to real messaging surfaces. Treat inbound DMs as **untrusted input**.

Full security guide: [Security](https://docs.openclaw.ai/gateway/security)

Default behavior on Telegram/WhatsApp/Signal/iMessage/Microsoft Teams/Discord/Google Chat/Slack:

- **DM pairing** (`dmPolicy="pairing"` / `channels.discord.dm.policy="pairing"` / `channels.slack.dm.policy="pairing"`): unknown senders receive a short pairing code and the bot does not process their message.
- Approve with: `openclaw pairing approve <channel> <code>` (then the sender is added to a local allowlist store).
- Public inbound DMs require an explicit opt-in: set `dmPolicy="open"` and include `"*"` in the channel allowlist (`allowFrom` / `channels.discord.dm.allowFrom` / `channels.slack.dm.allowFrom`).

Run `openclaw doctor` to surface risky/misconfigured DM policies.

## Highlights

- **[Local-first Gateway](https://docs.openclaw.ai/gateway)** — single control plane for sessions, channels, tools, and events.
- **[Multi-channel inbox](https://docs.openclaw.ai/channels)** — WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, BlueBubbles (iMessage), iMessage (legacy), Microsoft Teams, Matrix, Zalo, Zalo Personal, WebChat, macOS, iOS/Android.
- **[Multi-agent routing](https://docs.openclaw.ai/gateway/configuration)** — route inbound channels/accounts/peers to isolated agents (workspaces + per-agent sessions).
- **[Voice Wake](https://docs.openclaw.ai/nodes/voicewake) + [Talk Mode](https://docs.openclaw.ai/nodes/talk)** — always-on speech for macOS/iOS/Android with ElevenLabs.
- **[Live Canvas](https://docs.openclaw.ai/platforms/mac/canvas)** — agent-driven visual workspace with [A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui).
- **[First-class tools](https://docs.openclaw.ai/tools)** — browser, canvas, nodes, cron, sessions, and Discord/Slack actions.
- **[Companion apps](https://docs.openclaw.ai/platforms/macos)** — macOS menu bar app + iOS/Android [nodes](https://docs.openclaw.ai/nodes).
- **[Onboarding](https://docs.openclaw.ai/start/wizard) + [skills](https://docs.openclaw.ai/tools/skills)** — wizard-driven setup with bundled/managed/workspace skills.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=openclaw/openclaw&type=date&legend=top-left)](https://www.star-history.com/#openclaw/openclaw&type=date&legend=top-left)

## Everything we built so far

### Core platform

- [Gateway WS control plane](https://docs.openclaw.ai/gateway) with sessions, presence, config, cron, webhooks, [Control UI](https://docs.openclaw.ai/web), and [Canvas host](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui).
- [CLI surface](https://docs.openclaw.ai/tools/agent-send): gateway, agent, send, [wizard](https://docs.openclaw.ai/start/wizard), and [doctor](https://docs.openclaw.ai/gateway/doctor).
- [Pi agent runtime](https://docs.openclaw.ai/concepts/agent) in RPC mode with tool streaming and block streaming.
- [Session model](https://docs.openclaw.ai/concepts/session): `main` for direct chats, group isolation, activation modes, queue modes, reply-back. Group rules: [Groups](https://docs.openclaw.ai/concepts/groups).
- [Media pipeline](https://docs.openclaw.ai/nodes/images): images/audio/video, transcription hooks, size caps, temp file lifecycle. Audio details: [Audio](https://docs.openclaw.ai/nodes/audio).

### Channels

- [Channels](https://docs.openclaw.ai/channels): [WhatsApp](https://docs.openclaw.ai/channels/whatsapp) (Baileys), [Telegram](https://docs.openclaw.ai/channels/telegram) (grammY), [Slack](https://docs.openclaw.ai/channels/slack) (Bolt), [Discord](https://docs.openclaw.ai/channels/discord) (discord.js), [Google Chat](https://docs.openclaw.ai/channels/googlechat) (Chat API), [Signal](https://docs.openclaw.ai/channels/signal) (signal-cli), [BlueBubbles](https://docs.openclaw.ai/channels/bluebubbles) (iMessage, recommended), [iMessage](https://docs.openclaw.ai/channels/imessage) (legacy imsg), [Microsoft Teams](https://docs.openclaw.ai/channels/msteams) (extension), [Matrix](https://docs.openclaw.ai/channels/matrix) (extension), [Zalo](https://docs.openclaw.ai/channels/zalo) (extension), [Zalo Personal](https://docs.openclaw.ai/channels/zalouser) (extension), [WebChat](https://docs.openclaw.ai/web/webchat).
- [Group routing](https://docs.openclaw.ai/concepts/group-messages): mention gating, reply tags, per-channel chunking and routing. Channel rules: [Channels](https://docs.openclaw.ai/channels).

### Apps + nodes

- [macOS app](https://docs.openclaw.ai/platforms/macos): menu bar control plane, [Voice Wake](https://docs.openclaw.ai/nodes/voicewake)/PTT, [Talk Mode](https://docs.openclaw.ai/nodes/talk) overlay, [WebChat](https://docs.openclaw.ai/web/webchat), debug tools, [remote gateway](https://docs.openclaw.ai/gateway/remote) control.
- [iOS node](https://docs.openclaw.ai/platforms/ios): [Canvas](https://docs.openclaw.ai/platforms/mac/canvas), [Voice Wake](https://docs.openclaw.ai/nodes/voicewake), [Talk Mode](https://docs.openclaw.ai/nodes/talk), camera, screen recording, Bonjour pairing.
- [Android node](https://docs.openclaw.ai/platforms/android): [Canvas](https://docs.openclaw.ai/platforms/mac/canvas), [Talk Mode](https://docs.openclaw.ai/nodes/talk), camera, screen recording, optional SMS.
- [macOS node mode](https://docs.openclaw.ai/nodes): system.run/notify + canvas/camera exposure.

# 重启 Gateway 使新路径生效 | Restart Gateway to apply new path

openclaw gateway

```

**验证迁移 | Verify Migration:**
- 检查新位置是否有 `sessions.json` 文件
- Check if `sessions.json` exists in the new location
- 确认会话数据正常加载
- Confirm session data loads correctly

---

## 工具和自动化 | Tools & Automation

### 🛠️ 可用工具 | Available Tools

#### 浏览器控制 | Browser Control
- [文档链接](https://docs.openclaw.ai/tools/browser)
- 专用的 OpenClaw Chrome/Chromium 实例
- Dedicated openclaw Chrome/Chromium
- 支持截图、操作、上传、配置文件
- Snapshots, actions, uploads, profiles

#### Canvas 画布
- [文档链接](https://docs.openclaw.ai/platforms/mac/canvas)
- [A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui) 推送/重置、评估、快照
- [A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui) push/reset, eval, snapshot

#### 节点功能 | Nodes
- [文档链接](https://docs.openclaw.ai/nodes)
- 相机拍照/录像、屏幕录制、[位置获取](https://docs.openclaw.ai/nodes/location-command)、通知
- Camera snap/clip, screen record, [location.get](https://docs.openclaw.ai/nodes/location-command), notifications

#### 自动化 | Automation
- [定时任务 + 唤醒](https://docs.openclaw.ai/automation/cron-jobs) | [Cron + wakeups](https://docs.openclaw.ai/automation/cron-jobs)
- [Webhooks](https://docs.openclaw.ai/automation/webhook)
- [Gmail Pub/Sub](https://docs.openclaw.ai/automation/gmail-pubsub)

#### 技能平台 | Skills Platform
- [文档链接](https://docs.openclaw.ai/tools/skills)
- 内置、托管和工作区技能，带安装门控 + UI
- Bundled, managed, and workspace skills with install gating + UI

---

## 运行时和安全 | Runtime + Safety

- [Channel routing](https://docs.openclaw.ai/concepts/channel-routing), [retry policy](https://docs.openclaw.ai/concepts/retry), and [streaming/chunking](https://docs.openclaw.ai/concepts/streaming).
- [Presence](https://docs.openclaw.ai/concepts/presence), [typing indicators](https://docs.openclaw.ai/concepts/typing-indicators), and [usage tracking](https://docs.openclaw.ai/concepts/usage-tracking).
- [Models](https://docs.openclaw.ai/concepts/models), [model failover](https://docs.openclaw.ai/concepts/model-failover), and [session pruning](https://docs.openclaw.ai/concepts/session-pruning).
- [Security](https://docs.openclaw.ai/gateway/security) and [troubleshooting](https://docs.openclaw.ai/channels/troubleshooting).

### Ops + packaging

- [Control UI](https://docs.openclaw.ai/web) + [WebChat](https://docs.openclaw.ai/web/webchat) served directly from the Gateway.
- [Tailscale Serve/Funnel](https://docs.openclaw.ai/gateway/tailscale) or [SSH tunnels](https://docs.openclaw.ai/gateway/remote) with token/password auth.
- [Nix mode](https://docs.openclaw.ai/install/nix) for declarative config; [Docker](https://docs.openclaw.ai/install/docker)-based installs.
- [Doctor](https://docs.openclaw.ai/gateway/doctor) migrations, [logging](https://docs.openclaw.ai/logging).

## 工作原理（简版） | How it works (short)

```

WhatsApp / Telegram / Slack / Discord / Google Chat / Signal / iMessage / BlueBubbles / Microsoft Teams / Matrix / Zalo / Zalo Personal / WebChat
│
▼
┌───────────────────────────────┐
│ Gateway │
│ (control plane / 控制平面) │
│ ws://127.0.0.1:18789 │
└──────────────┬────────────────┘
│
├─ Pi agent (RPC / 智能体)
├─ CLI (openclaw … / 命令行)
├─ WebChat UI (网页聊天)
├─ macOS app (macOS 应用)
└─ iOS / Android nodes (节点)

````

## 核心子系统 | Key subsystems

- **[Gateway WebSocket 网络 | network](https://docs.openclaw.ai/concepts/architecture)** — 面向客户端、工具和事件的单一 WS 控制平面 | single WS control plane for clients, tools, and events（运维：[Gateway 运行手册 | runbook](https://docs.openclaw.ai/gateway)）
- **[Tailscale 暴露 | exposure](https://docs.openclaw.ai/gateway/tailscale)** — Gateway 仪表板 + WS 的 Serve/Funnel（远程访问：[远程 | Remote](https://docs.openclaw.ai/gateway/remote)）
- **[浏览器控制 | Browser control](https://docs.openclaw.ai/tools/browser)** — OpenClaw 管理的 Chrome/Chromium，支持 CDP 控制 | openclaw-managed Chrome/Chromium with CDP control
- **[Canvas + A2UI](https://docs.openclaw.ai/platforms/mac/canvas)** — 智能体驱动的视觉工作空间 | agent-driven visual workspace（A2UI 主机：[Canvas/A2UI](https://docs.openclaw.ai/platforms/mac/canvas#canvas-a2ui)）
- **[语音唤醒 | Voice Wake](https://docs.openclaw.ai/nodes/voicewake) + [对话模式 | Talk Mode](https://docs.openclaw.ai/nodes/talk)** — 全天候语音和连续对话 | always-on speech and continuous conversation
- **[节点功能 | Nodes](https://docs.openclaw.ai/nodes)** — Canvas、相机拍照/录像、屏幕录制、`location.get`、通知，以及 macOS 独占的 `system.run`/`system.notify` | Canvas, camera snap/clip, screen record, `location.get`, notifications, plus macOS-only `system.run`/`system.notify`

## Tailscale 访问（Gateway 仪表板） | Tailscale access (Gateway dashboard)

OpenClaw 可以自动配置 Tailscale **Serve**（仅 tailnet）或 **Funnel**（公开），同时 Gateway 保持绑定到回环。配置 `gateway.tailscale.mode`：
OpenClaw can auto-configure Tailscale **Serve** (tailnet-only) or **Funnel** (public) while the Gateway stays bound to loopback. Configure `gateway.tailscale.mode`:

- `off`: 无 Tailscale 自动化（默认）| no Tailscale automation (default)
- `serve`: 仅 tailnet HTTPS，通过 `tailscale serve`（默认使用 Tailscale 身份头）| tailnet-only HTTPS via `tailscale serve` (uses Tailscale identity headers by default)
- `funnel`: 公开 HTTPS，通过 `tailscale funnel`（需要共享密码认证）| public HTTPS via `tailscale funnel` (requires shared password auth)

**注意事项 | Notes:**

- 当启用 Serve/Funnel 时，`gateway.bind` 必须保持为 `loopback`（OpenClaw 强制执行）| `gateway.bind` must stay `loopback` when Serve/Funnel is enabled (OpenClaw enforces this)
- 可以通过设置 `gateway.auth.mode: "password"` 或 `gateway.auth.allowTailscale: false` 强制 Serve 需要密码 | Serve can be forced to require a password by setting `gateway.auth.mode: "password"` or `gateway.auth.allowTailscale: false`
- Funnel 拒绝启动，除非设置了 `gateway.auth.mode: "password"` | Funnel refuses to start unless `gateway.auth.mode: "password"` is set
- 可选：`gateway.tailscale.resetOnExit` 在关闭时撤销 Serve/Funnel | Optional: `gateway.tailscale.resetOnExit` to undo Serve/Funnel on shutdown

**详细信息 | Details:** [Tailscale 指南 | guide](https://docs.openclaw.ai/gateway/tailscale) · [网页界面 | Web surfaces](https://docs.openclaw.ai/web)

## 远程 Gateway（Linux 很棒） | Remote Gateway (Linux is great)

在小型 Linux 实例上运行 Gateway 完全可行。客户端（macOS 应用、CLI、WebChat）可以通过 **Tailscale Serve/Funnel** 或 **SSH 隧道**连接，并且你仍然可以配对设备节点（macOS/iOS/Android）来执行设备本地操作。
It's perfectly fine to run the Gateway on a small Linux instance. Clients (macOS app, CLI, WebChat) can connect over **Tailscale Serve/Funnel** or **SSH tunnels**, and you can still pair device nodes (macOS/iOS/Android) to execute device-local actions when needed.

- **Gateway 主机 | host** 默认运行 exec 工具和通道连接 | runs the exec tool and channel connections by default
- **设备节点 | Device nodes** 通过 `node.invoke` 运行设备本地操作（`system.run`、相机、屏幕录制、通知）| run device-local actions (`system.run`, camera, screen recording, notifications) via `node.invoke`
  简而言之：exec 在 Gateway 所在地运行；设备操作在设备所在地运行。| In short: exec runs where the Gateway lives; device actions run where the device lives.

**详细信息 | Details:** [远程访问 | Remote access](https://docs.openclaw.ai/gateway/remote) · [节点 | Nodes](https://docs.openclaw.ai/nodes) · [安全 | Security](https://docs.openclaw.ai/gateway/security)

## macOS 权限（通过 Gateway 协议） | macOS permissions via the Gateway protocol

macOS 应用可以以 **节点模式**运行，并通过 Gateway WebSocket（`node.list` / `node.describe`）通告其功能 + 权限映射。然后客户端可以通过 `node.invoke` 执行本地操作：
The macOS app can run in **node mode** and advertises its capabilities + permission map over the Gateway WebSocket (`node.list` / `node.describe`). Clients can then execute local actions via `node.invoke`:

- `system.run` 运行本地命令并返回 stdout/stderr/退出代码；设置 `needsScreenRecording: true` 需要屏幕录制权限（否则会得到 `PERMISSION_MISSING`）| runs a local command and returns stdout/stderr/exit code; set `needsScreenRecording: true` to require screen-recording permission (otherwise you'll get `PERMISSION_MISSING`)
- `system.notify` 发送用户通知，如果通知被拒绝则失败 | posts a user notification and fails if notifications are denied
- `canvas.*`、`camera.*`、`screen.record` 和 `location.get` 也通过 `node.invoke` 路由，并遵循 TCC 权限状态 | are also routed via `node.invoke` and follow TCC permission status

**提升权限 bash（主机权限）与 macOS TCC 是独立的 | Elevated bash (host permissions) is separate from macOS TCC:**

- 使用 `/elevated on|off` 在启用 + 白名单时切换每会话提升访问 | Use `/elevated on|off` to toggle per-session elevated access when enabled + allowlisted
- Gateway 通过 `sessions.patch`（WS 方法）持久化每会话切换，与 `thinkingLevel`、`verboseLevel`、`model`、`sendPolicy` 和 `groupActivation` 一起 | Gateway persists the per-session toggle via `sessions.patch` (WS method) alongside `thinkingLevel`, `verboseLevel`, `model`, `sendPolicy`, and `groupActivation`

**详细信息 | Details:** [节点 | Nodes](https://docs.openclaw.ai/nodes) · [macOS 应用 | app](https://docs.openclaw.ai/platforms/macos) · [Gateway 协议 | protocol](https://docs.openclaw.ai/concepts/architecture)

## 智能体间协作（sessions_* 工具） | Agent to Agent (sessions_* tools)

- 使用这些工具在会话之间协调工作，无需在聊天界面之间跳转 | Use these to coordinate work across sessions without jumping between chat surfaces
- `sessions_list` — 发现活跃的会话（智能体）及其元数据 | discover active sessions (agents) and their metadata
- `sessions_history` — 获取会话的对话记录 | fetch transcript logs for a session
- `sessions_send` — 向另一个会话发送消息；可选回复 ping-pong + 通知步骤（`REPLY_SKIP`、`ANNOUNCE_SKIP`）| message another session; optional reply-back ping-pong + announce step (`REPLY_SKIP`, `ANNOUNCE_SKIP`)

**详细信息 | Details:** [会话工具 | Session tools](https://docs.openclaw.ai/concepts/session-tool)

## 技能注册表（ClawHub） | Skills registry (ClawHub)

ClawHub 是一个简洁的技能注册表。启用 ClawHub 后，智能体可以自动搜索技能并根据需要拉取新技能。
ClawHub is a minimal skill registry. With ClawHub enabled, the agent can search for skills automatically and pull in new ones as needed.

[ClawHub](https://clawhub.com)

## 聊天命令 | Chat commands

在 WhatsApp/Telegram/Slack/Google Chat/Microsoft Teams/WebChat 中发送这些命令（群组命令仅限所有者）：
Send these in WhatsApp/Telegram/Slack/Google Chat/Microsoft Teams/WebChat (group commands are owner-only):

- `/status` — 简洁的会话状态（模型 + tokens，可用时显示成本）| compact session status (model + tokens, cost when available)
- `/new` 或 `/reset` — 重置会话 | reset the session
- `/compact` — 压缩会话上下文（总结）| compact session context (summary)
- `/think <level>` — off|minimal|low|medium|high|xhigh（仅 GPT-5.2 + Codex 模型）| off|minimal|low|medium|high|xhigh (GPT-5.2 + Codex models only)
- `/verbose on|off` — 详细模式开/关 | verbose mode on/off
- `/usage off|tokens|full` — 每次响应的使用情况页脚 | per-response usage footer
- `/restart` — 重启 gateway（群组中仅限所有者）| restart the gateway (owner-only in groups)
- `/activation mention|always` — 群组激活切换（仅群组）| group activation toggle (groups only)

## 应用程序（可选） | Apps (optional)

单独的 Gateway 就能提供出色的体验。所有应用都是可选的，并增加额外功能。
The Gateway alone delivers a great experience. All apps are optional and add extra features.

如果你计划构建/运行配套应用，请遵循下面的平台运行手册。
If you plan to build/run companion apps, follow the platform runbooks below.

### macOS (OpenClaw.app)（可选） | macOS (OpenClaw.app) (optional)

- 菜单栏控制 Gateway 和健康状态 | Menu bar control for the Gateway and health
- 语音唤醒 + 按键说话覆盖层 | Voice Wake + push-to-talk overlay
- WebChat + 调试工具 | WebChat + debug tools
- 通过 SSH 远程控制 gateway | Remote gateway control over SSH

**注意 | Note:** 需要签名构建，以便 macOS 权限在重新构建后保持（参见 `docs/mac/permissions.md`）| signed builds required for macOS permissions to stick across rebuilds (see `docs/mac/permissions.md`)

### iOS 节点（可选） | iOS node (optional)

- 通过 Bridge 配对为节点 | Pairs as a node via the Bridge
- 语音触发转发 + Canvas 界面 | Voice trigger forwarding + Canvas surface
- 通过 `openclaw nodes …` 控制 | Controlled via `openclaw nodes …`

**运行手册 | Runbook:** [iOS 连接 | connect](https://docs.openclaw.ai/platforms/ios)

### Android 节点（可选） | Android node (optional)

- 通过与 iOS 相同的 Bridge + 配对流程进行配对 | Pairs via the same Bridge + pairing flow as iOS
- 暴露 Canvas、相机和屏幕捕获命令 | Exposes Canvas, Camera, and Screen capture commands
- **运行手册 | Runbook:** [Android 连接 | connect](https://docs.openclaw.ai/platforms/android)

## 智能体工作空间 + 技能 | Agent workspace + skills

- **工作空间根目录 | Workspace root:** `~/.openclaw/workspace`（可通过 `agents.defaults.workspace` 配置 | configurable via `agents.defaults.workspace`）
- **注入的提示文件 | Injected prompt files:** `AGENTS.md`, `SOUL.md`, `TOOLS.md`
- **技能 | Skills:** `~/.openclaw/workspace/skills/<skill>/SKILL.md`

## 配置 | Configuration

**最小配置 | Minimal** `~/.openclaw/openclaw.json`（模型 + 默认值 | model + defaults）：

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-5",
  },
}
````

[完整配置参考（所有键 + 示例）| Full configuration reference (all keys + examples)](https://docs.openclaw.ai/gateway/configuration)

## 安全模型（重要） | Security model (important)

- **默认情况 | Default:** 工具在主机上为 **main** 会话运行，因此当只有你自己时，智能体具有完全访问权限 | tools run on the host for the **main** session, so the agent has full access when it's just you
- **群组/通道安全 | Group/channel safety:** 设置 `agents.defaults.sandbox.mode: "non-main"` 在每会话 Docker 沙盒中运行 **非 main 会话**（群组/通道）；然后 bash 在 Docker 中运行这些会话 | set `agents.defaults.sandbox.mode: "non-main"` to run **non-main sessions** (groups/channels) inside per-session Docker sandboxes; bash then runs in Docker for those sessions
- **沙监默认配置 | Sandbox defaults:** 白名单 | allowlist `bash`, `process`, `read`, `write`, `edit`, `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`；黑名单 | denylist `browser`, `canvas`, `nodes`, `cron`, `discord`, `gateway`

**详细信息 | Details:** [安全指南 | Security guide](https://docs.openclaw.ai/gateway/security) · [Docker + 沙监 | sandboxing](https://docs.openclaw.ai/install/docker) · [沙监配置 | Sandbox config](https://docs.openclaw.ai/gateway/configuration)

### [WhatsApp](https://docs.openclaw.ai/channels/whatsapp)

- 链接设备 | Link the device: `pnpm openclaw channels login`（将凭据存储在 `~/.openclaw/credentials` | stores creds in `~/.openclaw/credentials`）
- 通过 `channels.whatsapp.allowFrom` 白名单谁可以与助手对话 | Allowlist who can talk to the assistant via `channels.whatsapp.allowFrom`
- 如果设置了 `channels.whatsapp.groups`，它就变成群组白名单；包含 `"*"` 允许所有 | If `channels.whatsapp.groups` is set, it becomes a group allowlist; include `"*"` to allow all

### [Telegram](https://docs.openclaw.ai/channels/telegram)

- 设置 | Set `TELEGRAM_BOT_TOKEN` 或 | or `channels.telegram.botToken`（环境变量优先 | env wins）
- 可选 | Optional: 设置 | set `channels.telegram.groups`（带有 | with `channels.telegram.groups."*".requireMention`）；设置后，它是群组白名单（包含 `"*"` 允许所有）| when set, it is a group allowlist (include `"*"` to allow all)。还有 `channels.telegram.allowFrom` 或 `channels.telegram.webhookUrl` + `channels.telegram.webhookSecret` 根据需要 | Also `channels.telegram.allowFrom` or `channels.telegram.webhookUrl` + `channels.telegram.webhookSecret` as needed

```json5
{
  channels: {
    telegram: {
      botToken: "123456:ABCDEF",
    },
  },
}
```

### [Slack](https://docs.openclaw.ai/channels/slack)

- 设置 | Set `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`（或 | or `channels.slack.botToken` + `channels.slack.appToken`）

### [Discord](https://docs.openclaw.ai/channels/discord)

- 设置 | Set `DISCORD_BOT_TOKEN` 或 | or `channels.discord.token`（环境变量优先 | env wins）
- 可选 | Optional: 设置 | set `commands.native`, `commands.text`, 或 | or `commands.useAccessGroups`，以及 | plus `channels.discord.dm.allowFrom`, `channels.discord.guilds`, 或 | or `channels.discord.mediaMaxMb` 根据需要 | as needed

```json5
{
  channels: {
    discord: {
      token: "1234abcd",
    },
  },
}
```

### [Signal](https://docs.openclaw.ai/channels/signal)

- 需要 | Requires `signal-cli` 和 | and `channels.signal` 配置部分 | config section

### [BlueBubbles (iMessage)](https://docs.openclaw.ai/channels/bluebubbles)

- **推荐的 | Recommended** iMessage 集成 | integration
- 配置 | Configure `channels.bluebubbles.serverUrl` + `channels.bluebubbles.password` 和 | and webhook（`channels.bluebubbles.webhookPath`）
- BlueBubbles 服务器在 macOS 上运行；Gateway 可以在 macOS 或其他地方运行 | The BlueBubbles server runs on macOS; the Gateway can run on macOS or elsewhere

### [iMessage (legacy)](https://docs.openclaw.ai/channels/imessage)

- 通过 `imsg` 的旧版 macOS 独占集成（Messages 必须登录）| Legacy macOS-only integration via `imsg` (Messages must be signed in)
- 如果设置了 `channels.imessage.groups`，它就变成群组白名单；包含 `"*"` 允许所有 | If `channels.imessage.groups` is set, it becomes a group allowlist; include `"*"` to allow all

### [Microsoft Teams](https://docs.openclaw.ai/channels/msteams)

- 配置 | Configure Teams 应用 | app + Bot Framework，然后添加 | then add `msteams` 配置部分 | config section
- 通过 `msteams.allowFrom` 白名单谁可以对话 | Allowlist who can talk via `msteams.allowFrom`；群组访问通过 | group access via `msteams.groupAllowFrom` 或 | or `msteams.groupPolicy: "open"`

### [WebChat](https://docs.openclaw.ai/web/webchat)

- 使用 Gateway WebSocket；无需单独的 WebChat 端口/配置 | Uses the Gateway WebSocket; no separate WebChat port/config

**浏览器控制（可选）| Browser control (optional)**:

```json5
{
  browser: {
    enabled: true,
    color: "#FF4500",
  },
}
```

## 文档 | Docs

当你完成引导流程并想要更深入的参考时使用这些文档。
Use these when you're past the onboarding flow and want the deeper reference.

- [从文档索引开始导航和“哪里是什么” | Start with the docs index for navigation and "what's where"](https://docs.openclaw.ai)
- [阅读架构概述以了解 gateway + 协议模型 | Read the architecture overview for the gateway + protocol model](https://docs.openclaw.ai/concepts/architecture)
- [需要每个键和示例时使用完整配置参考 | Use the full configuration reference when you need every key and example](https://docs.openclaw.ai/gateway/configuration)
- [按手册运行 Gateway | Run the Gateway by the book with the operational runbook](https://docs.openclaw.ai/gateway)
- [了解 Control UI/Web 界面如何工作以及如何安全暴露它们 | Learn how the Control UI/Web surfaces work and how to expose them safely](https://docs.openclaw.ai/web)
- [了解通过 SSH 隧道或 tailnets 的远程访问 | Understand remote access over SSH tunnels or tailnets](https://docs.openclaw.ai/gateway/remote)
- [遵循引导向导流程进行引导设置 | Follow the onboarding wizard flow for a guided setup](https://docs.openclaw.ai/start/wizard)
- [通过 webhook 界面连接外部触发器 | Wire external triggers via the webhook surface](https://docs.openclaw.ai/automation/webhook)
- [设置 Gmail Pub/Sub 触发器 | Set up Gmail Pub/Sub triggers](https://docs.openclaw.ai/automation/gmail-pubsub)
- [了解 macOS 菜单栏配套详情 | Learn the macOS menu bar companion details](https://docs.openclaw.ai/platforms/mac/menu-bar)
- [平台指南 | Platform guides]: [Windows (WSL2)](https://docs.openclaw.ai/platforms/windows), [Linux](https://docs.openclaw.ai/platforms/linux), [macOS](https://docs.openclaw.ai/platforms/macos), [iOS](https://docs.openclaw.ai/platforms/ios), [Android](https://docs.openclaw.ai/platforms/android)
- [使用故障排除指南调试常见故障 | Debug common failures with the troubleshooting guide](https://docs.openclaw.ai/channels/troubleshooting)
- [在暴露任何内容之前查看安全指导 | Review security guidance before exposing anything](https://docs.openclaw.ai/gateway/security)

## 高级文档（发现 + 控制） | Advanced docs (discovery + control)

- [发现 + 传输 | Discovery + transports](https://docs.openclaw.ai/gateway/discovery)
- [Bonjour/mDNS](https://docs.openclaw.ai/gateway/bonjour)
- [Gateway 配对 | pairing](https://docs.openclaw.ai/gateway/pairing)
- [远程 gateway README | Remote gateway README](https://docs.openclaw.ai/gateway/remote-gateway-readme)
- [Control UI](https://docs.openclaw.ai/web/control-ui)
- [仪表板 | Dashboard](https://docs.openclaw.ai/web/dashboard)

## 运维和故障排除 | Operations & troubleshooting

- [健康检查 | Health checks](https://docs.openclaw.ai/gateway/health)
- [Gateway 锁 | lock](https://docs.openclaw.ai/gateway/gateway-lock)
- [后台进程 | Background process](https://docs.openclaw.ai/gateway/background-process)
- [浏览器故障排除（Linux）| Browser troubleshooting (Linux)](https://docs.openclaw.ai/tools/browser-linux-troubleshooting)
- [日志记录 | Logging](https://docs.openclaw.ai/logging)

## 深入了解 | Deep dives

- [智能体循环 | Agent loop](https://docs.openclaw.ai/concepts/agent-loop)
- [在线状态 | Presence](https://docs.openclaw.ai/concepts/presence)
- [TypeBox schemas](https://docs.openclaw.ai/concepts/typebox)
- [RPC 适配器 | adapters](https://docs.openclaw.ai/reference/rpc)
- [队列 | Queue](https://docs.openclaw.ai/concepts/queue)

## 工作空间和技能 | Workspace & skills

- [技能配置 | Skills config](https://docs.openclaw.ai/tools/skills-config)
- [默认 AGENTS | Default AGENTS](https://docs.openclaw.ai/reference/AGENTS.default)
- [模板 | Templates]: [AGENTS](https://docs.openclaw.ai/reference/templates/AGENTS), [BOOTSTRAP](https://docs.openclaw.ai/reference/templates/BOOTSTRAP), [IDENTITY](https://docs.openclaw.ai/reference/templates/IDENTITY), [SOUL](https://docs.openclaw.ai/reference/templates/SOUL), [TOOLS](https://docs.openclaw.ai/reference/templates/TOOLS), [USER](https://docs.openclaw.ai/reference/templates/USER)

## 平台内部 | Platform internals

- [macOS 开发设置 | dev setup](https://docs.openclaw.ai/platforms/mac/dev-setup)
- [macOS 菜单栏 | menu bar](https://docs.openclaw.ai/platforms/mac/menu-bar)
- [macOS 语音唤醒 | voice wake](https://docs.openclaw.ai/platforms/mac/voicewake)
- [iOS 节点 | node](https://docs.openclaw.ai/platforms/ios)
- [Android 节点 | node](https://docs.openclaw.ai/platforms/android)
- [Windows (WSL2)](https://docs.openclaw.ai/platforms/windows)
- [Linux 应用 | app](https://docs.openclaw.ai/platforms/linux)

## 邮件钩子（Gmail） | Email hooks (Gmail)

- [docs.openclaw.ai/gmail-pubsub](https://docs.openclaw.ai/automation/gmail-pubsub)

## Molty

OpenClaw 为 **Molty** 构建，一个太空龙虾 AI 助手。🦞
OpenClaw was built for **Molty**, a space lobster AI assistant. 🦞
由 Peter Steinberger 和社区构建。
by Peter Steinberger and the community.

- [openclaw.ai](https://openclaw.ai)
- [soul.md](https://soul.md)
- [steipete.me](https://steipete.me)
- [@openclaw](https://x.com/openclaw)

## 社区 | Community

查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解指南、维护者和如何提交 PR。
See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, maintainers, and how to submit PRs.

AI/vibe-coded PRs 欢迎！🤖
AI/vibe-coded PRs welcome! 🤖

特别感谢 [Mario Zechner](https://mariozechner.at/) 的支持和 [pi-mono](https://github.com/badlogic/pi-mono)。
Special thanks to [Mario Zechner](https://mariozechner.at/) for his support and for [pi-mono](https://github.com/badlogic/pi-mono).
特别感谢 Adam Doppelt 的 lobster.bot。
Special thanks to Adam Doppelt for lobster.bot.

感谢所有 clawtributors：
Thanks to all clawtributors:

<p align="left">
  <a href="https://github.com/steipete"><img src="https://avatars.githubusercontent.com/u/58493?v=4&s=48" width="48" height="48" alt="steipete" title="steipete"/></a> <a href="https://github.com/cpojer"><img src="https://avatars.githubusercontent.com/u/13352?v=4&s=48" width="48" height="48" alt="cpojer" title="cpojer"/></a> <a href="https://github.com/plum-dawg"><img src="https://avatars.githubusercontent.com/u/5909950?v=4&s=48" width="48" height="48" alt="plum-dawg" title="plum-dawg"/></a> <a href="https://github.com/bohdanpodvirnyi"><img src="https://avatars.githubusercontent.com/u/31819391?v=4&s=48" width="48" height="48" alt="bohdanpodvirnyi" title="bohdanpodvirnyi"/></a> <a href="https://github.com/iHildy"><img src="https://avatars.githubusercontent.com/u/25069719?v=4&s=48" width="48" height="48" alt="iHildy" title="iHildy"/></a> <a href="https://github.com/jaydenfyi"><img src="https://avatars.githubusercontent.com/u/213395523?v=4&s=48" width="48" height="48" alt="jaydenfyi" title="jaydenfyi"/></a> <a href="https://github.com/joshp123"><img src="https://avatars.githubusercontent.com/u/1497361?v=4&s=48" width="48" height="48" alt="joshp123" title="joshp123"/></a> <a href="https://github.com/joaohlisboa"><img src="https://avatars.githubusercontent.com/u/8200873?v=4&s=48" width="48" height="48" alt="joaohlisboa" title="joaohlisboa"/></a> <a href="https://github.com/mneves75"><img src="https://avatars.githubusercontent.com/u/2423436?v=4&s=48" width="48" height="48" alt="mneves75" title="mneves75"/></a> <a href="https://github.com/MatthieuBizien"><img src="https://avatars.githubusercontent.com/u/173090?v=4&s=48" width="48" height="48" alt="MatthieuBizien" title="MatthieuBizien"/></a>
  <a href="https://github.com/MaudeBot"><img src="https://avatars.githubusercontent.com/u/255777700?v=4&s=48" width="48" height="48" alt="MaudeBot" title="MaudeBot"/></a> <a href="https://github.com/Glucksberg"><img src="https://avatars.githubusercontent.com/u/80581902?v=4&s=48" width="48" height="48" alt="Glucksberg" title="Glucksberg"/></a> <a href="https://github.com/rahthakor"><img src="https://avatars.githubusercontent.com/u/8470553?v=4&s=48" width="48" height="48" alt="rahthakor" title="rahthakor"/></a> <a href="https://github.com/vrknetha"><img src="https://avatars.githubusercontent.com/u/20596261?v=4&s=48" width="48" height="48" alt="vrknetha" title="vrknetha"/></a> <a href="https://github.com/radek-paclt"><img src="https://avatars.githubusercontent.com/u/50451445?v=4&s=48" width="48" height="48" alt="radek-paclt" title="radek-paclt"/></a> <a href="https://github.com/vignesh07"><img src="https://avatars.githubusercontent.com/u/1436853?v=4&s=48" width="48" height="48" alt="vignesh07" title="vignesh07"/></a> <a href="https://github.com/tobiasbischoff"><img src="https://avatars.githubusercontent.com/u/711564?v=4&s=48" width="48" height="48" alt="Tobias Bischoff" title="Tobias Bischoff"/></a> <a href="https://github.com/sebslight"><img src="https://avatars.githubusercontent.com/u/19554889?v=4&s=48" width="48" height="48" alt="sebslight" title="sebslight"/></a> <a href="https://github.com/czekaj"><img src="https://avatars.githubusercontent.com/u/1464539?v=4&s=48" width="48" height="48" alt="czekaj" title="czekaj"/></a> <a href="https://github.com/mukhtharcm"><img src="https://avatars.githubusercontent.com/u/56378562?v=4&s=48" width="48" height="48" alt="mukhtharcm" title="mukhtharcm"/></a>
  <a href="https://github.com/maxsumrall"><img src="https://avatars.githubusercontent.com/u/628843?v=4&s=48" width="48" height="48" alt="maxsumrall" title="maxsumrall"/></a> <a href="https://github.com/xadenryan"><img src="https://avatars.githubusercontent.com/u/165437834?v=4&s=48" width="48" height="48" alt="xadenryan" title="xadenryan"/></a> <a href="https://github.com/VACInc"><img src="https://avatars.githubusercontent.com/u/3279061?v=4&s=48" width="48" height="48" alt="VACInc" title="VACInc"/></a> <a href="https://github.com/mbelinky"><img src="https://avatars.githubusercontent.com/u/132747814?v=4&s=48" width="48" height="48" alt="Mariano Belinky" title="Mariano Belinky"/></a> <a href="https://github.com/rodrigouroz"><img src="https://avatars.githubusercontent.com/u/384037?v=4&s=48" width="48" height="48" alt="rodrigouroz" title="rodrigouroz"/></a> <a href="https://github.com/tyler6204"><img src="https://avatars.githubusercontent.com/u/64381258?v=4&s=48" width="48" height="48" alt="tyler6204" title="tyler6204"/></a> <a href="https://github.com/juanpablodlc"><img src="https://avatars.githubusercontent.com/u/92012363?v=4&s=48" width="48" height="48" alt="juanpablodlc" title="juanpablodlc"/></a> <a href="https://github.com/conroywhitney"><img src="https://avatars.githubusercontent.com/u/249891?v=4&s=48" width="48" height="48" alt="conroywhitney" title="conroywhitney"/></a> <a href="https://github.com/hsrvc"><img src="https://avatars.githubusercontent.com/u/129702169?v=4&s=48" width="48" height="48" alt="hsrvc" title="hsrvc"/></a> <a href="https://github.com/magimetal"><img src="https://avatars.githubusercontent.com/u/36491250?v=4&s=48" width="48" height="48" alt="magimetal" title="magimetal"/></a>
  <a href="https://github.com/zerone0x"><img src="https://avatars.githubusercontent.com/u/39543393?v=4&s=48" width="48" height="48" alt="zerone0x" title="zerone0x"/></a> <a href="https://github.com/meaningfool"><img src="https://avatars.githubusercontent.com/u/2862331?v=4&s=48" width="48" height="48" alt="meaningfool" title="meaningfool"/></a> <a href="https://github.com/patelhiren"><img src="https://avatars.githubusercontent.com/u/172098?v=4&s=48" width="48" height="48" alt="patelhiren" title="patelhiren"/></a> <a href="https://github.com/NicholasSpisak"><img src="https://avatars.githubusercontent.com/u/129075147?v=4&s=48" width="48" height="48" alt="NicholasSpisak" title="NicholasSpisak"/></a> <a href="https://github.com/jonisjongithub"><img src="https://avatars.githubusercontent.com/u/86072337?v=4&s=48" width="48" height="48" alt="jonisjongithub" title="jonisjongithub"/></a> <a href="https://github.com/AbhisekBasu1"><img src="https://avatars.githubusercontent.com/u/40645221?v=4&s=48" width="48" height="48" alt="abhisekbasu1" title="abhisekbasu1"/></a> <a href="https://github.com/jamesgroat"><img src="https://avatars.githubusercontent.com/u/2634024?v=4&s=48" width="48" height="48" alt="jamesgroat" title="jamesgroat"/></a> <a href="https://github.com/claude"><img src="https://avatars.githubusercontent.com/u/81847?v=4&s=48" width="48" height="48" alt="claude" title="claude"/></a> <a href="https://github.com/JustYannicc"><img src="https://avatars.githubusercontent.com/u/52761674?v=4&s=48" width="48" height="48" alt="JustYannicc" title="JustYannicc"/></a> <a href="https://github.com/Hyaxia"><img src="https://avatars.githubusercontent.com/u/36747317?v=4&s=48" width="48" height="48" alt="Hyaxia" title="Hyaxia"/></a>
  <a href="https://github.com/dantelex"><img src="https://avatars.githubusercontent.com/u/631543?v=4&s=48" width="48" height="48" alt="dantelex" title="dantelex"/></a> <a href="https://github.com/SocialNerd42069"><img src="https://avatars.githubusercontent.com/u/118244303?v=4&s=48" width="48" height="48" alt="SocialNerd42069" title="SocialNerd42069"/></a> <a href="https://github.com/daveonkels"><img src="https://avatars.githubusercontent.com/u/533642?v=4&s=48" width="48" height="48" alt="daveonkels" title="daveonkels"/></a> <a href="https://github.com/apps/google-labs-jules"><img src="https://avatars.githubusercontent.com/in/842251?v=4&s=48" width="48" height="48" alt="google-labs-jules[bot]" title="google-labs-jules[bot]"/></a> <a href="https://github.com/lc0rp"><img src="https://avatars.githubusercontent.com/u/2609441?v=4&s=48" width="48" height="48" alt="lc0rp" title="lc0rp"/></a> <a href="https://github.com/mousberg"><img src="https://avatars.githubusercontent.com/u/57605064?v=4&s=48" width="48" height="48" alt="mousberg" title="mousberg"/></a> <a href="https://github.com/adam91holt"><img src="https://avatars.githubusercontent.com/u/9592417?v=4&s=48" width="48" height="48" alt="adam91holt" title="adam91holt"/></a> <a href="https://github.com/hougangdev"><img src="https://avatars.githubusercontent.com/u/105773686?v=4&s=48" width="48" height="48" alt="hougangdev" title="hougangdev"/></a> <a href="https://github.com/gumadeiras"><img src="https://avatars.githubusercontent.com/u/5599352?v=4&s=48" width="48" height="48" alt="gumadeiras" title="gumadeiras"/></a> <a href="https://github.com/shakkernerd"><img src="https://avatars.githubusercontent.com/u/165377636?v=4&s=48" width="48" height="48" alt="shakkernerd" title="shakkernerd"/></a>
  <a href="https://github.com/mteam88"><img src="https://avatars.githubusercontent.com/u/84196639?v=4&s=48" width="48" height="48" alt="mteam88" title="mteam88"/></a> <a href="https://github.com/hirefrank"><img src="https://avatars.githubusercontent.com/u/183158?v=4&s=48" width="48" height="48" alt="hirefrank" title="hirefrank"/></a> <a href="https://github.com/joeynyc"><img src="https://avatars.githubusercontent.com/u/17919866?v=4&s=48" width="48" height="48" alt="joeynyc" title="joeynyc"/></a> <a href="https://github.com/orlyjamie"><img src="https://avatars.githubusercontent.com/u/6668807?v=4&s=48" width="48" height="48" alt="orlyjamie" title="orlyjamie"/></a> <a href="https://github.com/dbhurley"><img src="https://avatars.githubusercontent.com/u/5251425?v=4&s=48" width="48" height="48" alt="dbhurley" title="dbhurley"/></a> <a href="https://github.com/omniwired"><img src="https://avatars.githubusercontent.com/u/322761?v=4&s=48" width="48" height="48" alt="Eng. Juan Combetto" title="Eng. Juan Combetto"/></a> <a href="https://github.com/TSavo"><img src="https://avatars.githubusercontent.com/u/877990?v=4&s=48" width="48" height="48" alt="TSavo" title="TSavo"/></a> <a href="https://github.com/aerolalit"><img src="https://avatars.githubusercontent.com/u/17166039?v=4&s=48" width="48" height="48" alt="aerolalit" title="aerolalit"/></a> <a href="https://github.com/julianengel"><img src="https://avatars.githubusercontent.com/u/10634231?v=4&s=48" width="48" height="48" alt="julianengel" title="julianengel"/></a> <a href="https://github.com/bradleypriest"><img src="https://avatars.githubusercontent.com/u/167215?v=4&s=48" width="48" height="48" alt="bradleypriest" title="bradleypriest"/></a>
  <a href="https://github.com/benithors"><img src="https://avatars.githubusercontent.com/u/20652882?v=4&s=48" width="48" height="48" alt="benithors" title="benithors"/></a> <a href="https://github.com/rohannagpal"><img src="https://avatars.githubusercontent.com/u/4009239?v=4&s=48" width="48" height="48" alt="rohannagpal" title="rohannagpal"/></a> <a href="https://github.com/timolins"><img src="https://avatars.githubusercontent.com/u/1440854?v=4&s=48" width="48" height="48" alt="timolins" title="timolins"/></a> <a href="https://github.com/f-trycua"><img src="https://avatars.githubusercontent.com/u/195596869?v=4&s=48" width="48" height="48" alt="f-trycua" title="f-trycua"/></a> <a href="https://github.com/benostein"><img src="https://avatars.githubusercontent.com/u/31802821?v=4&s=48" width="48" height="48" alt="benostein" title="benostein"/></a> <a href="https://github.com/elliotsecops"><img src="https://avatars.githubusercontent.com/u/141947839?v=4&s=48" width="48" height="48" alt="elliotsecops" title="elliotsecops"/></a> <a href="https://github.com/christianklotz"><img src="https://avatars.githubusercontent.com/u/69443?v=4&s=48" width="48" height="48" alt="christianklotz" title="christianklotz"/></a> <a href="https://github.com/Nachx639"><img src="https://avatars.githubusercontent.com/u/71144023?v=4&s=48" width="48" height="48" alt="nachx639" title="nachx639"/></a> <a href="https://github.com/pvoo"><img src="https://avatars.githubusercontent.com/u/20116814?v=4&s=48" width="48" height="48" alt="pvoo" title="pvoo"/></a> <a href="https://github.com/sreekaransrinath"><img src="https://avatars.githubusercontent.com/u/50989977?v=4&s=48" width="48" height="48" alt="sreekaransrinath" title="sreekaransrinath"/></a>
  <a href="https://github.com/gupsammy"><img src="https://avatars.githubusercontent.com/u/20296019?v=4&s=48" width="48" height="48" alt="gupsammy" title="gupsammy"/></a> <a href="https://github.com/cristip73"><img src="https://avatars.githubusercontent.com/u/24499421?v=4&s=48" width="48" height="48" alt="cristip73" title="cristip73"/></a> <a href="https://github.com/stefangalescu"><img src="https://avatars.githubusercontent.com/u/52995748?v=4&s=48" width="48" height="48" alt="stefangalescu" title="stefangalescu"/></a> <a href="https://github.com/nachoiacovino"><img src="https://avatars.githubusercontent.com/u/50103937?v=4&s=48" width="48" height="48" alt="nachoiacovino" title="nachoiacovino"/></a> <a href="https://github.com/vsabavat"><img src="https://avatars.githubusercontent.com/u/50385532?v=4&s=48" width="48" height="48" alt="Vasanth Rao Naik Sabavat" title="Vasanth Rao Naik Sabavat"/></a> <a href="https://github.com/petter-b"><img src="https://avatars.githubusercontent.com/u/62076402?v=4&s=48" width="48" height="48" alt="petter-b" title="petter-b"/></a> <a href="https://github.com/thewilloftheshadow"><img src="https://avatars.githubusercontent.com/u/35580099?v=4&s=48" width="48" height="48" alt="thewilloftheshadow" title="thewilloftheshadow"/></a> <a href="https://github.com/leszekszpunar"><img src="https://avatars.githubusercontent.com/u/13106764?v=4&s=48" width="48" height="48" alt="leszekszpunar" title="leszekszpunar"/></a> <a href="https://github.com/scald"><img src="https://avatars.githubusercontent.com/u/1215913?v=4&s=48" width="48" height="48" alt="scald" title="scald"/></a> <a href="https://github.com/andranik-sahakyan"><img src="https://avatars.githubusercontent.com/u/8908029?v=4&s=48" width="48" height="48" alt="andranik-sahakyan" title="andranik-sahakyan"/></a>
  <a href="https://github.com/davidguttman"><img src="https://avatars.githubusercontent.com/u/431696?v=4&s=48" width="48" height="48" alt="davidguttman" title="davidguttman"/></a> <a href="https://github.com/sleontenko"><img src="https://avatars.githubusercontent.com/u/7135949?v=4&s=48" width="48" height="48" alt="sleontenko" title="sleontenko"/></a> <a href="https://github.com/denysvitali"><img src="https://avatars.githubusercontent.com/u/4939519?v=4&s=48" width="48" height="48" alt="denysvitali" title="denysvitali"/></a> <a href="https://github.com/sircrumpet"><img src="https://avatars.githubusercontent.com/u/4436535?v=4&s=48" width="48" height="48" alt="sircrumpet" title="sircrumpet"/></a> <a href="https://github.com/peschee"><img src="https://avatars.githubusercontent.com/u/63866?v=4&s=48" width="48" height="48" alt="peschee" title="peschee"/></a> <a href="https://github.com/nonggialiang"><img src="https://avatars.githubusercontent.com/u/14367839?v=4&s=48" width="48" height="48" alt="nonggialiang" title="nonggialiang"/></a> <a href="https://github.com/rafaelreis-r"><img src="https://avatars.githubusercontent.com/u/57492577?v=4&s=48" width="48" height="48" alt="rafaelreis-r" title="rafaelreis-r"/></a> <a href="https://github.com/dominicnunez"><img src="https://avatars.githubusercontent.com/u/43616264?v=4&s=48" width="48" height="48" alt="dominicnunez" title="dominicnunez"/></a> <a href="https://github.com/lploc94"><img src="https://avatars.githubusercontent.com/u/28453843?v=4&s=48" width="48" height="48" alt="lploc94" title="lploc94"/></a> <a href="https://github.com/ratulsarna"><img src="https://avatars.githubusercontent.com/u/105903728?v=4&s=48" width="48" height="48" alt="ratulsarna" title="ratulsarna"/></a>
  <a href="https://github.com/sfo2001"><img src="https://avatars.githubusercontent.com/u/103369858?v=4&s=48" width="48" height="48" alt="sfo2001" title="sfo2001"/></a> <a href="https://github.com/lutr0"><img src="https://avatars.githubusercontent.com/u/76906369?v=4&s=48" width="48" height="48" alt="lutr0" title="lutr0"/></a> <a href="https://github.com/kiranjd"><img src="https://avatars.githubusercontent.com/u/25822851?v=4&s=48" width="48" height="48" alt="kiranjd" title="kiranjd"/></a> <a href="https://github.com/danielz1z"><img src="https://avatars.githubusercontent.com/u/235270390?v=4&s=48" width="48" height="48" alt="danielz1z" title="danielz1z"/></a> <a href="https://github.com/AdeboyeDN"><img src="https://avatars.githubusercontent.com/u/65312338?v=4&s=48" width="48" height="48" alt="AdeboyeDN" title="AdeboyeDN"/></a> <a href="https://github.com/Alg0rix"><img src="https://avatars.githubusercontent.com/u/53804949?v=4&s=48" width="48" height="48" alt="Alg0rix" title="Alg0rix"/></a> <a href="https://github.com/Takhoffman"><img src="https://avatars.githubusercontent.com/u/781889?v=4&s=48" width="48" height="48" alt="Takhoffman" title="Takhoffman"/></a> <a href="https://github.com/papago2355"><img src="https://avatars.githubusercontent.com/u/68721273?v=4&s=48" width="48" height="48" alt="papago2355" title="papago2355"/></a> <a href="https://github.com/apps/clawdinator"><img src="https://avatars.githubusercontent.com/in/2607181?v=4&s=48" width="48" height="48" alt="clawdinator[bot]" title="clawdinator[bot]"/></a> <a href="https://github.com/emanuelst"><img src="https://avatars.githubusercontent.com/u/9994339?v=4&s=48" width="48" height="48" alt="emanuelst" title="emanuelst"/></a>
  <a href="https://github.com/evanotero"><img src="https://avatars.githubusercontent.com/u/13204105?v=4&s=48" width="48" height="48" alt="evanotero" title="evanotero"/></a> <a href="https://github.com/KristijanJovanovski"><img src="https://avatars.githubusercontent.com/u/8942284?v=4&s=48" width="48" height="48" alt="KristijanJovanovski" title="KristijanJovanovski"/></a> <a href="https://github.com/jlowin"><img src="https://avatars.githubusercontent.com/u/153965?v=4&s=48" width="48" height="48" alt="jlowin" title="jlowin"/></a> <a href="https://github.com/rdev"><img src="https://avatars.githubusercontent.com/u/8418866?v=4&s=48" width="48" height="48" alt="rdev" title="rdev"/></a> <a href="https://github.com/rhuanssauro"><img src="https://avatars.githubusercontent.com/u/164682191?v=4&s=48" width="48" height="48" alt="rhuanssauro" title="rhuanssauro"/></a> <a href="https://github.com/joshrad-dev"><img src="https://avatars.githubusercontent.com/u/62785552?v=4&s=48" width="48" height="48" alt="joshrad-dev" title="joshrad-dev"/></a> <a href="https://github.com/obviyus"><img src="https://avatars.githubusercontent.com/u/22031114?v=4&s=48" width="48" height="48" alt="obviyus" title="obviyus"/></a> <a href="https://github.com/osolmaz"><img src="https://avatars.githubusercontent.com/u/2453968?v=4&s=48" width="48" height="48" alt="osolmaz" title="osolmaz"/></a> <a href="https://github.com/adityashaw2"><img src="https://avatars.githubusercontent.com/u/41204444?v=4&s=48" width="48" height="48" alt="adityashaw2" title="adityashaw2"/></a> <a href="https://github.com/CashWilliams"><img src="https://avatars.githubusercontent.com/u/613573?v=4&s=48" width="48" height="48" alt="CashWilliams" title="CashWilliams"/></a>
  <a href="https://github.com/search?q=sheeek"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="sheeek" title="sheeek"/></a> <a href="https://github.com/ryancontent"><img src="https://avatars.githubusercontent.com/u/39743613?v=4&s=48" width="48" height="48" alt="ryancontent" title="ryancontent"/></a> <a href="https://github.com/jasonsschin"><img src="https://avatars.githubusercontent.com/u/1456889?v=4&s=48" width="48" height="48" alt="jasonsschin" title="jasonsschin"/></a> <a href="https://github.com/artuskg"><img src="https://avatars.githubusercontent.com/u/11966157?v=4&s=48" width="48" height="48" alt="artuskg" title="artuskg"/></a> <a href="https://github.com/onutc"><img src="https://avatars.githubusercontent.com/u/152018508?v=4&s=48" width="48" height="48" alt="onutc" title="onutc"/></a> <a href="https://github.com/pauloportella"><img src="https://avatars.githubusercontent.com/u/22947229?v=4&s=48" width="48" height="48" alt="pauloportella" title="pauloportella"/></a> <a href="https://github.com/HirokiKobayashi-R"><img src="https://avatars.githubusercontent.com/u/37167840?v=4&s=48" width="48" height="48" alt="HirokiKobayashi-R" title="HirokiKobayashi-R"/></a> <a href="https://github.com/ThanhNguyxn"><img src="https://avatars.githubusercontent.com/u/74597207?v=4&s=48" width="48" height="48" alt="ThanhNguyxn" title="ThanhNguyxn"/></a> <a href="https://github.com/kimitaka"><img src="https://avatars.githubusercontent.com/u/167225?v=4&s=48" width="48" height="48" alt="kimitaka" title="kimitaka"/></a> <a href="https://github.com/yuting0624"><img src="https://avatars.githubusercontent.com/u/32728916?v=4&s=48" width="48" height="48" alt="yuting0624" title="yuting0624"/></a>
  <a href="https://github.com/neooriginal"><img src="https://avatars.githubusercontent.com/u/54811660?v=4&s=48" width="48" height="48" alt="neooriginal" title="neooriginal"/></a> <a href="https://github.com/ManuelHettich"><img src="https://avatars.githubusercontent.com/u/17690367?v=4&s=48" width="48" height="48" alt="manuelhettich" title="manuelhettich"/></a> <a href="https://github.com/minghinmatthewlam"><img src="https://avatars.githubusercontent.com/u/14224566?v=4&s=48" width="48" height="48" alt="minghinmatthewlam" title="minghinmatthewlam"/></a> <a href="https://github.com/baccula"><img src="https://avatars.githubusercontent.com/u/22080883?v=4&s=48" width="48" height="48" alt="baccula" title="baccula"/></a> <a href="https://github.com/manikv12"><img src="https://avatars.githubusercontent.com/u/49544491?v=4&s=48" width="48" height="48" alt="manikv12" title="manikv12"/></a> <a href="https://github.com/myfunc"><img src="https://avatars.githubusercontent.com/u/19294627?v=4&s=48" width="48" height="48" alt="myfunc" title="myfunc"/></a> <a href="https://github.com/travisirby"><img src="https://avatars.githubusercontent.com/u/5958376?v=4&s=48" width="48" height="48" alt="travisirby" title="travisirby"/></a> <a href="https://github.com/buddyh"><img src="https://avatars.githubusercontent.com/u/31752869?v=4&s=48" width="48" height="48" alt="buddyh" title="buddyh"/></a> <a href="https://github.com/connorshea"><img src="https://avatars.githubusercontent.com/u/2977353?v=4&s=48" width="48" height="48" alt="connorshea" title="connorshea"/></a> <a href="https://github.com/kyleok"><img src="https://avatars.githubusercontent.com/u/58307870?v=4&s=48" width="48" height="48" alt="kyleok" title="kyleok"/></a>
  <a href="https://github.com/mcinteerj"><img src="https://avatars.githubusercontent.com/u/3613653?v=4&s=48" width="48" height="48" alt="mcinteerj" title="mcinteerj"/></a> <a href="https://github.com/apps/dependabot"><img src="https://avatars.githubusercontent.com/in/29110?v=4&s=48" width="48" height="48" alt="dependabot[bot]" title="dependabot[bot]"/></a> <a href="https://github.com/amitbiswal007"><img src="https://avatars.githubusercontent.com/u/108086198?v=4&s=48" width="48" height="48" alt="amitbiswal007" title="amitbiswal007"/></a> <a href="https://github.com/John-Rood"><img src="https://avatars.githubusercontent.com/u/62669593?v=4&s=48" width="48" height="48" alt="John-Rood" title="John-Rood"/></a> <a href="https://github.com/timkrase"><img src="https://avatars.githubusercontent.com/u/38947626?v=4&s=48" width="48" height="48" alt="timkrase" title="timkrase"/></a> <a href="https://github.com/uos-status"><img src="https://avatars.githubusercontent.com/u/255712580?v=4&s=48" width="48" height="48" alt="uos-status" title="uos-status"/></a> <a href="https://github.com/gerardward2007"><img src="https://avatars.githubusercontent.com/u/3002155?v=4&s=48" width="48" height="48" alt="gerardward2007" title="gerardward2007"/></a> <a href="https://github.com/roshanasingh4"><img src="https://avatars.githubusercontent.com/u/88576930?v=4&s=48" width="48" height="48" alt="roshanasingh4" title="roshanasingh4"/></a> <a href="https://github.com/tosh-hamburg"><img src="https://avatars.githubusercontent.com/u/58424326?v=4&s=48" width="48" height="48" alt="tosh-hamburg" title="tosh-hamburg"/></a> <a href="https://github.com/azade-c"><img src="https://avatars.githubusercontent.com/u/252790079?v=4&s=48" width="48" height="48" alt="azade-c" title="azade-c"/></a>
  <a href="https://github.com/badlogic"><img src="https://avatars.githubusercontent.com/u/514052?v=4&s=48" width="48" height="48" alt="badlogic" title="badlogic"/></a> <a href="https://github.com/dlauer"><img src="https://avatars.githubusercontent.com/u/757041?v=4&s=48" width="48" height="48" alt="dlauer" title="dlauer"/></a> <a href="https://github.com/JonUleis"><img src="https://avatars.githubusercontent.com/u/7644941?v=4&s=48" width="48" height="48" alt="JonUleis" title="JonUleis"/></a> <a href="https://github.com/shivamraut101"><img src="https://avatars.githubusercontent.com/u/110457469?v=4&s=48" width="48" height="48" alt="shivamraut101" title="shivamraut101"/></a> <a href="https://github.com/bjesuiter"><img src="https://avatars.githubusercontent.com/u/2365676?v=4&s=48" width="48" height="48" alt="bjesuiter" title="bjesuiter"/></a> <a href="https://github.com/cheeeee"><img src="https://avatars.githubusercontent.com/u/21245729?v=4&s=48" width="48" height="48" alt="cheeeee" title="cheeeee"/></a> <a href="https://github.com/robbyczgw-cla"><img src="https://avatars.githubusercontent.com/u/239660374?v=4&s=48" width="48" height="48" alt="robbyczgw-cla" title="robbyczgw-cla"/></a> <a href="https://github.com/YuriNachos"><img src="https://avatars.githubusercontent.com/u/19365375?v=4&s=48" width="48" height="48" alt="YuriNachos" title="YuriNachos"/></a> <a href="https://github.com/j1philli"><img src="https://avatars.githubusercontent.com/u/3744255?v=4&s=48" width="48" height="48" alt="Josh Phillips" title="Josh Phillips"/></a> <a href="https://github.com/pookNast"><img src="https://avatars.githubusercontent.com/u/14242552?v=4&s=48" width="48" height="48" alt="pookNast" title="pookNast"/></a>
  <a href="https://github.com/Whoaa512"><img src="https://avatars.githubusercontent.com/u/1581943?v=4&s=48" width="48" height="48" alt="Whoaa512" title="Whoaa512"/></a> <a href="https://github.com/chriseidhof"><img src="https://avatars.githubusercontent.com/u/5382?v=4&s=48" width="48" height="48" alt="chriseidhof" title="chriseidhof"/></a> <a href="https://github.com/ngutman"><img src="https://avatars.githubusercontent.com/u/1540134?v=4&s=48" width="48" height="48" alt="ngutman" title="ngutman"/></a> <a href="https://github.com/ysqander"><img src="https://avatars.githubusercontent.com/u/80843820?v=4&s=48" width="48" height="48" alt="ysqander" title="ysqander"/></a> <a href="https://github.com/search?q=Yurii%20Chukhlib"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Yurii Chukhlib" title="Yurii Chukhlib"/></a> <a href="https://github.com/aj47"><img src="https://avatars.githubusercontent.com/u/8023513?v=4&s=48" width="48" height="48" alt="aj47" title="aj47"/></a> <a href="https://github.com/kennyklee"><img src="https://avatars.githubusercontent.com/u/1432489?v=4&s=48" width="48" height="48" alt="kennyklee" title="kennyklee"/></a> <a href="https://github.com/superman32432432"><img src="https://avatars.githubusercontent.com/u/7228420?v=4&s=48" width="48" height="48" alt="superman32432432" title="superman32432432"/></a> <a href="https://github.com/grp06"><img src="https://avatars.githubusercontent.com/u/1573959?v=4&s=48" width="48" height="48" alt="grp06" title="grp06"/></a> <a href="https://github.com/Hisleren"><img src="https://avatars.githubusercontent.com/u/83217244?v=4&s=48" width="48" height="48" alt="Hisleren" title="Hisleren"/></a>
  <a href="https://github.com/shatner"><img src="https://avatars.githubusercontent.com/u/17735435?v=4&s=48" width="48" height="48" alt="shatner" title="shatner"/></a> <a href="https://github.com/antons"><img src="https://avatars.githubusercontent.com/u/129705?v=4&s=48" width="48" height="48" alt="antons" title="antons"/></a> <a href="https://github.com/austinm911"><img src="https://avatars.githubusercontent.com/u/31991302?v=4&s=48" width="48" height="48" alt="austinm911" title="austinm911"/></a> <a href="https://github.com/apps/blacksmith-sh"><img src="https://avatars.githubusercontent.com/in/807020?v=4&s=48" width="48" height="48" alt="blacksmith-sh[bot]" title="blacksmith-sh[bot]"/></a> <a href="https://github.com/damoahdominic"><img src="https://avatars.githubusercontent.com/u/4623434?v=4&s=48" width="48" height="48" alt="damoahdominic" title="damoahdominic"/></a> <a href="https://github.com/dan-dr"><img src="https://avatars.githubusercontent.com/u/6669808?v=4&s=48" width="48" height="48" alt="dan-dr" title="dan-dr"/></a> <a href="https://github.com/GHesericsu"><img src="https://avatars.githubusercontent.com/u/60202455?v=4&s=48" width="48" height="48" alt="GHesericsu" title="GHesericsu"/></a> <a href="https://github.com/HeimdallStrategy"><img src="https://avatars.githubusercontent.com/u/223014405?v=4&s=48" width="48" height="48" alt="HeimdallStrategy" title="HeimdallStrategy"/></a> <a href="https://github.com/imfing"><img src="https://avatars.githubusercontent.com/u/5097752?v=4&s=48" width="48" height="48" alt="imfing" title="imfing"/></a> <a href="https://github.com/jalehman"><img src="https://avatars.githubusercontent.com/u/550978?v=4&s=48" width="48" height="48" alt="jalehman" title="jalehman"/></a>
  <a href="https://github.com/jarvis-medmatic"><img src="https://avatars.githubusercontent.com/u/252428873?v=4&s=48" width="48" height="48" alt="jarvis-medmatic" title="jarvis-medmatic"/></a> <a href="https://github.com/kkarimi"><img src="https://avatars.githubusercontent.com/u/875218?v=4&s=48" width="48" height="48" alt="kkarimi" title="kkarimi"/></a> <a href="https://github.com/mahmoudashraf93"><img src="https://avatars.githubusercontent.com/u/9130129?v=4&s=48" width="48" height="48" alt="mahmoudashraf93" title="mahmoudashraf93"/></a> <a href="https://github.com/pkrmf"><img src="https://avatars.githubusercontent.com/u/1714267?v=4&s=48" width="48" height="48" alt="pkrmf" title="pkrmf"/></a> <a href="https://github.com/RandyVentures"><img src="https://avatars.githubusercontent.com/u/149904821?v=4&s=48" width="48" height="48" alt="RandyVentures" title="RandyVentures"/></a> <a href="https://github.com/robhparker"><img src="https://avatars.githubusercontent.com/u/7404740?v=4&s=48" width="48" height="48" alt="robhparker" title="robhparker"/></a> <a href="https://github.com/search?q=Ryan%20Lisse"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Ryan Lisse" title="Ryan Lisse"/></a> <a href="https://github.com/dougvk"><img src="https://avatars.githubusercontent.com/u/401660?v=4&s=48" width="48" height="48" alt="dougvk" title="dougvk"/></a> <a href="https://github.com/erikpr1994"><img src="https://avatars.githubusercontent.com/u/6299331?v=4&s=48" width="48" height="48" alt="erikpr1994" title="erikpr1994"/></a> <a href="https://github.com/fal3"><img src="https://avatars.githubusercontent.com/u/6484295?v=4&s=48" width="48" height="48" alt="fal3" title="fal3"/></a>
  <a href="https://github.com/search?q=Ghost"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Ghost" title="Ghost"/></a> <a href="https://github.com/jonasjancarik"><img src="https://avatars.githubusercontent.com/u/2459191?v=4&s=48" width="48" height="48" alt="jonasjancarik" title="jonasjancarik"/></a> <a href="https://github.com/search?q=Keith%20the%20Silly%20Goose"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Keith the Silly Goose" title="Keith the Silly Goose"/></a> <a href="https://github.com/search?q=L36%20Server"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="L36 Server" title="L36 Server"/></a> <a href="https://github.com/search?q=Marc"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Marc" title="Marc"/></a> <a href="https://github.com/mitschabaude-bot"><img src="https://avatars.githubusercontent.com/u/247582884?v=4&s=48" width="48" height="48" alt="mitschabaude-bot" title="mitschabaude-bot"/></a> <a href="https://github.com/mkbehr"><img src="https://avatars.githubusercontent.com/u/1285?v=4&s=48" width="48" height="48" alt="mkbehr" title="mkbehr"/></a> <a href="https://github.com/neist"><img src="https://avatars.githubusercontent.com/u/1029724?v=4&s=48" width="48" height="48" alt="neist" title="neist"/></a> <a href="https://github.com/sibbl"><img src="https://avatars.githubusercontent.com/u/866535?v=4&s=48" width="48" height="48" alt="sibbl" title="sibbl"/></a> <a href="https://github.com/abhijeet117"><img src="https://avatars.githubusercontent.com/u/192859219?v=4&s=48" width="48" height="48" alt="abhijeet117" title="abhijeet117"/></a>
  <a href="https://github.com/chrisrodz"><img src="https://avatars.githubusercontent.com/u/2967620?v=4&s=48" width="48" height="48" alt="chrisrodz" title="chrisrodz"/></a> <a href="https://github.com/search?q=Friederike%20Seiler"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Friederike Seiler" title="Friederike Seiler"/></a> <a href="https://github.com/gabriel-trigo"><img src="https://avatars.githubusercontent.com/u/38991125?v=4&s=48" width="48" height="48" alt="gabriel-trigo" title="gabriel-trigo"/></a> <a href="https://github.com/Iamadig"><img src="https://avatars.githubusercontent.com/u/102129234?v=4&s=48" width="48" height="48" alt="iamadig" title="iamadig"/></a> <a href="https://github.com/itsjling"><img src="https://avatars.githubusercontent.com/u/2521993?v=4&s=48" width="48" height="48" alt="itsjling" title="itsjling"/></a> <a href="https://github.com/jdrhyne"><img src="https://avatars.githubusercontent.com/u/7828464?v=4&s=48" width="48" height="48" alt="Jonathan D. Rhyne (DJ-D)" title="Jonathan D. Rhyne (DJ-D)"/></a> <a href="https://github.com/search?q=Joshua%20Mitchell"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Joshua Mitchell" title="Joshua Mitchell"/></a> <a href="https://github.com/search?q=Kit"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Kit" title="Kit"/></a> <a href="https://github.com/koala73"><img src="https://avatars.githubusercontent.com/u/996596?v=4&s=48" width="48" height="48" alt="koala73" title="koala73"/></a> <a href="https://github.com/manmal"><img src="https://avatars.githubusercontent.com/u/142797?v=4&s=48" width="48" height="48" alt="manmal" title="manmal"/></a>
  <a href="https://github.com/ogulcancelik"><img src="https://avatars.githubusercontent.com/u/7064011?v=4&s=48" width="48" height="48" alt="ogulcancelik" title="ogulcancelik"/></a> <a href="https://github.com/pasogott"><img src="https://avatars.githubusercontent.com/u/23458152?v=4&s=48" width="48" height="48" alt="pasogott" title="pasogott"/></a> <a href="https://github.com/petradonka"><img src="https://avatars.githubusercontent.com/u/7353770?v=4&s=48" width="48" height="48" alt="petradonka" title="petradonka"/></a> <a href="https://github.com/rubyrunsstuff"><img src="https://avatars.githubusercontent.com/u/246602379?v=4&s=48" width="48" height="48" alt="rubyrunsstuff" title="rubyrunsstuff"/></a> <a href="https://github.com/siddhantjain"><img src="https://avatars.githubusercontent.com/u/4835232?v=4&s=48" width="48" height="48" alt="siddhantjain" title="siddhantjain"/></a> <a href="https://github.com/spiceoogway"><img src="https://avatars.githubusercontent.com/u/105812383?v=4&s=48" width="48" height="48" alt="spiceoogway" title="spiceoogway"/></a> <a href="https://github.com/suminhthanh"><img src="https://avatars.githubusercontent.com/u/2907636?v=4&s=48" width="48" height="48" alt="suminhthanh" title="suminhthanh"/></a> <a href="https://github.com/svkozak"><img src="https://avatars.githubusercontent.com/u/31941359?v=4&s=48" width="48" height="48" alt="svkozak" title="svkozak"/></a> <a href="https://github.com/wes-davis"><img src="https://avatars.githubusercontent.com/u/16506720?v=4&s=48" width="48" height="48" alt="wes-davis" title="wes-davis"/></a> <a href="https://github.com/zats"><img src="https://avatars.githubusercontent.com/u/2688806?v=4&s=48" width="48" height="48" alt="zats" title="zats"/></a>
  <a href="https://github.com/24601"><img src="https://avatars.githubusercontent.com/u/1157207?v=4&s=48" width="48" height="48" alt="24601" title="24601"/></a> <a href="https://github.com/ameno-"><img src="https://avatars.githubusercontent.com/u/2416135?v=4&s=48" width="48" height="48" alt="ameno-" title="ameno-"/></a> <a href="https://github.com/bonald"><img src="https://avatars.githubusercontent.com/u/12394874?v=4&s=48" width="48" height="48" alt="bonald" title="bonald"/></a> <a href="https://github.com/bravostation"><img src="https://avatars.githubusercontent.com/u/257991910?v=4&s=48" width="48" height="48" alt="bravostation" title="bravostation"/></a> <a href="https://github.com/search?q=Chris%20Taylor"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Chris Taylor" title="Chris Taylor"/></a> <a href="https://github.com/dguido"><img src="https://avatars.githubusercontent.com/u/294844?v=4&s=48" width="48" height="48" alt="dguido" title="dguido"/></a> <a href="https://github.com/djangonavarro220"><img src="https://avatars.githubusercontent.com/u/251162586?v=4&s=48" width="48" height="48" alt="Django Navarro" title="Django Navarro"/></a> <a href="https://github.com/evalexpr"><img src="https://avatars.githubusercontent.com/u/23485511?v=4&s=48" width="48" height="48" alt="evalexpr" title="evalexpr"/></a> <a href="https://github.com/henrino3"><img src="https://avatars.githubusercontent.com/u/4260288?v=4&s=48" width="48" height="48" alt="henrino3" title="henrino3"/></a> <a href="https://github.com/humanwritten"><img src="https://avatars.githubusercontent.com/u/206531610?v=4&s=48" width="48" height="48" alt="humanwritten" title="humanwritten"/></a>
  <a href="https://github.com/larlyssa"><img src="https://avatars.githubusercontent.com/u/13128869?v=4&s=48" width="48" height="48" alt="larlyssa" title="larlyssa"/></a> <a href="https://github.com/Lukavyi"><img src="https://avatars.githubusercontent.com/u/1013690?v=4&s=48" width="48" height="48" alt="Lukavyi" title="Lukavyi"/></a> <a href="https://github.com/mitsuhiko"><img src="https://avatars.githubusercontent.com/u/7396?v=4&s=48" width="48" height="48" alt="mitsuhiko" title="mitsuhiko"/></a> <a href="https://github.com/odysseus0"><img src="https://avatars.githubusercontent.com/u/8635094?v=4&s=48" width="48" height="48" alt="odysseus0" title="odysseus0"/></a> <a href="https://github.com/oswalpalash"><img src="https://avatars.githubusercontent.com/u/6431196?v=4&s=48" width="48" height="48" alt="oswalpalash" title="oswalpalash"/></a> <a href="https://github.com/pcty-nextgen-service-account"><img src="https://avatars.githubusercontent.com/u/112553441?v=4&s=48" width="48" height="48" alt="pcty-nextgen-service-account" title="pcty-nextgen-service-account"/></a> <a href="https://github.com/pi0"><img src="https://avatars.githubusercontent.com/u/5158436?v=4&s=48" width="48" height="48" alt="pi0" title="pi0"/></a> <a href="https://github.com/rmorse"><img src="https://avatars.githubusercontent.com/u/853547?v=4&s=48" width="48" height="48" alt="rmorse" title="rmorse"/></a> <a href="https://github.com/search?q=Roopak%20Nijhara"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Roopak Nijhara" title="Roopak Nijhara"/></a> <a href="https://github.com/Syhids"><img src="https://avatars.githubusercontent.com/u/671202?v=4&s=48" width="48" height="48" alt="Syhids" title="Syhids"/></a>
  <a href="https://github.com/search?q=Ubuntu"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Ubuntu" title="Ubuntu"/></a> <a href="https://github.com/search?q=xiaose"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="xiaose" title="xiaose"/></a> <a href="https://github.com/search?q=Aaron%20Konyer"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Aaron Konyer" title="Aaron Konyer"/></a> <a href="https://github.com/aaronveklabs"><img src="https://avatars.githubusercontent.com/u/225997828?v=4&s=48" width="48" height="48" alt="aaronveklabs" title="aaronveklabs"/></a> <a href="https://github.com/andreabadesso"><img src="https://avatars.githubusercontent.com/u/3586068?v=4&s=48" width="48" height="48" alt="andreabadesso" title="andreabadesso"/></a> <a href="https://github.com/search?q=Andrii"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Andrii" title="Andrii"/></a> <a href="https://github.com/cash-echo-bot"><img src="https://avatars.githubusercontent.com/u/252747386?v=4&s=48" width="48" height="48" alt="cash-echo-bot" title="cash-echo-bot"/></a> <a href="https://github.com/search?q=Clawd"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Clawd" title="Clawd"/></a> <a href="https://github.com/search?q=ClawdFx"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="ClawdFx" title="ClawdFx"/></a> <a href="https://github.com/danballance"><img src="https://avatars.githubusercontent.com/u/13839912?v=4&s=48" width="48" height="48" alt="danballance" title="danballance"/></a>
  <a href="https://github.com/EnzeD"><img src="https://avatars.githubusercontent.com/u/9866900?v=4&s=48" width="48" height="48" alt="EnzeD" title="EnzeD"/></a> <a href="https://github.com/erik-agens"><img src="https://avatars.githubusercontent.com/u/80908960?v=4&s=48" width="48" height="48" alt="erik-agens" title="erik-agens"/></a> <a href="https://github.com/Evizero"><img src="https://avatars.githubusercontent.com/u/10854026?v=4&s=48" width="48" height="48" alt="Evizero" title="Evizero"/></a> <a href="https://github.com/fcatuhe"><img src="https://avatars.githubusercontent.com/u/17382215?v=4&s=48" width="48" height="48" alt="fcatuhe" title="fcatuhe"/></a> <a href="https://github.com/itsjaydesu"><img src="https://avatars.githubusercontent.com/u/220390?v=4&s=48" width="48" height="48" alt="itsjaydesu" title="itsjaydesu"/></a> <a href="https://github.com/ivancasco"><img src="https://avatars.githubusercontent.com/u/2452858?v=4&s=48" width="48" height="48" alt="ivancasco" title="ivancasco"/></a> <a href="https://github.com/ivanrvpereira"><img src="https://avatars.githubusercontent.com/u/183991?v=4&s=48" width="48" height="48" alt="ivanrvpereira" title="ivanrvpereira"/></a> <a href="https://github.com/search?q=Jarvis"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jarvis" title="Jarvis"/></a> <a href="https://github.com/jayhickey"><img src="https://avatars.githubusercontent.com/u/1676460?v=4&s=48" width="48" height="48" alt="jayhickey" title="jayhickey"/></a> <a href="https://github.com/jeffersonwarrior"><img src="https://avatars.githubusercontent.com/u/89030989?v=4&s=48" width="48" height="48" alt="jeffersonwarrior" title="jeffersonwarrior"/></a>
  <a href="https://github.com/search?q=jeffersonwarrior"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="jeffersonwarrior" title="jeffersonwarrior"/></a> <a href="https://github.com/jverdi"><img src="https://avatars.githubusercontent.com/u/345050?v=4&s=48" width="48" height="48" alt="jverdi" title="jverdi"/></a> <a href="https://github.com/longmaba"><img src="https://avatars.githubusercontent.com/u/9361500?v=4&s=48" width="48" height="48" alt="longmaba" title="longmaba"/></a> <a href="https://github.com/MarvinCui"><img src="https://avatars.githubusercontent.com/u/130876763?v=4&s=48" width="48" height="48" alt="MarvinCui" title="MarvinCui"/></a> <a href="https://github.com/mjrussell"><img src="https://avatars.githubusercontent.com/u/1641895?v=4&s=48" width="48" height="48" alt="mjrussell" title="mjrussell"/></a> <a href="https://github.com/odnxe"><img src="https://avatars.githubusercontent.com/u/403141?v=4&s=48" width="48" height="48" alt="odnxe" title="odnxe"/></a> <a href="https://github.com/optimikelabs"><img src="https://avatars.githubusercontent.com/u/31423109?v=4&s=48" width="48" height="48" alt="optimikelabs" title="optimikelabs"/></a> <a href="https://github.com/p6l-richard"><img src="https://avatars.githubusercontent.com/u/18185649?v=4&s=48" width="48" height="48" alt="p6l-richard" title="p6l-richard"/></a> <a href="https://github.com/philipp-spiess"><img src="https://avatars.githubusercontent.com/u/458591?v=4&s=48" width="48" height="48" alt="philipp-spiess" title="philipp-spiess"/></a> <a href="https://github.com/search?q=Pocket%20Clawd"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Pocket Clawd" title="Pocket Clawd"/></a>
  <a href="https://github.com/robaxelsen"><img src="https://avatars.githubusercontent.com/u/13132899?v=4&s=48" width="48" height="48" alt="robaxelsen" title="robaxelsen"/></a> <a href="https://github.com/search?q=Sash%20Catanzarite"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Sash Catanzarite" title="Sash Catanzarite"/></a> <a href="https://github.com/Suksham-sharma"><img src="https://avatars.githubusercontent.com/u/94667656?v=4&s=48" width="48" height="48" alt="Suksham-sharma" title="Suksham-sharma"/></a> <a href="https://github.com/T5-AndyML"><img src="https://avatars.githubusercontent.com/u/22801233?v=4&s=48" width="48" height="48" alt="T5-AndyML" title="T5-AndyML"/></a> <a href="https://github.com/tewatia"><img src="https://avatars.githubusercontent.com/u/22875334?v=4&s=48" width="48" height="48" alt="tewatia" title="tewatia"/></a> <a href="https://github.com/thejhinvirtuoso"><img src="https://avatars.githubusercontent.com/u/258521837?v=4&s=48" width="48" height="48" alt="thejhinvirtuoso" title="thejhinvirtuoso"/></a> <a href="https://github.com/travisp"><img src="https://avatars.githubusercontent.com/u/165698?v=4&s=48" width="48" height="48" alt="travisp" title="travisp"/></a> <a href="https://github.com/search?q=VAC"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="VAC" title="VAC"/></a> <a href="https://github.com/search?q=william%20arzt"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="william arzt" title="william arzt"/></a> <a href="https://github.com/zknicker"><img src="https://avatars.githubusercontent.com/u/1164085?v=4&s=48" width="48" height="48" alt="zknicker" title="zknicker"/></a>
  <a href="https://github.com/0oAstro"><img src="https://avatars.githubusercontent.com/u/79555780?v=4&s=48" width="48" height="48" alt="0oAstro" title="0oAstro"/></a> <a href="https://github.com/abhaymundhara"><img src="https://avatars.githubusercontent.com/u/62872231?v=4&s=48" width="48" height="48" alt="abhaymundhara" title="abhaymundhara"/></a> <a href="https://github.com/aduk059"><img src="https://avatars.githubusercontent.com/u/257603478?v=4&s=48" width="48" height="48" alt="aduk059" title="aduk059"/></a> <a href="https://github.com/aldoeliacim"><img src="https://avatars.githubusercontent.com/u/17973757?v=4&s=48" width="48" height="48" alt="aldoeliacim" title="aldoeliacim"/></a> <a href="https://github.com/search?q=alejandro%20maza"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="alejandro maza" title="alejandro maza"/></a> <a href="https://github.com/Alex-Alaniz"><img src="https://avatars.githubusercontent.com/u/88956822?v=4&s=48" width="48" height="48" alt="Alex-Alaniz" title="Alex-Alaniz"/></a> <a href="https://github.com/alexanderatallah"><img src="https://avatars.githubusercontent.com/u/1011391?v=4&s=48" width="48" height="48" alt="alexanderatallah" title="alexanderatallah"/></a> <a href="https://github.com/alexstyl"><img src="https://avatars.githubusercontent.com/u/1665273?v=4&s=48" width="48" height="48" alt="alexstyl" title="alexstyl"/></a> <a href="https://github.com/andrewting19"><img src="https://avatars.githubusercontent.com/u/10536704?v=4&s=48" width="48" height="48" alt="andrewting19" title="andrewting19"/></a> <a href="https://github.com/anpoirier"><img src="https://avatars.githubusercontent.com/u/1245729?v=4&s=48" width="48" height="48" alt="anpoirier" title="anpoirier"/></a>
  <a href="https://github.com/araa47"><img src="https://avatars.githubusercontent.com/u/22760261?v=4&s=48" width="48" height="48" alt="araa47" title="araa47"/></a> <a href="https://github.com/arthyn"><img src="https://avatars.githubusercontent.com/u/5466421?v=4&s=48" width="48" height="48" alt="arthyn" title="arthyn"/></a> <a href="https://github.com/Asleep123"><img src="https://avatars.githubusercontent.com/u/122379135?v=4&s=48" width="48" height="48" alt="Asleep123" title="Asleep123"/></a> <a href="https://github.com/search?q=Ayush%20Ojha"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Ayush Ojha" title="Ayush Ojha"/></a> <a href="https://github.com/Ayush10"><img src="https://avatars.githubusercontent.com/u/7945279?v=4&s=48" width="48" height="48" alt="Ayush10" title="Ayush10"/></a> <a href="https://github.com/bguidolim"><img src="https://avatars.githubusercontent.com/u/987360?v=4&s=48" width="48" height="48" alt="bguidolim" title="bguidolim"/></a> <a href="https://github.com/bolismauro"><img src="https://avatars.githubusercontent.com/u/771999?v=4&s=48" width="48" height="48" alt="bolismauro" title="bolismauro"/></a> <a href="https://github.com/championswimmer"><img src="https://avatars.githubusercontent.com/u/1327050?v=4&s=48" width="48" height="48" alt="championswimmer" title="championswimmer"/></a> <a href="https://github.com/chenyuan99"><img src="https://avatars.githubusercontent.com/u/25518100?v=4&s=48" width="48" height="48" alt="chenyuan99" title="chenyuan99"/></a> <a href="https://github.com/Chloe-VP"><img src="https://avatars.githubusercontent.com/u/257371598?v=4&s=48" width="48" height="48" alt="Chloe-VP" title="Chloe-VP"/></a>
  <a href="https://github.com/search?q=Clawdbot%20Maintainers"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Clawdbot Maintainers" title="Clawdbot Maintainers"/></a> <a href="https://github.com/conhecendoia"><img src="https://avatars.githubusercontent.com/u/82890727?v=4&s=48" width="48" height="48" alt="conhecendoia" title="conhecendoia"/></a> <a href="https://github.com/dasilva333"><img src="https://avatars.githubusercontent.com/u/947827?v=4&s=48" width="48" height="48" alt="dasilva333" title="dasilva333"/></a> <a href="https://github.com/David-Marsh-Photo"><img src="https://avatars.githubusercontent.com/u/228404527?v=4&s=48" width="48" height="48" alt="David-Marsh-Photo" title="David-Marsh-Photo"/></a> <a href="https://github.com/search?q=Developer"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Developer" title="Developer"/></a> <a href="https://github.com/search?q=Dimitrios%20Ploutarchos"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Dimitrios Ploutarchos" title="Dimitrios Ploutarchos"/></a> <a href="https://github.com/search?q=Drake%20Thomsen"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Drake Thomsen" title="Drake Thomsen"/></a> <a href="https://github.com/dylanneve1"><img src="https://avatars.githubusercontent.com/u/31746704?v=4&s=48" width="48" height="48" alt="dylanneve1" title="dylanneve1"/></a> <a href="https://github.com/search?q=Felix%20Krause"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Felix Krause" title="Felix Krause"/></a> <a href="https://github.com/foeken"><img src="https://avatars.githubusercontent.com/u/13864?v=4&s=48" width="48" height="48" alt="foeken" title="foeken"/></a>
  <a href="https://github.com/frankekn"><img src="https://avatars.githubusercontent.com/u/4488090?v=4&s=48" width="48" height="48" alt="frankekn" title="frankekn"/></a> <a href="https://github.com/fredheir"><img src="https://avatars.githubusercontent.com/u/3304869?v=4&s=48" width="48" height="48" alt="fredheir" title="fredheir"/></a> <a href="https://github.com/search?q=ganghyun%20kim"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="ganghyun kim" title="ganghyun kim"/></a> <a href="https://github.com/grrowl"><img src="https://avatars.githubusercontent.com/u/907140?v=4&s=48" width="48" height="48" alt="grrowl" title="grrowl"/></a> <a href="https://github.com/gtsifrikas"><img src="https://avatars.githubusercontent.com/u/8904378?v=4&s=48" width="48" height="48" alt="gtsifrikas" title="gtsifrikas"/></a> <a href="https://github.com/HassanFleyah"><img src="https://avatars.githubusercontent.com/u/228002017?v=4&s=48" width="48" height="48" alt="HassanFleyah" title="HassanFleyah"/></a> <a href="https://github.com/HazAT"><img src="https://avatars.githubusercontent.com/u/363802?v=4&s=48" width="48" height="48" alt="HazAT" title="HazAT"/></a> <a href="https://github.com/hclsys"><img src="https://avatars.githubusercontent.com/u/7755017?v=4&s=48" width="48" height="48" alt="hclsys" title="hclsys"/></a> <a href="https://github.com/hrdwdmrbl"><img src="https://avatars.githubusercontent.com/u/554881?v=4&s=48" width="48" height="48" alt="hrdwdmrbl" title="hrdwdmrbl"/></a> <a href="https://github.com/hugobarauna"><img src="https://avatars.githubusercontent.com/u/2719?v=4&s=48" width="48" height="48" alt="hugobarauna" title="hugobarauna"/></a>
  <a href="https://github.com/iamEvanYT"><img src="https://avatars.githubusercontent.com/u/47493765?v=4&s=48" width="48" height="48" alt="iamEvanYT" title="iamEvanYT"/></a> <a href="https://github.com/search?q=Jamie%20Openshaw"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jamie Openshaw" title="Jamie Openshaw"/></a> <a href="https://github.com/search?q=Jane"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jane" title="Jane"/></a> <a href="https://github.com/search?q=Jarvis%20Deploy"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jarvis Deploy" title="Jarvis Deploy"/></a> <a href="https://github.com/search?q=Jefferson%20Nunn"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Jefferson Nunn" title="Jefferson Nunn"/></a> <a href="https://github.com/jogi47"><img src="https://avatars.githubusercontent.com/u/1710139?v=4&s=48" width="48" height="48" alt="jogi47" title="jogi47"/></a> <a href="https://github.com/kentaro"><img src="https://avatars.githubusercontent.com/u/3458?v=4&s=48" width="48" height="48" alt="kentaro" title="kentaro"/></a> <a href="https://github.com/search?q=Kevin%20Lin"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Kevin Lin" title="Kevin Lin"/></a> <a href="https://github.com/kira-ariaki"><img src="https://avatars.githubusercontent.com/u/257352493?v=4&s=48" width="48" height="48" alt="kira-ariaki" title="kira-ariaki"/></a> <a href="https://github.com/kitze"><img src="https://avatars.githubusercontent.com/u/1160594?v=4&s=48" width="48" height="48" alt="kitze" title="kitze"/></a>
  <a href="https://github.com/Kiwitwitter"><img src="https://avatars.githubusercontent.com/u/25277769?v=4&s=48" width="48" height="48" alt="Kiwitwitter" title="Kiwitwitter"/></a> <a href="https://github.com/levifig"><img src="https://avatars.githubusercontent.com/u/1605?v=4&s=48" width="48" height="48" alt="levifig" title="levifig"/></a> <a href="https://github.com/search?q=Lloyd"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Lloyd" title="Lloyd"/></a> <a href="https://github.com/loganaden"><img src="https://avatars.githubusercontent.com/u/1688420?v=4&s=48" width="48" height="48" alt="loganaden" title="loganaden"/></a> <a href="https://github.com/longjos"><img src="https://avatars.githubusercontent.com/u/740160?v=4&s=48" width="48" height="48" alt="longjos" title="longjos"/></a> <a href="https://github.com/loukotal"><img src="https://avatars.githubusercontent.com/u/18210858?v=4&s=48" width="48" height="48" alt="loukotal" title="loukotal"/></a> <a href="https://github.com/louzhixian"><img src="https://avatars.githubusercontent.com/u/7994361?v=4&s=48" width="48" height="48" alt="louzhixian" title="louzhixian"/></a> <a href="https://github.com/martinpucik"><img src="https://avatars.githubusercontent.com/u/5503097?v=4&s=48" width="48" height="48" alt="martinpucik" title="martinpucik"/></a> <a href="https://github.com/search?q=Matt%20mini"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Matt mini" title="Matt mini"/></a> <a href="https://github.com/mertcicekci0"><img src="https://avatars.githubusercontent.com/u/179321902?v=4&s=48" width="48" height="48" alt="mertcicekci0" title="mertcicekci0"/></a>
  <a href="https://github.com/search?q=Miles"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Miles" title="Miles"/></a> <a href="https://github.com/mrdbstn"><img src="https://avatars.githubusercontent.com/u/58957632?v=4&s=48" width="48" height="48" alt="mrdbstn" title="mrdbstn"/></a> <a href="https://github.com/MSch"><img src="https://avatars.githubusercontent.com/u/7475?v=4&s=48" width="48" height="48" alt="MSch" title="MSch"/></a> <a href="https://github.com/search?q=Mustafa%20Tag%20Eldeen"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Mustafa Tag Eldeen" title="Mustafa Tag Eldeen"/></a> <a href="https://github.com/mylukin"><img src="https://avatars.githubusercontent.com/u/1021019?v=4&s=48" width="48" height="48" alt="mylukin" title="mylukin"/></a> <a href="https://github.com/nathanbosse"><img src="https://avatars.githubusercontent.com/u/4040669?v=4&s=48" width="48" height="48" alt="nathanbosse" title="nathanbosse"/></a> <a href="https://github.com/ndraiman"><img src="https://avatars.githubusercontent.com/u/12609607?v=4&s=48" width="48" height="48" alt="ndraiman" title="ndraiman"/></a> <a href="https://github.com/nexty5870"><img src="https://avatars.githubusercontent.com/u/3869659?v=4&s=48" width="48" height="48" alt="nexty5870" title="nexty5870"/></a> <a href="https://github.com/Noctivoro"><img src="https://avatars.githubusercontent.com/u/183974570?v=4&s=48" width="48" height="48" alt="Noctivoro" title="Noctivoro"/></a> <a href="https://github.com/ozgur-polat"><img src="https://avatars.githubusercontent.com/u/26483942?v=4&s=48" width="48" height="48" alt="ozgur-polat" title="ozgur-polat"/></a>
  <a href="https://github.com/ppamment"><img src="https://avatars.githubusercontent.com/u/2122919?v=4&s=48" width="48" height="48" alt="ppamment" title="ppamment"/></a> <a href="https://github.com/prathamdby"><img src="https://avatars.githubusercontent.com/u/134331217?v=4&s=48" width="48" height="48" alt="prathamdby" title="prathamdby"/></a> <a href="https://github.com/ptn1411"><img src="https://avatars.githubusercontent.com/u/57529765?v=4&s=48" width="48" height="48" alt="ptn1411" title="ptn1411"/></a> <a href="https://github.com/reeltimeapps"><img src="https://avatars.githubusercontent.com/u/637338?v=4&s=48" width="48" height="48" alt="reeltimeapps" title="reeltimeapps"/></a> <a href="https://github.com/RLTCmpe"><img src="https://avatars.githubusercontent.com/u/10762242?v=4&s=48" width="48" height="48" alt="RLTCmpe" title="RLTCmpe"/></a> <a href="https://github.com/search?q=Rony%20Kelner"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Rony Kelner" title="Rony Kelner"/></a> <a href="https://github.com/ryancnelson"><img src="https://avatars.githubusercontent.com/u/347171?v=4&s=48" width="48" height="48" alt="ryancnelson" title="ryancnelson"/></a> <a href="https://github.com/search?q=Samrat%20Jha"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Samrat Jha" title="Samrat Jha"/></a> <a href="https://github.com/senoldogann"><img src="https://avatars.githubusercontent.com/u/45736551?v=4&s=48" width="48" height="48" alt="senoldogann" title="senoldogann"/></a> <a href="https://github.com/Seredeep"><img src="https://avatars.githubusercontent.com/u/22802816?v=4&s=48" width="48" height="48" alt="Seredeep" title="Seredeep"/></a>
  <a href="https://github.com/sergical"><img src="https://avatars.githubusercontent.com/u/3760543?v=4&s=48" width="48" height="48" alt="sergical" title="sergical"/></a> <a href="https://github.com/shiv19"><img src="https://avatars.githubusercontent.com/u/9407019?v=4&s=48" width="48" height="48" alt="shiv19" title="shiv19"/></a> <a href="https://github.com/shiyuanhai"><img src="https://avatars.githubusercontent.com/u/1187370?v=4&s=48" width="48" height="48" alt="shiyuanhai" title="shiyuanhai"/></a> <a href="https://github.com/siraht"><img src="https://avatars.githubusercontent.com/u/73152895?v=4&s=48" width="48" height="48" alt="siraht" title="siraht"/></a> <a href="https://github.com/snopoke"><img src="https://avatars.githubusercontent.com/u/249606?v=4&s=48" width="48" height="48" alt="snopoke" title="snopoke"/></a> <a href="https://github.com/search?q=techboss"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="techboss" title="techboss"/></a> <a href="https://github.com/testingabc321"><img src="https://avatars.githubusercontent.com/u/8577388?v=4&s=48" width="48" height="48" alt="testingabc321" title="testingabc321"/></a> <a href="https://github.com/search?q=The%20Admiral"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="The Admiral" title="The Admiral"/></a> <a href="https://github.com/thesash"><img src="https://avatars.githubusercontent.com/u/1166151?v=4&s=48" width="48" height="48" alt="thesash" title="thesash"/></a> <a href="https://github.com/search?q=Vibe%20Kanban"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Vibe Kanban" title="Vibe Kanban"/></a>
  <a href="https://github.com/voidserf"><img src="https://avatars.githubusercontent.com/u/477673?v=4&s=48" width="48" height="48" alt="voidserf" title="voidserf"/></a> <a href="https://github.com/search?q=Vultr-Clawd%20Admin"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Vultr-Clawd Admin" title="Vultr-Clawd Admin"/></a> <a href="https://github.com/search?q=Wimmie"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Wimmie" title="Wimmie"/></a> <a href="https://github.com/search?q=wolfred"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="wolfred" title="wolfred"/></a> <a href="https://github.com/wstock"><img src="https://avatars.githubusercontent.com/u/1394687?v=4&s=48" width="48" height="48" alt="wstock" title="wstock"/></a> <a href="https://github.com/YangHuang2280"><img src="https://avatars.githubusercontent.com/u/201681634?v=4&s=48" width="48" height="48" alt="YangHuang2280" title="YangHuang2280"/></a> <a href="https://github.com/yazinsai"><img src="https://avatars.githubusercontent.com/u/1846034?v=4&s=48" width="48" height="48" alt="yazinsai" title="yazinsai"/></a> <a href="https://github.com/yevhen"><img src="https://avatars.githubusercontent.com/u/107726?v=4&s=48" width="48" height="48" alt="yevhen" title="yevhen"/></a> <a href="https://github.com/YiWang24"><img src="https://avatars.githubusercontent.com/u/176262341?v=4&s=48" width="48" height="48" alt="YiWang24" title="YiWang24"/></a> <a href="https://github.com/search?q=ymat19"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="ymat19" title="ymat19"/></a>
  <a href="https://github.com/search?q=Zach%20Knickerbocker"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Zach Knickerbocker" title="Zach Knickerbocker"/></a> <a href="https://github.com/zackerthescar"><img src="https://avatars.githubusercontent.com/u/38077284?v=4&s=48" width="48" height="48" alt="zackerthescar" title="zackerthescar"/></a> <a href="https://github.com/0xJonHoldsCrypto"><img src="https://avatars.githubusercontent.com/u/81202085?v=4&s=48" width="48" height="48" alt="0xJonHoldsCrypto" title="0xJonHoldsCrypto"/></a> <a href="https://github.com/aaronn"><img src="https://avatars.githubusercontent.com/u/1653630?v=4&s=48" width="48" height="48" alt="aaronn" title="aaronn"/></a> <a href="https://github.com/Alphonse-arianee"><img src="https://avatars.githubusercontent.com/u/254457365?v=4&s=48" width="48" height="48" alt="Alphonse-arianee" title="Alphonse-arianee"/></a> <a href="https://github.com/atalovesyou"><img src="https://avatars.githubusercontent.com/u/3534502?v=4&s=48" width="48" height="48" alt="atalovesyou" title="atalovesyou"/></a> <a href="https://github.com/search?q=Azade"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Azade" title="Azade"/></a> <a href="https://github.com/carlulsoe"><img src="https://avatars.githubusercontent.com/u/34673973?v=4&s=48" width="48" height="48" alt="carlulsoe" title="carlulsoe"/></a> <a href="https://github.com/search?q=ddyo"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="ddyo" title="ddyo"/></a> <a href="https://github.com/search?q=Erik"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Erik" title="Erik"/></a>
  <a href="https://github.com/latitudeki5223"><img src="https://avatars.githubusercontent.com/u/119656367?v=4&s=48" width="48" height="48" alt="latitudeki5223" title="latitudeki5223"/></a> <a href="https://github.com/search?q=Manuel%20Maly"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Manuel Maly" title="Manuel Maly"/></a> <a href="https://github.com/search?q=Mourad%20Boustani"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Mourad Boustani" title="Mourad Boustani"/></a> <a href="https://github.com/odrobnik"><img src="https://avatars.githubusercontent.com/u/333270?v=4&s=48" width="48" height="48" alt="odrobnik" title="odrobnik"/></a> <a href="https://github.com/pcty-nextgen-ios-builder"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="pcty-nextgen-ios-builder" title="pcty-nextgen-ios-builder"/></a> <a href="https://github.com/search?q=Quentin"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Quentin" title="Quentin"/></a> <a href="https://github.com/search?q=Randy%20Torres"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Randy Torres" title="Randy Torres"/></a> <a href="https://github.com/rhjoh"><img src="https://avatars.githubusercontent.com/u/105699450?v=4&s=48" width="48" height="48" alt="rhjoh" title="rhjoh"/></a> <a href="https://github.com/search?q=Rolf%20Fredheim"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="Rolf Fredheim" title="Rolf Fredheim"/></a> <a href="https://github.com/ronak-guliani"><img src="https://avatars.githubusercontent.com/u/23518228?v=4&s=48" width="48" height="48" alt="ronak-guliani" title="ronak-guliani"/></a>
  <a href="https://github.com/search?q=William%20Stock"><img src="assets/avatar-placeholder.svg" width="48" height="48" alt="William Stock" title="William Stock"/></a> <a href="https://github.com/roerohan"><img src="https://avatars.githubusercontent.com/u/42958812?v=4&s=48" width="48" height="48" alt="roerohan" title="roerohan"/></a>
</p>
