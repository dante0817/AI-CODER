param(
  [string]$Destination = "$PSScriptRoot\AI-CODER-CodeOSS",
  [string]$CodeOSSRepo = "",
  [string]$CodeOSSRef = "",
  [switch]$SkipClone,
  [switch]$DevelopmentUnpinned
)
$ErrorActionPreference = 'Stop'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Require-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name is required but was not found on PATH." }
}
function Set-ExistingProperty($object, $name, $value) {
  if ($object.PSObject.Properties.Name -contains $name) { $object.$name = $value; return $true }
  return $false
}

Require-Cmd git
$lockPath = Join-Path $PSScriptRoot 'upstream.lock.json'
$identityPath = Join-Path $PSScriptRoot 'product-identity.json'
if (-not (Test-Path $lockPath)) { throw 'upstream.lock.json is missing.' }
if (-not (Test-Path $identityPath)) { throw 'product-identity.json is missing.' }
$lock = Get-Content $lockPath -Raw | ConvertFrom-Json
$identity = Get-Content $identityPath -Raw | ConvertFrom-Json
if (-not $CodeOSSRepo) { $CodeOSSRepo = $lock.repository }
if (-not $CodeOSSRef -and -not $DevelopmentUnpinned) { $CodeOSSRef = $lock.ref }
if (-not $CodeOSSRef -and -not $DevelopmentUnpinned) { throw 'Production-candidate bootstrap requires a pinned Code-OSS ref.' }

if (-not $SkipClone) {
  if (Test-Path $Destination) { throw "Destination already exists: $Destination" }
  Write-Host 'Cloning Code-OSS source metadata...'
  git clone --filter=blob:none --no-checkout $CodeOSSRepo $Destination
  if ($LASTEXITCODE -ne 0) { throw "Code-OSS clone failed with exit code $LASTEXITCODE" }
}
if (-not (Test-Path $Destination)) { throw "Code-OSS source not found: $Destination" }

if ($CodeOSSRef) {
  Write-Host "Resolving pinned Code-OSS ref: $CodeOSSRef"
  git -C $Destination fetch --depth 1 origin $CodeOSSRef
  if ($LASTEXITCODE -ne 0) { throw "Unable to fetch Code-OSS ref: $CodeOSSRef" }
  $targetCommit = (git -C $Destination rev-parse FETCH_HEAD).Trim()
  $currentCommit = (git -C $Destination rev-parse HEAD 2>$null).Trim()
  if ($currentCommit -ne $targetCommit) {
    git -C $Destination checkout --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to check out Code-OSS ref: $CodeOSSRef. If this is a dedicated AI-CODER checkout with local upstream edits, restore or remove those edits before retrying."
    }
  } else {
    Write-Host "Pinned upstream commit already checked out: $currentCommit"
  }
} elseif ($DevelopmentUnpinned) {
  Write-Warning 'DevelopmentUnpinned was requested. This checkout is NOT eligible for a production-candidate qualification.'
  git -C $Destination checkout --detach HEAD
}

$upstreamCommit = (git -C $Destination rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $upstreamCommit) { throw 'Unable to resolve Code-OSS upstream commit.' }
if (-not $DevelopmentUnpinned -and $lock.expectedCommitPrefix -and -not $upstreamCommit.StartsWith([string]$lock.expectedCommitPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Resolved Code-OSS commit $upstreamCommit does not match expected release prefix $($lock.expectedCommitPrefix). Ref/tag drift or an unexpected upstream object was detected."
}

$productPath = Join-Path $Destination 'product.json'
if (-not (Test-Path $productPath)) { throw 'product.json not found; this does not look like a Code-OSS checkout.' }
$product = Get-Content $productPath -Raw | ConvertFrom-Json
$required = @('nameShort','nameLong','applicationName','dataFolderName')
foreach ($name in $required) {
  if (-not ($product.PSObject.Properties.Name -contains $name)) { throw "Pinned Code-OSS product.json is missing required identity field: $name" }
  $product.$name = $identity.$name
}
$optionalIdentity = @('sharedDataFolderName','win32MutexName','win32DirName','win32NameVersion','win32RegValueName','win32AppUserModelId','win32ShellNameShort','urlProtocol')
foreach ($name in $optionalIdentity) { Set-ExistingProperty $product $name $identity.$name | Out-Null }
$productJson = $product | ConvertTo-Json -Depth 100
# scripts/code.bat parses nameShort with FOR /F and expects one space after the colon.
$productJson = $productJson -replace '("nameShort":)\s+', '$1 '
[System.IO.File]::WriteAllText($productPath, $productJson, $utf8NoBom)

$sourceExt = Join-Path $PSScriptRoot 'builtin-ai-coder'
$destExt = Join-Path $Destination 'extensions\ai-coder'
if (Test-Path $destExt) { Remove-Item $destExt -Recurse -Force }
Copy-Item $sourceExt $destExt -Recurse

$extensionPackage = Get-Content (Join-Path $sourceExt 'package.json') -Raw | ConvertFrom-Json
$upstreamDescribe = (git -C $Destination describe --always --dirty 2>$null).Trim()
$nvmrc = Join-Path $Destination '.nvmrc'
$requiredNode = if (Test-Path $nvmrc) { (Get-Content $nvmrc -Raw).Trim() } else { $null }
$manifest = [ordered]@{
  formatVersion = 2
  product = 'AI-CODER'
  aiCoderVersion = $extensionPackage.version
  codeOSSRepository = $CodeOSSRepo
  lockedRelease = $lock.release
  requestedRef = $CodeOSSRef
  expectedCommitPrefix = $lock.expectedCommitPrefix
  resolvedCommit = $upstreamCommit
  resolvedDescribe = $upstreamDescribe
  requiredNode = $requiredNode
  pinned = (-not $DevelopmentUnpinned)
  nativeWindowsBuildQualified = $false
  stagedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  builtInExtension = 'extensions/ai-coder'
}
[System.IO.File]::WriteAllText((Join-Path $Destination 'AI-CODER-UPSTREAM.json'), ($manifest | ConvertTo-Json -Depth 20), $utf8NoBom)

Write-Host ''
Write-Host 'AI-CODER branding and built-in workbench runtime have been staged.' -ForegroundColor Green
Write-Host "Code-OSS checkout: $Destination"
Write-Host "Upstream commit: $upstreamCommit"
Write-Host 'Build manifest: AI-CODER-UPSTREAM.json'
Write-Host 'Next: run preflight-code-oss.ps1 and qualify-code-oss.ps1. A source qualification does not substitute for the native Windows packaged-build gate.' -ForegroundColor Yellow
