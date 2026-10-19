'use strict';

const { normalizeCapabilityRecord, normalizeOllamaCapabilities, mapReasoningEffort } = require('./providerContract');

function normalizeBaseUrl(url) { return String(url || '').replace(/\/+$/, ''); }

class OpenAICompatibleProvider {
  constructor({ baseUrl, apiKey }) { this.baseUrl = normalizeBaseUrl(baseUrl); this.apiKey = apiKey || ''; this._lastModelRecords = null; }
  headers() { return { ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) }; }
  async listModelRecords({ signal } = {}) {
    const res = await fetch(`${this.baseUrl}/models`, { method: 'GET', signal, headers: this.headers() });
    const text = await res.text();
    if (!res.ok) throw new Error(`Provider HTTP ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    const records = Array.isArray(data.data) ? data.data.filter(x => x && x.id).map(x => ({ ...x })) : [];
    this._lastModelRecords = records;
    return records;
  }
  async listModels({ signal } = {}) { return (await this.listModelRecords({ signal })).map(x => String(x.id)); }
  async capabilityMetadata(model, { signal } = {}) {
    const records = this._lastModelRecords || await this.listModelRecords({ signal });
    const record = records.find(x => String(x.id) === String(model));
    return normalizeCapabilityRecord(record?.capabilities);
  }
  async health({ signal } = {}) {
    try { await this.listModels({ signal }); return true; } catch (_) { return false; }
  }
  async chat({ model, messages, effort, signal }) {
    const body = { model, messages, stream: false };
    const mappedEffort = mapReasoningEffort(effort, this.baseUrl);
    if (mappedEffort) body.reasoning_effort = mappedEffort;
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', ...this.headers() },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Provider HTTP ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === 'string') return { text: content, usage: data.usage || null, raw: data };
    if (Array.isArray(content)) return { text: content.map(x => x.text || x.content || '').join('\n'), usage: data.usage || null, raw: data };
    return { text: JSON.stringify(content ?? data), usage: data.usage || null, raw: data };
  }
}

class OllamaProvider {
  constructor({ baseUrl }) { this.baseUrl = normalizeBaseUrl(baseUrl); }
  async listModelRecords({ signal } = {}) {
    const res = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET', signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    return Array.isArray(data.models) ? data.models.filter(x => x && (x.name || x.model)).map(x => ({ ...x })) : [];
  }
  async listModels({ signal } = {}) { return (await this.listModelRecords({ signal })).map(x => String(x.name || x.model)); }
  async capabilityMetadata(model, { signal } = {}) {
    const res = await fetch(`${this.baseUrl}/api/show`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model })
    });
    if (!res.ok) return {};
    const data = await res.json();
    return normalizeOllamaCapabilities(data.capabilities);
  }
  async health({ signal } = {}) {
    try { await this.listModels({ signal }); return true; } catch (_) { return false; }
  }
  async chat({ model, messages, signal }) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    return { text: data.message?.content || '', usage: { input_tokens: data.prompt_eval_count, output_tokens: data.eval_count }, raw: data };
  }
}

module.exports = { OpenAICompatibleProvider, OllamaProvider };
