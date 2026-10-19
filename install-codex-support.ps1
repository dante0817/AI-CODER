$ErrorActionPreference = 'Stop'

$codex = Get-Command codex.exe, codex.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
if ($codex) {
  Write-Host "OpenAI Codex CLI is already available: $($codex.Source)" -ForegroundColor Green
  & $codex.Source --version
  if ($LASTEXITCODE -ne 0) { throw 'Codex CLI was found but failed to report its version.' }
  Write-Host 'In AI-CODER, open the AI Task Workbench and choose Sign in to ChatGPT. Sign-in uses the Codex CLI browser flow.'
  return
}

$npm = Get-Command npm.cmd, npm -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $npm) { throw 'Node.js/npm is required to install the official OpenAI Codex CLI.' }
Write-Host 'This installs the official OpenAI Codex CLI from npm. It does not make an API/model request.' -ForegroundColor Yellow
$answer = Read-Host 'Download and install @openai/codex for your Windows user now? [y/N]'
if ($answer -notmatch '^(y|yes)$') {
  Write-Host 'Skipped. No software was downloaded or installed.'
  return
}

& $npm.Source install --global @openai/codex
if ($LASTEXITCODE -ne 0) { throw "Codex CLI install failed with exit code $LASTEXITCODE" }
$codex = Get-Command codex.exe, codex.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $codex) { throw 'Codex CLI install completed but codex.exe/codex.cmd is not on PATH. Open a new terminal or add the npm global bin directory to PATH.' }
& $codex.Source --version
if ($LASTEXITCODE -ne 0) { throw 'Installed Codex CLI failed to report its version.' }
Write-Host 'Open AI-CODER, choose Sign in to ChatGPT, and complete the browser authorization when ready.' -ForegroundColor Green
