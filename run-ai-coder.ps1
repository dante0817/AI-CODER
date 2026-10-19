$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host 'AI-CODER legacy/reference Tkinter UI. For the target Code-OSS GUI, first use prepare-ai-coder-codeoss.ps1, then run-ai-coder-codeoss.ps1.' -ForegroundColor Yellow
if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 -m ai_coder
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python -m ai_coder
} else {
    throw 'Python 3.11+ was not found on PATH.'
}
