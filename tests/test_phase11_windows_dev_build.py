from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def test_rc4_versions_are_consistent():
    assert '0.6.0-rc.4' in (ROOT / 'ai_coder' / '__init__.py').read_text(encoding='utf-8')
    pkg = json.loads((ROOT / 'code-oss-mvp' / 'builtin-ai-coder' / 'package.json').read_text(encoding='utf-8'))
    assert pkg['version'] == '0.6.0-rc.4'


def test_one_command_codeoss_developer_setup_is_present_and_safe_by_default():
    ps1 = (ROOT / 'prepare-ai-coder-codeoss.ps1').read_text(encoding='utf-8')
    bat = (ROOT / 'prepare-ai-coder-codeoss.bat').read_text(encoding='utf-8')
    assert "AI-CODER\\dev\\CodeOSS-$releaseName" in ps1
    assert '-RequireBuildToolchain' in ps1
    assert 'npm install' in ps1
    assert 'npm run compile' in ps1
    assert 'AI-CODER-DEV-BUILD.json' in ps1
    assert 'nativeWindowsBuildQualified = $false' in ps1
    assert 'winget install' not in ps1.lower()
    assert 'choco install' not in ps1.lower()
    assert 'shell:true' not in ps1.lower()
    assert 'prepare-ai-coder-codeoss.ps1' in bat


def test_development_launcher_uses_same_stable_default_checkout():
    ps1 = (ROOT / 'run-ai-coder-codeoss.ps1').read_text(encoding='utf-8')
    assert "AI-CODER\\dev\\CodeOSS-$releaseName" in ps1
    assert "Join-Path $Checkout 'out'" in ps1
    assert 'prepare-ai-coder-codeoss.ps1' in ps1


def test_native_preflight_can_require_windows_build_toolchain():
    ps1 = (ROOT / 'code-oss-mvp' / 'preflight-code-oss.ps1').read_text(encoding='utf-8')
    assert '[switch]$RequireBuildToolchain' in ps1
    assert 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64' in ps1
    assert 'Windows Kits\\10\\Include' in ps1
    assert 'windowsSdkVisible' in ps1


def test_bootstrap_can_restage_same_pinned_commit_without_checkout_churn():
    ps1 = (ROOT / 'code-oss-mvp' / 'bootstrap-code-oss.ps1').read_text(encoding='utf-8')
    assert '$targetCommit' in ps1
    assert '$currentCommit -ne $targetCommit' in ps1
    assert 'Pinned upstream commit already checked out' in ps1


def test_documentation_no_longer_recommends_whitespace_checkout_path():
    readme = (ROOT / 'code-oss-mvp' / 'README.md').read_text(encoding='utf-8')
    assert 'X:\\2M\\000\\AI Coders\\AI-CODER-CodeOSS' not in readme
    assert 'prepare-ai-coder-codeoss.ps1' in readme
