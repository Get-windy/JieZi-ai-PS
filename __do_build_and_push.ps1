Set-Location "i:\JieZI\JieZi-ai-PS"
Write-Host "=== 开始构建验证 ===" -ForegroundColor Cyan

# 清理旧产物
if (Test-Path dist) {
    Remove-Item -Recurse -Force dist
    Write-Host "已清理 dist/" -ForegroundColor Yellow
}

# 执行构建
pnpm build 2>&1 | Tee-Object -FilePath "C:\Temp\build_result.txt"
$buildExit = $LASTEXITCODE
Write-Host "构建退出码: $buildExit" -ForegroundColor $(if ($buildExit -eq 0) { "Green" } else { "Red" })

if ($buildExit -ne 0) {
    Write-Host "构建失败，中止推送" -ForegroundColor Red
    exit 1
}

# 检查产物
$fileCount = (Get-ChildItem dist -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "dist/ 文件数: $fileCount" -ForegroundColor Green

Write-Host "=== 推送 localization-zh-CN ===" -ForegroundColor Cyan
git push origin localization-zh-CN
Write-Host "=== 合并到 main ===" -ForegroundColor Cyan
git checkout main
git merge localization-zh-CN
git push origin main
Write-Host "=== 切回工作分支 ===" -ForegroundColor Cyan
git checkout localization-zh-CN
git log --oneline -4
Write-Host "=== 全部完成 ===" -ForegroundColor Green
