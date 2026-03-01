# JieZi AI PS 安装脚本 (Windows PowerShell)
# 基于 OpenClaw 项目，针对中国用户优化

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Green
Write-Host "    JieZi AI PS 智能助手安装向导" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# 检查 PowerShell 版本
$PSVersion = $PSVersionTable.PSVersion.Major
if ($PSVersion -lt 5) {
    Write-Host "错误: PowerShell 版本过低 (当前: $PSVersion, 需要: >= 5)" -ForegroundColor Red
    exit 1
}

# 检查 Node.js
function Test-NodeVersion {
    try {
        $nodeVersion = (node -v).Trim('v')
        Write-Host "Node.js 版本: v$nodeVersion" -ForegroundColor Green
        
        $required = [version]"22.12.0"
        $current = [version]$nodeVersion
        
        if ($current -lt $required) {
            Write-Host "错误: Node.js 版本过低 (需要: >= v22.12.0)" -ForegroundColor Red
            Write-Host "请访问 https://nodejs.org 下载最新版本" -ForegroundColor Yellow
            exit 1
        }
    }
    catch {
        Write-Host "错误: 未检测到 Node.js" -ForegroundColor Red
        Write-Host "请先安装 Node.js >= 22.12.0" -ForegroundColor Yellow
        Write-Host "下载地址: https://nodejs.org/zh-cn/" -ForegroundColor Yellow
        exit 1
    }
}

# 检查包管理器
function Get-PackageManager {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Write-Host "使用包管理器: pnpm" -ForegroundColor Green
        return "pnpm"
    }
    elseif (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Host "使用包管理器: npm" -ForegroundColor Green
        return "npm"
    }
    else {
        Write-Host "错误: 未检测到包管理器 (npm/pnpm)" -ForegroundColor Red
        exit 1
    }
}

# 检查 Git
function Test-Git {
    if (!(Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host "警告: 未检测到 Git" -ForegroundColor Yellow
        Write-Host "如果选择从 Gitee 安装，需要先安装 Git" -ForegroundColor Yellow
        Write-Host "下载地址: https://git-scm.com/download/win" -ForegroundColor Yellow
        return $false
    }
    return $true
}

# 选择安装方式
function Select-InstallMethod {
    $hasGit = Test-Git
    
    Write-Host ""
    Write-Host "请选择安装方式:"
    if ($hasGit) {
        Write-Host "  1) 从 Gitee 直接安装 (推荐，最新版本)" -ForegroundColor Cyan
    } else {
        Write-Host "  1) 从 Gitee 直接安装 (需要 Git)" -ForegroundColor DarkGray
    }
    Write-Host "  2) 从 npm 安装 openclaw (上游版本)" -ForegroundColor Cyan
    Write-Host ""
    
    $choice = Read-Host "请输入选项 [1-2]"
    
    switch ($choice) {
        "1" {
            if (!$hasGit) {
                Write-Host "错误: 需要先安装 Git" -ForegroundColor Red
                exit 1
            }
            return "gitee"
        }
        "2" { return "npm" }
        default {
            Write-Host "无效选项，退出安装" -ForegroundColor Red
            exit 1
        }
    }
}

# 从 Gitee 安装
function Install-FromGitee {
    param($PackageManager)
    
    Write-Host ""
    Write-Host "正在从 Gitee 克隆仓库..." -ForegroundColor Yellow
    
    $tempDir = Join-Path $env:TEMP "jiezi-ps-install-$(Get-Random)"
    $repoUrl = "https://gitee.com/CozyNook/JieZi-ai-PS.git"
    $branch = "localization-zh-CN"
    
    Write-Host "克隆地址: $repoUrl"
    Write-Host "分支: $branch"
    
    try {
        git clone -b $branch --depth 1 $repoUrl $tempDir
        if ($LASTEXITCODE -ne 0) { throw "Git 克隆失败" }
        
        Push-Location $tempDir
        
        Write-Host "正在安装依赖..." -ForegroundColor Yellow
        if ($PackageManager -eq "pnpm") {
            pnpm install --registry=https://registry.npmmirror.com
        } else {
            npm install --registry=https://registry.npmmirror.com
        }
        if ($LASTEXITCODE -ne 0) { throw "依赖安装失败" }
        
        Write-Host "正在构建 UI..." -ForegroundColor Yellow
        & $PackageManager ui:build
        if ($LASTEXITCODE -ne 0) { throw "UI 构建失败" }
        
        Write-Host "正在构建项目..." -ForegroundColor Yellow
        & $PackageManager build
        if ($LASTEXITCODE -ne 0) { throw "项目构建失败" }
        
        Write-Host "正在全局安装..." -ForegroundColor Yellow
        if ($PackageManager -eq "pnpm") {
            pnpm add -g $tempDir
        } else {
            npm install -g $tempDir
        }
        if ($LASTEXITCODE -ne 0) { throw "全局安装失败" }
        
        Pop-Location
        
        Write-Host "✓ 从 Gitee 安装完成" -ForegroundColor Green
        
        # 清理临时目录
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    }
    catch {
        Write-Host "安装失败: $_" -ForegroundColor Red
        Pop-Location -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
        exit 1
    }
}

# 从 npm 安装
function Install-FromNpm {
    param($PackageManager)
    
    Write-Host ""
    Write-Host "正在从 npm 安装 openclaw..." -ForegroundColor Yellow
    
    try {
        if ($PackageManager -eq "pnpm") {
            pnpm add -g openclaw@latest --registry=https://registry.npmmirror.com
        } else {
            npm install -g openclaw@latest --registry=https://registry.npmmirror.com
        }
        
        if ($LASTEXITCODE -ne 0) { throw "npm 安装失败" }
        
        Write-Host "✓ 从 npm 安装完成" -ForegroundColor Green
    }
    catch {
        Write-Host "安装失败: $_" -ForegroundColor Red
        exit 1
    }
}

# 运行配置向导
function Start-Onboarding {
    Write-Host ""
    $runWizard = Read-Host "是否运行配置向导? (推荐首次安装运行) [Y/n]"
    
    if ($runWizard -eq "" -or $runWizard -match "^[Yy]$") {
        Write-Host ""
        Write-Host "启动配置向导..." -ForegroundColor Green
        openclaw onboard --install-daemon
    }
    else {
        Write-Host "跳过配置向导" -ForegroundColor Yellow
        Write-Host "您可以稍后运行: openclaw onboard" -ForegroundColor Green
    }
}

# 显示后续步骤
function Show-NextSteps {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "     安装完成！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "后续步骤:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. 如果未运行配置向导，请执行:" -ForegroundColor White
    Write-Host "   openclaw onboard --install-daemon" -ForegroundColor Green
    Write-Host ""
    Write-Host "2. 启动网关:" -ForegroundColor White
    Write-Host "   openclaw gateway --port 18789 --verbose" -ForegroundColor Green
    Write-Host ""
    Write-Host "3. 测试助手:" -ForegroundColor White
    Write-Host "   openclaw agent --message `"你好`" --thinking high" -ForegroundColor Green
    Write-Host ""
    Write-Host "4. 发送消息 (如果配置了频道):" -ForegroundColor White
    Write-Host "   openclaw message send --to <目标> --message `"测试消息`"" -ForegroundColor Green
    Write-Host ""
    Write-Host "5. 查看帮助:" -ForegroundColor White
    Write-Host "   openclaw --help" -ForegroundColor Green
    Write-Host ""
    Write-Host "更多文档:" -ForegroundColor Cyan
    Write-Host "  - GitHub: https://github.com/Get-windy/JieZi-ai-PS"
    Write-Host "  - Gitee:  https://gitee.com/CozyNook/JieZi-ai-PS"
    Write-Host "  - 上游文档: https://docs.openclaw.ai"
    Write-Host ""
}

# 主流程
function Main {
    Test-NodeVersion
    $pkgManager = Get-PackageManager
    $method = Select-InstallMethod
    
    if ($method -eq "gitee") {
        Install-FromGitee -PackageManager $pkgManager
    }
    else {
        Install-FromNpm -PackageManager $pkgManager
    }
    
    Start-Onboarding
    Show-NextSteps
}

# 执行
try {
    Main
}
catch {
    Write-Host ""
    Write-Host "安装过程出现错误: $_" -ForegroundColor Red
    Write-Host "请检查错误信息并重试" -ForegroundColor Yellow
    exit 1
}
