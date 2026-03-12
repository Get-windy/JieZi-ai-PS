param([string]$EntryFile = "extensions/memory-core/index.ts")

Set-Location "i:\JIEZI\JieZi-ai-PS"

$visited = @{}
$missing = [System.Collections.Generic.Dictionary[string,string]]::new()
$srcRoot = (Resolve-Path "src").Path
$upRoot  = (Resolve-Path "upstream/src").Path

function Scan([string]$file) {
    $abs = [System.IO.Path]::GetFullPath($file)
    if ($visited[$abs]) { return }
    $visited[$abs] = $true
    if (-not (Test-Path $abs)) { return }

    $content = Get-Content $abs -Raw
    $pattern = 'from\s+[''"](\.[^''""]+?)\.js[''"]'
    $matches2 = [regex]::Matches($content, $pattern)
    foreach ($m in $matches2) {
        $rel = $m.Groups[1].Value
        $dir = Split-Path $abs -Parent
        $target = [System.IO.Path]::GetFullPath((Join-Path $dir "$rel.ts"))
        if (-not ($target -like "$srcRoot\*")) { continue }
        if (-not (Test-Path $target)) {
            $upTarget = $target.Replace($srcRoot, $upRoot)
            if (Test-Path $upTarget) {
                $missing[$target] = $upTarget
                Scan $upTarget
            }
        } else {
            Scan $target
        }
    }
}

Scan $EntryFile

$created = 0
$skipped = 0

foreach ($src in $missing.Keys) {
    $up = $missing[$src]

    # 跳过 version.ts（会导致 overlay 自循环 OOM）
    if ($src -like "*\version.ts") {
        Write-Host "SKIP (version): $src"
        $skipped++
        continue
    }

    # 计算 src 文件相对于 upstream 文件的相对路径前缀
    $srcDir = Split-Path $src -Parent
    $upRel = $up.Replace("$upRoot\", "").Replace("\", "/")
    
    # 计算从 src 目录到 upstream/src 目录的相对路径
    $srcDirRel = $srcDir.Replace("$srcRoot", "").TrimStart("\").Replace("\", "/")
    $depth = ($srcDirRel -split "/" | Where-Object { $_ -ne "" }).Count
    $prefix = ("../" * ($depth + 1)) + "upstream/src/"
    $fwdPath = $prefix + $upRel

    $dir = Split-Path $src -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $content = "// 转发到 upstream 实现，供运行时（tsx）动态加载时使用`nexport * from `"$fwdPath`";`n"
    Set-Content -Path $src -Value $content -Encoding UTF8 -NoNewline
    Write-Host "CREATED: $($src.Replace("$srcRoot\","src\"))"
    $created++
}

Write-Host ""
Write-Host "Done. Created: $created, Skipped: $skipped"
