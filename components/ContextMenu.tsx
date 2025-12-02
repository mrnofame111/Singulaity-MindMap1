
import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { Icon } from './Icons';
import { NodeShape, NodeType } from '../types';

interface ContextMenuProps {
  anchorRect: { left: number, top: number, right: number, bottom: number, width: number, height: number };
  nodeId: string | null; // Null implies Canvas context
  activeNodeType?: NodeType;
  isEdge?: boolean;
  isControlPoint?: boolean;
  onClose: () => void;
  onAction: (action: string, payload?: any) => void;
}

const EDGE_COLORS = [
  '#cbd5e1', '#94a3b8', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#000000'
];

export const ContextMenu: React.FC<ContextMenuProps> = ({ anchorRect, nodeId, activeNodeType, isEdge, isControlPoint, onClose, onAction }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  const [showCreateSubmenu, setShowCreateSubmenu] = useState(false);
  const [isSubmenuLocked, setIsSubmenuLocked] = useState(false);
  const submenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleMouseEnter = () => {
    if (submenuTimer.current) {
      clearTimeout(submenuTimer.current);
      submenuTimer.current = null;
    }
    setShowCreateSubmenu(true);
  };

  const handleMouseLeave = () => {
    if (isSubmenuLocked) return; 
    submenuTimer.current = setTimeout(() => {
      setShowCreateSubmenu(false);
    }, 300);
  };

  const handleClickCreate = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsSubmenuLocked(!isSubmenuLocked); 
      setShowCreateSubmenu(true);
  };

  useLayoutEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const { innerWidth, innerHeight } = window;
      const gap = 12;

      let left = anchorRect.right + gap;
      let top = anchorRect.top;

      if (!nodeId && !isEdge && !isControlPoint) {
          left = anchorRect.left;
          top = anchorRect.top;
      }

      if (left + menuRect.width > innerWidth) {
         left = anchorRect.left - menuRect.width - gap;
      }

      if (top + menuRect.height > innerHeight) {
         top = innerHeight - menuRect.height - gap;
         if (top < gap) top = gap;
      } else if (top < gap) {
         top = gap;
      }
      
      if (left < gap) left = gap;

      setPosition({ x: left, y: top });
    }
  }, [anchorRect, nodeId, isEdge, isControlPoint]);

  const MenuItem = ({ icon: IconC, label, action, hasSub, onHover }: any) => (
    <button 
        onClick={(e) => { if(!hasSub) { e.stopPropagation(); onAction(action); onClose(); } }}
        onMouseEnter={onHover}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-100 transition-all text-sm font-bold text-gray-700 group relative"
    >
        <div className="flex items-center gap-3">
            {IconC && <IconC size={16} className="text-gray-400 group-hover:text-blue-500"/>}
            <span>{label}</span>
        </div>
        {hasSub && <Icon.CornerDownRight size={12} className="opacity-30 -rotate-90" />}
    </button>
  );

  const handleDropper = async () => {
    if (!(window as any).EyeDropper) {
        alert("Eyedropper not supported in this browser.");
        return;
    }
    try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        const color = result.sRGBHex;
        onAction(isEdge ? 'edge-color' : 'color-hex', color);
        onClose();
    } catch (e) {
        console.error(e);
    }
  };

  if (isControlPoint) {
      return (
        <div
            ref={menuRef}
            className="fixed z-[100] min-w-[200px] bg-white/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-clay-xl flex flex-col origin-top-left p-2" // Removed animate-pop
            style={{ left: position.x, top: position.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
             <div className="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">
                 Control Point
             </div>
             <MenuItem icon={Icon.Trash} label="Delete Point" action="delete-control-point" />
        </div>
      );
  }

  if (isEdge) {
      return (
          <div 
            ref={menuRef}
            className="fixed z-[100] min-w-[240px] bg-white/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-clay-xl flex flex-col origin-top-left p-3" // Removed animate-pop
            style={{ left: position.x, top: position.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
             <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Connection</span>
                <div className="flex gap-1">
                   <button onClick={handleDropper} className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title="Pick Color">
                      <Icon.Pipette size={14}/>
                   </button>
                   <label className="p-1.5 hover:bg-gray-100 rounded text-gray-500 cursor-pointer relative">
                      <Icon.Palette size={14}/>
                      <input type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" onChange={(e) => onAction('edge-color', e.target.value)} />
                   </label>
                </div>
             </div>
             <div className="flex flex-wrap gap-2 mb-3 px-1">
                {EDGE_COLORS.map(c => (
                   <button 
                      key={c}
                      onClick={() => onAction('edge-color', c)}
                      className="w-5 h-5 rounded-full shadow-sm hover:scale-125 transition-transform ring-1 ring-black/5"
                      style={{ backgroundColor: c }}
                   />
                ))}
             </div>
             
             <div className="grid grid-cols-3 gap-1 mb-2">
                <button onClick={() => onAction('edge-routing-straight')} className="h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-500 uppercase" title="Straight">STR</button>
                <button onClick={() => onAction('edge-routing-curved')} className="h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-500 uppercase" title="Curved">CRV</button>
                <button onClick={() => onAction('edge-routing-orthogonal')} className="h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-500 uppercase" title="Orthogonal">90°</button>
             </div>

             <div className="grid grid-cols-3 gap-1 mb-2">
                {['solid', 'dashed', 'dotted'].map(s => (
                  <button 
                    key={s} 
                    onClick={() => onAction('edge-style', s)}
                    className="h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 rounded border border-gray-100"
                    title={s}
                  >
                     <div className={`w-6 h-0.5 bg-gray-500 ${s === 'dashed' ? 'border-b-2 border-dashed border-gray-500 bg-transparent' : s === 'dotted' ? 'border-b-2 border-dotted border-gray-500 bg-transparent' : ''}`} />
                  </button>
                ))}
             </div>
             <div className="h-px bg-gray-100 my-2" />
             <MenuItem icon={Icon.Plus} label="Add Control Point" action="edge-add-point" />
             <MenuItem icon={Icon.Edit} label="Edit Label" action="edge-label" />
             <MenuItem icon={Icon.Zap} label="Toggle Animation" action="edge-animate" />
             <div className="h-px bg-gray-100 my-2" />
             <MenuItem icon={Icon.Trash} label="Delete Connection" action="edge-delete" />
          </div>
      );
  }

  if (!nodeId) {
      return (
          <div 
            ref={menuRef}
            className="fixed z-[100] min-w-[220px] bg-white/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-clay-xl flex flex-col origin-top-left p-2" // Removed animate-pop
            style={{ left: position.x, top: position.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
             <div className="px-3 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">
                 Canvas Actions
             </div>
             <div 
                className="relative"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={handleClickCreate}
             >
                 <MenuItem icon={Icon.Plus} label="Add Node" hasSub />
                 {showCreateSubmenu && (
                     <div 
                        className="absolute left-full top-[-8px] pl-2 pt-2 z-[110] min-w-[200px]"
                        onMouseEnter={handleMouseEnter} 
                        onMouseLeave={handleMouseLeave}
                     >
                         <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-2 grid grid-cols-1 gap-1">
                             <div className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase">Shapes</div>
                             <button onClick={() => onAction('add-node-shape', 'rectangle')} className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded text-sm text-gray-600"><Icon.ShapeRect size={14}/> Rectangle</button>
                             <button onClick={() => onAction('add-node-shape', 'rounded')} className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded text-sm text-gray-600"><div className="w-3 h-3 border-2 border-gray-500 rounded-sm"/> Rounded</button>
                             <button onClick={() => onAction('add-node-shape', 'circle')} className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded text-sm text-gray-600"><Icon.ShapeCircle size={14}/> Circle</button>
                             <button onClick={() => onAction('add-node-shape', 'diamond')} className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded text-sm text-gray-600"><div className="w-3 h-3 border-2 border-gray-500 rotate-45"/> Diamond</button>
                             <button onClick={() => onAction('add-node-shape', 'triangle')} className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded text-sm text-gray-600"><Icon.ShapeTriangle size={14}/> Triangle</button>
                             <button onClick={() => onAction('add-node-shape', 'hexagon')} className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded text-sm text-gray-600"><Icon.ShapeHexagon size={14}/> Hexagon</button>
                             <button onClick={() => onAction('add-node-shape', 'cloud')} className="flex items-center gap-3 p-2 hover:bg-blue-50 rounded text-sm text-gray-600"><Icon.ShapeCloud size={14}/> Cloud</button>
                             <div className="h-px bg-gray-100 my-1"/>
                             <button onClick={() => onAction('add-node')} className="flex items-center gap-2 p-2 hover:bg-blue-50 rounded text-sm font-bold text-blue-600"><Icon.Plus size={14}/> Default Node</button>
                         </div>
                     </div>
                 )}
             </div>
             <MenuItem icon={Icon.StickyNote} label="Add Note" action="new-sticky-color" />
             <MenuItem icon={Icon.Image} label="Paste Media" action="open-media-modal" />
             <div className="h-px bg-gray-100 my-1" />
             <MenuItem icon={Icon.Pen} label="Start Drawing" action="start-drawing" />
             <MenuItem icon={Icon.Code} label="Insert Code Block" action="insert-code" />
             <MenuItem icon={Icon.Table} label="Insert Table" action="insert-table" />
             <div className="h-px bg-gray-100 my-1" />
             <MenuItem icon={Icon.Layout} label="Auto Layout" action="fit" />
          </div>
      );
  }

  return null; // Node Context Menu is handled by ShapeDock
};
