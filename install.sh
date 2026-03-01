#!/bin/bash
# JieZi AI PS 安装脚本
# 基于 OpenClaw 项目，针对中国用户优化

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}    JieZi AI PS 智能助手安装向导${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检测操作系统
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        echo -e "${YELLOW}检测到 Windows 系统${NC}"
        echo -e "${YELLOW}建议使用 WSL2 (Windows Subsystem for Linux) 运行此脚本${NC}"
        echo -e "请参考: https://docs.microsoft.com/zh-cn/windows/wsl/install"
        exit 1
    else
        echo -e "${RED}不支持的操作系统: $OSTYPE${NC}"
        exit 1
    fi
    echo -e "检测到操作系统: ${GREEN}$OS${NC}"
}

# 检查 Node.js 版本
check_node() {
    if ! command -v node &> /dev/null; then
        echo -e "${RED}错误: 未检测到 Node.js${NC}"
        echo "请先安装 Node.js >= 22.12.0"
        echo "推荐使用 nvm 安装:"
        echo "  curl -o- https://gitee.com/mirrors/nvm-sh_nvm/raw/master/install.sh | bash"
        echo "  nvm install 22"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    REQUIRED_VERSION="22.12.0"
    
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
        echo -e "${RED}错误: Node.js 版本过低 (当前: v$NODE_VERSION, 需要: >= v$REQUIRED_VERSION)${NC}"
        echo "请升级 Node.js 到 v22.12.0 或更高版本"
        exit 1
    fi
    
    echo -e "Node.js 版本: ${GREEN}v$NODE_VERSION${NC} ✓"
}

# 检查包管理器
detect_package_manager() {
    if command -v pnpm &> /dev/null; then
        PKG_MANAGER="pnpm"
        INSTALL_CMD="pnpm add -g"
    elif command -v npm &> /dev/null; then
        PKG_MANAGER="npm"
        INSTALL_CMD="npm install -g"
    elif command -v yarn &> /dev/null; then
        PKG_MANAGER="yarn"
        INSTALL_CMD="yarn global add"
    else
        echo -e "${RED}错误: 未检测到包管理器 (npm/pnpm/yarn)${NC}"
        exit 1
    fi
    echo -e "使用包管理器: ${GREEN}$PKG_MANAGER${NC}"
}

# 选择安装方式
select_install_method() {
    echo ""
    echo "请选择安装方式:"
    echo "  1) 从 Gitee 直接安装 (推荐，最新版本)"
    echo "  2) 从 npm 安装 openclaw (上游版本)"
    echo ""
    read -p "请输入选项 [1-2]: " choice
    
    case $choice in
        1)
            INSTALL_METHOD="gitee"
            echo -e "${GREEN}选择: 从 Gitee 安装${NC}"
            ;;
        2)
            INSTALL_METHOD="npm"
            echo -e "${GREEN}选择: 从 npm 安装${NC}"
            ;;
        *)
            echo -e "${RED}无效选项，退出安装${NC}"
            exit 1
            ;;
    esac
}

# 从 Gitee 安装
install_from_gitee() {
    echo ""
    echo -e "${YELLOW}正在从 Gitee 克隆仓库...${NC}"
    
    TEMP_DIR=$(mktemp -d)
    REPO_URL="https://gitee.com/CozyNook/JieZi-ai-PS.git"
    BRANCH="${BRANCH:-localization-zh-CN}"
    
    echo "克隆地址: $REPO_URL"
    echo "分支: $BRANCH"
    
    git clone -b "$BRANCH" --depth 1 "$REPO_URL" "$TEMP_DIR" || {
        echo -e "${RED}克隆失败，请检查网络连接${NC}"
        exit 1
    }
    
    cd "$TEMP_DIR"
    
    echo -e "${YELLOW}正在安装依赖...${NC}"
    if [ "$PKG_MANAGER" = "pnpm" ]; then
        pnpm install --registry=https://registry.npmmirror.com
    else
        npm install --registry=https://registry.npmmirror.com
    fi
    
    echo -e "${YELLOW}正在构建 UI...${NC}"
    $PKG_MANAGER ui:build
    
    echo -e "${YELLOW}正在构建项目...${NC}"
    $PKG_MANAGER build
    
    echo -e "${YELLOW}正在全局安装...${NC}"
    $INSTALL_CMD "$TEMP_DIR"
    
    echo -e "${GREEN}✓ 从 Gitee 安装完成${NC}"
    
    # 清理临时目录
    cd - > /dev/null
    rm -rf "$TEMP_DIR"
}

# 从 npm 安装
install_from_npm() {
    echo ""
    echo -e "${YELLOW}正在从 npm 安装 openclaw...${NC}"
    
    # 使用国内镜像加速
    if [ "$PKG_MANAGER" = "npm" ]; then
        npm install -g openclaw@latest --registry=https://registry.npmmirror.com
    elif [ "$PKG_MANAGER" = "pnpm" ]; then
        pnpm add -g openclaw@latest --registry=https://registry.npmmirror.com
    else
        yarn global add openclaw@latest --registry=https://registry.npmmirror.com
    fi
    
    echo -e "${GREEN}✓ 从 npm 安装完成${NC}"
}

# 运行安装向导
run_onboarding() {
    echo ""
    echo -e "${YELLOW}是否运行配置向导? (推荐首次安装运行) [Y/n]${NC}"
    read -p "> " run_wizard
    
    if [[ "$run_wizard" =~ ^[Yy]$ ]] || [[ -z "$run_wizard" ]]; then
        echo ""
        echo -e "${GREEN}启动配置向导...${NC}"
        openclaw onboard --install-daemon
    else
        echo -e "${YELLOW}跳过配置向导${NC}"
        echo "您可以稍后运行: ${GREEN}openclaw onboard${NC}"
    fi
}

# 显示后续步骤
show_next_steps() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}     安装完成！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "后续步骤:"
    echo ""
    echo "1. 如果未运行配置向导，请执行:"
    echo -e "   ${GREEN}openclaw onboard --install-daemon${NC}"
    echo ""
    echo "2. 启动网关:"
    echo -e "   ${GREEN}openclaw gateway --port 18789 --verbose${NC}"
    echo ""
    echo "3. 测试助手:"
    echo -e "   ${GREEN}openclaw agent --message \"你好\" --thinking high${NC}"
    echo ""
    echo "4. 发送消息 (如果配置了频道):"
    echo -e "   ${GREEN}openclaw message send --to <目标> --message \"测试消息\"${NC}"
    echo ""
    echo "5. 查看帮助:"
    echo -e "   ${GREEN}openclaw --help${NC}"
    echo ""
    echo "更多文档:"
    echo "  - GitHub: https://github.com/Get-windy/JieZi-ai-PS"
    echo "  - Gitee:  https://gitee.com/CozyNook/JieZi-ai-PS"
    echo "  - 上游文档: https://docs.openclaw.ai"
    echo ""
}

# 主流程
main() {
    detect_os
    check_node
    detect_package_manager
    select_install_method
    
    if [ "$INSTALL_METHOD" = "gitee" ]; then
        install_from_gitee
    else
        install_from_npm
    fi
    
    run_onboarding
    show_next_steps
}

# 执行主流程
main "$@"
