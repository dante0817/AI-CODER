'use strict';

const { CAPABILITY_NAMES, ModelRegistry, normalizeModel, unknownModel } = require('./modelRegistry');

async function capabilityMetadata(adapter, modelId) {
  if (!adapter || typeof adapter.capabilityMetadata !== 'function') return {};
  try {
    const raw = await adapter.capabilityMetadata(modelId);
    const out = {};
    for (const name of CAPABILITY_NAMES) {
      if (['supported', 'unsupported', 'unknown'].includes(raw?.[name])) out[name] = raw[name];
    }
    return out;
  } catch (_) { return {}; }
}

async function discoverModelCatalog(registry, adapters, { probeCapabilities = true, maxCapabilityProbes = 20 } = {}) {
  const models = [];
  const providers = [];
  const seen = new Set();
  let capabilityProbes = 0;
  for (const [provider, adapter] of Object.entries(adapters || {})) {
    let ids = [];
    try {
      if (typeof adapter.listModels === 'function') ids = [...new Set((await adapter.listModels()).map(String).filter(Boolean))];
      else if (typeof adapter.health === 'function' && await adapter.health()) ids = registry.list(provider).map(m => m.modelId);
      else throw new Error('Provider does not expose model discovery and its health check failed.');
      providers.push({ provider, reachable: true, models: ids, error: '' });
    } catch (error) {
      providers.push({ provider, reachable: false, models: [], error: error?.message || String(error) });
      continue;
    }
    for (const modelId of ids) {
      const key = `${provider}\u0000${modelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const known = registry.find(provider, modelId);
      let model = known ? normalizeModel({ ...known, discoverySource: 'provider-catalog' }) : unknownModel(provider, modelId, 'provider-catalog-id');
      const shouldProbe = probeCapabilities && !known && capabilityProbes < Math.max(0, Number(maxCapabilityProbes) || 0);
      const states = shouldProbe ? await capabilityMetadata(adapter, modelId) : {};
      if (shouldProbe) capabilityProbes += 1;
      if (Object.keys(states).length) {
        const sources = { ...(model.capabilitySources || {}) };
        for (const name of Object.keys(states)) sources[name] = 'provider-capability-probe';
        model = normalizeModel({ ...model, capabilityStates: { ...(model.capabilityStates || {}), ...states }, capabilitySources: sources, discoverySource: 'provider-catalog+capability-probe' });
      }
      models.push(model);
    }
  }
  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId));
  providers.sort((a, b) => a.provider.localeCompare(b.provider));
  return { models, providers };
}

function registryWithCatalog(base, snapshot, { includeRegistryOnly = new Set() } = {}) {
  const merged = new Map();
  for (const model of base.list()) if (includeRegistryOnly.has(model.provider)) merged.set(`${model.provider}\u0000${model.modelId}`, model);
  for (const model of snapshot.models || []) merged.set(`${model.provider}\u0000${model.modelId}`, model);
  return new ModelRegistry([...merged.values()], { includeDefaults: false });
}

module.exports = { discoverModelCatalog, registryWithCatalog };
