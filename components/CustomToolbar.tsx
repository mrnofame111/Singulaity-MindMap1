
import React from 'react';
import { Icon } from './Icons';

export interface CustomTool {
  id: string;
  label: string;
  icon: React.ElementType;
  action: (payload?: any) => void;
  actionId: string;
  payload?: any;
  isActive?: boolean;
}

interface CustomToolbarProps {
  tools: CustomTool[];
  onAddClick: () => void;
  onRemoveTool: (index: number) => void;
  onDropTool: (index: number, toolData: any) => void;
  isSelectionMode: boolean;
}

export const CustomToolbar: React.FC<CustomToolbarProps> = ({ 
  tools, 
  onAddClick, 
  onRemoveTool, 
  onDropTool,
  isSelectionMode
}) => {
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent, index?: number) => {
    e.preventDefault();
    const toolDataStr = e.dataTransfer.getData('singularity-tool');
    if (toolDataStr) {
      try {
        const toolData = JSON.parse(toolDataStr);
        onDropTool(index ?? tools.length, toolData);
      } catch (err) {
        console.error("Invalid tool drop data", err);
      }
    }
  };

  return (
    <div className="flex items-center gap-3 pointer-events-auto">
        
        {/* Add / Main Button */}
        <div 
            className="relative"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e)}
        >
            <button
                onClick={onAddClick}
                className={`
                    w-[44px] h-[44px] flex items-center justify-center rounded-2xl border-2 border-dashed transition-all bg-white/90 backdrop-blur-xl shadow-clay-md
                    ${isSelectionMode 
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-600 animate-pulse shadow-[0_0_15px_rgba(99,102,241,0.4)]' 
                        : 'border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-white hover:shadow-clay-lg'
                    }
                `}
                title={tools.length === 0 ? "Add Custom Tool" : "Add Another Tool"}
            >
                <Icon.Plus size={20} strokeWidth={2.5} />
            </button>
            
            {isSelectionMode && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap animate-bounce shadow-lg">
                    Select Tool
                </div>
            )}
        </div>

        {/* Tool Slots - Only render if there are tools */}
        {tools.length > 0 && (
            <div className={`
                flex items-center gap-2 p-1.5 rounded-2xl border transition-all duration-300
                bg-white/90 backdrop-blur-xl border-white/60 shadow-clay-lg hover:shadow-clay-xl h-[44px]
            `}>
                {tools.map((tool, idx) => (
                    <div 
                        key={`${tool.id}-${idx}`} 
                        className="relative group h-full"
                        onContextMenu={(e) => { e.preventDefault(); onRemoveTool(idx); }}
                    >
                        <button
                            onClick={() => tool.action(tool.payload)}
                            className={`
                                w-8 h-8 flex items-center justify-center rounded-xl transition-all active:scale-95
                                ${tool.isActive 
                                    ? 'bg-blue-100 text-blue-600 ring-1 ring-blue-200 shadow-inner' 
                                    : 'hover:bg-gray-100 text-gray-600'
                                }
                            `}
                            title={tool.label}
                        >
                            <tool.icon size={18} strokeWidth={2} />
                        </button>
                        
                        {/* Delete Badge on Hover */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); onRemoveTool(idx); }}
                            className="absolute -top-1 -right-1 bg-red-500 text-white w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-sm z-10"
                        >
                            <Icon.Close size={8} strokeWidth={4} />
                        </button>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
};
