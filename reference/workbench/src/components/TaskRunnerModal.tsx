import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Square, CheckCircle2, AlertOctagon, RotateCcw, ArrowRight } from 'lucide-react';

interface TaskRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TaskExecutionStage = 
  | 'idle'
  | 'connecting'
  | 'analyzing'
  | 'building_context'
  | 'waiting_for_model'
  | 'receiving_answer'
  | 'preparing_changes'
  | 'waiting_approval'
  | 'running_tests'
  | 'completed'
  | 'cancelled';

export const TaskRunnerModal: React.FC<TaskRunnerModalProps> = ({ isOpen, onClose }) => {
  const [stage, setStage] = useState<TaskExecutionStage>('idle');
  const [streamedText, setStreamedText] = useState('');
  const [stageLogs, setStageLogs] = useState<string[]>([]);
  const timerRef = useRef<any>(null);

  if (!isOpen) return null;

  const handleStartTask = () => {
    setStage('connecting');
    setStreamedText('');
    setStageLogs(['[00:00.0] Initializing isolated worktree task session...']);

    // Advance stages with realistic timings
    timerRef.current = setTimeout(() => {
      setStage('analyzing');
      setStageLogs(prev => [...prev, '[00:00.6] Analyzing task intent & identifying target symbols in OrderService...']);

      timerRef.current = setTimeout(() => {
        setStage('building_context');
        setStageLogs(prev => [...prev, '[00:01.2] Smart Context Engine: Traversing import graph & companion unit tests...']);

        timerRef.current = setTimeout(() => {
          setStage('waiting_for_model');
          setStageLogs(prev => [...prev, '[00:02.0] Model connected (Qwen3 Coder / DeepSeek R1). Awaiting token stream...']);

          timerRef.current = setTimeout(() => {
            setStage('receiving_answer');
            setStreamedText('```json\n{\n  "patch_type": "replace_exact_text",\n  "base_sha256": "84a1d48c08ef...",\n  "target": "src/checkout/order_service.py",\n  "summary": "Wrap inventory check and payment authorization in threading.Lock to eliminate race condition."\n}\n```');
            setStageLogs(prev => [...prev, '[00:03.1] Receiving structured JSON patch proposal...']);

            timerRef.current = setTimeout(() => {
              setStage('preparing_changes');
              setStageLogs(prev => [...prev, '[00:04.0] In-Memory Patch Compiler: Base SHA-256 verified. Checkpoint chk_9941a captured.']);

              timerRef.current = setTimeout(() => {
                setStage('waiting_approval');
                setStageLogs(prev => [...prev, '[00:04.8] Change ready for pre-write review. Awaiting user approval...']);
              }, 1000);
            }, 1200);
          }, 1500);
        }, 1200);
      }, 1000);
    }, 800);
  };

  const handleApproveAndTest = () => {
    setStage('running_tests');
    setStageLogs(prev => [...prev, '[00:05.5] Pre-write review accepted. Committing safe write via Windows handle lock...']);
    setStageLogs(prev => [...prev, '[00:06.2] Running verification suite: pytest tests/test_order_service.py...']);

    setTimeout(() => {
      setStage('completed');
      setStageLogs(prev => [...prev, '[00:07.4] 2 passed in 0.42s! Worktree task successfully verified and ready for merge gate.']);
    }, 1500);
  };

  const handleCancelTask = () => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (stage === 'preparing_changes' || stage === 'running_tests') {
      // Controlled cancellation / atomic protection
      setStageLogs(prev => [...prev, '[CANCEL] Controlled cancellation triggered: Rollback checkpoint restored to ensure zero disk corruption.']);
    } else {
      setStageLogs(prev => [...prev, '[CANCEL] Request aborted immediately by user.']);
    }
    setStage('cancelled');
  };

  const handleReset = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStage('idle');
    setStreamedText('');
    setStageLogs([]);
  };

  const getStageBadge = (target: TaskExecutionStage, label: string) => {
    const isCurrent = stage === target;
    const isDone = [
      'connecting', 'analyzing', 'building_context', 'waiting_for_model',
      'receiving_answer', 'preparing_changes', 'waiting_approval', 'running_tests', 'completed'
    ].indexOf(stage) > [
      'connecting', 'analyzing', 'building_context', 'waiting_for_model',
      'receiving_answer', 'preparing_changes', 'waiting_approval', 'running_tests', 'completed'
    ].indexOf(target);

    return (
      <div className={`px-2.5 py-1 rounded text-xs font-mono flex items-center gap-1.5 ${
        isCurrent
          ? 'bg-indigo-950 text-indigo-300 border border-indigo-500 font-semibold'
          : isDone
          ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'
          : 'bg-slate-900 text-slate-500 border border-slate-800'
      }`}>
        {isDone ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : null}
        <span>{label}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Streaming &amp; Per-Task Cancellation State Machine
            </h3>
            <div className="text-xs text-slate-400 mt-0.5">
              Task: Fix OrderService Concurrency · Worktree: ~/.ai-coder/worktrees/task-101
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Progress Stage Flow */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-400">Execution Pipeline Timeline</div>
            <div className="flex flex-wrap gap-2">
              {getStageBadge('connecting', '1. Connecting')}
              {getStageBadge('analyzing', '2. Analyzing')}
              {getStageBadge('building_context', '3. Building Context')}
              {getStageBadge('waiting_for_model', '4. Waiting for Model')}
              {getStageBadge('receiving_answer', '5. Receiving Stream')}
              {getStageBadge('preparing_changes', '6. Preparing Changes')}
              {getStageBadge('waiting_approval', '7. Pre-Write Review')}
              {getStageBadge('running_tests', '8. Running Tests')}
            </div>
          </div>

          {/* Streaming Output Visualizer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">Model Response Stream</span>
              <span className="font-mono text-slate-500">
                {stage === 'receiving_answer' ? 'Streaming live...' : stage === 'completed' ? 'Stream finished' : 'Idle'}
              </span>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl min-h-24 max-h-36 overflow-y-auto font-mono text-xs text-indigo-300">
              {streamedText ? (
                <pre className="whitespace-pre-wrap">{streamedText}</pre>
              ) : (
                <span className="text-slate-600 italic">Awaiting model payload...</span>
              )}
            </div>
          </div>

          {/* Runtime Event Telemetry */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">Lifecycle Events &amp; Safety Guards</div>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 max-h-40 overflow-y-auto space-y-1">
              {stageLogs.length > 0 ? (
                stageLogs.map((log, i) => <div key={i}>{log}</div>)
              ) : (
                <div className="text-slate-600">No events yet. Click &quot;Start Execution&quot; below.</div>
              )}
            </div>
          </div>

          {/* Pre-Write Approval Callout if waiting */}
          {stage === 'waiting_approval' && (
            <div className="p-3.5 bg-indigo-950/40 border border-indigo-800/80 rounded-xl flex items-center justify-between gap-4">
              <div className="text-xs text-indigo-200">
                <strong>Pre-Write Review Gate:</strong> In-memory diff verified. Ready to apply with rollback backup.
              </div>
              <button
                onClick={handleApproveAndTest}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap"
              >
                Approve &amp; Run Tests
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Cancellation Policy: Cleanly abortable prior to file write; locked during atomic replace.
          </div>

          <div className="flex items-center gap-2.5">
            {stage === 'idle' || stage === 'cancelled' || stage === 'completed' ? (
              <button
                onClick={stage === 'idle' ? handleStartTask : handleReset}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {stage === 'idle' ? <Play className="w-3.5 h-3.5 fill-current" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>{stage === 'idle' ? 'Start Task Execution' : 'Reset Task'}</span>
              </button>
            ) : (
              <button
                onClick={handleCancelTask}
                className="px-4 py-2 text-xs font-semibold text-rose-300 hover:text-white bg-rose-950/80 hover:bg-rose-900 border border-rose-800 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Cancel Active Run</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
