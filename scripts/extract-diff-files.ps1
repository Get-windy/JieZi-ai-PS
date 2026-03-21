#!/usr/bin/env pwsh
# 提取有差异的文件列表

$logFile = "merge-check-log.txt"
$outputFile = "diff-files-list.txt"

$diffFiles = Get-Content $logFile | Select-String "✓ DIFF:"

Write-Host "正在提取差异文件..." -ForegroundColor Cyan

$files = @()
foreach ($line in $diffFiles) {
    # 提取文件名（从 ✓ DIFF: 后面到 (本地 前面）
    if ($line.Line -match "✓ DIFF:\s+(.+?)\s+\(") {
        $files += $matches[1]
    }
}

$files | Out-File $outputFile -Encoding UTF8

Write-Host "✅ 提取完成！共 $($files.Count) 个文件" -ForegroundColor Green
Write-Host "📄 文件已保存到：$outputFile" -ForegroundColor Yellow
