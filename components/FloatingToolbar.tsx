
import React from 'react';
import { Icon } from './Icons';

interface FloatingToolbarProps {
  selectedCount: number;
  onAction: (action: string, payload?: any) => void;
  isEdgeMode?: boolean;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ selectedCount, onAction, isEdgeMode }) => {
  // Only show if items are selected
  if (selectedCount < 1) return null;

  if (isEdgeMode) {
     return (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-white/90 backdrop-blur-md border border-blue-500/30 p-1.5 rounded-xl shadow-clay-lg animate-fade-in">
            <div className="px-3 flex items-center gap-2 border-r border-gray-200">
                <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                {selectedCount}
                </div>
                <span className="text-xs font-bold text-gray-500 hidden sm:inline">Links</span>
            </div>
            
             <div className="flex items-center gap-1.5 px-2 border-r border-gray-200">
                <button className="relative w-5 h-5 rounded-full overflow-hidden border border-black/5 hover:scale-110 transition-transform shadow-sm flex items-center justify-center bg-gray-100 group" title="Custom Color">
                     <Icon.Palette size={10} className="text-gray-500 absolute pointer-events-none group-hover:text-blue-500"/>
                     <input type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" onChange={(e) => onAction('edge-bulk-update', { color: e.target.value })} />
                </button>
                {['#cbd5e1', '#ef4444', '#3b82f6', '#10b981'].map(c => (
                <button
                    key={c}
                    onClick={() => onAction('edge-bulk-update', { color: c })}
                    className="w-5 h-5 rounded-full border border-black/5 hover:scale-110 transition-transform shadow-sm"
                    style={{ backgroundColor: c }}
                    title="Set Color"
                />
                ))}
            </div>

            <div className="flex items-center gap-1 px-2 border-r border-gray-200">
                <button onClick={() => onAction('edge-bulk-update', { routingType: 'straight' })} className="p-1 text-[10px] font-bold uppercase rounded hover:bg-gray-100 text-gray-600">STR</button>
                <button onClick={() => onAction('edge-bulk-update', { routingType: 'curved' })} className="p-1 text-[10px] font-bold uppercase rounded hover:bg-gray-100 text-gray-600">CRV</button>
                <button onClick={() => onAction('edge-bulk-update', { routingType: 'orthogonal' })} className="p-1 text-[10px] font-bold uppercase rounded hover:bg-gray-100 text-gray-600">90°</button>
            </div>

            <div className="flex items-center gap-1 pl-2">
                <ToolbarBtn onClick={() => onAction('edge-delete-selected')} icon={Icon.Trash} title="Delete Links" color="text-red-500 hover:bg-red-50" />
            </div>
        </div>
     );
  }

  // Node Mode (Existing)
  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-white/90 backdrop-blur-md border border-blue-500/30 p-1.5 rounded-xl shadow-clay-lg animate-fade-in">
      
      {/* Count Indicator */}
      <div className="px-3 flex items-center gap-2 border-r border-gray-200">
        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shadow-sm">
          {selectedCount}
        </div>
        <span className="text-xs font-bold text-gray-500 hidden sm:inline">Selected</span>
      </div>

      {/* Colors */}
      <div className="flex items-center gap-1.5 px-2 border-r border-gray-200">
        {['#ffffff', '#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7'].map(c => (
          <button
            key={c}
            onClick={() => onAction('color', c)}
            className="w-5 h-5 rounded-full border border-black/5 hover:scale-110 transition-transform shadow-sm"
            style={{ backgroundColor: c }}
            title="Set Color"
          />
        ))}
        <label className="w-5 h-5 rounded-full border border-dashed border-gray-400 flex items-center justify-center cursor-pointer hover:bg-gray-100 relative overflow-hidden group" title="Custom Color">
           <input type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" onChange={(e) => onAction('color', e.target.value)} />
           <Icon.Palette size={10} className="text-gray-500 pointer-events-none group-hover:text-blue-500"/>
        </label>
      </div>

      {/* Shapes */}
      <div className="flex items-center gap-1 px-2 border-r border-gray-200">
         <ToolbarBtn onClick={() => onAction('shape', 'rectangle')} icon={Icon.ShapeRect} title="Rectangle" />
         <ToolbarBtn onClick={() => onAction('shape', 'circle')} icon={Icon.ShapeCircle} title="Circle" />
         <ToolbarBtn onClick={() => onAction('shape', 'rounded')} icon={() => <div className="w-3 h-3 border-2 border-current rounded-sm" />} title="Rounded" />
      </div>

      {/* Alignment */}
      <div className="flex items-center gap-1 px-2 border-r border-gray-200">
          <ToolbarBtn onClick={() => onAction('align-left')} icon={Icon.AlignLeft} title="Align Left" />
          <ToolbarBtn onClick={() => onAction('align-center')} icon={Icon.AlignCenter} title="Align Center" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 pl-2">
        <ToolbarBtn onClick={() => onAction('duplicate')} icon={Icon.Duplicate} title="Duplicate" />
        <ToolbarBtn onClick={() => onAction('lock')} icon={Icon.Lock} title="Lock/Unlock" />
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={() => onAction('delete')} icon={Icon.Trash} title="Delete" color="text-red-500 hover:bg-red-50" />
      </div>
    </div>
  );
};

const ToolbarBtn = ({ onClick, icon: IconC, title, color = "text-gray-600 hover:bg-gray-100" }: any) => (
  <button 
    onClick={onClick} 
    className={`p-1.5 rounded-lg transition-colors ${color}`} 
    title={title}
  >
    <IconC size={18} strokeWidth={2} />
  </button>
);
