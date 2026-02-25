$files = @(
    'src/commands/configure.wizard.ts',
    'src/gateway/server-methods/models.ts', 
    'src/media-understanding/apply.test.ts',
    'src/plugins/install.test.ts',
    'ui/src/ui/views/agents.ts'
)

foreach ($file in $files) {
    Write-Host "`n=== $file ==="
    if (-not (Test-Path $file)) {
        Write-Host "文件不存在"
        continue
    }
    
    $lines = Get-Content $file
    $hasConflict = $false
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^<<<<<<<|^=======|^>>>>>>>') {
            Write-Host "第$($i+1)行: $($lines[$i])"
            $hasConflict = $true
        }
    }
    
    if (-not $hasConflict) {
        Write-Host "✓ 无冲突标记"
    }
}
