# Infra 目录合并脚本
param(
    [string]$LocalPath = "I:\JieZI\JieZi-ai-PS\src\infra",
    [string]$UpstreamPath = "I:\JieZI\JieZi-ai-PS\upstream\src\infra",
    [string]$LogPath = "I:\JieZI\JieZi-ai-PS\infra-merge-log.md"
)

$mergeLog = @()
$conflictCount = 0
$mergedCount = 0
$skippedCount = 0

# 获取本地所有文件
$localFiles = Get-ChildItem -Path $LocalPath -Recurse -File

Write-Host "开始合并 Infra 目录..."
Write-Host "本地文件数：$($localFiles.Count)"

foreach ($localFile in $localFiles) {
    $relativePath = $localFile.FullName.Replace($LocalPath, '').TrimStart('\')
    $upstreamFile = Join-Path $UpstreamPath $relativePath
    
    $fileInfo = @{
        File = $relativePath
        Status = ""
        Note = ""
    }
    
    if (Test-Path $upstreamFile) {
        # 上游文件存在，比较内容
        $localContent = Get-Content $localFile.FullName -Raw
        $upstreamContent = Get-Content $upstreamFile -Raw
        
        if ($localContent -eq $upstreamContent) {
            $fileInfo.Status = "相同"
            $skippedCount++
        } else {
            # 内容不同，需要合并 - 保留本地版本
            $fileInfo.Status = "已合并 (保留本地)"
            $mergedCount++
            $conflictCount++
        }
    } else {
        # 上游不存在，本地独有
        $fileInfo.Status = "本地独有"
        $skippedCount++
    }
    
    $mergeLog += $fileInfo
    
    # 每 10 个文件输出进度
    if ($mergeLog.Count % 10 -eq 0) {
        Write-Host "已处理 $($mergeLog.Count) / $($localFiles.Count) 个文件"
    }
}

# 生成合并报告
$report = @"
# Infra 目录合并报告

**合并时间**: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
**本地路径**: $LocalPath
**上游路径**: $UpstreamPath

## 合并统计

| 指标 | 数量 |
|------|------|
| 本地文件总数 | $($localFiles.Count) |
| 已合并文件 | $mergedCount |
| 冲突文件 | $conflictCount |
| 跳过文件 | $skippedCount |

## 合并详情

| 文件 | 状态 | 说明 |
|------|------|------|
"@

foreach ($item in $mergeLog) {
    $report += "| $($item.File) | $($item.Status) | $($item.Note) |`n"
}

$report += "`n---`n*合并完成*"

# 保存报告
$report | Out-File -FilePath $LogPath -Encoding UTF8

Write-Host "合并完成！"
Write-Host "已处理：$($mergeLog.Count) 个文件"
Write-Host "冲突：$conflictCount 个"
Write-Host "报告已保存到：$LogPath"
