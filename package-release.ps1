<#
.SYNOPSIS
    Authoritative release build, verification, and packaging script for AI-CODER Combined.
.DESCRIPTION
    1. Clean-builds native windows-safeio.exe helper with Go.
    2. Enforces bit-for-bit SHA-256 parity between Desktop and Code-OSS helpers.
    3. Validates windows-safeio helper version and build provenance.
    4. Executes complete Python and Node.js test suites.
    5. Packages clean distributable zip archive under dist/.
    6. Extracts package to a temporary location and verifies artifact integrity.
#>

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " AI-CODER Combined - Release Build & Packaging Pipeline" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Clean Build Native Helper
Write-Host "`n[1/6] Building native windows-safeio.exe helper..." -ForegroundColor Yellow
$buildScript = Join-Path $repoRoot "native\windows-safeio\build-windows-safeio.ps1"
powershell -ExecutionPolicy Bypass -File $buildScript

$desktopHelper = Join-Path $repoRoot "native\windows-safeio\windows-safeio.exe"
$codeOssHelper = Join-Path $repoRoot "code-oss-mvp\builtin-ai-coder\native\windows-safeio.exe"

if (-not (Test-Path $desktopHelper)) { throw "Desktop helper binary missing: $desktopHelper" }
if (-not (Test-Path $codeOssHelper)) { throw "Code-OSS helper binary missing: $codeOssHelper" }

# 2. Verify Binary Parity & Version
Write-Host "`n[2/6] Verifying helper binary parity & provenance..." -ForegroundColor Yellow
$desktopHash = (Get-FileHash -Algorithm SHA256 $desktopHelper).Hash
$codeOssHash = (Get-FileHash -Algorithm SHA256 $codeOssHelper).Hash

if ($desktopHash -ne $codeOssHash) {
    throw "Helper SHA-256 parity failure: Desktop ($desktopHash) != Code-OSS ($codeOssHash)"
}
Write-Host "  SHA-256: $desktopHash" -ForegroundColor Green

$versionJson = & $desktopHelper version
Write-Host "  Version: $versionJson" -ForegroundColor Gray
$meta = $versionJson | ConvertFrom-Json
if ($meta.protocol -ne 1) { throw "Invalid helper protocol version: $($meta.protocol)" }
if ($meta.arch -ne "windows/amd64") { throw "Invalid helper arch: $($meta.arch)" }

# 3. Execute Python Test Suite
Write-Host "`n[3/6] Running Python test suite..." -ForegroundColor Yellow
Push-Location $repoRoot
try {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m pytest -v
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        & py -m pytest -v
    } else {
        throw "Python executable not found in PATH."
    }
    if ($LASTEXITCODE -ne 0) { throw "Python tests failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

# 4. Execute Code-OSS Extension Test Suite
Write-Host "`n[4/6] Running Code-OSS Node.js test suite..." -ForegroundColor Yellow
$codeOssDir = Join-Path $repoRoot "code-oss-mvp\builtin-ai-coder"
Push-Location $codeOssDir
try {
    & npm test
    if ($LASTEXITCODE -ne 0) { throw "Node.js tests failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

# 5. Package Clean Distributable Archive
Write-Host "`n[5/6] Creating release archive..." -ForegroundColor Yellow
$distDir = Join-Path $repoRoot "dist"
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir | Out-Null
}

$packageJson = Get-Content (Join-Path $repoRoot "code-oss-mvp\builtin-ai-coder\package.json") -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
$artifactVersion = $version -replace '-rc\.(\d+)$', '-rc$1'
$zipName = "AI-CODER-v$artifactVersion-combined.zip"
$zipPath = Join-Path $distDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$excludePatterns = @(
    "\.git",
    "\.pytest_cache",
    "__pycache__",
    "\.venv",
    "\bvenv\b",
    "\bnode_modules\b",
    "\bdist\b",
    "\.pytest_cache",
    "\.mypy_cache",
    "\.ruff_cache"
)

$allFiles = Get-ChildItem -Path $repoRoot -Recurse -File | Where-Object {
    $filePath = $_.FullName
    $rel = $filePath.Substring($repoRoot.Length).TrimStart("\/")
    $leaf = $_.Name
    $excluded = $false
    foreach ($p in $excludePatterns) {
        if ($rel -match $p) {
            $excluded = $true
            break
        }
    }
    # Keep non-secret templates such as .env.example, but never package real local env/key material.
    if ($leaf -match '^\.env($|\.)' -and $leaf -notmatch '^\.env\.(example|sample|template)$') { $excluded = $true }
    if ($leaf -match '\.(pem|key|p12|pfx)$') { $excluded = $true }
    -not $excluded
}

Write-Host "  Compressing $($allFiles.Count) files into $zipName..." -ForegroundColor Gray
$tempStage = Join-Path $env:TEMP "ai-coder-stage-$([System.Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempStage | Out-Null
try {
    $folderName = "AI-CODER-v$artifactVersion-combined"
    $stageRoot = Join-Path $tempStage $folderName
    New-Item -ItemType Directory -Path $stageRoot | Out-Null

    foreach ($file in $allFiles) {
        $relPath = $file.FullName.Substring($repoRoot.Length).TrimStart("\/")
        $targetPath = Join-Path $stageRoot $relPath
        $targetDir = Split-Path -Parent $targetPath
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        Copy-Item -Path $file.FullName -Destination $targetPath -Force
    }

    Compress-Archive -Path "$tempStage\*" -DestinationPath $zipPath -CompressionLevel Optimal
} finally {
    if (Test-Path $tempStage) { Remove-Item -Path $tempStage -Recurse -Force -ErrorAction SilentlyContinue }
}

$zipSizeMb = [math]::Round(((Get-Item $zipPath).Length / 1MB), 2)
$zipHash = (Get-FileHash -Algorithm SHA256 $zipPath).Hash
Write-Host "  Created $zipPath ($zipSizeMb MB)" -ForegroundColor Green
Write-Host "  ZIP SHA-256: $zipHash" -ForegroundColor Green

# 6. Extract Package and Verify Artifact Integrity
Write-Host "`n[6/6] Extracting package to test clean execution..." -ForegroundColor Yellow
$tempExtract = Join-Path $env:TEMP "ai-coder-verify-$([System.Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempExtract | Out-Null
try {
    Expand-Archive -Path $zipPath -DestinationPath $tempExtract
    $extractedFolder = Join-Path $tempExtract "AI-CODER-v$artifactVersion-combined"
    $extractedHelper = Join-Path $extractedFolder "native\windows-safeio\windows-safeio.exe"

    if (-not (Test-Path $extractedHelper)) {
        throw "Extracted package is missing native helper: $extractedHelper"
    }

    $extractedHash = (Get-FileHash -Algorithm SHA256 $extractedHelper).Hash
    if ($extractedHash -ne $desktopHash) {
        throw "Packaged helper hash ($extractedHash) does not match built binary ($desktopHash)"
    }

    $extractedVersion = & $extractedHelper version
    Write-Host "  Extracted helper successfully verified: $extractedVersion" -ForegroundColor Green
} finally {
    if (Test-Path $tempExtract) { Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " Release Build & Verification Succeeded!" -ForegroundColor Green
Write-Host " Artifact: $zipPath" -ForegroundColor Green
Write-Host " SHA-256:  $zipHash" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
