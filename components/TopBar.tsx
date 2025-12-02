
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icons';

interface TopBarProps {
  projectName: string;
  setProjectName: (n: string) => void;
  activeToolName: string;
  onShare: () => void;
  onSettings: () => void;
  onAction: (action: string, payload?: any) => void;
  isSettingsOpen?: boolean;
  isDarkMode?: boolean;
  onBack?: () => void;
  isVoiceActive?: boolean;
  onToggleVoice?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ 
  projectName, 
  setProjectName, 
  activeToolName,
  onShare,
  onSettings,
  onAction,
  isSettingsOpen,
  isDarkMode,
  onBack,
  isVoiceActive,
  onToggleVoice
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Simulate auto-save effect when name changes
  useEffect(() => {
    setSaveStatus('saving');
    const timer = setTimeout(() => setSaveStatus('saved'), 1000);
    return () => clearTimeout(timer);
  }, [projectName]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const MenuDropdown = ({ title, items }: { title: string, items: { label: string, action: () => void, shortcut?: string, icon?: any, isDivider?: boolean }[] }) => (
    <div className="relative">
      <button 
        onClick={() => setActiveMenu(activeMenu === title ? null : title)}
        className={`hover:bg-gray-100 px-2 py-1 rounded transition-colors text-sm font-medium ${activeMenu === title ? 'bg-gray-100 text-black' : 'text-gray-700'}`}
      >
        {title}
      </button>
      {activeMenu === title && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[60] animate-fade-in">
          {items.map((item, idx) => (
            item.isDivider ? (
                <div key={idx} className="h-px bg-gray-100 my-1"></div>
            ) : (
                <button
                key={idx}
                onClick={() => { item.action(); setActiveMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-between group"
                >
                <div className="flex items-center gap-2">
                    {item.icon && <item.icon size={14} className="text-gray-400 group-hover:text-blue-500" />}
                    <span>{item.label}</span>
                </div>
                {item.shortcut && <span className="text-xs text-gray-400 font-mono">{item.shortcut}</span>}
                </button>
            )
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-[60px] bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm select-none">
      
      {/* Left Side: File Info & Menu */}
      <div className="flex items-center gap-4 pointer-events-auto min-w-0" ref={menuRef}>
        <button 
            onClick={onBack}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm shrink-0"
            title="Back to Home"
        >
          <Icon.Brain size={20} />
        </button>
        
        <div className="flex flex-col justify-center min-w-0">
           {/* Title */}
           <div className="flex items-center gap-2">
             {isEditing ? (
               <input 
                 autoFocus
                 className="font-sans font-bold text-lg text-gray-800 bg-transparent outline-none border-b-2 border-indigo-500 px-1 min-w-[150px]"
                 value={projectName}
                 onChange={(e) => setProjectName(e.target.value)}
                 onBlur={() => setIsEditing(false)}
                 onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
               />
             ) : (
               <button 
                 className="font-sans font-bold text-lg text-gray-800 hover:bg-gray-100 px-2 rounded -ml-2 text-left truncate max-w-[300px]"
                 onClick={() => setIsEditing(true)}
                 title="Rename Project"
               >
                 {projectName}
               </button>
             )}
             
             {/* Cloud Status */}
             <div className="flex items-center gap-1 text-gray-400" title={saveStatus === 'saved' ? "All changes saved" : "Saving..."}>
               {saveStatus === 'saved' ? (
                 <Icon.ShapeCloud size={14} className="text-gray-400" /> 
               ) : (
                 <Icon.Sparkles size={14} className="text-blue-400 animate-pulse" />
               )}
               {saveStatus === 'saved' && <span className="text-[10px] font-medium hidden sm:inline">Saved</span>}
             </div>
           </div>

           {/* Functional Menu Row */}
           <div className="flex items-center gap-1 mt-0.5">
              <MenuDropdown 
                title="File" 
                items={[
                  { label: 'New Map (Clear)', action: () => onAction('new-map'), icon: Icon.Plus },
                  { label: 'Save', action: () => setSaveStatus('saving'), shortcut: 'Ctrl+S', icon: Icon.Cloud },
                  { label: '', action: () => {}, isDivider: true },
                  { label: 'Export PNG Image', action: () => onAction('export-image'), icon: Icon.Image },
                  { label: 'Export JPEG Image', action: () => onAction('export-jpeg'), icon: Icon.Image },
                  { label: 'Export Text Outline', action: () => onAction('export-text'), icon: Icon.FileText },
                  { label: 'Export JSON Backup', action: () => onAction('export-json'), icon: Icon.Download },
                  { label: '', action: () => {}, isDivider: true },
                  { label: 'Exit to Home', action: () => onBack && onBack(), icon: Icon.Close },
                ]} 
              />
              <MenuDropdown 
                title="Edit" 
                items={[
                  { label: 'Undo', action: () => onAction('undo'), shortcut: 'Ctrl+Z', icon: Icon.Undo },
                  { label: 'Redo', action: () => onAction('redo'), shortcut: 'Ctrl+Y', icon: Icon.Redo },
                  { label: 'Select All', action: () => onAction('select-all'), shortcut: 'Ctrl+A', icon: Icon.Select },
                ]} 
              />
              <MenuDropdown 
                title="View" 
                items={[
                  { label: 'Zoom In', action: () => onAction('zoom-in'), icon: Icon.Plus },
                  { label: 'Zoom Out', action: () => onAction('zoom-out'), icon: Icon.Minus },
                  { label: 'Fit to Screen', action: () => onAction('fit'), shortcut: 'L', icon: Icon.Maximize },
                  { label: 'Center View', action: () => onAction('center'), shortcut: 'C', icon: Icon.Navigation },
                  { label: '', action: () => {}, isDivider: true },
                  { label: 'Start Presentation', action: () => onAction('present'), icon: Icon.Present },
                ]} 
              />
              <MenuDropdown 
                title="Help" 
                items={[
                  { label: 'Keyboard Shortcuts', action: () => onAction('shortcuts'), shortcut: '?', icon: Icon.Keyboard },
                  { label: 'About Singularity', action: () => alert("Singularity MindMap v1.0"), icon: Icon.Help },
                ]} 
              />
           </div>
        </div>
      </div>

      {/* Right Side: Actions (No Overlap) */}
      <div className="flex items-center gap-4 shrink-0 pointer-events-auto ml-4">
         
         {/* Voice Control Button */}
         {onToggleVoice && (
             <button
                onClick={onToggleVoice}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${isVoiceActive ? 'bg-red-50 border-red-200 text-red-600 shadow-inner' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
                title={isVoiceActive ? "Listening... (Click to stop)" : "Enable Voice Control"}
             >
                 <Icon.Mic size={16} className={isVoiceActive ? "animate-pulse" : ""} />
                 {isVoiceActive && <span className="text-xs font-bold animate-pulse">Listening</span>}
             </button>
         )}

         {/* Active Tool Indicator (Desktop only) */}
         <div className="hidden md:flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
            <span className="text-xs font-mono font-bold text-gray-500 uppercase">{activeToolName}</span>
         </div>

         <div className="h-8 w-px bg-gray-200 mx-2 hidden sm:block" />

         <button 
           onClick={() => onAction('present')}
           className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-full font-bold text-sm shadow-sm transition-all"
           title="Start Presentation Mode"
         >
            <Icon.Present size={16} className="text-pink-500" />
            <span className="hidden sm:inline">Present</span>
         </button>

         {/* Action Buttons */}
         <button 
           onClick={onShare}
           className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-full font-bold text-sm shadow-md hover:shadow-lg transition-all transform active:scale-95"
         >
           <Icon.Share size={16} />
           <span className="hidden sm:inline">Share</span>
         </button>

         <button 
           onClick={onSettings}
           className={`p-2 rounded-full transition-all duration-300 transform ${isSettingsOpen ? 'bg-blue-100 text-blue-600 rotate-90 shadow-inner scale-110' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 hover:rotate-45'}`}
           title="Settings"
         >
           <Icon.Settings size={22} />
         </button>

         {/* Profile Avatar */}
         <button className="w-9 h-9 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 p-0.5 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <span className="font-bold text-xs text-orange-500">ME</span>
            </div>
         </button>
      </div>
    </div>
  );
};
