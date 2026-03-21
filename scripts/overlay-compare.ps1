#!/usr/bin/env pwsh
# Overlay 架构文件对比工具

param(
    [string]$LocalDir = "src",
    [string]$UpstreamDir = "upstream/src"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Agents & Infra 文件对比分析" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Agents 目录
Write-Host "📁 Agents 系统:" -ForegroundColor Yellow
$agentsPath = Join-Path $LocalDir "agents"
if (Test-Path $agentsPath) {
    $files = Get-ChildItem -Path $agentsPath -Recurse -File
    
    $onlyLocal = 0
    $same = 0
    $different = 0
    
    foreach ($file in $files) {
        $relativePath = $file.FullName.Replace((Get-Item $agentsPath).FullName + "\", "")
        $upstreamPath = Join-Path (Join-Path $UpstreamDir "agents") $relativePath
        
        if (Test-Path $upstreamPath) {
            $localContent = Get-Content $file.FullName -Raw
            $upstreamContent = Get-Content $upstreamPath -Raw
            
            if ($localContent -eq $upstreamContent) {
                Write-Host "  ✓ 相同：$relativePath" -ForegroundColor Gray
                $same++
            } else {
                Write-Host "  ⚠ 不同：$relativePath (需要检查合并)" -ForegroundColor Red
                $different++
            }
        } else {
            Write-Host "  ★ 仅本地：$relativePath" -ForegroundColor Green
            $onlyLocal++
        }
    }
    
    Write-Host ""
    Write-Host "  统计:" -ForegroundColor Cyan
    Write-Host "    仅本地文件：$onlyLocal" -ForegroundColor Green
    Write-Host "    与上游相同：$same" -ForegroundColor Gray
    Write-Host "    与上游不同：$different" -ForegroundColor Red
} else {
    Write-Host "  ❌ Agents 目录不存在" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

# 检查 Infra 目录
Write-Host "📁 Infra 基础设施:" -ForegroundColor Yellow
$infraPath = Join-Path $LocalDir "infra"
if (Test-Path $infraPath) {
    $files = Get-ChildItem -Path $infraPath -Recurse -File
    
    $onlyLocal = 0
    $same = 0
    $different = 0
    
    foreach ($file in $files) {
        $relativePath = $file.FullName.Replace((Get-Item $infraPath).FullName + "\", "")
        $upstreamPath = Join-Path (Join-Path $UpstreamDir "infra") $relativePath
        
        if (Test-Path $upstreamPath) {
            $localContent = Get-Content $file.FullName -Raw
            $upstreamContent = Get-Content $upstreamPath -Raw
            
            if ($localContent -eq $upstreamContent) {
                Write-Host "  ✓ 相同：$relativePath" -ForegroundColor Gray
                $same++
            } else {
                Write-Host "  ⚠ 不同：$relativePath (需要检查合并)" -ForegroundColor Red
                $different++
            }
        } else {
            Write-Host "  ★ 仅本地：$relativePath" -ForegroundColor Green
            $onlyLocal++
        }
    }
    
    Write-Host ""
    Write-Host "  统计:" -ForegroundColor Cyan
    Write-Host "    仅本地文件：$onlyLocal" -ForegroundColor Green
    Write-Host "    与上游相同：$same" -ForegroundColor Gray
    Write-Host "    与上游不同：$different" -ForegroundColor Red
} else {
    Write-Host "  ❌ Infra 目录不存在" -ForegroundColor Red
}
