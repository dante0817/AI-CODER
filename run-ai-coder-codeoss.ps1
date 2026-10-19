param(
  [string]$Workspace = "",
  [string]$Checkout = ""
)
$ErrorActionPreference = 'Stop'

if (-not $Checkout) {
  $lockPath = Join-Path $PSScriptRoot 'code-oss-mvp\upstream.lock.json'
  if (-not (Test-Path $lockPath)) { throw "Missing upstream lock: $lockPath" }
  $lock = Get-Content $lockPath -Raw | ConvertFrom-Json
  $releaseName = ([string]$lock.release) -replace '[^A-Za-z0-9._-]', '-'
  $Checkout = Join-Path $env:LOCALAPPDATA "AI-CODER\dev\CodeOSS-$releaseName"
}

$codeBat = Join-Path $Checkout 'scripts\code.bat'
$manifest = Join-Path $Checkout 'AI-CODER-UPSTREAM.json'
if (-not (Test-Path $Checkout)) {
  throw @"
AI-CODER Code-OSS development checkout was not found:
  $Checkout

Prepare it with the one-command Windows developer setup from the repository root:
  .\prepare-ai-coder-codeoss.ps1
Or double-click prepare-ai-coder-codeoss.bat.

The setup uses a short per-user checkout path by default, validates prerequisites, installs dependencies, compiles Code-OSS, runs AI-CODER tests, and can launch the target GUI.
"@
}
if (-not (Test-Path $manifest)) { throw "AI-CODER-UPSTREAM.json is missing. Re-stage the checkout with bootstrap-code-oss.ps1." }
if (-not (Test-Path $codeBat)) { throw "Code-OSS development launcher not found: $codeBat" }
$outDir = Join-Path $Checkout 'out'
if (-not (Test-Path $outDir)) { throw "Code-OSS compiled output is missing: $outDir`nRun .\prepare-ai-coder-codeoss.ps1 to compile the pinned development runtime." }

$info = Get-Content $manifest -Raw | ConvertFrom-Json
if ($info.product -ne 'AI-CODER') { throw 'The staged checkout is not branded as AI-CODER.' }

$runtime = Join-Path $env:LOCALAPPDATA 'AI-CODER\development'
$userData = Join-Path $runtime 'user-data'
$extensions = Join-Path $runtime 'extensions'
New-Item -ItemType Directory -Force -Path $userData,$extensions | Out-Null

$args = @('--user-data-dir', $userData, '--extensions-dir', $extensions)
if ($Workspace) {
  if (-not (Test-Path $Workspace)) { throw "Workspace not found: $Workspace" }
  $args += (Resolve-Path $Workspace).Path
}

Write-Host "Launching AI-CODER Code-OSS development runtime" -ForegroundColor Cyan
Write-Host "Version: $($info.aiCoderVersion)"
Write-Host "Upstream: $($info.resolvedCommit)"
Write-Host "Checkout: $Checkout"
Write-Host "User data: $userData"
& $codeBat @args
exit $LASTEXITCODE
