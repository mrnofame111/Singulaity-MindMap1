
import React from 'react';
import { Icon } from './Icons';

interface StatusBarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomChange: (val: number) => void;
  onFitView: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  className?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ 
  zoom, 
  onZoomIn, 
  onZoomOut, 
  onZoomChange,
  onFitView,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExpandAll,
  onCollapseAll,
  className
}) => {
  return (
    <div className={className || "pointer-events-auto select-none origin-bottom-left scale-90 md:scale-100 relative"}>
      
      {/* Main Control Bar */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/40 rounded-2xl shadow-clay-lg p-1.5 flex items-center gap-1 max-w-[95vw] overflow-x-auto custom-scrollbar md:overflow-visible">
        
        {/* History */}
        <div className="flex items-center shrink-0">
          <button 
            onClick={onUndo} 
            disabled={!canUndo}
            className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-colors text-gray-600"
            title="Undo (Ctrl+Z)"
          >
            <Icon.Undo size={18} />
          </button>
          <button 
            onClick={onRedo} 
            disabled={!canRedo}
            className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-30 transition-colors text-gray-600"
            title="Redo (Ctrl+Y)"
          >
            <Icon.Redo size={18} />
          </button>
        </div>

        <div className="w-px h-6 bg-gray-200 mx-1 shrink-0" />

        {/* Expand/Collapse Actions */}
        <div className="flex items-center shrink-0">
             {onCollapseAll && (
                <button 
                    onClick={onCollapseAll}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
                    title="Collapse All (<<)"
                >
                    <Icon.ChevronsLeft size={18} />
                </button>
             )}
             {onExpandAll && (
                <button 
                    onClick={onExpandAll}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
                    title="Expand All (>>)"
                >
                    <Icon.ChevronsRight size={18} />
                </button>
             )}
        </div>

        <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block shrink-0" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-2 px-1 shrink-0">
           <button 
              onClick={onZoomOut} 
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
           >
             <Icon.Minus size={16} />
           </button>

           <div className="flex items-center gap-2 bg-gray-100/50 rounded-lg px-3 py-1 border border-gray-200/50 h-8">
             <input 
               type="range" 
               min="0.1" 
               max="5" 
               step="0.1" 
               value={zoom}
               onChange={(e) => onZoomChange(parseFloat(e.target.value))}
               className="w-24 h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-gray-600 hover:accent-blue-600 transition-all hidden md:block"
               title="Zoom Scale"
             />
             <div className="w-9 text-right font-mono font-bold text-xs text-gray-600 select-none">
               {Math.round(zoom * 100)}%
             </div>
           </div>
           
           <button 
              onClick={onZoomIn} 
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
           >
             <Icon.Plus size={16} />
           </button>
        </div>

        <div className="w-px h-6 bg-gray-200 mx-1 shrink-0" />

        <button 
           onClick={onFitView} 
           className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 transition-colors shrink-0"
           title="Fit to Screen (L)"
        >
           <Icon.Maximize size={18} />
        </button>

      </div>
    </div>
  );
};
