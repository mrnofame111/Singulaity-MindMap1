
import React, { useEffect, useState } from 'react';

export const ShortcutMonitor: React.FC = () => {
  const [modifiers, setModifiers] = useState<string[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mods: string[] = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      if (e.metaKey) mods.push('Cmd');
      
      if (mods.length > 0) {
          // Normalize for comparison to avoid re-renders if same set
          const sorted = [...mods].sort();
          setModifiers(prev => {
              const prevSorted = [...prev].sort();
              return JSON.stringify(sorted) === JSON.stringify(prevSorted) ? prev : sorted;
          });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        const mods: string[] = [];
        if (e.ctrlKey) mods.push('Ctrl');
        if (e.altKey) mods.push('Alt');
        if (e.shiftKey) mods.push('Shift');
        if (e.metaKey) mods.push('Cmd');
        setModifiers(mods);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    }
  }, []);

  if (modifiers.length === 0) return null;

  const getHints = () => {
      // Logic to prioritize specific combinations
      const hasCtrl = modifiers.includes('Ctrl') || modifiers.includes('Cmd');
      const hasAlt = modifiers.includes('Alt');
      const hasShift = modifiers.includes('Shift');

      if (hasCtrl && hasAlt) {
          return [
              { key: 'C', desc: 'Copy Style' },
              { key: 'V', desc: 'Paste Style' },
          ];
      }

      if (hasCtrl) {
          const base = [
            { key: 'Z', desc: 'Undo' },
            { key: 'Y', desc: 'Redo' },
            { key: 'F', desc: 'Find & Replace' },
            { key: 'K', desc: 'Cmd Palette' },
            { key: 'A', desc: 'Select All' },
            { key: 'Click', desc: 'Multi-Select' },
            { key: 'Scroll', desc: 'Zoom' },
          ];
          if (hasShift) base.unshift({ key: 'Z', desc: 'Redo (Alt)' });
          return base;
      }

      if (hasAlt) return [
          { key: 'Drag', desc: 'Move Branch' },
          { key: 'Click', desc: 'Select Branch' },
          { key: 'M', desc: 'Magic Style' },
      ];

      if (hasShift) return [
          { key: 'Click', desc: 'Cycle Shape' },
          { key: 'Click', desc: 'Multi-Select' },
          { key: 'Enter', desc: 'Add Sibling' },
      ];

      return [];
  };

  const hints = getHints();

  return (
    <div className="fixed bottom-8 left-8 z-[200] pointer-events-none animate-slide-up font-sans">
       <div className="bg-black/80 backdrop-blur text-white p-4 rounded-2xl shadow-2xl border border-white/10">
          <div className="flex items-center gap-2 mb-3 border-b border-white/20 pb-2">
              <span className="font-mono font-bold text-xl tracking-wider text-yellow-400">{modifiers.join(' + ')}</span>
              <span className="text-xs text-gray-400 font-bold uppercase">Active Modifiers</span>
          </div>
          {hints.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {hints.map((h, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-gray-300 font-medium">{h.desc}</span>
                        <span className="font-mono font-bold bg-white/20 px-1.5 rounded text-xs min-w-[20px] text-center">{h.key}</span>
                    </div>
                ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">No specific actions</div>
          )}
       </div>
    </div>
  );
};
