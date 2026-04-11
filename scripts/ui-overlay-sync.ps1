#!/usr/bin/env pwsh
# UI Overlay 层同步检查工具
# 用途：定期对比 upstream/ui/src/ui 与 ui/src/ui，生成新增/修改文件清单
#
# ============================================================
# 标准化合入流程（每次上游有重大更新后执行）
# ============================================================
#
# 步骤一：更新上游代码
#   git -C upstream pull          ← 拉取上游最新代码
#
# 步骤二：评估影响范围
#   .\scripts\ui-overlay-sync.ps1 -ShowNew       ← 查看上游新增文件（回退自动可用）
#   .\scripts\ui-overlay-sync.ps1 -ShowDiff      ← 查看本地覆盖文件的上游改进
#
# 步骤三：选择性合入
#   对 -ShowDiff 清单中的文件：
#     - 如果上游有功能增强：手动 cherry-pick 改进到本地覆盖文件
#     - 如果上游改动和本地无关：可以跳过
#   对 -ShowNew 清单中的文件：
#     - 文件已通过回退机制自动生效，无需操作
#     - 如需本地定制：拷贝到 ui/src/ui/ 并修改
#
# 步骤四：验证
#   cd ui && npx vitest run     ← 运行全量测试（应全部通过）
#   IDE 诊断検查               ← 确认无编译错误
#
# 步骤五：提交
#   git add -p && git commit -m "chore: sync upstream UI improvements"
#
# ============================================================
# 代码分层架构说明
# ============================================================
#
# 本地覆盖文件分两类：
#
#   A.《上游扩展版》：需定期跟踪上游改进
#      示例：views/agents.ts、app-render.ts、navigation.ts、app.ts
#      识别：文件在 -ShowDiff 清单中且本地比上游大
#      操作：每次上游更新后对比 diff、cherry-pick 有用改进
#
#   B.《本地独有文件》：无需跟踪上游
#      示例：views/projects.ts、views/organization-management.ts
#            views/permissions-management.ts、controllers/phase5.ts
#      识别：文件仅在本地存在，不在 -ShowDiff 清单中
#      操作：自由维护，不受上游影响
#
# ============================================================
#
# 用法：
#   .\scripts\ui-overlay-sync.ps1                   # 显示摘要
#   .\scripts\ui-overlay-sync.ps1 -ShowNew           # 显示上游新增（本地未覆盖，回退可用）
#   .\scripts\ui-overlay-sync.ps1 -ShowDiff          # 显示本地已覆盖且与上游不同的文件
#   .\scripts\ui-overlay-sync.ps1 -ShowNew -ShowDiff # 显示全部差异

param(
    [switch]$ShowNew,
    [switch]$ShowDiff,
    [switch]$ShowSame
)

$ROOT = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$LOCAL_UI = Join-Path $ROOT "ui\src\ui"
$UPSTREAM_UI = Join-Path $ROOT "upstream\ui\src\ui"

if (-not (Test-Path $LOCAL_UI)) {
    Write-Host "错误：本地 UI 目录不存在：$LOCAL_UI" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $UPSTREAM_UI)) {
    Write-Host "错误：上游 UI 目录不存在：$UPSTREAM_UI" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "UI Overlay 层同步检查" -ForegroundColor Cyan
Write-Host "  本地: $LOCAL_UI" -ForegroundColor DarkCyan
Write-Host "  上游: $UPSTREAM_UI" -ForegroundColor DarkCyan
Write-Host "========================================" -ForegroundColor Cyan

$totalOnlyUpstream = 0
$totalOnlyLocal = 0
$totalSame = 0
$totalDiff = 0

$newFiles = @()
$diffFiles = @()

# 检查上游新增的文件（本地未覆盖，通过回退机制可用）
$upFiles = Get-ChildItem -Path $UPSTREAM_UI -Recurse -File -Filter "*.ts"
foreach ($upFile in $upFiles) {
    $rel = $upFile.FullName.Replace($UPSTREAM_UI + "\", "")
    $localFile = Join-Path $LOCAL_UI $rel
    if (-not (Test-Path $localFile)) {
        $totalOnlyUpstream++
        $newFiles += [PSCustomObject]@{
            File = $rel
            Size = [math]::Round($upFile.Length / 1KB, 1)
            Type = "上游新增(回退可用)"
        }
    }
}

# 检查本地覆盖的文件
$localFiles = Get-ChildItem -Path $LOCAL_UI -Recurse -File -Filter "*.ts"
foreach ($file in $localFiles) {
    $rel = $file.FullName.Replace($LOCAL_UI + "\", "")
    $upFile = Join-Path $UPSTREAM_UI $rel

    if (Test-Path $upFile) {
        $localContent = Get-Content $file.FullName -Raw
        $upContent = Get-Content $upFile -Raw
        $localKB = [math]::Round($file.Length / 1KB, 1)
        $upKB = [math]::Round((Get-Item $upFile).Length / 1KB, 1)

        if ($localContent -eq $upContent) {
            $totalSame++
        } else {
            $totalDiff++
            $diffFiles += [PSCustomObject]@{
                File = $rel
                LocalKB = $localKB
                UpstreamKB = $upKB
                SizeDiff = [math]::Round(($localKB - $upKB), 1)
                Type = "本地已覆盖(与上游不同)"
            }
        }
    } else {
        $totalOnlyLocal++
    }
}

# 输出摘要
Write-Host ""
Write-Host "📊 总体统计" -ForegroundColor Yellow
Write-Host "  上游新增(回退可用，本地未覆盖): $totalOnlyUpstream" -ForegroundColor Blue
Write-Host "  本地独有(上游无对应文件):       $totalOnlyLocal" -ForegroundColor Green
Write-Host "  本地覆盖(与上游相同):           $totalSame" -ForegroundColor Gray
Write-Host "  本地覆盖(与上游不同，需关注):   $totalDiff" -ForegroundColor Red

if ($ShowNew -and $newFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "⭐ 上游新增文件 (本地未覆盖，通过回退机制自动可用)" -ForegroundColor Blue
    Write-Host "   如需自定义可创建本地覆盖文件，否则上游版本直接生效" -ForegroundColor DarkBlue
    $newFiles | Sort-Object File | ForEach-Object {
        Write-Host "  + $($_.File) ($($_.Size)KB)" -ForegroundColor Blue
    }
}

if ($ShowDiff -and $diffFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠ 本地覆盖文件 (与上游版本不同，需要定期检查合入上游改进)" -ForegroundColor Red
    $diffFiles | Sort-Object { [math]::Abs($_.SizeDiff) } -Descending | ForEach-Object {
        $arrow = if ($_.SizeDiff -gt 0) { "↑$($_.SizeDiff)KB(本地更大)" } else { "↓$([math]::Abs($_.SizeDiff))KB(上游更大)" }
        Write-Host "  ~ $($_.File) [本地$($_.LocalKB)KB vs 上游$($_.UpstreamKB)KB $arrow]" -ForegroundColor DarkYellow
    }
}

if ($ShowSame) {
    Write-Host ""
    Write-Host "✓ 与上游相同的本地覆盖文件 (可考虑删除，改用回退)" -ForegroundColor Gray
    $localFiles | ForEach-Object {
        $rel = $_.FullName.Replace($LOCAL_UI + "\", "")
        $upFile = Join-Path $UPSTREAM_UI $rel
        if ((Test-Path $upFile)) {
            $lc = Get-Content $_.FullName -Raw
            $uc = Get-Content $upFile -Raw
            if ($lc -eq $uc) {
                Write-Host "  = $rel" -ForegroundColor Gray
            }
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "提示：运行 -ShowNew -ShowDiff 查看详细差异清单" -ForegroundColor Gray
Write-Host "建议定期运行此脚本（每次上游更新后）检查需要合入的改进" -ForegroundColor Gray
