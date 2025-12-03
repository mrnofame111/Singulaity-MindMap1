
import React, { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { Icon } from './Icons';
import { NodeShape, NodeType } from '../types';

interface ShapeDockProps {
  nodePosition: { x: number, y: number };
  zoom: number;
  nodeType?: NodeType;
  initialColor?: string;
  onAction: (action: string, payload?: any) => void;
}

// Definition of all available actions for the Quick Access system
const ALL_ACTIONS = [
  { id: 'add-child', label: 'Add Child', icon: Icon.Plus, section: 'QUICK' },
  { id: 'delete', label: 'Delete', icon: Icon.Trash, section: 'QUICK' },
  { id: 'duplicate', label: 'Copy', icon: Icon.Duplicate, section: 'QUICK' },
  { id: 'lock', label: 'Lock', icon: Icon.Lock, section: 'QUICK' },
  
  { id: 'magic-style', label: 'Magic Style', icon: Icon.Magic, section: 'MAIN' },
  { id: 'convert-task', label: 'Convert to Task', icon: Icon.Task, section: 'MAIN' },
  { id: 'convert-normal', label: 'Convert to Node', icon: Icon.ShapeRect, section: 'MAIN' },
  { id: 'convert-code', label: 'Convert to Code', icon: Icon.Code, section: 'MAIN' },
  { id: 'convert-table', label: 'Convert to Table', icon: Icon.Table, section: 'MAIN' },
  { id: 'convert-list', label: 'Convert to List', icon: Icon.Layers, section: 'MAIN' },
  { id: 'add-link', label: 'Add Link', icon: Icon.Connect, section: 'MAIN' },
  { id: 'focus', label: 'Focus Branch', icon: Icon.Zap, section: 'MAIN' },

  { id: 'ai-expand', label: 'Expand Idea', icon: Icon.Zap, section: 'AI' },
  { id: 'dream-node', label: 'Dream (Image)', icon: Icon.Image, section: 'AI' },
  { id: 'ai-summarize', label: 'Summarize', icon: Icon.FileText, section: 'AI' },
  { id: 'ai-rewrite', label: 'Refine Text', icon: Icon.Edit, section: 'AI' },
];

// --- Color Helpers ---
const hsvToHex = (h: number, s: number, v: number) => {
  const f = (n: number, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(5))}${toHex(f(3))}${toHex(f(1))}`;
};

const hexToHsv = (hex: string) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt("0x" + hex[1] + hex[1]);
    g = parseInt("0x" + hex[2] + hex[2]);
    b = parseInt("0x" + hex[3] + hex[3]);
  } else if (hex.length === 7) {
    r = parseInt("0x" + hex[1] + hex[2]);
    g = parseInt("0x" + hex[3] + hex[4]);
    b = parseInt("0x" + hex[5] + hex[6]);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  let h = 0;
  if (max !== min) {
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, v };
};

const MiniColorPicker = ({ initialColor, onPreview, onCommit }: { initialColor: string, onPreview: (c: string) => void, onCommit: (c: string) => void }) => {
    const [hsv, setHsv] = useState(hexToHsv(initialColor || '#ffffff'));
    const svRef = useRef<HTMLDivElement>(null);
    const hueRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const activeRef = useRef<'sv' | 'hue' | null>(null);

    // Initialize state from prop if it changes significantly
    useEffect(() => {
       const newHsv = hexToHsv(initialColor || '#ffffff');
       // Only update if significantly different to avoid loop during preview
       if(Math.abs(newHsv.h - hsv.h) > 5 || Math.abs(newHsv.s - hsv.s) > 0.1 || Math.abs(newHsv.v - hsv.v) > 0.1) {
           if(!isDraggingRef.current) setHsv(newHsv);
       }
    }, [initialColor]);

    const updateColor = (h: number, s: number, v: number, isFinal: boolean) => {
        const hex = hsvToHex(h, s, v);
        setHsv({ h, s, v });
        if (isFinal) onCommit(hex);
        else onPreview(hex);
    };

    const handleSvMove = (e: MouseEvent | React.MouseEvent) => {
        if (!svRef.current) return;
        const rect = svRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        updateColor(hsv.h, x, 1 - y, false);
    };

    const handleHueMove = (e: MouseEvent | React.MouseEvent) => {
        if (!hueRef.current) return;
        const rect = hueRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        updateColor(x * 360, hsv.s, hsv.v, false);
    };

    const handleMouseDown = (e: React.MouseEvent, type: 'sv' | 'hue') => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation(); // Critical for preventing canvas drag
        isDraggingRef.current = true;
        activeRef.current = type;
        
        if(type === 'sv') handleSvMove(e);
        else handleHueMove(e);

        const handleMouseMove = (ev: MouseEvent) => {
            if (activeRef.current === 'sv') handleSvMove(ev);
            else handleHueMove(ev);
        };

        const handleMouseUp = (ev: MouseEvent) => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            // Clean up drag state here as fallback
            isDraggingRef.current = false;
        };
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };
    
    // Ref to keep track of latest for commit
    const hsvRef = useRef(hsv);
    useEffect(() => { hsvRef.current = hsv; }, [hsv]);

    // Re-bind mouse up to use ref
    useEffect(() => {
        const upHandler = () => {
            if (isDraggingRef.current) {
                const { h, s, v } = hsvRef.current;
                onCommit(hsvToHex(h, s, v));
                isDraggingRef.current = false;
                activeRef.current = null;
            }
        };
        window.addEventListener('mouseup', upHandler);
        return () => window.removeEventListener('mouseup', upHandler);
    }, [onCommit]);

    return (
        <div className="p-2 bg-gray-100 rounded-xl select-none" onMouseDown={e => e.stopPropagation()}>
            {/* Saturation/Value Box */}
            <div 
                ref={svRef}
                className="w-full h-24 rounded-lg relative cursor-crosshair mb-3 shadow-inner"
                style={{ 
                    backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                    backgroundImage: 'linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, transparent)'
                }}
                onMouseDown={(e) => handleMouseDown(e, 'sv')}
            >
                <div 
                    className="absolute w-3 h-3 border-2 border-white rounded-full shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
                />
            </div>

            {/* Hue Slider */}
            <div className="flex items-center gap-2">
                <div 
                    ref={hueRef}
                    className="flex-1 h-3 rounded-full relative cursor-ew-resize"
                    style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
                    onMouseDown={(e) => handleMouseDown(e, 'hue')}
                >
                    <div 
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-gray-300 rounded-full shadow-sm -translate-x-1/2 pointer-events-none"
                        style={{ left: `${(hsv.h / 360) * 100}%` }}
                    />
                </div>
                <div 
                    className="w-6 h-6 rounded-full border border-gray-200 shadow-sm shrink-0"
                    style={{ backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v) }}
                />
            </div>
        </div>
    );
};

export const ShapeDock: React.FC<ShapeDockProps> = ({ nodePosition, zoom, nodeType, onAction, initialColor }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [quickSlots, setQuickSlots] = useState<(string | null)[]>([null, null, null]);
  const [assignModeSlot, setAssignModeSlot] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load Quick Slots from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('singularity-quick-access');
    if (saved) {
      try {
        setQuickSlots(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse quick slots", e);
      }
    }
  }, []);

  // Save Quick Slots
  const updateSlot = (index: number, actionId: string | null) => {
    const newSlots = [...quickSlots];
    newSlots[index] = actionId;
    setQuickSlots(newSlots);
    localStorage.setItem('singularity-quick-access', JSON.stringify(newSlots));
    setAssignModeSlot(null);
  };

  // Smart Positioning Logic - Runs instantly before paint to ensure no visual lag
  // Uses direct DOM manipulation to avoid React Render Cycle lag (Syncs perfectly with Node)
  useLayoutEffect(() => {
    if (menuRef.current && !isMobile) {
      const rect = menuRef.current.getBoundingClientRect();
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      
      // Place to the RIGHT of the node by default
      const offset = 100 * zoom; 

      let x = nodePosition.x + offset;
      // Center vertically relative to node center
      let y = nodePosition.y - (rect.height / 2);

      // Check Right Edge - Instant Flip
      if (x + rect.width > screenW - 10) {
        // Flip to LEFT
        x = nodePosition.x - offset - rect.width;
      }

      // Check Top/Bottom Edges - Clamp
      if (y < 10) y = 10;
      if (y + rect.height > screenH - 10) {
        y = screenH - rect.height - 10;
      }

      menuRef.current.style.left = `${x}px`;
      menuRef.current.style.top = `${y}px`;
    }
  }, [nodePosition, zoom, quickSlots, assignModeSlot, isMobile]);

  const handleMenuClick = (actionId: string, payload?: any) => {
    if (assignModeSlot !== null) {
      updateSlot(assignModeSlot, actionId);
    } else {
      onAction(actionId, payload);
    }
  };

  const PRESET_COLORS = [
    '#ffffff', '#f87171', '#fb923c', '#4ade80', '#60a5fa', '#a78bfa',
  ];

  const MenuItem = ({ item }: { item: typeof ALL_ACTIONS[0] }) => (
    <button 
        onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); handleMenuClick(item.id); }}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left text-sm font-bold
           ${assignModeSlot !== null 
              ? 'bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100' 
              : 'hover:bg-gray-50 text-gray-700'
           }
        `}
    >
        <item.icon size={16} className={assignModeSlot !== null ? "text-blue-500" : "text-gray-400"}/>
        <span>{item.label}</span>
    </button>
  );

  const QuickActionBtn = ({ item, color="text-gray-600" }: { item: typeof ALL_ACTIONS[0], color?: string }) => (
    <button 
      onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); handleMenuClick(item.id); }}
      className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors 
         ${assignModeSlot !== null 
            ? 'bg-blue-50 border border-blue-200' 
            : 'hover:bg-gray-50'
         }
      `}
      title={item.label}
    >
      <item.icon size={20} strokeWidth={2.5} className={`mb-1 ${assignModeSlot !== null ? 'text-blue-600' : color}`} />
      <span className={`text-[9px] font-bold uppercase tracking-wide ${assignModeSlot !== null ? 'text-blue-600' : 'text-gray-500'}`}>{item.label}</span>
    </button>
  );

  const ShapeButton = ({ id, icon: IconC }: { id: NodeShape, icon: any }) => (
    <button
      onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); onAction('shape', id); }}
      className="flex items-center justify-center p-2.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
      title={id}
    >
      <IconC size={18} />
    </button>
  );

  const isTask = nodeType === NodeType.TASK;

  return (
    <div 
      ref={menuRef}
      className={`fixed z-[90] flex flex-col pointer-events-none
        ${isMobile 
            ? 'left-0 right-0 bottom-4 items-center justify-end px-4' // Mobile: Fixed bottom center
            : '' // Desktop: Positioned via style
        }
      `}
      style={!isMobile ? { left: 0, top: 0 } : {}} // Reset on mobile
    >
      <div 
        className={`pointer-events-auto bg-white/95 backdrop-blur-xl border border-white/50 shadow-clay-xl overflow-hidden flex flex-col
            ${isMobile 
                ? 'w-full max-w-sm rounded-2xl max-h-[50dvh]' // Use dvh for mobile max height
                : 'w-[280px] rounded-[1.5rem]'
            }
        `}
        onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }} 
      >
        {/* Custom Quick Access Area */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 border-b border-gray-100">
           {quickSlots.map((actionId, idx) => {
              const action = ALL_ACTIONS.find(a => a.id === actionId);
              return (
                <button
                   key={idx}
                   onClick={(e) => { 
                      e.stopPropagation(); 
                      e.nativeEvent.stopImmediatePropagation();
                      if (!action) setAssignModeSlot(idx); 
                      else handleMenuClick(actionId!); 
                   }}
                   onContextMenu={(e) => { e.preventDefault(); setAssignModeSlot(idx); }}
                   className={`
                      aspect-square rounded-xl flex flex-col items-center justify-center border-2 transition-all
                      ${assignModeSlot === idx 
                          ? 'border-blue-500 bg-blue-50 text-blue-600 animate-pulse' 
                          : action 
                             ? 'border-white bg-white shadow-sm hover:border-blue-200 text-gray-700' 
                             : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500'
                      }
                   `}
                   title={action ? action.label : "Click to assign shortcut"}
                >
                   {action ? (
                      <>
                        <action.icon size={20} strokeWidth={2} className="mb-1"/>
                        <span className="text-[9px] font-bold uppercase truncate max-w-full px-1">{action.label}</span>
                      </>
                   ) : (
                      <Icon.Plus size={20} />
                   )}
                </button>
              );
           })}
        </div>
        
        {assignModeSlot !== null && (
           <div className="bg-blue-500 text-white text-xs font-bold text-center py-1.5">
              Select an option below to assign
           </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            {/* Row 1: Default Quick Actions */}
            <div className="grid grid-cols-4 gap-1 p-2 border-b border-gray-100">
            <QuickActionBtn item={ALL_ACTIONS.find(a => a.id === 'add-child')!} color="text-green-600" />
            <QuickActionBtn item={ALL_ACTIONS.find(a => a.id === 'delete')!} color="text-red-500" />
            <QuickActionBtn item={ALL_ACTIONS.find(a => a.id === 'duplicate')!} />
            <QuickActionBtn item={ALL_ACTIONS.find(a => a.id === 'lock')!} />
            </div>

            <div className="p-3 space-y-3">
            
            {/* Main Actions */}
            <div>
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'magic-style')!} />
                <MenuItem item={{ 
                    id: isTask ? 'convert-normal' : 'convert-task', 
                    label: isTask ? 'Convert to Node' : 'Convert to Task', 
                    icon: isTask ? Icon.ShapeRect : Icon.Task, 
                    section: 'MAIN' 
                }} />
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'convert-code')!} />
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'convert-table')!} />
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'convert-list')!} />
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'add-link')!} />
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'focus')!} />
            </div>

            {/* AI Actions */}
            <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 pl-1 flex items-center gap-2">
                <Icon.Sparkles size={10} className="text-indigo-400"/> AI Actions
                </h3>
                <div className="space-y-0.5">
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'ai-expand')!} />
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'dream-node')!} />
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'ai-summarize')!} />
                <MenuItem item={ALL_ACTIONS.find(a => a.id === 'ai-rewrite')!} />
                </div>
            </div>

            {/* Appearance */}
            <div>
                <div className="flex items-center justify-between mb-2 pl-1">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Appearance</h3>
                </div>

                {/* Colors */}
                <div className="mb-3 px-1">
                    <MiniColorPicker 
                        initialColor={initialColor || '#ffffff'}
                        onPreview={(c) => onAction('color-preview', c)}
                        onCommit={(c) => onAction('color', c)}
                    />
                    
                    {/* Quick Swatches */}
                    <div className="flex justify-between gap-2 mt-3">
                        {PRESET_COLORS.map((c, i) => (
                        <button
                            key={i}
                            onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); onAction('color', c); }}
                            className={`w-6 h-6 rounded-full shadow-sm hover:scale-110 transition-transform ring-1 ring-black/5`}
                            style={{ backgroundColor: c }}
                        />
                        ))}
                    </div>
                </div>

                {/* Shapes */}
                <div className="grid grid-cols-4 gap-2 bg-gray-50 p-2 rounded-xl border border-gray-100">
                    <ShapeButton id="rectangle" icon={Icon.ShapeRect} />
                    <ShapeButton id="rounded" icon={() => <div className="w-3 h-2 border-2 border-current rounded-md"/>} />
                    <ShapeButton id="circle" icon={Icon.ShapeCircle} />
                    <ShapeButton id="diamond" icon={() => <div className="w-2.5 h-2.5 border-2 border-current rotate-45"/>} />
                    <ShapeButton id="hexagon" icon={Icon.ShapeHexagon} />
                    <ShapeButton id="triangle" icon={Icon.ShapeTriangle} />
                    <ShapeButton id="cloud" icon={Icon.ShapeCloud} />
                    <ShapeButton id="parallelogram" icon={Icon.ShapePara} />
                </div>
            </div>

            </div>
        </div>
      </div>
    </div>
  );
};
