#!/usr/bin/env pwsh
Set-Location "I:\JieZI\JieZi-ai-PS"

# tsdown 构建入口文件，必须保留在 src/ 中（glob 展开需要它们存在）
$entryFiles = @(
    "index.ts",
    "entry.ts",
    "cli\daemon-cli.ts",
    "infra\warning-filter.ts",
    "plugin-sdk\account-id.ts",
    "extensionAPI.ts",
    "hooks\bundled\boot-md\handler.ts",
    "hooks\bundled\bootstrap-extra-files\handler.ts",
    "hooks\bundled\command-logger\handler.ts",
    "hooks\bundled\session-memory\handler.ts"
)

$entrySet = [System.Collections.Generic.HashSet[string]]::new()
foreach ($f in $entryFiles) {
    [void]$entrySet.Add($f)
}

$all = Get-Content "src-identical-to-upstream.txt"
$filtered = [System.Collections.Generic.List[string]]::new()
$excluded = 0

foreach ($line in $all) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($entrySet.Contains($line)) {
        $excluded++
        Write-Host "KEEP (entry): src/$line"
    } else {
        $filtered.Add($line)
    }
}

$filtered | Out-File -Encoding UTF8 "src-filtered-deletions.txt"
Write-Host ""
Write-Host "=== Summary ==="
Write-Host "Total identical: $($all.Count)"
Write-Host "Excluded (entry points): $excluded"
Write-Host "Will delete: $($filtered.Count)"
