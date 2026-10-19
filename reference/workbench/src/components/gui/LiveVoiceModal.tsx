import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Sparkles, Volume2, Radio, AlertCircle, PhoneOff } from 'lucide-react';
import { float32To16BitPCM, arrayBufferToBase64, base64To16BitPCM } from '../../lib/geminiClient';

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'listening' | 'speaking' | 'error' | 'disconnected'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcriptions, setTranscriptions] = useState<string[]>([]);
  const [visualizerLevels, setVisualizerLevels] = useState<number[]>([15, 30, 60, 40, 75, 50, 90, 45, 65, 35, 20]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef(false);

  isMutedRef.current = isMuted;

  useEffect(() => {
    if (isOpen) {
      startLiveSession();
    } else {
      stopLiveSession();
    }
    return () => {
      stopLiveSession();
    };
  }, [isOpen]);

  // Animated visualizer loop
  useEffect(() => {
    let animId: number;
    const updateLevels = () => {
      if (status === 'speaking' || status === 'listening') {
        setVisualizerLevels(prev => prev.map(() => Math.floor(Math.random() * 70 + 20)));
      } else {
        setVisualizerLevels([10, 15, 20, 15, 25, 20, 15, 20, 15, 10, 8]);
      }
      animId = requestAnimationFrame(updateLevels);
    };
    animId = requestAnimationFrame(updateLevels);
    return () => cancelAnimationFrame(animId);
  }, [status]);

  const startLiveSession = async () => {
    setStatus('connecting');
    setErrorMessage(null);
    setTranscriptions(['Connecting to gemini-3.8-live session...']);

    try {
      // 1. Setup AudioContexts (16kHz in, 24kHz out per gemini_api skill guidelines)
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      // 2. Setup Mic Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // 3. Connect to WebSocket proxy on server.ts
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live-ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        setTranscriptions(prev => [...prev, 'Session active with gemini-3.8-live. Speak now!']);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'ready') {
            setStatus('listening');
          } else if (msg.type === 'audio' && msg.audio) {
            setStatus('speaking');
            playAudioChunk(msg.audio);
          } else if (msg.type === 'transcription' && msg.text) {
            setTranscriptions(prev => [...prev.slice(-6), `Model: ${msg.text}`]);
          } else if (msg.type === 'interrupted') {
            // Cancel pending audio
            nextStartTimeRef.current = outputAudioCtxRef.current?.currentTime || 0;
            setStatus('listening');
          } else if (msg.type === 'error') {
            setErrorMessage(msg.error);
            setStatus('error');
          }
        } catch (e) {
          console.warn('Live message parse error', e);
        }
      };

      ws.onerror = (e) => {
        console.error('WebSocket error in Live Voice', e);
        setErrorMessage('Failed to connect to Live API WebSocket.');
        setStatus('error');
      };

      ws.onclose = () => {
        setStatus('disconnected');
      };

      // 4. Capture Mic Audio and Stream as 16kHz PCM
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16Buffer = float32To16BitPCM(inputData);
        const base64Audio = arrayBufferToBase64(pcm16Buffer);

        wsRef.current.send(JSON.stringify({
          type: 'audio',
          audio: base64Audio,
        }));
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
    } catch (err: any) {
      console.error('Error starting live voice session:', err);
      setErrorMessage(err.message || 'Microphone access denied or Live API unavailable.');
      setStatus('error');
    }
  };

  const playAudioChunk = (base64Audio: string) => {
    if (!outputAudioCtxRef.current) return;
    try {
      const ctx = outputAudioCtxRef.current;
      const float32 = base64To16BitPCM(base64Audio);
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }

      sourceNode.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      sourceNode.onended = () => {
        if (ctx.currentTime >= nextStartTimeRef.current - 0.05) {
          setStatus('listening');
        }
      };
    } catch (e) {
      console.warn('Audio playback error', e);
    }
  };

  const stopLiveSession = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      outputAudioCtxRef.current.close();
      outputAudioCtxRef.current = null;
    }
    setStatus('disconnected');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="bg-[#0f141d] border border-blue-500/40 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col text-slate-200">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#21262d] flex items-center justify-between bg-[#121824]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Live Voice Conversation</h3>
              <div className="text-[11px] text-blue-400 font-mono">Model: gemini-3.8-live (Live API)</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:text-white hover:bg-slate-800 rounded transition-colors text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visualizer Area */}
        <div className="p-8 flex flex-col items-center justify-center space-y-6 bg-gradient-to-b from-[#111723] to-[#0a0d14]">
          {/* Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border bg-[#161f30] border-slate-700">
            {status === 'speaking' ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-blue-400 animate-bounce" />
                <span className="text-blue-300 font-semibold">Gemini Speaking...</span>
              </>
            ) : status === 'listening' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-emerald-400 font-semibold">Listening to Microphone</span>
              </>
            ) : status === 'connecting' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span className="text-amber-300">Connecting to Live API...</span>
              </>
            ) : status === 'error' ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-300">Connection Error</span>
              </>
            ) : (
              <span className="text-slate-400">Disconnected</span>
            )}
          </div>

          {/* Glowing Waveform Bars */}
          <div className="flex items-center justify-center gap-1.5 h-24 w-full">
            {visualizerLevels.map((lvl, idx) => (
              <div
                key={idx}
                className={`w-2 rounded-full transition-all duration-75 ${
                  status === 'speaking'
                    ? 'bg-blue-500 shadow-blue-500/50 shadow-md'
                    : status === 'listening'
                    ? 'bg-emerald-500 shadow-emerald-500/50 shadow-md'
                    : 'bg-slate-700'
                }`}
                style={{ height: `${lvl}%` }}
              />
            ))}
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-200 text-center max-w-sm">
              {errorMessage}
            </div>
          )}

          {/* Transcript / Activity Feed */}
          <div className="w-full bg-[#121824] border border-slate-800 rounded-xl p-3 min-h-20 max-h-32 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1">
            {transcriptions.map((t, i) => (
              <div key={i} className="leading-relaxed">{t}</div>
            ))}
          </div>
        </div>

        {/* Controls Footer */}
        <div className="px-6 py-4 border-t border-[#21262d] bg-[#0d121b] flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            Bidirectional 16kHz &rarr; 24kHz PCM stream
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-2.5 rounded-full border transition-colors ${
                isMuted
                  ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                  : 'bg-[#1b2536] border-slate-700 text-slate-200 hover:text-white'
              }`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>End Call</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
