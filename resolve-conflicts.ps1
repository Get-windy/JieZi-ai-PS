# 解决Git冲突 - 保留我们的代码(HEAD部分)
# 这个脚本会处理所有冲突文件,移除冲突标记并保留HEAD部分

$files = @(
    'src/commands/configure.wizard.ts',
    'src/gateway/server-methods/models.ts', 
    'src/media-understanding/apply.test.ts',
    'src/plugins/install.test.ts',
    'ui/src/ui/views/agents.ts'
)

foreach ($file in $files) {
    Write-Host "`n=== 处理 $file ==="
    
    if (-not (Test-Path $file)) {
        Write-Host "文件不存在,跳过"
        continue
    }
    
    $content = Get-Content $file -Raw
    $lines = Get-Content $file
    
    # 检查是否有冲突标记
    if (-not ($content -match '<<<<<<< HEAD')) {
        Write-Host "无冲突标记,跳过"
        continue
    }
    
    # 创建备份
    $backupFile = "$file.conflict-backup"
    Copy-Item $file $backupFile -Force
    Write-Host "已创建备份: $backupFile"
    
    # 解决冲突:保留HEAD部分(我们的代码),删除upstream部分
    $newLines = @()
    $inConflict = $false
    $inOurCode = $false
    $conflictCount = 0
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        
        if ($line -match '^<<<<<<< HEAD') {
            # 进入冲突区域,开始保留我们的代码
            $inConflict = $true
            $inOurCode = $true
            $conflictCount++
            continue
        }
        
        if ($line -match '^=======') {
            # 到达分隔线,停止保留代码
            $inOurCode = $false
            continue
        }
        
        if ($line -match '^>>>>>>>') {
            # 退出冲突区域
            $inConflict = $false
            $inOurCode = $false
            continue
        }
        
        # 如果在我们的代码区域,或者不在冲突中,保留这行
        if ($inOurCode -or -not $inConflict) {
            $newLines += $line
        }
    }
    
    # 写回文件
    $newLines | Set-Content $file -Encoding UTF8
    Write-Host "✓ 已解决 $conflictCount 个冲突,保留了我们的代码"
}

Write-Host "`n所有冲突已解决!"
