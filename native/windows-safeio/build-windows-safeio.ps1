$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here "..\..")
$out = Join-Path $here "windows-safeio.exe"
$codeOssOut = Join-Path $repo "code-oss-mvp\builtin-ai-coder\native\windows-safeio.exe"

$env:GOOS = "windows"
$env:GOARCH = "amd64"
$env:CGO_ENABLED = "0"

$cmd = Get-Command go -ErrorAction SilentlyContinue
if ($cmd) {
    $go = $cmd.Source
} else {
    $candidates = New-Object System.Collections.Generic.List[string]
    if ($env:ProgramW6432) { $candidates.Add((Join-Path $env:ProgramW6432 "Go\bin\go.exe")) }
    if ($env:ProgramFiles) { $candidates.Add((Join-Path $env:ProgramFiles "Go\bin\go.exe")) }
    $candidates.Add("C:\Program Files\Go\bin\go.exe")
    $candidates.Add("C:\Go\bin\go.exe")
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $go = $c
            break
        }
    }
    if (-not $go) {
        throw "Could not find 'go' in PATH or standard installation directories."
    }
}

Push-Location $repo
try {
    & $go build -trimpath -ldflags="-s -w" -o $out ".\native\windows-safeio\main.go"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $codeOssOut) | Out-Null
    Copy-Item $out $codeOssOut -Force
    Write-Host "Built shared Windows safe-I/O helper:"
    Write-Host "  $out"
    Write-Host "  $codeOssOut"
} finally {
    Pop-Location
}
