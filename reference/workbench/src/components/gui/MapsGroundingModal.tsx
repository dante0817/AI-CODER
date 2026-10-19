import React, { useState } from 'react';
import { MapPin, X, ExternalLink, Search, Sparkles, Navigation, Star, MessageSquare } from 'lucide-react';
import { queryGoogleMapsGrounding, GroundedPlace } from '../../lib/geminiClient';

interface MapsGroundingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertToChat?: (text: string) => void;
}

export const MapsGroundingModal: React.FC<MapsGroundingModalProps> = ({
  isOpen,
  onClose,
  onInsertToChat,
}) => {
  const [prompt, setPrompt] = useState('Find top tech developer co-working spaces near San Francisco with fast wifi');
  const [isLoading, setIsLoading] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [places, setPlaces] = useState<GroundedPlace[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);
    setResultText(null);
    setPlaces([]);

    try {
      // Optional geolocation
      let lat: number | undefined;
      let lng: number | undefined;

      if (navigator.geolocation) {
        try {
          const pos: any = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch (geoErr) {
          // ignore geolocation refusal, fallback to prompt location
        }
      }

      const res = await queryGoogleMapsGrounding(prompt.trim(), lat, lng);
      setResultText(res.text);
      setPlaces(res.places || []);
    } catch (err: any) {
      console.error('Maps Grounding query failed:', err);
      setError(err.message || 'Failed to query Google Maps grounding.');
    } finally {
      setIsLoading(false);
    }
  };

  const sampleQueries = [
    'Top developer co-working spaces in San Francisco',
    'Google Bay View Campus and nearby amenities',
    'Tech campuses and innovation hubs in Austin, TX',
    'Quiet programming cafes with fast internet near Tokyo Station'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="bg-[#0f141d] border border-blue-500/40 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] text-slate-200">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#21262d] flex items-center justify-between bg-[#121824]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Google Maps Grounding Engine</h3>
              <div className="text-[11px] text-blue-400 font-mono">Model: gemini-3.5-flash with googleMaps tool</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-[#141a26] border border-slate-700/80 rounded-xl px-3 py-2 text-xs focus-within:border-blue-500 transition-colors">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask about places, tech hubs, offices, or cafes..."
                className="w-full bg-transparent text-slate-100 placeholder:text-slate-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !prompt.trim()}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Grounding...' : 'Search Maps'}</span>
            </button>
          </form>

          {/* Quick Query Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1">
            <span className="text-slate-500 font-medium shrink-0">Sample queries:</span>
            {sampleQueries.map((q, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setPrompt(q);
                }}
                className="px-2.5 py-1 rounded-full bg-[#161f2e] hover:bg-[#202c42] text-slate-300 hover:text-white border border-slate-800 whitespace-nowrap transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Results Display */}
          {resultText && (
            <div className="space-y-4 pt-2">
              {/* Grounded Places Cards */}
              {places.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Grounded Google Maps Places ({places.length})</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {places.map((place, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-[#131924] border border-slate-800 hover:border-blue-500/50 rounded-xl space-y-2 transition-all shadow-sm group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
                            {place.title}
                          </h4>
                          {place.uri && (
                            <a
                              href={place.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 shrink-0"
                              title="Open in Google Maps"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        {place.reviewSnippets && place.reviewSnippets.length > 0 && (
                          <div className="space-y-1">
                            {place.reviewSnippets.slice(0, 2).map((snip: any, sIdx: number) => (
                              <div key={sIdx} className="text-[11px] text-slate-400 flex items-start gap-1">
                                <MessageSquare className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                                <span className="line-clamp-2 italic">&ldquo;{typeof snip === 'string' ? snip : snip?.text || ''}&rdquo;</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {place.uri && (
                          <div className="pt-1">
                            <a
                              href={place.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-400 font-mono hover:underline"
                            >
                              <span>View on Google Maps</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Markdown Answer */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-300">Detailed Grounded Intelligence</div>
                <div className="p-4 bg-[#111724] border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {resultText}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#21262d] bg-[#0d121b] flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            Grounding metadata verified via Google Maps Platform API
          </div>

          {resultText && onInsertToChat && (
            <button
              onClick={() => {
                onInsertToChat(resultText);
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
            >
              Insert into Task Chat
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
