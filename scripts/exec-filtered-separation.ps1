#!/usr/bin/env pwsh
Set-Location "I:\JieZI\JieZi-ai-PS"

# 读取过滤后的删除列表（已排除入口文件）
$deleteList = Get-Content "src-filtered-deletions.txt" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
Write-Host "Files to delete: $($deleteList.Count)"

$deleted = 0
$errors = 0

foreach ($relPath in $deleteList) {
    $fullPath = Join-Path "src" $relPath
    if (Test-Path $fullPath) {
        try {
            Remove-Item $fullPath -Force
            $deleted++
        } catch {
            Write-Host "ERROR: $fullPath - $_"
            $errors++
        }
    } else {
        Write-Host "SKIP (not found): $fullPath"
    }
}

Write-Host ""
Write-Host "=== Deletion Complete ==="
Write-Host "Deleted: $deleted"
Write-Host "Errors: $errors"

# 清理空目录
Write-Host ""
Write-Host "Cleaning empty directories..."
$emptyDirs = 0
do {
    $dirs = Get-ChildItem -Path "src" -Directory -Recurse | Where-Object {
        (Get-ChildItem -Path $_.FullName -Recurse -File).Count -eq 0
    }
    foreach ($d in $dirs) {
        Remove-Item $d.FullName -Recurse -Force
        $emptyDirs++
    }
} while ($dirs.Count -gt 0)

Write-Host "Empty directories removed: $emptyDirs"

# 统计结果
$remainingFiles = (Get-ChildItem -Path "src" -Recurse -File).Count
Write-Host ""
Write-Host "=== Final Statistics ==="
Write-Host "src/ files remaining: $remainingFiles"

# 验证核心模块完整
$coreModules = @("admin", "lifecycle", "organization", "permissions", "workspace")
foreach ($mod in $coreModules) {
    $modPath = Join-Path "src" $mod
    if (Test-Path $modPath) {
        $count = (Get-ChildItem -Path $modPath -Recurse -File).Count
        Write-Host "  Core module '$mod': $count files"
    } else {
        Write-Host "  WARNING: Core module '$mod' MISSING!"
    }
}

