param(
  [Parameter(Mandatory = $true)]
  [string]$Checkout,
  [string]$PackageRoot = ''
)

$ErrorActionPreference = 'Stop'
$gulpfile = Join-Path $Checkout 'build\gulpfile.vscode.ts'
if (-not (Test-Path -LiteralPath $gulpfile)) { throw "Code-OSS packaging task not found: $gulpfile" }

$source = [System.IO.File]::ReadAllText($gulpfile)
$anchor = @'
		const builtInCopilotExtensionDir = path.join(appBase, 'extensions', 'copilot');
		prepareBuiltInCopilotRipgrepShim(platform, arch, builtInCopilotExtensionDir, appNodeModulesDir);
'@
$replacement = @'
		const builtInCopilotExtensionDir = path.join(appBase, 'extensions', 'copilot');
		// The minified Windows package can omit the Copilot CLI SDK from the
		// extension. Restore the exact already-installed, lockfile-pinned package
		// before the normal shim helper runs; never fetch a replacement here.
		if (platform === 'win32' && arch === 'x64') {
			const sourceCopilotDir = path.join(root, 'extensions', 'copilot', 'node_modules', '@github', 'copilot');
			const extensionLock = JSON.parse(fs.readFileSync(path.join(root, 'extensions', 'copilot', 'package-lock.json'), 'utf8'));
			const sourceVersion = JSON.parse(fs.readFileSync(path.join(sourceCopilotDir, 'package.json'), 'utf8')).version;
			const lockedVersion = extensionLock.packages?.['node_modules/@github/copilot']?.version;
			if (!sourceVersion || sourceVersion !== lockedVersion) {
				throw new Error(`[AI-CODER Copilot shim] Installed @github/copilot ${sourceVersion || '(missing)'} does not match lockfile ${lockedVersion || '(missing)'}.`);
			}
			const packagedCopilotDir = path.join(builtInCopilotExtensionDir, 'node_modules', '@github', 'copilot');
			if (!fs.existsSync(path.join(packagedCopilotDir, 'sdk'))) {
				fs.mkdirSync(path.dirname(packagedCopilotDir), { recursive: true });
				fs.cpSync(sourceCopilotDir, packagedCopilotDir, { recursive: true });
				console.log(`[AI-CODER Copilot shim] Staged lockfile-pinned @github/copilot@${sourceVersion}.`);
			}
			const sourcePlatformDir = path.join(root, 'extensions', 'copilot', 'node_modules', '@github', 'copilot-win32-x64');
			const packagedPlatformDir = path.join(appNodeModulesDir, '@github', 'copilot-win32-x64');
			const sourcePlatformVersion = JSON.parse(fs.readFileSync(path.join(sourcePlatformDir, 'package.json'), 'utf8')).version;
			if (sourcePlatformVersion !== sourceVersion) {
				throw new Error(`[AI-CODER Copilot shim] @github/copilot-win32-x64 ${sourcePlatformVersion} does not match @github/copilot ${sourceVersion}.`);
			}
			if (fs.existsSync(path.join(packagedPlatformDir, 'package.json'))) {
				const packagedVersion = JSON.parse(fs.readFileSync(path.join(packagedPlatformDir, 'package.json'), 'utf8')).version;
				if (packagedVersion !== sourceVersion) {
					throw new Error(`[AI-CODER Copilot shim] Packaged native ${packagedVersion} does not match extension ${sourceVersion}; refusing to overwrite it.`);
				}
			} else {
				fs.mkdirSync(path.dirname(packagedPlatformDir), { recursive: true });
				fs.cpSync(sourcePlatformDir, packagedPlatformDir, { recursive: true });
				console.log(`[AI-CODER Copilot shim] Staged lockfile-pinned @github/copilot-win32-x64@${sourceVersion}.`);
			}
		}
		prepareBuiltInCopilotRipgrepShim(platform, arch, builtInCopilotExtensionDir, appNodeModulesDir);
'@

if ($source.Contains($replacement)) {
  Write-Host 'Copilot SDK staging workaround is already applied.' -ForegroundColor DarkGray
} else {
  if (-not $source.Contains($anchor)) {
    throw 'The pinned Code-OSS Copilot shim task no longer matches the expected source. No upstream file was changed.'
  }
  $updated = $source.Replace($anchor, $replacement)
  [System.IO.File]::WriteAllText($gulpfile, $updated, [System.Text.UTF8Encoding]::new($false))
  Write-Host 'Applied the offline, version-matched Copilot SDK shim staging workaround.' -ForegroundColor Green
}

if (-not $PackageRoot) { return }
if (-not (Test-Path -LiteralPath $PackageRoot)) { throw "Packaged app resources directory is missing: $PackageRoot" }

$extensionRoot = Join-Path $Checkout 'extensions\copilot'
$sourceCopilot = Join-Path $extensionRoot 'node_modules\@github\copilot'
$sourceNative = Join-Path $extensionRoot 'node_modules\@github\copilot-win32-x64'
$lock = Get-Content -LiteralPath (Join-Path $extensionRoot 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
$lockedVersion = [string]$lock.packages['node_modules/@github/copilot'].version
$sdkVersion = [string](Get-Content -LiteralPath (Join-Path $sourceCopilot 'package.json') -Raw | ConvertFrom-Json).version
$nativeVersion = [string](Get-Content -LiteralPath (Join-Path $sourceNative 'package.json') -Raw | ConvertFrom-Json).version
if (-not $lockedVersion -or $sdkVersion -ne $lockedVersion -or $nativeVersion -ne $sdkVersion) {
  throw "Installed Copilot SDK/native versions do not match the extension lockfile ($lockedVersion / $sdkVersion / $nativeVersion)."
}

$packagedCopilot = Join-Path $PackageRoot 'extensions\copilot\node_modules\@github\copilot'
if (-not (Test-Path -LiteralPath (Join-Path $packagedCopilot 'sdk'))) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $packagedCopilot) | Out-Null
  Copy-Item -LiteralPath $sourceCopilot -Destination $packagedCopilot -Recurse
}
$packagedNative = Join-Path $PackageRoot 'node_modules\@github\copilot-win32-x64'
$packagedNativeManifest = Join-Path $packagedNative 'package.json'
if (Test-Path -LiteralPath $packagedNativeManifest) {
  $packagedVersion = [string](Get-Content -LiteralPath $packagedNativeManifest -Raw | ConvertFrom-Json).version
  if ($packagedVersion -ne $sdkVersion) { throw "Packaged Copilot native version $packagedVersion does not match $sdkVersion; refusing to overwrite it." }
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $packagedNative) | Out-Null
  Copy-Item -LiteralPath $sourceNative -Destination $packagedNative -Recurse
}
Write-Host "Staged offline Copilot SDK/native packages version $sdkVersion in $PackageRoot." -ForegroundColor Green
