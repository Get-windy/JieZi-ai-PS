# 批量分析infra目录文件差异
$baseDir = "I:/JieZI/JieZi-ai-PS"
$files = Get-Content "$baseDir/overlay-files-list.txt" | Select-String "infra"

$results = @()
$counter = 0

foreach ($file in $files) {
    $counter++
    $localPath = "$baseDir/$file"
    $upstreamPath = "$baseDir/upstream/$file"
    
    $status = ""
    $diffLines = 0
    
    if (-not (Test-Path $localPath)) {
        $status = "UPSTREAM_ONLY"
    } elseif (-not (Test-Path $upstreamPath)) {
        $status = "LOCAL_ONLY"
    } else {
        # 计算差异行数
        $localContent = Get-Content $localPath -Raw -ErrorAction SilentlyContinue
        $upstreamContent = Get-Content $upstreamPath -Raw -ErrorAction SilentlyContinue
        
        if ($localContent -eq $upstreamContent) {
            $status = "IDENTICAL"
        } else {
            $status = "DIFFERENT"
            # 使用git diff计算差异
            $diffOutput = git diff --no-index --stat $upstreamPath $localPath 2>$null
            if ($diffOutput -match "(\d+) insertion") {
                $diffLines = [int]$matches[1]
            }
            if ($diffOutput -match "(\d+) deletion") {
                $diffLines += [int]$matches[1]
            }
        }
    }
    
    $results += [PSCustomObject]@{
        File = $file
        Status = $status
        DiffLines = $diffLines
    }
    
    Write-Host "$counter/54 : $file -> $status"
}

# 输出CSV报告
$results | Export-Csv -Path "$baseDir/infra-diff-report.csv" -NoTypeInformation -Encoding UTF8

# 输出摘要
Write-Host "`n=== 分析摘要 ==="
$results | Group-Object Status | Select-Object Name, Count | Format-Table -AutoSize

# 列出需要合并的文件（有差异的）
Write-Host "`n=== 需要合并的文件 ==="
$results | Where-Object { $_.Status -eq "DIFFERENT" } | Format-Table -AutoSize
