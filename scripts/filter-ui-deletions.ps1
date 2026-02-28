# 从 ui-identical-to-upstream.txt 中排除配置文件
# 只删除源代码文件，保留配置文件以便本地定制

$inputFile = "ui-identical-to-upstream.txt"
$outputFile = "ui-filtered-deletions.txt"

# 排除模式：配置文件
$excludePatterns = @(
    "^package\.json$",
    "^vite\.config\.ts$",
    "^vitest\.config\.ts$",
    "^vitest\.node\.config\.ts$",
    "^tsconfig\.json$",
    "^index\.html$",  # 入口文件
    "\.config\.(js|ts|mjs|cjs)$"  # 任何配置文件
)

$files = Get-Content $inputFile
$filtered = $files | Where-Object {
    $file = $_
    $shouldExclude = $false
    foreach ($pattern in $excludePatterns) {
        if ($file -match $pattern) {
            $shouldExclude = $true
            Write-Host "Excluding config file: $file" -ForegroundColor Yellow
            break
        }
    }
    -not $shouldExclude
}

$filtered | Set-Content $outputFile

$originalCount = $files.Count
$filteredCount = $filtered.Count
$excludedCount = $originalCount - $filteredCount

Write-Host "`n=== UI Deletion Filtering Summary ===" -ForegroundColor Cyan
Write-Host "Original files: $originalCount" -ForegroundColor White
Write-Host "Excluded files: $excludedCount" -ForegroundColor Yellow
Write-Host "Files to delete: $filteredCount" -ForegroundColor Green
Write-Host "Output: $outputFile" -ForegroundColor Cyan
