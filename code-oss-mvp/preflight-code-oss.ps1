param(
  [Parameter(Mandatory=$true)][string]$Checkout,
  [switch]$RequireWindows,
  [switch]$RequireBuildToolchain
)
$ErrorActionPreference = 'Stop'

function Cmd($name) { return Get-Command $name -ErrorAction SilentlyContinue }
function VersionOf($name, $commandArgs) {
  $cmd = Cmd $name; if (-not $cmd) { return $null }
  try { return ((& $name @commandArgs 2>$null | Select-Object -First 1) -as [string]).Trim() } catch { return $null }
}

$root = (Resolve-Path $Checkout).Path
$warnings = New-Object System.Collections.Generic.List[string]
$errors = New-Object System.Collections.Generic.List[string]
if ($root -match '\s') { $errors.Add('The Code-OSS source path contains whitespace. Use a short path without spaces for native builds.') }
foreach ($name in @('git','node','npm')) { if (-not (Cmd $name)) { $errors.Add("$name is required but was not found on PATH.") } }
$pythonCommand = if (Cmd 'python') { 'python' } elseif (Cmd 'py') { 'py' } else { $null }
if (-not $pythonCommand) { $errors.Add('Python is required but neither python nor py was found on PATH.') }

$nvmrc = Join-Path $root '.nvmrc'
$requiredNode = if (Test-Path $nvmrc) { (Get-Content $nvmrc -Raw).Trim().TrimStart('v') } else { $null }
$currentNode = (VersionOf 'node' @('--version'))
if ($currentNode) { $currentNode = $currentNode.TrimStart('v') }
if ($requiredNode -and $currentNode -and $requiredNode -ne $currentNode) { $errors.Add("Node $currentNode is active but the pinned checkout requires $requiredNode from .nvmrc.") }
if (-not $requiredNode) { $warnings.Add('Pinned checkout has no .nvmrc; verify the upstream build prerequisites manually.') }

$isWindows = $IsWindows -or $env:OS -eq 'Windows_NT'
if ($RequireWindows -and -not $isWindows) { $errors.Add('Native Windows qualification was requested, but this host is not Windows.') }
$vswhere = $null
$vsInstallation = $null
$windowsSdkVisible = $false
if ($isWindows) {
  $candidate = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (Test-Path $candidate) {
    $vswhere = $candidate
    try {
      $vsInstallation = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
      if ($vsInstallation) { $vsInstallation = ([string]$vsInstallation).Trim() }
    } catch { $vsInstallation = $null }
  }
  $sdkInclude = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Include'
  if (Test-Path $sdkInclude) {
    $windowsSdkVisible = [bool](Get-ChildItem $sdkInclude -Directory -ErrorAction SilentlyContinue | Select-Object -First 1)
  }
  if (-not $vsInstallation -and -not (Cmd 'cl')) {
    $message = 'MSVC C++ Build Tools were not found. Install Visual Studio Build Tools with Desktop development with C++ (or run from a configured VS Developer shell).'
    if ($RequireBuildToolchain) { $errors.Add($message) } else { $warnings.Add($message) }
  }
  if (-not $windowsSdkVisible) {
    $message = 'A Windows 10/11 SDK installation was not detected under Windows Kits\10. The pinned Code-OSS native dependencies require a Windows SDK.'
    if ($RequireBuildToolchain) { $errors.Add($message) } else { $warnings.Add($message) }
  }
}

$manifestPath = Join-Path $root 'AI-CODER-UPSTREAM.json'
if (-not (Test-Path $manifestPath)) { $errors.Add('AI-CODER-UPSTREAM.json is missing. Run bootstrap-code-oss.ps1 first.') }
$manifest = if (Test-Path $manifestPath) { Get-Content $manifestPath -Raw | ConvertFrom-Json } else { $null }
$head = if (Cmd 'git') { (git -C $root rev-parse HEAD 2>$null).Trim() } else { $null }
if ($manifest -and $head -and $head -ne $manifest.resolvedCommit) { $errors.Add("Checkout HEAD $head does not match staged manifest $($manifest.resolvedCommit).") }

$report = [ordered]@{
  formatVersion = 1
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  checkout = $root
  platform = [System.Environment]::OSVersion.Platform.ToString()
  isWindows = [bool]$isWindows
  git = (VersionOf 'git' @('--version'))
  node = $currentNode
  requiredNode = $requiredNode
  npm = (VersionOf 'npm' @('--version'))
  python = if ($pythonCommand) { VersionOf $pythonCommand @('--version') } else { $null }
  msVcVisible = [bool](Cmd 'cl')
  vswhere = $vswhere
  visualStudioInstallation = $vsInstallation
  windowsSdkVisible = [bool]$windowsSdkVisible
  requireBuildToolchain = [bool]$RequireBuildToolchain
  warnings = @($warnings)
  errors = @($errors)
  nativeWindowsBuildQualified = $false
  result = if ($errors.Count) { 'failed' } else { 'preflight-passed' }
}
$out = Join-Path $root 'AI-CODER-PREFLIGHT.json'
$report | ConvertTo-Json -Depth 20 | Set-Content $out -Encoding UTF8
$report | ConvertTo-Json -Depth 20
if ($errors.Count) { throw "AI-CODER Code-OSS preflight failed with $($errors.Count) error(s). See $out" }
Write-Host "AI-CODER source/build preflight passed. Native Windows packaged-build qualification is still required. Report: $out" -ForegroundColor Yellow
