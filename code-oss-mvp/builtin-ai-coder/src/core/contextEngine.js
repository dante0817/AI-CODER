'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { isSensitivePath } = require('./policy');
const { resolveWorkspacePath, readWorkspaceFile, decodeUtf8Text, encodeUtf8Text } = require('./workspacePaths');

const DEFAULT_EXCLUDES = ['node_modules', '.git', '.ai-coder', 'dist', 'build', '.next', 'coverage', '.venv', 'venv', '__pycache__'];
const TEXT_EXTENSIONS = new Set(['.js','.jsx','.ts','.tsx','.json','.md','.txt','.py','.java','.cs','.cpp','.c','.h','.hpp','.go','.rs','.php','.rb','.html','.css','.scss','.sql','.yaml','.yml','.toml','.ini','.sh','.ps1']);
const STOP_WORDS = new Set([
  'the','and','for','with','this','that','from','into','then','than','when','where','what','which','have','has','had','will','would','should','could','can',
  'please','pls','app','code','file','project','fix','add','remove','update','change','implement','review','make','use','using','only','also','after','before'
]);

function shouldInclude(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  if (DEFAULT_EXCLUDES.some(x => norm.split('/').includes(x))) return false;
  if (isSensitivePath(norm)) return false;
  return TEXT_EXTENSIONS.has(path.extname(norm).toLowerCase()) || path.basename(norm).toLowerCase().startsWith('readme');
}

function truncate(text, max) {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  const suffix = '\n...[truncated]';
  if (max <= suffix.length) return text.slice(0, max);
  return text.slice(0, max - suffix.length) + suffix;
}
function sameRoot(a, b) {
  try { return fs.realpathSync(a.uri.fsPath) === fs.realpathSync(b.uri.fsPath); } catch (_) { return false; }
}
function walkRelativeFiles(root, limit = 400) {
  const out = [];
  const visit = (dir, prefix = '') => {
    if (out.length >= limit) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= limit) break;
      if (DEFAULT_EXCLUDES.includes(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      let st;
      try { st = fs.lstatSync(full); } catch (_) { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) visit(full, rel);
      else if (st.isFile() && shouldInclude(rel)) out.push(rel);
    }
  };
  visit(root);
  return out;
}

function terms(text) {
  const values = String(text || '').toLowerCase().match(/[a-zA-Z0-9_]+/g) || [];
  return new Set(values.filter(token => token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token)));
}
function pathTerms(rel) { return terms(String(rel || '').replace(/[\\/._-]+/g, ' ')); }

function extractDependencyHints(activeText) {
  const hints = new Set();
  const text = String(activeText || '');
  const patterns = [
    /(?:from\s+|require\s*\(\s*|import\s+(?:[^'"]+?\s+from\s+)?)["']([^"']+)["']/gm,
    /^\s*from\s+([A-Za-z_][\w.]*)\s+import\b/gm,
    /^\s*import\s+([A-Za-z_][\w.]*)/gm,
    /^\s*#include\s*[<"]([^>"]+)[>"]/gm
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(text))) {
      let raw = String(match[1] || '').trim().replace(/\\/g, '/');
      raw = raw.replace(/^(?:\.\.\/|\.\/)+/, '');
      raw = raw.replace(/\.(?:js|jsx|ts|tsx|py|json|java|cs|cpp|c|h|hpp|go|rs|php|rb)$/i, '');
      if (raw) hints.add(raw.toLowerCase().replace(/\./g, '/'));
    }
  }
  return hints;
}

function extractSymbolHints(activeText, taskText = '', selection = '') {
  const combined = `${String(activeText || '')}\n${String(selection || '')}`;
  const symbols = new Set();
  const patterns = [
    /\b(?:class|def|function|interface|enum|struct|type)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)/g
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(combined))) {
      const name = String(match[1] || '');
      if (name.length >= 3 && !STOP_WORDS.has(name.toLowerCase())) symbols.add(name.toLowerCase());
    }
  }
  const taskTokens = String(taskText || '').match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
  for (const token of taskTokens) {
    if ((token.includes('_') || /[a-z][A-Z]/.test(token) || /^[A-Z]/.test(token)) && token.length >= 3) symbols.add(token.toLowerCase());
  }
  return new Set([...symbols].sort().slice(0, 40));
}

function scanSymbolHits(root, paths, symbols) {
  if (!symbols || symbols.size === 0) return {};
  const out = {};
  const escaped = [...symbols].sort().map(symbol => [symbol, new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')]);
  for (const rel of paths) {
    try {
      const buf = readWorkspaceFile({ uri: { scheme: 'file', fsPath: root } }, rel);
      const sample = decodeUtf8Text(buf, { source: rel, maxBytes: 200000, rejectNul: true }).slice(0, 60000);
      let count = 0;
      for (const [, re] of escaped) if (re.test(sample)) count += 1;
      if (count) out[String(rel).replace(/\\/g, '/').toLowerCase()] = count;
    } catch (_) {}
  }
  return out;
}

function gitModifiedPaths(root) {
  try {
    const result = childProcess.execFileSync('git', ['status', '--porcelain=v1', '-z'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, windowsHide: true
    });
    const out = new Set();
    for (const entry of String(result || '').split('\0')) {
      if (!entry || entry.length < 4) continue;
      let payload = entry.slice(3);
      if (payload.includes(' -> ')) payload = payload.split(' -> ', 2)[1];
      if (payload) out.add(payload.replace(/\\/g, '/'));
    }
    return out;
  } catch (_) { return new Set(); }
}

function rankWorkspaceCandidates(paths, { activeRel = '', activeText = '', taskText = '', modifiedPaths = new Set(), symbolHits = {}, semanticPaths = new Set(), workspaceSymbolHits = {} } = {}) {
  activeRel = String(activeRel || '').replace(/\\/g, '/');
  const activeStem = activeRel ? path.parse(activeRel).name.toLowerCase() : '';
  const activeDir = activeRel ? path.posix.dirname(activeRel).toLowerCase() : '';
  const activeExt = activeRel ? path.extname(activeRel).toLowerCase() : '';
  const taskTerms = terms(taskText);
  const depHints = extractDependencyHints(activeText);
  const modified = new Set([...modifiedPaths].map(p => String(p).replace(/\\/g, '/').toLowerCase()));
  const symbolsByPath = Object.fromEntries(Object.entries(symbolHits || {}).map(([p,v]) => [String(p).replace(/\\/g, '/').toLowerCase(), Number(v) || 0]));
  const semantic = new Set([...(semanticPaths || [])].map(p => String(p).replace(/\\/g, '/').toLowerCase()));
  const workspaceSymbolsByPath = Object.fromEntries(Object.entries(workspaceSymbolHits || {}).map(([p,v]) => [String(p).replace(/\\/g, '/').toLowerCase(), Number(v) || 0]));

  const ranked = [];
  for (const original of paths) {
    const rel = String(original).replace(/\\/g, '/');
    if (activeRel && rel.toLowerCase() === activeRel.toLowerCase()) continue;
    const low = rel.toLowerCase();
    const pterms = pathTerms(low);
    let score = 0;
    const reasons = [];

    if (semantic.has(low)) { score += 90; reasons.push('lsp-reference'); }
    const workspaceSymbolCount = Math.max(0, workspaceSymbolsByPath[low] || 0);
    if (workspaceSymbolCount) { score += Math.min(85, 30 + 20 * workspaceSymbolCount); reasons.push('workspace-symbol'); }
    if (modified.has(low)) { score += 80; reasons.push('git-modified'); }
    const name = path.posix.basename(low);
    const isTest = /(?:^|\/)(?:test|tests|spec|specs)(?:\/|$)/.test(low) || /(?:^|[._-])(?:test|spec)(?:[._-]|$)/.test(name);
    if (isTest && activeStem && low.includes(activeStem)) { score += 70; reasons.push('related-test'); }

    const stemless = low.replace(/\.[^.\/]+$/, '');
    let depMatch = false;
    for (const hint of depHints) {
      const hintNorm = String(hint).replace(/^\/+|\/+$/g, '');
      if (!hintNorm) continue;
      if (stemless.endsWith(hintNorm) || (`/${stemless}/`).includes(`/${hintNorm}/`) || path.posix.basename(stemless) === path.posix.basename(hintNorm)) {
        depMatch = true; break;
      }
    }
    if (depMatch) { score += 75; reasons.push('direct-dependency'); }

    const symbolCount = Math.max(0, symbolsByPath[low] || 0);
    if (symbolCount) { score += Math.min(60, 15 * symbolCount); reasons.push('symbol-match'); }

    const overlap = [...taskTerms].filter(t => pterms.has(t)).sort();
    if (overlap.length) { score += Math.min(40, 10 * overlap.length); reasons.push('task-path-match'); }
    if (activeDir && path.posix.dirname(low) === activeDir) { score += 20; reasons.push('same-directory'); }
    if (activeExt && path.extname(low) === activeExt) { score += 5; reasons.push('same-language'); }
    if (path.posix.basename(low).startsWith('readme')) { score += 2; reasons.push('repository-doc'); }

    ranked.push({ path: rel, score, reasons: reasons.length ? reasons : ['workspace-fallback'] });
  }
  ranked.sort((a, b) => (b.score - a.score) || a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
  return ranked;
}


async function collectSemanticReferencePaths(vscode, editor, mainFolder, { maxSymbols = 6, maxReferences = 80 } = {}) {
  if (!editor || !mainFolder || !vscode?.commands?.executeCommand) return new Set();
  const doc = editor.document;
  if (!doc?.uri || doc.uri.scheme !== 'file') return new Set();
  let symbols = [];
  try { symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc.uri) || []; } catch (_) { return new Set(); }
  const flat = [];
  const visit = items => {
    for (const item of items || []) {
      if (!item) continue;
      if (item.location?.range) flat.push({ name: item.name || '', range: item.location.range });
      else if (item.range) flat.push({ name: item.name || '', range: item.selectionRange || item.range });
      if (Array.isArray(item.children)) visit(item.children);
    }
  };
  visit(symbols);
  if (!flat.length) return new Set();
  const selection = editor.selection;
  const cursor = selection?.active || selection?.start;
  const contains = (range, pos) => range && pos && typeof range.contains === 'function' ? range.contains(pos) : false;
  const prioritized = [...flat].sort((a, b) => Number(contains(b.range, cursor)) - Number(contains(a.range, cursor))).slice(0, maxSymbols);
  const refs = new Set();
  for (const symbol of prioritized) {
    const pos = symbol.range?.start;
    if (!pos) continue;
    let locations = [];
    try { locations = await vscode.commands.executeCommand('vscode.executeReferenceProvider', doc.uri, pos) || []; } catch (_) { continue; }
    for (const loc of locations) {
      if (refs.size >= maxReferences) break;
      const uri = loc?.uri;
      if (!uri || uri.scheme !== 'file') continue;
      try {
        const rel = path.relative(mainFolder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');
        if (!rel || rel.startsWith('../') || path.isAbsolute(rel) || !shouldInclude(rel)) continue;
        refs.add(rel);
      } catch (_) {}
    }
    if (refs.size >= maxReferences) break;
  }
  return refs;
}


async function collectWorkspaceSymbolHits(vscode, mainFolder, { activeText = '', taskText = '', selection = '', maxQueries = 8, maxResults = 120 } = {}) {
  if (!mainFolder || !vscode?.commands?.executeCommand) return {};
  const hints = [...extractSymbolHints(activeText, taskText, selection)].slice(0, Math.max(0, maxQueries));
  if (!hints.length) return {};
  const hits = {};
  let seen = 0;
  for (const hint of hints) {
    let symbols = [];
    try { symbols = await vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', hint) || []; }
    catch (_) { continue; }
    for (const symbol of symbols) {
      if (seen >= maxResults) break;
      const uri = symbol?.location?.uri || symbol?.uri;
      if (!uri || uri.scheme !== 'file') continue;
      let rel;
      try { rel = path.relative(mainFolder.uri.fsPath, uri.fsPath).replace(/\\/g, '/'); }
      catch (_) { continue; }
      if (!rel || rel.startsWith('../') || path.isAbsolute(rel) || !shouldInclude(rel)) continue;
      const low = rel.toLowerCase();
      hits[low] = Math.min(8, (hits[low] || 0) + 1);
      seen += 1;
    }
    if (seen >= maxResults) break;
  }
  return hits;
}

async function buildContext(vscode, {
  maxChars = 80000,
  includeWorkspace = false,
  executionFolder = null,
  projectFolder = null,
  taskText = ''
} = {}) {
  const parts = [];
  const items = [];
  let used = 0;
  const push = (label, content, { source = '', reason = 'workspace', priority = 0, score = null, limit = null } = {}) => {
    const remaining = maxChars - used;
    if (remaining <= 0) return false;
    const allowed = limit === null ? remaining : Math.min(remaining, Math.max(0, Number(limit) || 0));
    if (allowed <= 0) return false;
    const original = String(content);
    const clipped = truncate(original, allowed);
    if (!clipped) return false;
    parts.push(`\n--- ${label} ---\n${clipped}`);
    used += clipped.length;
    items.push({
      label, source, reason, priority, score: score === null ? priority : score,
      chars: clipped.length, estimatedTokens: Math.max(1, Math.ceil(clipped.length / 4)), truncated: clipped.length < original.length
    });
    return true;
  };

  const folders = vscode.workspace.workspaceFolders || [];
  const mainFolder = projectFolder || folders[0] || null;
  const execFolder = executionFolder || mainFolder;
  const editor = vscode.window.activeTextEditor;
  let activeRel = '';
  let activeText = '';

  if (editor && editor.document.uri.scheme === 'file') {
    const doc = editor.document;
    const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (wsFolder && wsFolder.uri.scheme === 'file') {
      const rel = vscode.workspace.asRelativePath(doc.uri, false).replace(/\\/g, '/');
      try {
        const readFolder = execFolder || wsFolder;
        resolveWorkspacePath(readFolder, rel);
        if (sameRoot(readFolder, wsFolder) && doc.isDirty) {
          activeText = decodeUtf8Text(
            encodeUtf8Text(doc.getText(), { source: rel, maxBytes: 2 * 1024 * 1024, rejectNul: true }),
            { source: rel, maxBytes: 2 * 1024 * 1024, rejectNul: true }
          );
        } else {
          activeText = decodeUtf8Text(readWorkspaceFile(readFolder, rel), { source: rel, maxBytes: 2 * 1024 * 1024, rejectNul: true });
        }
        activeRel = rel;
        const sel = editor.selection;
        const selected = sel && !sel.isEmpty ? doc.getText(sel) : '';
        if (selected) {
          encodeUtf8Text(selected, { source: `${rel} selection`, maxBytes: 2 * 1024 * 1024, rejectNul: true });
          push(`SELECTION ${rel}`, selected, {
            source: rel, reason: sameRoot(readFolder, wsFolder) ? 'selected-text' : 'selected-text-main-reference', priority: 100,
            limit: Math.min(12000, Math.max(1000, Math.floor(maxChars * 0.20)))
          });
        }
        push(`ACTIVE FILE ${rel}`, activeText, {
          source: rel, reason: sameRoot(readFolder, wsFolder) ? 'active-file' : 'active-file-worktree', priority: 95,
          limit: Math.min(30000, Math.max(2000, Math.floor(maxChars * 0.45)))
        });
      } catch (_) { activeRel = ''; activeText = ''; }
    }
  }

  if (mainFolder && mainFolder.uri.scheme === 'file' && used < maxChars) {
    try {
      const profileTarget = resolveWorkspacePath(mainFolder, '.ai-coder/project.json', { allowControl: true });
      if (profileTarget !== path.join(fs.realpathSync(mainFolder.uri.fsPath), '.ai-coder', 'project.json')) throw new Error('Profile alias blocked');
      push(
        'PROJECT PROFILE',
        decodeUtf8Text(readWorkspaceFile(mainFolder, '.ai-coder/project.json', { allowControl: true }), { source: '.ai-coder/project.json', maxBytes: 200000, rejectNul: true }),
        { source: '.ai-coder/project.json', reason: 'project-profile', priority: 85, limit: Math.min(8000, Math.max(1000, Math.floor(maxChars * 0.12))) }
      );
    } catch (_) {}
  }

  if (includeWorkspace && execFolder && execFolder.uri.scheme === 'file' && used < maxChars) {
    let candidates;
    if (mainFolder && sameRoot(execFolder, mainFolder)) {
      const found = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/.ai-coder/**,**/dist/**,**/build/**,**/.next/**,**/coverage/**,**/.venv/**,**/venv/**}', 400);
      candidates = found.map(uri => vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/')).filter(shouldInclude);
    } else {
      candidates = walkRelativeFiles(execFolder.uri.fsPath, 400);
    }
    const selectedText = editor && editor.selection && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
    const symbolHints = extractSymbolHints(activeText, taskText, selectedText);
    const symbolHits = scanSymbolHits(execFolder.uri.fsPath, candidates, symbolHints);
    const semanticPaths = await collectSemanticReferencePaths(vscode, editor, mainFolder);
    const workspaceSymbolHits = await collectWorkspaceSymbolHits(vscode, mainFolder, { activeText, taskText, selection: selectedText });
    const ranked = rankWorkspaceCandidates(candidates, {
      activeRel, activeText, taskText, modifiedPaths: gitModifiedPaths(execFolder.uri.fsPath), symbolHits, semanticPaths, workspaceSymbolHits
    });
    const perFileCap = Math.min(12000, Math.max(1500, Math.floor(maxChars * 0.15)));
    let count = 0;
    for (const candidate of ranked) {
      if (count >= 120 || used >= maxChars) break;
      try {
        resolveWorkspacePath(execFolder, candidate.path);
        const buf = readWorkspaceFile(execFolder, candidate.path);
        if (buf.byteLength > 200000) continue;
        push(`FILE ${candidate.path}`, decodeUtf8Text(buf, { source: candidate.path, maxBytes: 200000, rejectNul: true }), {
          source: candidate.path, reason: candidate.reasons[0], priority: 10 + Math.min(candidate.score, 80), score: candidate.score, limit: perFileCap
        });
        count += 1;
      } catch (_) {}
    }
  }

  return { text: parts.join('\n'), chars: used, maxChars, estimatedTokens: Math.max(1, Math.ceil(used / 4)), items };
}

module.exports = {
  buildContext, shouldInclude, walkRelativeFiles, rankWorkspaceCandidates, extractDependencyHints, extractSymbolHints, scanSymbolHits, gitModifiedPaths, collectSemanticReferencePaths, collectWorkspaceSymbolHits
};
