# 批量修复 UI 中跨层导入 src/ 的问题
# 将所有 from "xxxx/src/yyyy" 替换为 from "xxxx/upstream/src/yyyy"

$files = Get-ChildItem -Recurse ui/src -Filter "*.ts"
$count = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $original = $content
    
    # 匹配模式：from "../../../src/" 或 "../../../../src/"
    # 替换为：from "../../../upstream/src/" 或 "../../../../upstream/src/"
    $content = $content -replace '(from\s+["''])(\.\./)+src/', '$1$2upstream/src/'
    
    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $count++
        Write-Host "Fixed: $($file.FullName)" -ForegroundColor Green
    }
}

Write-Host "`nTotal files fixed: $count" -ForegroundColor Cyan
