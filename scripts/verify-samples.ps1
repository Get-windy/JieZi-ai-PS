#!/usr/bin/env pwsh
# verify-samples.ps1 - 随机抽查10个标记为相同的文件，验证确实没有差异
Set-Location "I:\JieZI\JieZi-ai-PS"

Write-Host "=== src/ 样本验证 ===" -ForegroundColor Cyan
$srcSamples = Get-Content "src-identical-to-upstream.txt" | Get-Random -Count 10
foreach ($f in $srcSamples) {
    $srcFile = Join-Path "src" $f
    $upFile = Join-Path "upstream\src" $f
    if ((Test-Path $srcFile) -and (Test-Path $upFile)) {
        $lh = (Get-FileHash $srcFile -Algorithm SHA256).Hash
        $uh = (Get-FileHash $upFile -Algorithm SHA256).Hash
        if ($lh -eq $uh) {
            Write-Host "  OK $f" -ForegroundColor Green
        } else {
            Write-Host "  MISMATCH $f" -ForegroundColor Red
        }
    } else {
        Write-Host "  MISSING $f" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== ui/ 样本验证 ===" -ForegroundColor Cyan
$uiSamples = Get-Content "ui-identical-to-upstream.txt" | Get-Random -Count 10
foreach ($f in $uiSamples) {
    $uiFile = Join-Path "ui" $f
    $upFile = Join-Path "upstream\ui" $f
    if ((Test-Path $uiFile) -and (Test-Path $upFile)) {
        $lh = (Get-FileHash $uiFile -Algorithm SHA256).Hash
        $uh = (Get-FileHash $upFile -Algorithm SHA256).Hash
        if ($lh -eq $uh) {
            Write-Host "  OK $f" -ForegroundColor Green
        } else {
            Write-Host "  MISMATCH $f" -ForegroundColor Red
        }
    } else {
        Write-Host "  MISSING $f" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== 验证核心本地模块NOT在删除列表中 ===" -ForegroundColor Cyan
$coreModules = @("admin\", "lifecycle\", "organization\", "permissions\", "workspace\", "sessions\")
$identicalSrc = Get-Content "src-identical-to-upstream.txt"
foreach ($mod in $coreModules) {
    $found = $identicalSrc | Where-Object { $_.StartsWith($mod) }
    if ($found.Count -gt 0) {
        Write-Host "  WARNING: $mod 有 $($found.Count) 个文件标记为相同 (预期为0)" -ForegroundColor Red
    } else {
        Write-Host "  OK: $mod 无文件在删除列表中" -ForegroundColor Green
    }
}
