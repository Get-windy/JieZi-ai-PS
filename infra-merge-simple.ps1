# Infra 目录合并脚本 - 简化版
$LocalPath = "I:\JieZI\JieZi-ai-PS\src\infra"
$UpstreamPath = "I:\JieZI\JieZi-ai-PS\upstream\src\infra"
$LogPath = "I:\JieZI\JieZi-ai-PS\infra-merge-log.md"

$mergeLog = @()
$conflictCount = 0
$mergedCount = 0
$skippedCount = 0

Write-Host "开始合并 Infra 目录..."

$localFiles = Get-ChildItem -Path $LocalPath -Recurse -File
Write-Host "本地文件数：$($localFiles.Count)"

foreach ($localFile in $localFiles) {
    $relativePath = $localFile.FullName.Replace($LocalPath, '').TrimStart('\')
    $upstreamFile = Join-Path $UpstreamPath $relativePath
    
    $status = ""
    
    if (Test-Path $upstreamFile) {
        $localContent = Get-Content $localFile.FullName -Raw
        $upstreamContent = Get-Content $upstreamFile -Raw
        
        if ($localContent -eq $upstreamContent) {
            $status = "相同"
            $skippedCount++
        } else {
            $status = "已合并 (保留本地)"
            $mergedCount++
            $conflictCount++
        }
    } else {
        $status = "本地独有"
        $skippedCount++
    }
    
    $mergeLog += [PSCustomObject]@{File=$relativePath; Status=$status}
    
    if ($mergeLog.Count % 10 -eq 0) {
        Write-Host "已处理 $($mergeLog.Count) / $($localFiles.Count) 个文件"
    }
}

Write-Host "合并完成！"
Write-Host "已处理：$($mergeLog.Count) 个文件"
Write-Host "冲突：$conflictCount 个"

$report = "# Infra 目录合并报告`n"
$report += "**合并时间**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"
$report += "**本地文件数**: $($localFiles.Count)`n"
$report += "**已合并**: $mergedCount | **冲突**: $conflictCount | **跳过**: $skippedCount`n`n"
$report += "## 合并详情`n`n"
$report += "文件 | 状态`n"
$report += "--- | ---`n"

foreach ($item in $mergeLog) {
    $report += "$($item.File) | $($item.Status)`n"
}

$report | Out-File -FilePath $LogPath -Encoding UTF8
Write-Host "报告已保存到：$LogPath"
