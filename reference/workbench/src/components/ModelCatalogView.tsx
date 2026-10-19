import React, { useState } from 'react';
import { ModelMetadata, ModelProvider } from '../types';
import { discoverOllamaModels, registerDiscoveredModel, runCapabilityProbe, saveCatalogToCache } from '../lib/modelDiscovery';
import { RefreshCw, Plus, CheckCircle2, XCircle, HelpCircle, Server, Sparkles, AlertTriangle } from 'lucide-react';

interface ModelCatalogViewProps {
  models: ModelMetadata[];
  onUpdateModels: (models: ModelMetadata[]) => void;
  lastRefreshed: string;
}

export const ModelCatalogView: React.FC<ModelCatalogViewProps> = ({
  models,
  onUpdateModels,
  lastRefreshed
}) => {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider>('ollama');
  const [customModelId, setCustomModelId] = useState('');
  const [customModelName, setCustomModelName] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState('http://localhost:11434');
  const [filterQuery, setFilterQuery] = useState('');
  const [probeResultMsg, setProbeResultMsg] = useState<string | null>(null);

  const handleRunDiscovery = () => {
    setIsDiscovering(true);
    setTimeout(() => {
      if (selectedProvider === 'ollama') {
        const discovered = discoverOllamaModels();
        // Merge without losing custom models
        const existingIds = new Set(discovered.map(m => m.id));
        const kept = models.filter(m => !existingIds.has(m.id));
        const merged = [...discovered, ...kept];
        onUpdateModels(merged);
        saveCatalogToCache(merged);
      } else {
        // OpenAI-compatible simulation
        const sampleDiscovered = registerDiscoveredModel(
          'deepseek-chat-v3',
          'DeepSeek Chat V3 (Discovered via /v1/models)',
          'openai-compatible',
          'provider_discovery',
          customEndpoint,
          false // Unknown should mean unknown!
        );
        const merged = [sampleDiscovered, ...models.filter(m => m.id !== sampleDiscovered.id)];
        onUpdateModels(merged);
        saveCatalogToCache(merged);
      }
      setIsDiscovering(false);
    }, 450);
  };

  const handleAddManualModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customModelId.trim()) return;

    // v0.4.7 Requirement: An automatically discovered or manual model
    // should NOT inherit optimistic capabilities merely because it exists.
    // Unknown means unknown!
    const newModel = registerDiscoveredModel(
      customModelId.trim().toLowerCase(),
      customModelName.trim() || customModelId.trim(),
      selectedProvider,
      'manual_user_entry',
      customEndpoint.trim(),
      false // strictly unverified
    );

    const updated = [newModel, ...models];
    onUpdateModels(updated);
    saveCatalogToCache(updated);
    setCustomModelId('');
    setCustomModelName('');
  };

  const handleProbeModel = (model: ModelMetadata) => {
    const verified = runCapabilityProbe(model);
    const updated = models.map(m => m.id === model.id ? verified : m);
    onUpdateModels(updated);
    saveCatalogToCache(updated);
    setProbeResultMsg(`Handshake probe succeeded for ${model.name}: capabilities verified and registered.`);
    setTimeout(() => setProbeResultMsg(null), 4000);
  };

  const filteredModels = models.filter(m => 
    m.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
    m.id.toLowerCase().includes(filterQuery.toLowerCase()) ||
    m.provider.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const renderCapStatus = (status: 'supported' | 'unsupported' | 'unknown') => {
    if (status === 'supported') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-mono">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>supported</span>
        </span>
      );
    }
    if (status === 'unsupported') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-mono">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>unsupported</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-mono">
        <HelpCircle className="w-3.5 h-3.5 shrink-0" />
        <span>unknown</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Editorial context header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            Dynamic Model Catalog &amp; Capability Registry
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <span>v0.4.7 Architecture Improvement (P1)</span>
            <span aria-hidden="true">·</span>
            <span>Refreshed: {lastRefreshed}</span>
            <span aria-hidden="true">·</span>
            <span>Unknown Should Mean Unknown Safeguard Active</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRunDiscovery}
            disabled={isDiscovering}
            className="px-3 py-1.5 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isDiscovering ? 'animate-spin' : ''}`} />
            <span>{isDiscovering ? 'Scanning Providers...' : 'Discover Installed Models'}</span>
          </button>
        </div>
      </div>

      {probeResultMsg && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{probeResultMsg}</span>
        </div>
      )}

      {/* Discovery Architecture Banner */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded bg-indigo-950/60 border border-indigo-800/50 text-indigo-400 shrink-0">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Rigorous Separation: Availability vs. Verified Capabilities
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              In v0.4.6, manually typing or discovering an unknown model caused the router to synthesize optimistic assumptions 
              (<code className="text-slate-300 font-mono">tools: True, reasoning: True, structured_output: True</code>). 
              In v0.4.7, newly discovered or manual models strictly register as <strong>unknown</strong> until an active capability handshake probe verifies them.
            </p>
          </div>
        </div>

        {/* Discovery form & adapter selector */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <form onSubmit={handleAddManualModel} className="flex flex-wrap items-center gap-2.5 flex-1">
            <select
              value={selectedProvider}
              onChange={(e) => {
                const prov = e.target.value as ModelProvider;
                setSelectedProvider(prov);
                if (prov === 'ollama') setCustomEndpoint('http://localhost:11434');
                else if (prov === 'openai-compatible') setCustomEndpoint('https://api.openai.com/v1');
                else setCustomEndpoint('http://localhost:8000/v1');
              }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-indigo-500 outline-none"
            >
              <option value="ollama">Ollama (Local /api/tags)</option>
              <option value="openai-compatible">OpenAI-Compatible (/v1/models)</option>
              <option value="codex">Codex SDK Provider</option>
              <option value="custom">Custom Internal Proxy</option>
            </select>

            <input
              type="text"
              placeholder="Model ID (e.g., mistral-small:24b)"
              value={customModelId}
              onChange={(e) => setCustomModelId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 font-mono focus:border-indigo-500 outline-none w-56"
            />

            <input
              type="text"
              placeholder="Endpoint URL"
              value={customEndpoint}
              onChange={(e) => setCustomEndpoint(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 font-mono focus:border-indigo-500 outline-none w-52"
            />

            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Model</span>
            </button>
          </form>

          <input
            type="text"
            placeholder="Filter catalog..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 outline-none w-48"
          />
        </div>
      </div>

      {/* Model Catalog Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="text-xs font-medium text-slate-300">
            Discovered Models ({filteredModels.length})
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Cache Mode: Last-Known-Good Fallback Enabled
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">Model ID &amp; Source</th>
                <th className="px-4 py-2.5 font-medium">Provider &amp; Endpoint</th>
                <th className="px-4 py-2.5 font-medium">Structured Plan</th>
                <th className="px-4 py-2.5 font-medium">Reasoning</th>
                <th className="px-4 py-2.5 font-medium">Native Tools</th>
                <th className="px-4 py-2.5 font-medium">Context Limit</th>
                <th className="px-4 py-2.5 font-medium">Verification Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredModels.map((model) => (
                <tr key={model.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-200">{model.name}</div>
                    <div className="font-mono text-[11px] text-slate-500">{model.id}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Source: {model.source} · {model.discoveredAt}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="text-slate-300 font-medium capitalize">{model.provider}</div>
                    <div className="font-mono text-[11px] text-slate-500 truncate max-w-[180px]">
                      {model.providerEndpoint || 'Embedded SDK'}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {renderCapStatus(model.capabilities.structured_agent_plan)}
                  </td>

                  <td className="px-4 py-3">
                    {renderCapStatus(model.capabilities.reasoning)}
                  </td>

                  <td className="px-4 py-3">
                    {renderCapStatus(model.capabilities.native_tool_calling)}
                  </td>

                  <td className="px-4 py-3 font-mono tabular-nums text-slate-300">
                    {model.contextCapacityTokens.toLocaleString()} tokens
                  </td>

                  <td className="px-4 py-3">
                    {model.verifiedCapabilities ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Unverified (Strict)</span>
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {!model.verifiedCapabilities ? (
                      <button
                        onClick={() => handleProbeModel(model)}
                        className="px-2.5 py-1 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800 rounded transition-colors inline-flex items-center gap-1"
                        title="Run capability handshake probe to verify schema support"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Run Probe</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500 font-mono">Profile Verified</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
