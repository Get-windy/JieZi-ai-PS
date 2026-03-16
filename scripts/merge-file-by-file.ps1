#!/usr/bin/env pwsh
# 逐文件对比工具 - 每次显示一个文件

param(
    [int]$StartIndex = 0,
    [int]$Count = 1
)

$localOnlyFiles = Get-Content "src-local-only.txt" | Select-String "^agents\\|^infra\\"

$totalFiles = $localOnlyFiles.Count
$currentIndex = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "逐文件合并检查工具" -ForegroundColor Cyan
Write-Host "总文件数：$totalFiles | 从索引 $StartIndex 开始 | 每次显示 $Count 个文件" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

for ($i = $StartIndex; $i -lt [Math]::Min($StartIndex + $Count, $totalFiles); $i++) {
    $file = $localOnlyFiles[$i].Line.Trim()
    $currentIndex = $i + 1
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "📄 文件 [$currentIndex/$totalFiles]: $file" -ForegroundColor Cyan
    
    # 检查上游是否存在
    $upstreamPath = Join-Path "upstream\src" ($file.Substring(7))
    $localPath = Join-Path "src" $file
    
    if (Test-Path $upstreamPath) {
        # 上游存在，需要对比内容
        $localContent = Get-Content $localPath -Raw
        $upstreamContent = Get-Content $upstreamPath -Raw
        
        if ($localContent -eq $upstreamContent) {
            Write-Host "⚠️  状态：与上游完全相同" -ForegroundColor Red
            Write-Host "   建议：删除本地文件" -ForegroundColor Yellow
        } else {
            $localLines = ($localContent -split "`n").Count
            $upstreamLines = ($upstreamContent -split "`n").Count
            Write-Host "✓ 状态：与上游有差异" -ForegroundColor Green
            Write-Host "   本地：$localLines 行 | 上游：$upstreamLines 行" -ForegroundColor Gray
            Write-Host "   建议：保留本地版本（需要时手动合并上游更新）" -ForegroundColor Yellow
        }
    } else {
        Write-Host "★ 状态：仅本地有" -ForegroundColor Green
        Write-Host "   建议：保留" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "✅ 本批次检查完成" -ForegroundColor Cyan
Write-Host ""
