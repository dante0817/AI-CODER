import React, { useState } from 'react';
import { TitleBar } from './components/gui/TitleBar';
import { ActivityBar, ActivityBarItem } from './components/gui/ActivityBar';
import { SidebarExplorer, TaskItem } from './components/gui/SidebarExplorer';
import { TaskCenterPanel } from './components/gui/TaskCenterPanel';
import { BottomTerminalPanel } from './components/gui/BottomTerminalPanel';
import { TaskDetailsSidebar } from './components/gui/TaskDetailsSidebar';
import { StatusBar } from './components/gui/StatusBar';
import { CommandPaletteModal } from './components/gui/CommandPaletteModal';
import { ArchitectureWorkbenchDrawer, WorkbenchTab } from './components/gui/ArchitectureWorkbenchDrawer';
import { TaskRunnerModal } from './components/TaskRunnerModal';
import { ArchitectureGuideModal } from './components/ArchitectureGuideModal';
import { LiveVoiceModal } from './components/gui/LiveVoiceModal';
import { MapsGroundingModal } from './components/gui/MapsGroundingModal';
import { NewTaskModal } from './components/gui/NewTaskModal';
import { ConflictGateModal } from './components/gui/ConflictGateModal';
import { DiscardModal } from './components/gui/DiscardModal';
import { CheckpointInspectionModal } from './components/gui/CheckpointInspectionModal';
import { getCachedCatalog } from './lib/modelDiscovery';
import { INITIAL_TASKS, MOCK_REPOSITORY_FILES } from './data/mockData';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  // Underlying Architectural State
  const cached = getCachedCatalog();
  const [models, setModels] = useState(cached.models);
  const [lastRefreshed, setLastRefreshed] = useState(cached.lastRefreshed);
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [files] = useState(MOCK_REPOSITORY_FILES);

  // GUI State Matching Screenshot
  const [activeActivityItem, setActiveActivityItem] = useState<ActivityBarItem>('workspace');
  const [activeTaskId, setActiveTaskId] = useState('task-101');
  const [activeFilePath, setActiveFilePath] = useState('src/auth/session.py');
  const [activeDiffFile, setActiveDiffFile] = useState<'session.py' | 'test_auth.py'>('session.py');
  const [isTaskDetailsOpen, setIsTaskDetailsOpen] = useState(true);

  // Modals & Drawers
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>('router');
  const [isRunnerOpen, setIsRunnerOpen] = useState(false);
  const [isArchGuideOpen, setIsArchGuideOpen] = useState(false);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  const [isMapsGroundingOpen, setIsMapsGroundingOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [isConflictGateOpen, setIsConflictGateOpen] = useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [isCheckpointModalOpen, setIsCheckpointModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // GUI Tasks List (from image.png)
  const [guiTasks, setGuiTasks] = useState<TaskItem[]>([
    {
      id: 'task-101',
      title: 'Fix authentication issue',
      status: 'running',
      mode: 'Agent',
      createdAt: 'Nov 15, 2024 10:23 AM',
      updatedAt: '2 minutes ago',
      targetFile: 'src/auth/session.py'
    },
    {
      id: 'task-102',
      title: 'Review database schema',
      status: 'ready',
      mode: 'Chat',
      createdAt: 'Nov 15, 2024 09:10 AM',
      updatedAt: '1 hour ago',
      targetFile: 'src/db/schema.py'
    },
    {
      id: 'task-103',
      title: 'Refactor API client',
      status: 'review_required',
      mode: 'Agent',
      createdAt: 'Nov 14, 2024 16:45 PM',
      updatedAt: 'Yesterday',
      targetFile: 'src/api/client.py'
    },
    {
      id: 'task-104',
      title: 'Update README',
      status: 'completed',
      mode: 'Chat',
      createdAt: 'Nov 14, 2024 14:20 PM',
      updatedAt: 'Yesterday',
      targetFile: 'README.md'
    },
    {
      id: 'task-105',
      title: 'Improve test coverage',
      status: 'failed',
      mode: 'Agent',
      createdAt: 'Nov 14, 2024 11:00 AM',
      updatedAt: '2 days ago',
      targetFile: 'tests/test_auth.py'
    },
    {
      id: 'task-106',
      title: 'Add dark mode',
      status: 'ready',
      mode: 'Chat',
      createdAt: 'Nov 13, 2024 18:00 PM',
      updatedAt: '3 days ago',
      targetFile: 'src/ui/theme.py'
    },
  ]);

  const activeTask = guiTasks.find(t => t.id === activeTaskId) || guiTasks[0];

  const handleUpdateModels = (updated: typeof models) => {
    setModels(updated);
    setLastRefreshed(new Date().toLocaleTimeString());
  };

  const handleOpenWorkbenchTab = (tab: WorkbenchTab) => {
    setWorkbenchTab(tab);
    setIsWorkbenchOpen(true);
  };

  const handleSelectActivityItem = (item: ActivityBarItem) => {
    setActiveActivityItem(item);
    if (item === 'ai_tasks') {
      handleOpenWorkbenchTab('router');
    } else if (item === 'source_control') {
      handleOpenWorkbenchTab('lifecycle');
    } else if (item === 'skills') {
      handleOpenWorkbenchTab('conformance');
    } else if (item === 'activity') {
      setIsRunnerOpen(true);
    } else if (item === 'settings') {
      handleOpenWorkbenchTab('discovery');
    }
  };

  const handleApplySuccess = () => {
    showToast('SUCCESS: Worktree ai-coder/7a82f applied cleanly to main project! All 36 pytest assertions verified.');
    setGuiTasks(prev => prev.map(t => t.id === activeTaskId ? { ...t, status: 'completed' as const } : t));
  };

  const handleDiscardSuccess = () => {
    showToast('Pending unmerged changes discarded. Checkpoint retained in .ai-coder/checkpoints.');
    setGuiTasks(prev => prev.map(t => t.id === activeTaskId ? { ...t, status: 'ready' as const } : t));
  };

  const handleRollbackSuccess = () => {
    showToast('ROLLBACK COMPLETE: Restored pre-patch state with 100% byte-exact fidelity.');
  };

  return (
    <div className="h-screen w-screen bg-[#0d1117] text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* 1. Window Title Bar */}
      <TitleBar
        projectName="AI-CODER-Desktop-MVP"
        isConnected={true}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenAIConnections={() => handleOpenWorkbenchTab('router')}
        onOpenSettings={() => handleOpenWorkbenchTab('discovery')}
      />

      {/* 2. Main Workstation Area (Activity Bar + Sidebar + Center + Task Details) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Far-Left Activity Bar (VS Code style) */}
        <ActivityBar
          activeItem={activeActivityItem}
          onSelectItem={handleSelectActivityItem}
        />

        {/* Left Sidebar: Project Explorer & AI Tasks */}
        <SidebarExplorer
          tasks={guiTasks}
          activeTaskId={activeTaskId}
          onSelectTask={(id) => {
            setActiveTaskId(id);
            const found = guiTasks.find(t => t.id === id);
            if (found) {
              if (found.targetFile.includes('test_auth')) {
                setActiveDiffFile('test_auth.py');
              } else {
                setActiveDiffFile('session.py');
              }
            }
          }}
          onNewTask={() => setIsNewTaskModalOpen(true)}
          activeFilePath={activeFilePath}
          onSelectFile={(path) => {
            setActiveFilePath(path);
            if (path.includes('test_auth')) {
              setActiveDiffFile('test_auth.py');
            } else {
              setActiveDiffFile('session.py');
            }
          }}
        />

        {/* Center Main Stage (Chat Conversation + Diff Viewer + Bottom Terminal) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Upper/Middle Center: Task Header, Controls, Chat, Diff */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <TaskCenterPanel
              taskTitle={activeTask.title}
              activeDiffFile={activeDiffFile}
              onSelectDiffFile={setActiveDiffFile}
              onOpenContextInspect={() => handleOpenWorkbenchTab('context')}
              onOpenLiveVoice={() => setIsLiveVoiceOpen(true)}
              onOpenMapsGrounding={() => setIsMapsGroundingOpen(true)}
            />
          </div>

          {/* Lower Center: Terminal & Verification Output Panel */}
          <BottomTerminalPanel
            onOpenCheckpointsModal={() => setIsCheckpointModalOpen(true)}
            onOpenVerificationModal={() => setIsRunnerOpen(true)}
          />
        </div>

        {/* Right Sidebar: Task Details Panel */}
        {isTaskDetailsOpen && (
          <TaskDetailsSidebar
            taskTitle={activeTask.title}
            status={activeTask.status === 'running' ? 'Running' : activeTask.status === 'review_required' ? 'Review required' : activeTask.status}
            onClose={() => setIsTaskDetailsOpen(false)}
            onOpenContextInspect={() => handleOpenWorkbenchTab('context')}
            onOpenCheckpointView={() => setIsCheckpointModalOpen(true)}
            onOpenRouterDetails={() => handleOpenWorkbenchTab('router')}
            onApplyToMain={() => setIsConflictGateOpen(true)}
            onDiscardChanges={() => setIsDiscardModalOpen(true)}
          />
        )}
      </div>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-8 right-6 z-50 bg-emerald-950/95 border border-emerald-500 text-emerald-200 px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 text-xs font-medium backdrop-blur-xs animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 3. Bottom Status Bar */}
      <StatusBar
        worktreeName="ai-coder/7a82f"
        contextUsage="51 KB / 80 KB"
        modelName="GPT-5.6 Sol (Auto)"
        onOpenModelRouter={() => handleOpenWorkbenchTab('router')}
        onOpenContextEngine={() => handleOpenWorkbenchTab('context')}
      />

      {/* Modals & Dialogs */}
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        onCreateTask={(newTask) => {
          setGuiTasks([newTask, ...guiTasks]);
          setActiveTaskId(newTask.id);
          showToast(`Created task: ${newTask.title}`);
        }}
      />

      <ConflictGateModal
        isOpen={isConflictGateOpen}
        onClose={() => setIsConflictGateOpen(false)}
        onConfirmApply={handleApplySuccess}
      />

      <DiscardModal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        onConfirmDiscard={handleDiscardSuccess}
      />

      <CheckpointInspectionModal
        isOpen={isCheckpointModalOpen}
        onClose={() => setIsCheckpointModalOpen(false)}
        onRollbackComplete={handleRollbackSuccess}
      />

      {/* 4. Full Architecture Suite Workbench Drawer / Modal */}
      <ArchitectureWorkbenchDrawer
        isOpen={isWorkbenchOpen}
        onClose={() => setIsWorkbenchOpen(false)}
        activeTab={workbenchTab}
        onTabChange={setWorkbenchTab}
        models={models}
        onUpdateModels={handleUpdateModels}
        lastRefreshed={lastRefreshed}
        tasks={tasks}
        onUpdateTasks={setTasks}
        files={files}
        onOpenArchGuide={() => setIsArchGuideOpen(true)}
      />

      {/* 5. Command Palette Modal (Ctrl+K) */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTask={(id) => {
          setActiveTaskId(id);
          setIsCommandPaletteOpen(false);
        }}
        onSelectFile={(path) => {
          setActiveFilePath(path);
          if (path.includes('test_auth')) {
            setActiveDiffFile('test_auth.py');
          } else {
            setActiveDiffFile('session.py');
          }
          setIsCommandPaletteOpen(false);
        }}
        onOpenWorkbench={(tab) => {
          handleOpenWorkbenchTab(tab as WorkbenchTab);
          setIsCommandPaletteOpen(false);
        }}
      />

      {/* 6. Streaming Task Runner Modal */}
      <TaskRunnerModal
        isOpen={isRunnerOpen}
        onClose={() => setIsRunnerOpen(false)}
      />

      {/* 7. Architecture Guide & Priority Roadmap Modal */}
      <ArchitectureGuideModal
        isOpen={isArchGuideOpen}
        onClose={() => setIsArchGuideOpen(false)}
      />

      {/* 8. Live API Voice Modal (gemini-3.8-live) */}
      <LiveVoiceModal
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
      />

      {/* 9. Google Maps Grounding Modal (gemini-3.5-flash with googleMaps) */}
      <MapsGroundingModal
        isOpen={isMapsGroundingOpen}
        onClose={() => setIsMapsGroundingOpen(false)}
      />
    </div>
  );
}
