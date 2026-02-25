#!/usr/bin/env pwsh
# exec-physical-separation.ps1 - 执行物理分离：删除与 upstream 相同的文件

Set-Location "I:\JieZI\JieZi-ai-PS"

# ===== 第一部分：删除 src/ 中与 upstream 相同的文件 =====
Write-Host "===== 开始删除 src/ 中与 upstream 相同的文件 =====" -ForegroundColor Cyan
$srcFiles = Get-Content "src-identical-to-upstream.txt" | Where-Object { $_.Trim() -ne "" }
$srcDeleted = 0
$srcErrors = 0

foreach ($f in $srcFiles) {
    $fullPath = Join-Path "src" $f
    if (Test-Path $fullPath) {
        try {
            Remove-Item $fullPath -Force
            $srcDeleted++
        } catch {
            Write-Host "  ERROR: $fullPath" -ForegroundColor Red
            $srcErrors++
        }
    }
}

Write-Host "  src/ 删除完成: $srcDeleted 个文件已删除, $srcErrors 个错误" -ForegroundColor Green

# ===== 第二部分：删除 ui/ 中与 upstream 相同的文件 =====
Write-Host ""
Write-Host "===== 开始删除 ui/ 中与 upstream 相同的文件 =====" -ForegroundColor Cyan
$uiFiles = Get-Content "ui-identical-to-upstream.txt" | Where-Object { $_.Trim() -ne "" }
$uiDeleted = 0
$uiErrors = 0

foreach ($f in $uiFiles) {
    $fullPath = Join-Path "ui" $f
    if (Test-Path $fullPath) {
        try {
            Remove-Item $fullPath -Force
            $uiDeleted++
        } catch {
            Write-Host "  ERROR: $fullPath" -ForegroundColor Red
            $uiErrors++
        }
    }
}

Write-Host "  ui/ 删除完成: $uiDeleted 个文件已删除, $uiErrors 个错误" -ForegroundColor Green

# ===== 第三部分：清理空目录 =====
Write-Host ""
Write-Host "===== 清理空目录 =====" -ForegroundColor Cyan
$emptyDirs = 0

function Remove-EmptyDirs {
    param([string]$Path)
    $script:passes = 0
    do {
        $script:passes++
        $dirs = Get-ChildItem $Path -Directory -Recurse | 
            Where-Object { (Get-ChildItem $_.FullName -Force).Count -eq 0 }
        foreach ($d in $dirs) {
            Remove-Item $d.FullName -Force
            $script:emptyDirs++
        }
    } while ($dirs.Count -gt 0 -and $script:passes -lt 20)
}

Remove-EmptyDirs "src"
Remove-EmptyDirs "ui"

Write-Host "  已清理 $emptyDirs 个空目录" -ForegroundColor Green

# ===== 第四部分：统计结果 =====
Write-Host ""
Write-Host "===== 物理分离统计 =====" -ForegroundColor Cyan
$srcAfter = (Get-ChildItem src -Recurse -File).Count
$uiAfter = (Get-ChildItem ui -Recurse -File).Count

Write-Host "  src/: 3909 -> $srcAfter 个文件 (删除了 $srcDeleted 个)" -ForegroundColor Yellow
Write-Host "  ui/:  272  -> $uiAfter 个文件 (删除了 $uiDeleted 个)" -ForegroundColor Yellow
Write-Host ""

# 验证核心模块完整性
Write-Host "===== 核心模块完整性验证 =====" -ForegroundColor Cyan
$coreModules = @("src\admin", "src\lifecycle", "src\organization", "src\permissions", "src\workspace")
foreach ($mod in $coreModules) {
    if (Test-Path $mod) {
        $cnt = (Get-ChildItem $mod -Recurse -File).Count
        Write-Host "  OK $mod ($cnt files)" -ForegroundColor Green
    } else {
        Write-Host "  MISSING $mod !" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "===== 物理分离执行完毕 =====" -ForegroundColor Cyan
