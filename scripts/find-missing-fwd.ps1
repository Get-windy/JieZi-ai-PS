param([string]$EntryFile = "src/config/io.ts")

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
                # 继续追踪 upstream 文件的依赖
                Scan $upTarget
            }
        } else {
            Scan $target
        }
    }
}

Scan $EntryFile
$missing.Keys | Sort-Object | ForEach-Object {
    $src = $_
    $up  = $missing[$src]
    $srcRel = $src.Replace("$srcRoot\", "src/").Replace("\","/")
    $upRel  = $up.Replace("$upRoot\", "upstream/src/").Replace("\","/")
    "MISSING: $srcRel  <-  $upRel"
}
Write-Host "Total missing: $($missing.Count)"
