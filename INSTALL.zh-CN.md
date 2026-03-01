# JieZi AI PS 安装指南

本文档提供 JieZi AI PS 项目的详细安装说明，包括多种安装方式供您选择。

## 🎯 目录

- [系统要求](#系统要求)
- [快速安装](#快速安装)
- [手动安装](#手动安装)
- [验证安装](#验证安装)
- [常见问题](#常见问题)

---

## 系统要求

### 最低要求

- **Node.js**: >= 22.12.0 (推荐 LTS 版本)
- **内存**: >= 4GB RAM
- **磁盘空间**: >= 2GB 可用空间
- **操作系统**:
  - Linux (Ubuntu 20.04+, Debian 10+, CentOS 8+)
  - macOS 11.0+ (Big Sur 或更高)
  - Windows 10/11 (PowerShell 5.1+)

### 推荐配置

- **Node.js**: 22.x LTS
- **包管理器**: pnpm 10.x (或 npm 10.x)
- **Git**: 2.x (用于从源代码安装)

---

## 快速安装

### 方式一：一键安装脚本 ⚡ (推荐)

#### Linux / macOS

```bash
# 直接执行
curl -fsSL https://gitee.com/CozyNook/JieZi-ai-PS/raw/localization-zh-CN/install.sh | bash

# 或下载后执行
wget https://gitee.com/CozyNook/JieZi-ai-PS/raw/localization-zh-CN/install.sh
chmod +x install.sh
./install.sh
```

#### Windows (PowerShell)

```powershell
# 直接执行 (以管理员身份运行 PowerShell)
iwr https://gitee.com/CozyNook/JieZi-ai-PS/raw/localization-zh-CN/install.ps1 -UseBasicParsing | iex

# 或下载后执行
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
.\install.ps1
```

**一键安装脚本功能：**
- ✅ 自动检测操作系统和 Node.js 版本
- ✅ 智能选择包管理器 (pnpm/npm)
- ✅ 提供两种安装方式（Gitee/npm）
- ✅ 使用国内镜像加速下载
- ✅ 自动运行配置向导
- ✅ 友好的中文提示

---

### 方式二：从 npm 安装 📦

适合需要快速部署的用户，使用上游稳定版本。

```bash
# 使用 npm
npm install -g openclaw@latest --registry=https://registry.npmmirror.com

# 或使用 pnpm (推荐)
pnpm add -g openclaw@latest --registry=https://registry.npmmirror.com

# 运行配置向导
openclaw onboard --install-daemon
```

---

### 方式三：从 Gitee 安装 🚀 (最新功能)

适合需要最新功能和中文优化的用户。

```bash
# 1. 克隆仓库
git clone -b localization-zh-CN https://gitee.com/CozyNook/JieZi-ai-PS.git
cd JieZi-ai-PS

# 2. 安装依赖 (使用国内镜像加速)
pnpm install --registry=https://registry.npmmirror.com

# 3. 构建 UI
pnpm ui:build

# 4. 构建项目
pnpm build

# 5. 全局安装
pnpm add -g .

# 6. 运行配置向导
openclaw onboard --install-daemon
```

---

## 手动安装

### 前置准备

#### 1. 安装 Node.js

**Linux (Ubuntu/Debian):**
```bash
# 使用 nvm (推荐)
curl -o- https://gitee.com/mirrors/nvm-sh_nvm/raw/master/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

# 或使用 NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**macOS:**
```bash
# 使用 Homebrew
brew install node@22

# 或使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 22
```

**Windows:**
- 访问 https://nodejs.org/zh-cn/
- 下载 22.x LTS 版本安装包
- 运行安装程序，按提示完成安装

#### 2. 安装 pnpm (可选但推荐)

```bash
npm install -g pnpm@latest
```

#### 3. 安装 Git (从源代码安装时需要)

- **Linux**: `sudo apt-get install git`
- **macOS**: `brew install git`
- **Windows**: https://git-scm.com/download/win

### 详细安装步骤

#### 步骤 1: 获取源代码

```bash
# 克隆仓库
git clone -b localization-zh-CN https://gitee.com/CozyNook/JieZi-ai-PS.git
cd JieZi-ai-PS
```

#### 步骤 2: 安装依赖

```bash
# 使用 pnpm (推荐，更快)
pnpm install --registry=https://registry.npmmirror.com

# 或使用 npm
npm install --registry=https://registry.npmmirror.com
```

#### 步骤 3: 构建 UI

```bash
pnpm ui:build
# 或
npm run ui:build
```

#### 步骤 4: 构建项目

```bash
pnpm build
# 或
npm run build
```

#### 步骤 5: 全局安装

```bash
# 使用 pnpm
pnpm add -g .

# 使用 npm
npm install -g .

# 或链接到本地（开发模式）
pnpm link --global
# 或
npm link
```

#### 步骤 6: 运行配置向导

```bash
openclaw onboard --install-daemon
```

---

## 验证安装

### 检查版本

```bash
openclaw --version
```

应该显示类似：`2026.2.23` 的版本号。

### 检查命令可用性

```bash
openclaw --help
```

应该显示完整的命令帮助信息。

### 启动网关测试

```bash
# 启动网关 (前台运行)
openclaw gateway --port 18789 --verbose

# 应该看到类似输出：
# 12:00:00 [gateway] Gateway listening on http://127.0.0.1:18789
```

### 测试助手

打开新终端，运行：

```bash
openclaw agent --message "你好" --thinking high
```

应该收到助手的回复。

---

## 常见问题

### Q1: Node.js 版本过低怎么办？

**错误信息:**
```
Error: Node.js version too low (current: v18.x, required: >= 22.12.0)
```

**解决方案:**
```bash
# 使用 nvm 升级
nvm install 22
nvm use 22
nvm alias default 22
```

### Q2: 安装依赖时网络超时

**错误信息:**
```
npm ERR! network timeout
```

**解决方案:**
```bash
# 使用国内镜像
npm config set registry https://registry.npmmirror.com
pnpm config set registry https://registry.npmmirror.com

# 增加超时时间
npm config set timeout 600000
```

### Q3: Windows 构建失败

**错误信息:**
```
'bash' is not recognized as an internal or external command
```

**解决方案:**
- 确保使用本项目版本（已适配 Windows）
- 不要使用上游的 `bash scripts/bundle-a2ui.sh`
- 本项目使用 `node scripts/bundle-a2ui.mjs`

### Q4: 权限错误 (Linux/macOS)

**错误信息:**
```
Error: EACCES: permission denied
```

**解决方案:**
```bash
# 不要使用 sudo npm install -g
# 配置 npm 全局目录到用户目录
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Q5: pnpm 构建失败

**错误信息:**
```
ERR_PNPM_FETCH_* errors
```

**解决方案:**
```bash
# 清理 pnpm 缓存
pnpm store prune
rm -rf node_modules
rm pnpm-lock.yaml

# 重新安装
pnpm install --registry=https://registry.npmmirror.com
```

### Q6: 配置向导无法运行

**错误信息:**
```
Command not found: openclaw
```

**解决方案:**
```bash
# 检查全局安装路径
npm config get prefix
pnpm config get global-bin-dir

# 添加到 PATH
# Linux/macOS (~/.bashrc 或 ~/.zshrc)
export PATH="$PATH:$(npm config get prefix)/bin"

# Windows (PowerShell)
$env:Path += ";$(npm config get prefix)"
```

---

## 卸载

如果需要卸载 JieZi AI PS：

```bash
# 使用 npm 卸载
npm uninstall -g openclaw

# 使用 pnpm 卸载
pnpm remove -g openclaw

# 删除配置目录 (可选)
rm -rf ~/.openclaw
```

---

## 更多资源

- **GitHub**: https://github.com/Get-windy/JieZi-ai-PS
- **Gitee**: https://gitee.com/CozyNook/JieZi-ai-PS
- **上游文档**: https://docs.openclaw.ai
- **问题反馈**: https://gitee.com/CozyNook/JieZi-ai-PS/issues

---

## 开发者安装

如果您是开发者，想要参与项目开发：

```bash
# 克隆仓库
git clone -b localization-zh-CN https://gitee.com/CozyNook/JieZi-ai-PS.git
cd JieZi-ai-PS

# 安装依赖
pnpm install --registry=https://registry.npmmirror.com

# 构建 UI
pnpm ui:build

# 开发模式运行 (自动重载)
pnpm dev

# 或启动网关监听模式
pnpm gateway:watch
```

更多开发相关信息，请参考 [CONTRIBUTING.md](CONTRIBUTING.md)。
