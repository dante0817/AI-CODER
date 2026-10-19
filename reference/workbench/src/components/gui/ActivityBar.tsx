import React from 'react';
import { Home, Files, Search, GitBranch, Sparkles, Shield, Activity as ActivityIcon, Settings } from 'lucide-react';

export type ActivityBarItem = 
  | 'workspace'
  | 'explorer'
  | 'search'
  | 'source_control'
  | 'ai_tasks'
  | 'skills'
  | 'activity'
  | 'settings';

interface ActivityBarProps {
  activeItem: ActivityBarItem;
  onSelectItem: (item: ActivityBarItem) => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activeItem, onSelectItem }) => {
  const topItems: { id: ActivityBarItem; label: string; icon: React.ReactNode }[] = [
    { id: 'workspace', label: 'Workspace', icon: <Home className="w-5 h-5" /> },
    { id: 'explorer', label: 'Explorer', icon: <Files className="w-5 h-5" /> },
    { id: 'search', label: 'Search', icon: <Search className="w-5 h-5" /> },
    { id: 'source_control', label: 'Source Control', icon: <GitBranch className="w-5 h-5" /> },
    { id: 'ai_tasks', label: 'AI Tasks', icon: <Sparkles className="w-5 h-5 text-blue-400" /> },
    { id: 'skills', label: 'Skills', icon: <Shield className="w-5 h-5" /> },
    { id: 'activity', label: 'Activity', icon: <ActivityIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="w-16 bg-[#0c1017] border-r border-[#21262d] flex flex-col justify-between items-center py-2 select-none shrink-0 z-20">
      {/* Top action items */}
      <div className="flex flex-col items-center w-full gap-1">
        {topItems.map((item) => {
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              className={`w-full py-2 flex flex-col items-center justify-center transition-colors relative group ${
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22]'
              }`}
            >
              {/* Active left indicator line */}
              {isActive && (
                <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-500 rounded-r" />
              )}
              {/* Icon container */}
              <div className={`p-1.5 rounded-lg flex items-center justify-center ${
                isActive && item.id === 'workspace'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isActive
                  ? 'bg-[#1f242c] text-blue-400'
                  : ''
              }`}>
                {item.icon}
              </div>
              <span className="text-[10px] mt-1 font-medium leading-none tracking-tight scale-90">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom Settings icon */}
      <div className="w-full flex flex-col items-center">
        <button
          onClick={() => onSelectItem('settings')}
          className={`w-full py-2.5 flex flex-col items-center justify-center transition-colors relative ${
            activeItem === 'settings'
              ? 'text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22]'
          }`}
          title="Settings & Configuration"
        >
          {activeItem === 'settings' && (
            <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-500 rounded-r" />
          )}
          <Settings className="w-5 h-5" />
          <span className="text-[10px] mt-1 font-medium leading-none tracking-tight scale-90">
            Settings
          </span>
        </button>
      </div>
    </div>
  );
};
