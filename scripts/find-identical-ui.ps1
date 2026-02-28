#!/usr/bin/env pwsh
# find-identical-ui.ps1 - 找出 ui/ 中与 upstream/ui/ 完全相同的文件

Set-Location "I:\JieZI\JieZi-ai-PS"

$identicalFiles = [System.Collections.Generic.List[string]]::new()
$diffFiles = [System.Collections.Generic.List[string]]::new()
$localOnly = [System.Collections.Generic.List[string]]::new()
$localDir = Resolve-Path "ui"
$upDir = "upstream\ui"

$allLocal = Get-ChildItem -Path "ui" -Recurse -File
$total = $allLocal.Count
$checked = 0

Write-Host "开始对比 ui/ ($total 个文件) vs upstream/ui/ ..." -ForegroundColor Cyan

foreach ($f in $allLocal) {
    $checked++
    $rel = $f.FullName.Substring($localDir.Path.Length + 1)
    $upFile = Join-Path $upDir $rel

    if (Test-Path $upFile) {
        $lh = (Get-FileHash $f.FullName -Algorithm SHA256).Hash
        $uh = (Get-FileHash $upFile -Algorithm SHA256).Hash
        if ($lh -eq $uh) {
            $identicalFiles.Add($rel)
        } else {
            $diffFiles.Add($rel)
        }
    } else {
        $localOnly.Add($rel)
    }
}

$identicalFiles | Out-File -Encoding UTF8 "ui-identical-to-upstream.txt"
$diffFiles | Out-File -Encoding UTF8 "ui-different-from-upstream.txt"
$localOnly | Out-File -Encoding UTF8 "ui-local-only.txt"

Write-Host ""
Write-Host "=== ui/ 对比完成 ===" -ForegroundColor Cyan
Write-Host "  总文件数:       $total"
Write-Host "  与upstream相同: $($identicalFiles.Count) (可安全删除)" -ForegroundColor Green
Write-Host "  与upstream不同: $($diffFiles.Count) (本地修改,保留)" -ForegroundColor Yellow
Write-Host "  仅本地存在:     $($localOnly.Count) (本地新增,保留)" -ForegroundColor Yellow
