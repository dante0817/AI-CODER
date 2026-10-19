param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [Parameter(Mandatory = $true)]
  [string]$Checkout,
  [Parameter(Mandatory = $true)]
  [string]$BackupRoot
)

$ErrorActionPreference = 'Stop'
$sourceManifest = Join-Path $Source 'package.json'
$destination = Join-Path $Checkout 'extensions\ai-coder'
if (-not (Test-Path -LiteralPath $sourceManifest)) { throw "AI-CODER extension source is missing: $Source" }
if (-not (Test-Path -LiteralPath $Checkout)) { throw "Code-OSS checkout is missing: $Checkout" }
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$changed = 0
$files = Get-ChildItem -LiteralPath $Source -Recurse -File | Where-Object {
  $_.FullName -notmatch '[\\/]node_modules[\\/]'
}
foreach ($file in $files) {
  $relative = $file.FullName.Substring($Source.Length).TrimStart('\', '/')
  $target = Join-Path $destination $relative
  if (Test-Path -LiteralPath $target) {
    $oldHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    $newHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    if ($oldHash -eq $newHash) { continue }
    $backup = Join-Path $BackupRoot $relative
    if (-not (Test-Path -LiteralPath $backup)) {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
      Copy-Item -LiteralPath $target -Destination $backup
    }
    $changed++
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}

$sourceVersion = [string](Get-Content -LiteralPath $sourceManifest -Raw | ConvertFrom-Json).version
$stagedManifest = Get-Content -LiteralPath (Join-Path $destination 'package.json') -Raw | ConvertFrom-Json
if ([string]$stagedManifest.version -ne $sourceVersion) { throw 'Staged AI-CODER extension version does not match the RC4 source.' }
Write-Host "Staged AI-CODER extension $sourceVersion ($changed changed files backed up at $BackupRoot)." -ForegroundColor Green
