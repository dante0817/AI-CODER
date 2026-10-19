param(
  [Parameter(Mandatory=$true)][string]$Checkout,
  [switch]$RunCompile,
  [switch]$SkipExtensionTests
)
$ErrorActionPreference = 'Stop'

function Require-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name is required but was not found on PATH." }
}
function Run-Step($label, [scriptblock]$action) {
  Write-Host "[AI-CODER] $label"
  & $action
  if ($LASTEXITCODE -ne 0) { throw "$label failed with exit code $LASTEXITCODE" }
}
function Get-Prop($obj, $name) {
  $p = $obj.PSObject.Properties[$name]
  if ($null -eq $p) { return $null }
  return $p.Value
}

Require-Cmd git
Require-Cmd node
$root = (Resolve-Path $Checkout).Path
$manifestPath = Join-Path $root 'AI-CODER-UPSTREAM.json'
$productPath = Join-Path $root 'product.json'
$extensionPath = Join-Path $root 'extensions\ai-coder'
$extensionPackagePath = Join-Path $extensionPath 'package.json'
$lockPath = Join-Path $PSScriptRoot 'upstream.lock.json'
$identityPath = Join-Path $PSScriptRoot 'product-identity.json'
foreach ($p in @($manifestPath,$productPath,$extensionPackagePath,$lockPath,$identityPath)) { if (-not (Test-Path $p)) { throw "Required qualification input is missing: $p" } }

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$product = Get-Content $productPath -Raw | ConvertFrom-Json
$extensionPackage = Get-Content $extensionPackagePath -Raw | ConvertFrom-Json
$lock = Get-Content $lockPath -Raw | ConvertFrom-Json
$identity = Get-Content $identityPath -Raw | ConvertFrom-Json
$head = (git -C $root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to read Code-OSS HEAD.' }
if ($head -ne $manifest.resolvedCommit) { throw "Code-OSS HEAD $head does not match pinned manifest commit $($manifest.resolvedCommit)." }
if (-not $head.StartsWith([string]$lock.expectedCommitPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Code-OSS HEAD $head does not match pinned prefix $($lock.expectedCommitPrefix)." }
if ([string]$manifest.lockedRelease -ne [string]$lock.release) { throw "Manifest release $($manifest.lockedRelease) does not match source lock $($lock.release)." }
if ($extensionPackage.version -ne $manifest.aiCoderVersion) { throw "Built-in extension version $($extensionPackage.version) does not match manifest $($manifest.aiCoderVersion)." }

$requiredIdentity = @('nameShort','nameLong','applicationName','dataFolderName')
$optionalIdentity = @('sharedDataFolderName','win32MutexName','win32DirName','win32NameVersion','win32RegValueName','win32AppUserModelId','win32ShellNameShort','urlProtocol')
foreach ($name in $requiredIdentity) {
  $expected = Get-Prop $identity $name; $actual = Get-Prop $product $name
  if ($null -eq $actual -or [string]$actual -ne [string]$expected) { throw "Required product identity $name is '$actual'; expected '$expected'." }
}
foreach ($name in $optionalIdentity) {
  $expected = Get-Prop $identity $name; $actual = Get-Prop $product $name
  if ($null -ne $actual -and $null -ne $expected -and [string]$actual -ne [string]$expected) { throw "Product identity $name is '$actual'; expected '$expected'." }
}

$extensionTests = 'skipped'
if (-not $SkipExtensionTests) {
  Push-Location $extensionPath
  try { Run-Step 'Run built-in AI-CODER Node regression suite' { node --test }; $extensionTests = 'passed' }
  finally { Pop-Location }
}

$compile = 'not-requested'
if ($RunCompile) {
  Require-Cmd npm
  $rootPackage = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
  if (-not ($rootPackage.scripts.PSObject.Properties.Name -contains 'compile')) { throw 'Pinned Code-OSS checkout does not expose npm compile; use the checkout-specific upstream build task.' }
  Push-Location $root
  try { Run-Step 'Compile pinned Code-OSS checkout' { npm run compile }; $compile = 'passed' }
  finally { Pop-Location }
}

$helper = Join-Path $extensionPath 'native\windows-safeio.exe'
$sourceHelper = Join-Path $PSScriptRoot 'builtin-ai-coder\native\windows-safeio.exe'
if (-not (Test-Path $helper) -or -not (Test-Path $sourceHelper)) { throw 'Windows Safe-I/O helper is missing.' }
$helperHash = (Get-FileHash $helper -Algorithm SHA256).Hash.ToLowerInvariant()
$sourceHelperHash = (Get-FileHash $sourceHelper -Algorithm SHA256).Hash.ToLowerInvariant()
if ($helperHash -ne $sourceHelperHash) { throw "Staged Safe-I/O hash $helperHash does not match source $sourceHelperHash." }

$qualification = [ordered]@{
  formatVersion = 2
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  aiCoderVersion = $extensionPackage.version
  lockedRelease = $lock.release
  codeOSSCommit = $head
  productIdentity = 'passed'
  builtInExtensionTests = $extensionTests
  compile = $compile
  windowsSafeIoSha256 = $helperHash
  windowsSafeIoParity = 'passed'
  sourceQualificationPassed = $true
  nativeWindowsBuildQualified = $false
  result = 'source-candidate-passed'
  note = 'This source qualification is not the native Windows packaged-build/security qualification gate.'
}
$qualificationPath = Join-Path $root 'AI-CODER-QUALIFICATION.json'
$qualification | ConvertTo-Json -Depth 20 | Set-Content $qualificationPath -Encoding UTF8
Write-Host ''
Write-Host 'AI-CODER Code-OSS source qualification passed.' -ForegroundColor Green
Write-Host "Report: $qualificationPath"
Write-Host 'Native Windows packaged-build qualification remains PENDING.' -ForegroundColor Yellow
