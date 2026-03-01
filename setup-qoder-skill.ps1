# Qoder Skill 快速集成脚本
# 用途：将 ClawHub 项目中的 Qoder Skill 链接到 JieZi-ai-PS

$ErrorActionPreference = "Stop"

$clawHubSkillPath = "I:\JieZI\JieZI-clawhub\skills\qoder-coding"
$jiezi AISkillsDir = "I:\JieZI\JieZi-ai-PS\skills"
$targetLink = Join-Path $jieziAISkillsDir "qoder-coding"

Write-Host "=== Qoder Skill 集成脚本 ===" -ForegroundColor Cyan
Write-Host ""

# 检查源路径
if (-not (Test-Path $clawHubSkillPath)) {
    Write-Host "❌ 错误: 源路径不存在" -ForegroundColor Red
    Write-Host "   路径: $clawHubSkillPath" -ForegroundColor Yellow
    exit 1
}

# 检查 SKILL.md
$skillMd = Join-Path $clawHubSkillPath "SKILL.md"
if (-not (Test-Path $skillMd)) {
    Write-Host "❌ 错误: SKILL.md 文件不存在" -ForegroundColor Red
    Write-Host "   路径: $skillMd" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 找到 Qoder Skill 源文件" -ForegroundColor Green
Write-Host "   路径: $clawHubSkillPath" -ForegroundColor Gray
Write-Host ""

# 检查目标目录
if (-not (Test-Path $jieziAISkillsDir)) {
    Write-Host "⚠️  警告: skills 目录不存在，正在创建..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $jieziAISkillsDir -Force | Out-Null
    Write-Host "✅ 已创建 skills 目录" -ForegroundColor Green
}

# 检查是否已存在
if (Test-Path $targetLink) {
    Write-Host "⚠️  目标位置已存在，请选择操作:" -ForegroundColor Yellow
    Write-Host "   [1] 删除并重新创建符号链接"
    Write-Host "   [2] 删除并复制文件"
    Write-Host "   [3] 跳过（退出）"
    $choice = Read-Host "请输入选择 (1/2/3)"
    
    if ($choice -eq "3") {
        Write-Host "已取消" -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host "正在删除现有文件/链接..." -ForegroundColor Yellow
    Remove-Item $targetLink -Recurse -Force
    Write-Host "✅ 已删除" -ForegroundColor Green
}

Write-Host ""
Write-Host "请选择集成方式:" -ForegroundColor Cyan
Write-Host "   [1] 创建符号链接 (推荐，需要管理员权限)" -ForegroundColor Green
Write-Host "   [2] 复制文件"
Write-Host ""
$method = Read-Host "请输入选择 (1/2)"

if ($method -eq "1") {
    # 检查管理员权限
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    
    if (-not $isAdmin) {
        Write-Host "❌ 错误: 创建符号链接需要管理员权限" -ForegroundColor Red
        Write-Host "   请以管理员身份运行 PowerShell" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "提示: 右键点击 PowerShell 图标 → '以管理员身份运行'" -ForegroundColor Gray
        exit 1
    }
    
    Write-Host "正在创建符号链接..." -ForegroundColor Cyan
    try {
        New-Item -ItemType SymbolicLink -Path $targetLink -Target $clawHubSkillPath -Force | Out-Null
        Write-Host "✅ 符号链接创建成功!" -ForegroundColor Green
        Write-Host "   源: $clawHubSkillPath" -ForegroundColor Gray
        Write-Host "   目标: $targetLink" -ForegroundColor Gray
        Write-Host ""
        Write-Host "💡 提示: 修改源文件会自动同步到 JieZi-ai-PS" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ 创建符号链接失败: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} elseif ($method -eq "2") {
    Write-Host "正在复制文件..." -ForegroundColor Cyan
    try {
        Copy-Item -Path $clawHubSkillPath -Destination $targetLink -Recurse -Force
        Write-Host "✅ 文件复制成功!" -ForegroundColor Green
        Write-Host "   目标: $targetLink" -ForegroundColor Gray
        Write-Host ""
        Write-Host "⚠️  注意: 需要手动同步更新" -ForegroundColor Yellow
    } catch {
        Write-Host "❌ 复制文件失败: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "❌ 无效选择" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== 验证 ===" -ForegroundColor Cyan
if (Test-Path (Join-Path $targetLink "SKILL.md")) {
    Write-Host "✅ SKILL.md 文件存在" -ForegroundColor Green
    
    $fileSize = (Get-Item (Join-Path $targetLink "SKILL.md")).Length
    Write-Host "   文件大小: $([math]::Round($fileSize / 1KB, 2)) KB" -ForegroundColor Gray
    
    if ($fileSize -gt 256KB) {
        Write-Host "   ⚠️  警告: 文件过大，可能不被加载（限制: 256 KB）" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ SKILL.md 文件不存在" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== 下一步 ===" -ForegroundColor Cyan
Write-Host "1. 配置 CLI Backend（见 SKILL.md）" -ForegroundColor White
Write-Host "   编辑: ~/.openclaw/openclaw.json" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 验证 Skill 加载" -ForegroundColor White
Write-Host "   openclaw skills list" -ForegroundColor Gray
Write-Host ""
Write-Host "3. 测试 Qoder Backend" -ForegroundColor White
Write-Host "   openclaw agent --provider qoder-cli `"What is 2+2?`"" -ForegroundColor Gray
Write-Host ""
Write-Host "完整文档: I:\JieZI\JieZi-ai-PS\QODER_SKILL_INTEGRATION_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ 集成完成!" -ForegroundColor Green
