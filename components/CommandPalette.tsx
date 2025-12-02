
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icons';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-[#353956] border-[3px] border-white/10 rounded-2xl shadow-clay-xl overflow-hidden animate-pop"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <Icon.Search className="text-white/50" size={24} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Type a command..."
            className="bg-transparent text-white text-xl font-display font-semibold w-full outline-none placeholder-white/30"
          />
          <div className="text-xs font-bold text-white/30 border border-white/20 rounded px-2 py-1">ESC</div>
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="p-6 text-center text-white/40 font-medium">No commands found</div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => { cmd.action(); onClose(); }}
                className={`w-full px-5 py-3 flex items-center justify-between transition-colors text-left
                  ${idx === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'}
                `}
              >
                <div className="flex items-center gap-4 text-white">
                  <div className={`p-2 rounded-lg ${idx === selectedIndex ? 'bg-pink-500 shadow-clay-sm' : 'bg-white/5'}`}>
                    {cmd.icon}
                  </div>
                  <span className="font-bold text-lg">{cmd.label}</span>
                </div>
                {cmd.shortcut && (
                  <span className="text-xs font-mono text-white/40 bg-black/20 px-2 py-1 rounded border border-white/10">
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
        
        <div className="px-4 py-2 bg-black/20 flex items-center justify-between text-[10px] text-white/30 uppercase font-bold tracking-wider">
           <span>Singularity Command</span>
           <span>Select: ↵</span>
        </div>
      </div>
    </div>
  );
};
