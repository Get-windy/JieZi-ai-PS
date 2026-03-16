#!/usr/bin/env pwsh
# 手动合并辅助工具 - 显示文件差异摘要

param(
    [string]$RelativePath
)

$localPath = Join-Path "src" $RelativePath
$upstreamPath = Join-Path "upstream\src" $RelativePath

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "📄 正在检查：$RelativePath" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

if (-not (Test-Path $localPath)) {
    Write-Host "❌ 本地文件不存在：$localPath" -ForegroundColor Red
    return
}

if (-not (Test-Path $upstreamPath)) {
    Write-Host "★ 上游文件不存在，仅本地有" -ForegroundColor Green
    return
}

$localLines = (Get-Content $localPath).Count
$upstreamLines = (Get-Content $upstreamPath).Count

Write-Host ""
Write-Host "📊 文件统计:" -ForegroundColor Yellow
Write-Host "  本地行数：$localLines" -ForegroundColor Cyan
Write-Host "  上游行数：$upstreamLines" -ForegroundColor White
Write-Host "  差异：$([Math]::Abs($upstreamLines - $localLines)) 行" -ForegroundColor $(if ($localLines -eq $upstreamLines) { "Green" } else { "Yellow" })

Write-Host ""
Write-Host "🔍 查看 git diff 前 50 行:" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
git diff --no-index $localPath $upstreamPath 2>&1 | Select-Object -First 50
Write-Host "----------------------------------------" -ForegroundColor Gray

Write-Host ""
Write-Host "💡 建议操作:" -ForegroundColor Yellow
if ($localLines -lt $upstreamLines) {
    Write-Host "  上游新增了内容，需要合并到本地版本" -ForegroundColor Cyan
} elseif ($localLines -gt $upstreamLines) {
    Write-Host "  本地有独特内容，需要保留" -ForegroundColor Green
} else {
    Write-Host "  行数相同，但内容可能有差异" -ForegroundColor Yellow
}
Write-Host ""
