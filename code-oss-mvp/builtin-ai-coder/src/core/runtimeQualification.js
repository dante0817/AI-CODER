'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function buildRuntimeQualificationReport(vscode, context, workbench) {
  const packageJson = readJson(path.join(context.extensionPath || path.resolve(__dirname, '..', '..'), 'package.json')) || {};
  const appRoot = vscode?.env?.appRoot || '';
  const upstreamManifestPath = appRoot ? path.join(appRoot, 'AI-CODER-UPSTREAM.json') : '';
  const upstream = upstreamManifestPath ? readJson(upstreamManifestPath) : null;
  const folders = vscode?.workspace?.workspaceFolders || [];
  const folder = folders.length === 1 ? folders[0] : null;
  const localWorkspace = !!(folder && folder.uri?.scheme === 'file');
  const workspaceTrusted = vscode?.workspace?.isTrusted === true;
  const helper = path.join(context.extensionPath || path.resolve(__dirname, '..', '..'), 'native', 'windows-safeio.exe');
  const helperPresent = fs.existsSync(helper);
  const warnings = [];
  if (!localWorkspace) warnings.push(folders.length > 1 ? 'Multiple workspace roots are open; v0.6 task execution requires exactly one local workspace root.' : 'No single local file workspace is open; durable project-state qualification is unavailable.');
  if (!workspaceTrusted) warnings.push('Workspace Trust is not granted; Agent mutation and verification must remain blocked.');
  if (!workbench?.projectStateLock) warnings.push('Cross-process project-state lock is not configured.');
  if (!workbench?.taskExecutionLease) warnings.push('Per-task execution lease is not configured.');
  if (!upstream) warnings.push('AI-CODER-UPSTREAM.json is not present at the Code-OSS app root; this looks like a development/extension-host run rather than a pinned branded build.');
  if (upstream && packageJson.version && upstream.aiCoderVersion !== packageJson.version) warnings.push('Built-in extension version does not match AI-CODER-UPSTREAM.json.');
  if (process.platform === 'win32' && !helperPresent) warnings.push('Windows Safe-I/O helper is missing.');

  const report = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    aiCoderVersion: packageJson.version || 'unknown',
    runtime: {
      appName: vscode?.env?.appName || '', appRoot, platform: process.platform,
      brandedPinnedBuild: !!upstream,
      nativeWindowsBuildQualified: !!upstream?.nativeWindowsBuildQualified,
      upstreamManifest: upstream || null
    },
    workspace: {
      localFileWorkspace: localWorkspace,
      singleWorkspaceRoot: folders.length === 1,
      workspaceTrusted,
      path: localWorkspace ? folder.uri.fsPath : null,
      durableTasks: !!workbench?.tasks?.collection?.available?.(),
      durableCheckpoints: !!workbench?.checkpoints?.collection?.available?.(),
      durableActivity: !!workbench?.activity?.available?.(),
      crossProcessProjectStateLock: !!workbench?.projectStateLock,
      taskExecutionLease: !!workbench?.taskExecutionLease,
      runtimeRoot: workbench?.runtimeRoot || null,
      lockScope: 'same OS user + stable AI-CODER runtime root + canonical local workspace path'
    },
    safeIo: {
      mode: process.platform === 'win32' ? 'windows-native-helper' : 'posix-confined-atomic-io',
      windowsHelperPresent: helperPresent,
      windowsHelperSha256: helperPresent ? sha256File(helper) : null
    },
    qualification: {
      runtimeCandidate: localWorkspace && workspaceTrusted && !!workbench?.projectStateLock && !!workbench?.taskExecutionLease && (process.platform !== 'win32' || helperPresent),
      pinnedBrandedSource: !!upstream && (!packageJson.version || upstream.aiCoderVersion === packageJson.version),
      sourceCandidate: localWorkspace && workspaceTrusted && !!workbench?.projectStateLock && !!workbench?.taskExecutionLease
        && (process.platform !== 'win32' || helperPresent) && !!upstream && (!packageJson.version || upstream.aiCoderVersion === packageJson.version),
      candidate: localWorkspace && workspaceTrusted && !!workbench?.projectStateLock && !!workbench?.taskExecutionLease
        && (process.platform !== 'win32' || helperPresent) && !!upstream && (!packageJson.version || upstream.aiCoderVersion === packageJson.version)
        && (process.platform !== 'win32' || !!upstream.nativeWindowsBuildQualified),
      warnings
    }
  };
  return report;
}

module.exports = { buildRuntimeQualificationReport, sha256File };
