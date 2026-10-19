'use strict';

const fs = require('fs');
const path = require('path');

function safeRead(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch (_) { return null; }
}
function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}
function cacheKey({ provider = 'auto', baseUrl = '', codexConnected = false } = {}) {
  return JSON.stringify({ provider, baseUrl: String(baseUrl || '').replace(/\/+$/, ''), codexConnected: !!codexConnected });
}

class ModelCatalogCache {
  constructor(storageDir, { ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
    this.file = path.join(storageDir, 'model-catalog-v1.json');
    this.ttlMs = ttlMs;
    this.now = now;
  }
  get(key, { allowStale = false } = {}) {
    const root = safeRead(this.file);
    const item = root?.entries?.[key];
    if (!item || !item.snapshot) return null;
    const ageMs = Math.max(0, this.now() - Number(item.savedAtMs || 0));
    if (!allowStale && ageMs > this.ttlMs) return null;
    return { snapshot: item.snapshot, ageMs, stale: ageMs > this.ttlMs, savedAtMs: item.savedAtMs };
  }
  put(key, snapshot) {
    const root = safeRead(this.file) || { formatVersion: 1, entries: {} };
    root.formatVersion = 1;
    root.entries ??= {};
    root.entries[key] = { savedAtMs: this.now(), snapshot };
    // Bound the file to the 12 newest route/provider variants.
    const entries = Object.entries(root.entries).sort((a, b) => Number(b[1]?.savedAtMs || 0) - Number(a[1]?.savedAtMs || 0)).slice(0, 12);
    root.entries = Object.fromEntries(entries);
    atomicWrite(this.file, root);
    return snapshot;
  }
  clear() { try { fs.unlinkSync(this.file); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}

module.exports = { ModelCatalogCache, cacheKey };
