'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { classifyCommand, validateWorkspacePath, validateWindowsComponent } = require('../src/core/policy');
const { resolveWorkspacePath, readWorkspaceFile, writeWorkspaceFile, registerWindowsWorkspace } = require('../src/core/workspacePaths');
const windowsSafeIo = require('../src/core/windowsSafeIo');
const { buildContext } = require('../src/core/contextEngine');
const { CheckpointStore } = require('../src/core/checkpoints');

function folder(dir) { return { uri: { scheme: 'file', fsPath: dir } }; }
test('command policy accepts only exact fixed argv', () => {
  assert.deepEqual(classifyCommand('npm test').argv, ['npm', 'test']);
  for (const text of ['npm test && echo bad', 'pytest; echo bad', 'git diff | cat', 'node --test $(whoami)'])
    assert.equal(classifyCommand(text).allowed, false);
  for (const text of ['../secret', 'C:/secret', 'file:stream', '/tmp/secret', '..\\secret', '.ai-coder/threads/forged.json'])
    assert.throws(() => validateWorkspacePath(text));
});
test('canonical paths reject external and sensitive aliases', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-out-'));
  try {
    fs.writeFileSync(path.join(root, '.env'), 'secret');
    fs.writeFileSync(path.join(outside, 'a.txt'), 'outside');
    try {
      fs.symlinkSync(path.join(root, '.env'), path.join(root, 'alias.txt'));
      fs.symlinkSync(path.join(outside, 'a.txt'), path.join(root, 'outside.txt'));
    } catch (err) {
      if (err.code === 'EPERM' && process.platform === 'win32') {
        t.skip('File symlinks require elevated privileges on Windows without Developer Mode');
        return;
      }
      throw err;
    }
    assert.throws(() => resolveWorkspacePath(folder(root), 'alias.txt'));
    assert.throws(() => resolveWorkspacePath(folder(root), 'outside.txt'));
    assert.equal(resolveWorkspacePath(folder(root), 'new.txt'), path.join(root, 'new.txt'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});
test('sensitive active selection is not sent in context', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-context-'));
  try {
    const uri = { scheme: 'file', fsPath: path.join(root, '.env') };
    fs.writeFileSync(uri.fsPath, 'secret-value');
    const mock = { window: { activeTextEditor: { document: { uri, getText: () => 'secret-value' }, selection: { isEmpty: false } } },
      workspace: { workspaceFolders: [], getWorkspaceFolder: () => folder(root), asRelativePath: () => '.env' } };
    const result = await buildContext(mock);
    assert.doesNotMatch(result.text, /secret-value/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('checkpoint refuses a directory link changed after creation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-checkpoint-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-target-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(outside, 'a.txt'), 'safe');
    let saved = [];
    const state = { get: () => saved, update: async (_key, value) => { saved = value; } };
    const store = new CheckpointStore({}, { workspaceState: state });
    const cp = await store.create(folder(root), [{ path: 'src/a.txt', content: 'new' }]);
    fs.rmdirSync(path.join(root, 'src'));
    fs.symlinkSync(outside, path.join(root, 'src'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => store.apply(folder(root), cp));
    assert.equal(fs.readFileSync(path.join(outside, 'a.txt'), 'utf8'), 'safe');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});
test('checkpoint preview is write-free and becomes stale when source changes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-preview-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'before');
    let saved = [];
    const store = new CheckpointStore({}, { workspaceState: { get: () => saved, update: async (_key, value) => { saved = value; } } });
    const preview = store.preview(folder(root), [{ path: 'a.txt', content: 'after' }]);
    assert.deepEqual(saved, []);
    fs.writeFileSync(path.join(root, 'a.txt'), 'external');
    await assert.rejects(store.create(folder(root), [{ path: 'a.txt', content: 'after' }], preview));
    assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'external');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('checkpoint round-trips exact CRLF bytes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-crlf-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), Buffer.from('a\r\nb\r\n', 'utf8'));
    let saved = [];
    const store = new CheckpointStore({}, { workspaceState: { get: () => saved, update: async (_key, value) => { saved = value; } } });
    const cp = await store.create(folder(root), [{ path: 'a.txt', content: 'changed\n' }]);
    assert.equal(cp.files[0].before, 'a\r\nb\r\n');
    await store.apply(folder(root), cp);
    assert.deepEqual(fs.readFileSync(path.join(root, 'a.txt')), Buffer.from('changed\n'));
    await store.undoCheckpoint(folder(root), cp.id);
    assert.deepEqual(fs.readFileSync(path.join(root, 'a.txt')), Buffer.from('a\r\nb\r\n'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('checkpoint preserves a UTF-8 BOM in preview, apply, and undo', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-bom-'));
  try {
    const original = Buffer.from('\ufeffbefore\r\n', 'utf8');
    const proposed = Buffer.from('\ufeffafter\r\n', 'utf8');
    fs.writeFileSync(path.join(root, 'a.txt'), original);
    let saved = [];
    const store = new CheckpointStore({}, { workspaceState: { get: () => saved, update: async (_key, value) => { saved = value; } } });
    const cp = await store.create(folder(root), [{ path: 'a.txt', content: '\ufeffafter\r\n' }]);
    assert.equal(cp.files[0].before, '\ufeffbefore\r\n');
    assert.equal(cp.files[0].after, '\ufeffafter\r\n');
    await store.apply(folder(root), cp);
    assert.deepEqual(fs.readFileSync(path.join(root, 'a.txt')), proposed);
    await store.undoCheckpoint(folder(root), cp.id);
    assert.deepEqual(fs.readFileSync(path.join(root, 'a.txt')), original);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('checkpoint rejects invalid UTF-8, NUL bytes, and oversized text', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-binary-'));
  try {
    let saved = [];
    const store = new CheckpointStore({}, { workspaceState: { get: () => saved, update: async (_key, value) => { saved = value; } } });
    fs.writeFileSync(path.join(root, 'bad.txt'), Buffer.from([0x61, 0xff, 0x62]));
    assert.throws(() => store.preview(folder(root), [{ path: 'bad.txt', content: 'x' }]));
    fs.writeFileSync(path.join(root, 'nul.txt'), Buffer.from([0x61, 0x00, 0x62]));
    assert.throws(() => store.preview(folder(root), [{ path: 'nul.txt', content: 'x' }]));
    fs.writeFileSync(path.join(root, 'big.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 0x61));
    assert.throws(() => store.preview(folder(root), [{ path: 'big.txt', content: 'x' }]));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('apply rolls back the currently attempted file after a post-replace failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-apply-partial-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'old-a');
    fs.writeFileSync(path.join(root, 'b.txt'), 'old-b');
    let saved = [];
    const state = { get: () => saved, update: async (_key, value) => { saved = value; } };
    const realIo = require('../src/core/workspacePaths');
    let failed = false;
    const io = {
      ...realIo,
      writeWorkspaceFile(ws, rel, data, options) {
        realIo.writeWorkspaceFile(ws, rel, data, options);
        if (!failed && rel === 'b.txt' && Buffer.from(data).equals(Buffer.from('new-b'))) {
          failed = true;
          throw new Error('simulated post-replace failure');
        }
      }
    };
    const store = new CheckpointStore({}, { workspaceState: state }, io);
    const cp = await store.create(folder(root), [{ path: 'a.txt', content: 'new-a' }, { path: 'b.txt', content: 'new-b' }]);
    await assert.rejects(() => store.apply(folder(root), cp), /verified back at their original bytes/);
    assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'old-a');
    assert.equal(fs.readFileSync(path.join(root, 'b.txt'), 'utf8'), 'old-b');
    assert.equal(saved.find(x => x.id === cp.id), undefined);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('undo rolls back the currently attempted restore after a post-replace failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-undo-partial-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'old-a');
    fs.writeFileSync(path.join(root, 'b.txt'), 'old-b');
    let saved = [];
    const state = { get: () => saved, update: async (_key, value) => { saved = value; } };
    const realIo = require('../src/core/workspacePaths');
    const store = new CheckpointStore({}, { workspaceState: state });
    const cp = await store.create(folder(root), [{ path: 'a.txt', content: 'new-a' }, { path: 'b.txt', content: 'new-b' }]);
    await store.apply(folder(root), cp);
    let failed = false;
    store.io = {
      ...realIo,
      writeWorkspaceFile(ws, rel, data, options) {
        realIo.writeWorkspaceFile(ws, rel, data, options);
        if (!failed && rel === 'b.txt' && Buffer.from(data).equals(Buffer.from('old-b'))) {
          failed = true;
          throw new Error('simulated post-restore failure');
        }
      }
    };
    await assert.rejects(() => store.undoCheckpoint(folder(root), cp.id), /checkpoint was retained/);
    assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'new-a');
    assert.equal(fs.readFileSync(path.join(root, 'b.txt'), 'utf8'), 'new-b');
    assert.ok(saved.find(x => x.id === cp.id));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('atomic replacement preserves existing mode bits on POSIX', { skip: process.platform === 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-mode-'));
  try {
    const realIo = require('../src/core/workspacePaths');
    const target = path.join(root, 'mode.txt');
    fs.writeFileSync(target, 'before');
    fs.chmodSync(target, 0o640);
    realIo.writeWorkspaceFile(folder(root), 'mode.txt', Buffer.from('after'));
    assert.equal(fs.statSync(target).mode & 0o777, 0o640);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('strict UTF-8 encoding rejects lone surrogate content', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-surrogate-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'before');
    let saved = [];
    const store = new CheckpointStore({}, { workspaceState: { get: () => saved, update: async (_key, value) => { saved = value; } } });
    assert.throws(() => store.preview(folder(root), [{ path: 'a.txt', content: '\ud800' }]));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('Windows safe I/O rejects a junction that would redirect a write outside the workspace', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-win-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-win-out-'));
  try {
    fs.writeFileSync(path.join(outside, 'a.txt'), 'safe');
    fs.symlinkSync(outside, path.join(root, 'src'), 'junction');
    registerWindowsWorkspace(root, { force: true });
    assert.throws(() => writeWorkspaceFile(folder(root), 'src/a.txt', Buffer.from('tampered')), /reparse point blocked/i);
    assert.equal(fs.readFileSync(path.join(outside, 'a.txt'), 'utf8'), 'safe');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('Windows safe I/O detects replacement of the selected workspace root', { skip: process.platform !== 'win32' }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-win-identity-'));
  const root = path.join(base, 'workspace');
  const moved = path.join(base, 'workspace-original');
  try {
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'a.txt'), 'original');
    registerWindowsWorkspace(root, { force: true });
    fs.renameSync(root, moved);
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'a.txt'), 'replacement');
    assert.throws(() => readWorkspaceFile(folder(root), 'a.txt'), /workspace identity changed/i);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('hard-linked files are rejected for read and write', (t) => {
  const td = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-hardlink-'));
  try {
    const outside = path.join(td, 'outside.txt');
    const workspace = path.join(td, 'workspace');
    fs.mkdirSync(workspace);
    fs.writeFileSync(outside, 'SECRET');
    const alias = path.join(workspace, 'alias.txt');
    try {
      fs.linkSync(outside, alias);
    } catch (e) {
      t.skip('Hard links unsupported in this environment');
      return;
    }
    assert.throws(() => readWorkspaceFile(folder(workspace), 'alias.txt'), /hard-linked/i);
    assert.throws(() => writeWorkspaceFile(folder(workspace), 'alias.txt', Buffer.from('TAMPER')), /hard-linked/i);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'SECRET');
  } finally { fs.rmSync(td, { recursive: true, force: true }); }
});

test('Windows canonicalization and control directory blocked', () => {
  // Superscript devices with and without extensions must be blocked
  const blocked = [
    'COM¹', 'com¹', 'COM¹.txt', 'COM².tar.gz', 'LPT¹', 'lpt².log', 'LPT³.dat',
    'COM1', 'com2', 'com3.txt', 'lpt1', 'lpt9.log', 'CON', 'con.txt', 'PRN', 'AUX', 'NUL', 'nul.bin'
  ];
  for (const name of blocked) {
    assert.throws(() => validateWorkspacePath(name), `Expected ${name} to be blocked`);
    assert.throws(() => validateWindowsComponent(name), `Expected ${name} component to be blocked`);
  }

  // Non-reserved names that resemble devices must be accepted
  const accepted = ['COM10', 'LPT10', 'COMX', 'con_file.txt', 'my_com1.py', 'normal.txt'];
  for (const name of accepted) {
    assert.equal(validateWorkspacePath(name), name);
    assert.doesNotThrow(() => validateWindowsComponent(name));
  }

  // Control directories, trailing dots/spaces, leading spaces
  assert.throws(() => validateWorkspacePath('.AI-CODER/project.json'), /control data blocked/i);
  assert.throws(() => validateWorkspacePath('.ai-coder./project.json'));
  assert.throws(() => validateWorkspacePath('.ai-coder /project.json'));
  assert.throws(() => validateWorkspacePath('src/file.'));
  assert.throws(() => validateWorkspacePath('src/file '));
  assert.throws(() => validateWorkspacePath('src/ file'));
});

test('privilege separation: allowSensitive vs allowControl', () => {
  // Case 1: .ai-coder/project.json with no options -> BLOCKED
  assert.throws(() => validateWorkspacePath('.ai-coder/project.json'), /control data blocked/i);

  // Case 2: .ai-coder/project.json with allowSensitive: true only -> STILL BLOCKED
  assert.throws(() => validateWorkspacePath('.ai-coder/project.json', { allowSensitive: true }), /control data blocked/i);

  // Case 3: .ai-coder/project.json with allowControl: true -> ALLOWED
  assert.equal(validateWorkspacePath('.ai-coder/project.json', { allowControl: true }), '.ai-coder/project.json');

  // Case 4: .env with allowControl: true only -> STILL BLOCKED (sensitive policy applies)
  assert.throws(() => validateWorkspacePath('.env', { allowControl: true }), /sensitive path blocked/i);

  // Case 5: normal project file -> ALLOWED with default options
  assert.equal(validateWorkspacePath('src/app.js'), 'src/app.js');
});

test('bundled helper binary packaging and parity', { skip: process.platform !== 'win32' }, () => {
  const cp = require('node:child_process');
  const nativeExe = path.resolve(__dirname, '..', '..', '..', 'native', 'windows-safeio', 'windows-safeio.exe');
  const codeOssExe = path.resolve(__dirname, '..', 'native', 'windows-safeio.exe');
  assert(fs.existsSync(nativeExe), 'Missing native helper binary');
  assert(fs.existsSync(codeOssExe), 'Missing Code-OSS helper binary');

  const nativeHash = crypto.createHash('sha256').update(fs.readFileSync(nativeExe)).digest('hex');
  const codeOssHash = crypto.createHash('sha256').update(fs.readFileSync(codeOssExe)).digest('hex');
  assert.equal(nativeHash, codeOssHash, 'Helper binaries have different SHA-256 hashes');

  const buf = fs.readFileSync(nativeExe);
  assert(buf.includes(Buffer.from('NtSetInformationFile')), 'Missing NtSetInformationFile symbol');
  assert(buf.includes(Buffer.from('AI_CODER_SAFEIO_TEST_HOOKS')), 'Missing test hook strings');

  // Verify version output
  const res = cp.execFileSync(nativeExe, ['version'], { encoding: 'utf8' });
  const verInfo = JSON.parse(res.trim());
  assert.equal(verInfo.protocol, 1);
  assert.equal(verInfo.arch, 'windows/amd64');
  assert.equal(verInfo.build_provenance, 'AI-CODER-MVP-SafeIO-v0.4.6');
});

test('Windows safe I/O new-file write, atomic replacement, and read', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-win-write-'));
  try {
    registerWindowsWorkspace(root, { force: true });
    writeWorkspaceFile(folder(root), 'sub/new.txt', Buffer.from('hello windows'));
    const read1 = readWorkspaceFile(folder(root), 'sub/new.txt');
    assert.equal(read1.toString('utf8'), 'hello windows');

    // Atomic replacement of existing file using NtSetInformationFile
    writeWorkspaceFile(folder(root), 'sub/new.txt', Buffer.from('replaced content'));
    const read2 = readWorkspaceFile(folder(root), 'sub/new.txt');
    assert.equal(read2.toString('utf8'), 'replaced content');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Windows safe I/O early lexical control rejection', { skip: process.platform !== 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-win-ctrl-'));
  try {
    registerWindowsWorkspace(root, { force: true });
    // Without allowControl, helper rejects literal .ai-coder early
    assert.throws(() => windowsSafeIo.validatePath(root, '.ai-coder/project.json', { allowControl: false }));
    // With allowControl: true, helper allows internal control path
    const target = windowsSafeIo.validatePath(root, '.ai-coder/project.json', { allowControl: true });
    assert(target.endsWith('project.json'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('named undo can retain checkpoint until task history is persisted', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-undo-retain-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'before');
    let saved = [];
    const store = new CheckpointStore({}, { workspaceState: { get: () => saved, update: async (_key, value) => { saved = value; } } });
    const cp = await store.create(folder(root), [{ path: 'a.txt', content: 'after' }]);
    await store.apply(folder(root), cp);
    const undone = await store.undoCheckpoint(folder(root), cp.id, { remove: false });
    assert.equal(undone.state, 'undone-pending-history');
    assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'before');
    assert.equal(store.get(cp.id).state, 'undone-pending-history');
    store.verifyCheckpointState(folder(root), cp.id, false);
    await store.finalizeUndo(cp.id);
    assert.equal(store.get(cp.id), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('checkpoint workspace-state persistence serializes concurrent creates', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-checkpoint-concurrent-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'before');
    let saved = [];
    const state = { get: () => saved, update: async (_key, value) => { await new Promise(r => setTimeout(r, 2)); saved = value; } };
    const store = new CheckpointStore({}, { workspaceState: state });
    const [a, b] = await Promise.all([
      store.create(folder(root), [{ path: 'a.txt', content: 'after-a' }]),
      store.create(folder(root), [{ path: 'a.txt', content: 'after-b' }])
    ]);
    const ids = new Set(store.list().map(x => x.id));
    assert.ok(ids.has(a.id));
    assert.ok(ids.has(b.id));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('checkpoint records persist to project-local durable storage across extension state reset', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coder-js-durable-cp-'));
  try {
    fs.writeFileSync(path.join(root, 'a.txt'), 'before\n');
    const folder = { uri: { scheme: 'file', fsPath: root } };
    const mkContext = () => ({ workspaceState: { get: (_k, fallback) => fallback, update: async () => {} } });
    const store = new CheckpointStore({}, mkContext(), undefined, { folderProvider: () => folder });
    const preview = store.preview(folder, [{ path: 'a.txt', content: 'after\n' }]);
    const cp = await store.create(folder, [{ path: 'a.txt', content: 'after\n' }], preview, { taskId: 'task1' });
    await store.apply(folder, cp);

    const reopened = new CheckpointStore({}, mkContext(), undefined, { folderProvider: () => folder });
    const loaded = reopened.get(cp.id);
    assert.ok(loaded);
    assert.equal(loaded.state, 'applied');
    assert.equal(loaded.files[0].after, 'after\n');
    assert.ok(fs.existsSync(path.join(root, '.ai-coder', 'code-oss', 'checkpoints', `${cp.id}.json`)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
