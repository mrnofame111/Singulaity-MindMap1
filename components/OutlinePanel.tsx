import React from 'react';
import { Icon } from './Icons';
import { SingularityNode } from '../types';

interface OutlinePanelProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  nodes: SingularityNode[];
  onSelectNode: (id: string) => void;
  isSidebarOpen?: boolean;
}

export const OutlinePanel: React.FC<OutlinePanelProps> = ({ isOpen, setIsOpen, nodes, onSelectNode, isSidebarOpen }) => {
  const rootNodes = nodes.filter(n => !n.parentId);

  const renderTree = (nodeId: string, depth: number = 0) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return null;
      
      const hasChildren = node.childrenIds.length > 0;
      const nodeColor = node.color && node.color !== 'transparent' && !node.color.startsWith('bg-') ? node.color : '#9ca3af';

      return (
          <div key={node.id} style={{ paddingLeft: depth * 12 }}>
             <div 
               className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-100 cursor-pointer group transition-colors"
               onClick={() => onSelectNode(node.id)}
             >
                 <span className="text-gray-400 shrink-0">
                    {hasChildren ? <div className="w-1.5 h-1.5 rounded-full bg-gray-400" /> : <div className="w-1 h-1 rounded-full bg-gray-300 ml-0.5" />}
                 </span>
                 
                 {/* Color Indicator */}
                 <div className="w-2 h-2 rounded-full shrink-0 border border-black/10 shadow-sm" style={{ backgroundColor: nodeColor }} />

                 <span className="text-xs font-bold text-gray-600 truncate group-hover:text-blue-600 transition-colors">
                     {node.label}
                 </span>
             </div>
             {hasChildren && (
                 <div className="border-l-2 border-gray-100 ml-2.5 my-1">
                     {node.childrenIds.map(childId => renderTree(childId, depth + 1))}
                 </div>
             )}
          </div>
      );
  };

  if (!isOpen) {
      return (
          <button 
             onClick={() => setIsOpen(true)}
             className={`fixed top-44 z-30 p-2.5 bg-white rounded-lg shadow-clay-sm border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-400 transition-all duration-300 ease-in-out`}
             style={{ left: isSidebarOpen ? '280px' : '16px' }}
             title="Open Outline"
          >
              <Icon.AlignLeft size={20} />
          </button>
      );
  }

  return (
    <div 
        className="fixed top-44 bottom-24 w-[240px] z-30 flex flex-col pointer-events-none transition-all duration-300 ease-in-out"
        style={{ left: isSidebarOpen ? '280px' : '16px' }}
    >
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-white/40 shadow-clay-lg flex flex-col h-full pointer-events-auto overflow-hidden max-h-[calc(100dvh-150px)]">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/80">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Icon.AlignLeft size={12} /> Map Outline
                </span>
                <button onClick={() => setIsOpen(false)} className="hover:bg-gray-200 p-1.5 rounded-md text-gray-500 transition-colors">
                    <Icon.Close size={14} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                {rootNodes.map(root => renderTree(root.id))}
                {rootNodes.length === 0 && (
                    <div className="text-center p-6 text-xs text-gray-400 italic font-medium">Map is empty.</div>
                )}
            </div>
        </div>
    </div>
  );
};