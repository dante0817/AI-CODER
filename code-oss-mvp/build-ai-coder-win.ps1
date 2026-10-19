param(
  [string]$Checkout = '',
  [string]$WorkRoot = '',
  [switch]$SkipInstall
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'AI-CODER native production-candidate build must run on Windows.' }
$scriptRoot = $PSScriptRoot
if (-not $WorkRoot) { $WorkRoot = Join-Path $env:LOCALAPPDATA 'AI-CODER\build' }
if (-not $Checkout) { $Checkout = Join-Path $WorkRoot 'vscode-ai-coder' }
if ($Checkout -match '\s') { throw 'Code-OSS build checkout path must not contain spaces.' }
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

function Run-Step($label, [scriptblock]$action) {
  Write-Host "[AI-CODER] $label" -ForegroundColor Cyan
  & $action
  if ($LASTEXITCODE -ne 0) { throw "$label failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path $Checkout)) {
  Run-Step 'Bootstrap exact pinned Code-OSS source' { & (Join-Path $scriptRoot 'bootstrap-code-oss.ps1') -Destination $Checkout }
}
Run-Step 'Run Windows preflight' { & (Join-Path $scriptRoot 'preflight-code-oss.ps1') -Checkout $Checkout -RequireWindows -RequireBuildToolchain }
Run-Step 'Stage current AI-CODER extension source with backups' { & (Join-Path $scriptRoot 'stage-ai-coder-extension.ps1') -Source (Join-Path $scriptRoot 'builtin-ai-coder') -Checkout $Checkout -BackupRoot (Join-Path $WorkRoot 'backups\ai-coder-before-current-source') }
Run-Step 'Stage offline Copilot SDK packaging workaround' { & (Join-Path $scriptRoot 'stage-copilot-sdk-shim.ps1') -Checkout $Checkout }

Push-Location $Checkout
try {
  if (-not $SkipInstall) { Run-Step 'Install pinned Code-OSS dependencies' { npm install } }
  Run-Step 'Run AI-CODER source qualification' { & (Join-Path $scriptRoot 'qualify-code-oss.ps1') -Checkout $Checkout }
  Run-Step 'Compile pinned Code-OSS source' { npm run compile }
  $gulp = Join-Path $Checkout 'node_modules\gulp\bin\gulp.js'
  if (-not (Test-Path $gulp)) { throw "Pinned checkout gulp entry is missing: $gulp" }
  Run-Step 'Package minified Windows x64 Code-OSS application' { node $gulp vscode-win32-x64-min }
} finally { Pop-Location }

$manifestPath = Join-Path $Checkout 'AI-CODER-UPSTREAM.json'
if (-not (Test-Path $manifestPath)) { throw 'Upstream manifest disappeared during build.' }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.nativeWindowsBuildQualified = $false
$manifest.nativeWindowsBuildProduced = $true
$manifest.nativeWindowsBuildAtUtc = (Get-Date).ToUniversalTime().ToString('o')
$manifest | ConvertTo-Json -Depth 30 | Set-Content $manifestPath -Encoding UTF8

Write-Host ''
Write-Host 'Windows Code-OSS package build completed.' -ForegroundColor Green
Write-Host 'IMPORTANT: nativeWindowsBuildQualified remains FALSE until the packaged-app NTFS/security/migration gate is executed.' -ForegroundColor Yellow
