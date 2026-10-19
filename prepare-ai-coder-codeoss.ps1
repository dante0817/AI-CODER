param(
  [string]$Workspace = "",
  [string]$Checkout = "",
  [switch]$NoLaunch,
  [switch]$SkipInstall,
  [switch]$SkipCompile,
  [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'AI-CODER Code-OSS developer setup must run on Windows. This script intentionally does not claim a Windows build from another OS.'
}

$repoRoot = $PSScriptRoot
$codeOssScripts = Join-Path $repoRoot 'code-oss-mvp'
$lockPath = Join-Path $codeOssScripts 'upstream.lock.json'
if (-not (Test-Path $lockPath)) { throw "Missing upstream lock: $lockPath" }
$lock = Get-Content $lockPath -Raw | ConvertFrom-Json
if (-not $Checkout) {
  $releaseName = ([string]$lock.release) -replace '[^A-Za-z0-9._-]', '-'
  $Checkout = Join-Path $env:LOCALAPPDATA "AI-CODER\dev\CodeOSS-$releaseName"
}
if ($Checkout -match '\s') {
  throw "The Code-OSS checkout path contains whitespace: $Checkout`nUse the default checkout or another short path without spaces."
}
if ($Workspace -and -not (Test-Path $Workspace)) { throw "Workspace not found: $Workspace" }

$report = [ordered]@{
  formatVersion = 1
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  aiCoderCandidate = '0.6.0-rc.4'
  checkout = $Checkout
  lockedRelease = [string]$lock.release
  workspace = if ($Workspace) { (Resolve-Path $Workspace).Path } else { $null }
  steps = [ordered]@{}
  launchReady = $false
  nativeWindowsBuildQualified = $false
  result = 'running'
  error = $null
}

function Set-Step([string]$name, [string]$status, [string]$detail = '') {
  $report.steps[$name] = [ordered]@{ status = $status; detail = $detail; atUtc = (Get-Date).ToUniversalTime().ToString('o') }
}
function Run-Step([string]$name, [scriptblock]$action) {
  Write-Host "[AI-CODER] $name" -ForegroundColor Cyan
  Set-Step $name 'running'
  $global:LASTEXITCODE = 0
  & $action
  if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" }
  Set-Step $name 'passed'
}
function Write-Report {
  $target = if (Test-Path $Checkout) { Join-Path $Checkout 'AI-CODER-DEV-BUILD.json' } else { Join-Path $repoRoot 'AI-CODER-DEV-BUILD-LAST.json' }
  $report.generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  $report | ConvertTo-Json -Depth 30 | Set-Content $target -Encoding UTF8
  return $target
}

try {
  $bootstrap = Join-Path $codeOssScripts 'bootstrap-code-oss.ps1'
  if (Test-Path $Checkout) {
    Run-Step 'Restage AI-CODER into pinned checkout' { & $bootstrap -Destination $Checkout -SkipClone }
  } else {
    $parent = Split-Path -Parent $Checkout
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Run-Step 'Bootstrap exact pinned Code-OSS checkout' { & $bootstrap -Destination $Checkout }
  }

  Run-Step 'Validate Windows developer prerequisites' {
    & (Join-Path $codeOssScripts 'preflight-code-oss.ps1') -Checkout $Checkout -RequireWindows -RequireBuildToolchain
  }

  Push-Location $Checkout
  try {
    if (-not $SkipInstall) {
      Run-Step 'Install pinned Code-OSS dependencies' { npm install }
    } elseif (-not (Test-Path (Join-Path $Checkout 'node_modules'))) {
      throw '-SkipInstall was requested but node_modules is missing. Run again without -SkipInstall.'
    } else {
      Set-Step 'Install pinned Code-OSS dependencies' 'skipped' 'node_modules already present'
    }

    if (-not $SkipTests) {
      $ext = Join-Path $Checkout 'extensions\ai-coder'
      Push-Location $ext
      try { Run-Step 'Run AI-CODER built-in extension regression suite' { node --test } }
      finally { Pop-Location }
    } else {
      Set-Step 'Run AI-CODER built-in extension regression suite' 'skipped' 'explicit -SkipTests'
    }

    if (-not $SkipCompile) {
      Run-Step 'Compile pinned Code-OSS development source' { npm run compile }
    } elseif (-not (Test-Path (Join-Path $Checkout 'out'))) {
      throw '-SkipCompile was requested but the compiled out directory is missing. Run again without -SkipCompile.'
    } else {
      Set-Step 'Compile pinned Code-OSS development source' 'skipped' 'compiled out directory already present'
    }
  } finally {
    Pop-Location
  }

  Run-Step 'Run AI-CODER source qualification' {
    if ($SkipTests) {
      & (Join-Path $codeOssScripts 'qualify-code-oss.ps1') -Checkout $Checkout -SkipExtensionTests
    } else {
      & (Join-Path $codeOssScripts 'qualify-code-oss.ps1') -Checkout $Checkout
    }
  }

  $codeBat = Join-Path $Checkout 'scripts\code.bat'
  $outDir = Join-Path $Checkout 'out'
  if (-not (Test-Path $codeBat)) { throw "Code-OSS development launcher is missing: $codeBat" }
  if (-not (Test-Path $outDir)) { throw "Compiled Code-OSS output is missing: $outDir" }

  $report.launchReady = $true
  $report.result = 'developer-runtime-ready'
  $reportPath = Write-Report
  Write-Host ''
  Write-Host 'AI-CODER Code-OSS developer runtime is ready.' -ForegroundColor Green
  Write-Host "Checkout: $Checkout"
  Write-Host "Build report: $reportPath"
  Write-Host 'This is a development runtime; native Windows packaged-build qualification remains pending.' -ForegroundColor Yellow

  if (-not $NoLaunch) {
    $launcher = Join-Path $repoRoot 'run-ai-coder-codeoss.ps1'
    Write-Host ''
    Write-Host 'Launching the real AI-CODER Code-OSS GUI...' -ForegroundColor Cyan
    if ($Workspace) { & $launcher -Checkout $Checkout -Workspace $Workspace }
    else { & $launcher -Checkout $Checkout }
    exit $LASTEXITCODE
  }
} catch {
  $report.result = 'failed'
  $report.error = $_.Exception.Message
  $reportPath = Write-Report
  Write-Host ''
  Write-Host 'AI-CODER Code-OSS developer setup failed.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Diagnostic report: $reportPath" -ForegroundColor Yellow
  Write-Host ''
  Write-Host 'Common causes:' -ForegroundColor Yellow
  Write-Host '  - Active Node version does not match the pinned checkout .nvmrc.'
  Write-Host '  - Visual Studio C++ Build Tools / Windows SDK are unavailable.'
  Write-Host '  - The checkout path contains spaces.'
  Write-Host '  - npm dependency installation failed.'
  throw
}
