import React, { useState } from 'react';
import { Icon } from './Icons';
import { ToolMode, NodeShape, EdgeOptions } from '../types';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  activeMode: ToolMode;
  setMode: (mode: ToolMode) => void;
  onAction: (actionId: string, payload?: any) => void;
  appMode: 'MINDMAP' | 'FLOWCHART' | 'WHITEBOARD';
  setAppMode: (mode: 'MINDMAP' | 'FLOWCHART' | 'WHITEBOARD') => void;
  drawingSettings?: { color: string; width: number; tool: 'pen' | 'highlighter' | 'eraser' };
  setDrawingSettings?: (settings: any) => void;
  defaultEdgeOptions?: EdgeOptions;
  setDefaultEdgeOptions?: (opts: EdgeOptions) => void;
  isSelectionMode?: boolean;
  onToolSelect?: (toolId: string, label: string, iconName: string) => void;
}

type SubMenuType = 'NODE' | 'STICKY' | 'DRAW' | 'TEMPLATES' | 'CONNECT' | 'CODE' | 'TABLE' | 'LAYOUT' | null;

const SidebarBtn = ({ icon: IconC, label, isActive, onClick, hasSub, shortcut }: { icon: any, label: string, isActive?: boolean, onClick?: () => void, hasSub?: boolean, shortcut?: string }) => (
  <button 
    onClick={onClick}
    className={`
      relative w-full aspect-square flex flex-col items-center justify-center rounded-xl transition-all duration-200 border
      ${isActive 
        ? 'bg-white shadow-md text-blue-600 border-blue-200 ring-2 ring-blue-50 scale-105 z-10' 
        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 hover:shadow-sm'
      }
    `}
    title={shortcut ? `${label} (${shortcut})` : label}
  >
    <IconC size={20} strokeWidth={isActive ? 2.5 : 2} />
    <span className="text-[9px] font-bold mt-1">{label}</span>
    
    {hasSub && (
      <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-400 opacity-50" />
    )}
  </button>
);

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen,
  setIsOpen,
  activeMode, 
  setMode, 
  onAction,
  appMode,
  setAppMode,
  drawingSettings,
  setDrawingSettings,
  defaultEdgeOptions,
  setDefaultEdgeOptions,
  isSelectionMode,
  onToolSelect
}) => {
  const [activeSubMenu, setActiveSubMenu] = useState<SubMenuType>(null);
  const [tableDims, setTableDims] = useState({ rows: 3, cols: 3 });
  const [layoutDir, setLayoutDir] = useState<'LR' | 'RL'>('LR');

  const toggleSubMenu = (menu: SubMenuType) => {
    setActiveSubMenu(prev => prev === menu ? null : menu);
  };

  const handleToolClick = (mode: ToolMode) => {
    setMode(mode);
  };

  const handleDropper = async () => {
      if (!(window as any).EyeDropper) return;
      try {
          const eyeDropper = new (window as any).EyeDropper();
          const result = await eyeDropper.open();
          const color = result.sRGBHex;
          if (activeSubMenu === 'CONNECT' && setDefaultEdgeOptions && defaultEdgeOptions) {
              setDefaultEdgeOptions({ ...defaultEdgeOptions, color });
          } else if (activeSubMenu === 'DRAW' && setDrawingSettings && drawingSettings) {
              setDrawingSettings({ ...drawingSettings, color });
          }
      } catch (e) { console.error(e); }
  };

  // Wrapper for draggable buttons
  const DraggableToolButton = ({ id, label, iconName, onClick, children, ...props }: any) => {
      const handleDragStart = (e: React.DragEvent) => {
          e.dataTransfer.setData('singularity-tool', JSON.stringify({ id, label, iconName }));
          e.dataTransfer.effectAllowed = 'copy';
      };

      const handleClick = (e: React.MouseEvent) => {
          if (isSelectionMode && onToolSelect) {
              e.stopPropagation();
              onToolSelect(id, label, iconName);
          } else {
              onClick && onClick(e);
          }
      };

      return (
          <div 
            draggable 
            onDragStart={handleDragStart}
            onClick={handleClick}
            className={isSelectionMode ? "ring-2 ring-indigo-400 ring-offset-1 rounded-xl cursor-copy animate-pulse" : ""}
            {...props}
          >
              {children}
          </div>
      );
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed left-4 top-32 z-[60] bg-white p-2.5 rounded-lg shadow-clay-md border border-gray-200 hover:border-blue-400 hover:text-blue-600 transition-all group
          ${isOpen ? 'translate-x-[260px] md:translate-x-[250px] opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}
        `}
        title="Expand Tools"
      >
        <Icon.Grid size={20} />
      </button>

      <div 
        className={`
          fixed left-0 top-[60px] z-[60] bg-[#f8f9fa] border-r border-gray-200 shadow-xl
          transition-transform duration-300 ease-in-out flex flex-col w-[260px] 
          h-[calc(100dvh-60px)] overflow-hidden
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className={`p-3 flex items-center justify-between border-b border-gray-200 ${isSelectionMode ? 'bg-indigo-50' : 'bg-white/50'}`}>
           <span className={`text-[10px] font-black uppercase tracking-widest ${isSelectionMode ? 'text-indigo-600' : 'text-gray-400'}`}>
               {isSelectionMode ? 'Select a Tool to Add' : 'Toolbar'}
           </span>
           <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-gray-200 rounded text-gray-500" title="Collapse">
             <Icon.Minus size={16} />
           </button>
        </div>

        <div className="flex-1 flex flex-col px-3 py-4 gap-4 overflow-y-auto custom-scrollbar">
          
          <div className="shrink-0">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 pl-1">Essentials</h3>
            <div className="grid grid-cols-4 gap-2">
              <DraggableToolButton id="tool:SELECT" label="Select" iconName="Select" onClick={() => handleToolClick(ToolMode.SELECT)}>
                  <SidebarBtn icon={Icon.Select} label="Select" isActive={activeMode === ToolMode.SELECT} shortcut="V" />
              </DraggableToolButton>
              
              <DraggableToolButton id="tool:HAND" label="Pan" iconName="Hand" onClick={() => handleToolClick(ToolMode.HAND)}>
                  <SidebarBtn icon={Icon.Hand} label="Pan" isActive={activeMode === ToolMode.HAND} shortcut="H" />
              </DraggableToolButton>

              <DraggableToolButton id="tool:CONNECT" label="Link" iconName="Connect" onClick={() => { toggleSubMenu('CONNECT'); handleToolClick(ToolMode.CONNECT); }}>
                  <SidebarBtn icon={Icon.Connect} label="Link" isActive={activeMode === ToolMode.CONNECT} hasSub />
              </DraggableToolButton>

              <DraggableToolButton id="action:search" label="Find" iconName="Search" onClick={() => onAction('search')}>
                  <SidebarBtn icon={Icon.Search} label="Find" shortcut="Ctrl+F" />
              </DraggableToolButton>
            </div>
          </div>

          {/* CONNECT SUBMENU */}
          <div className={`overflow-hidden transition-all duration-300 ease-in-out shrink-0 ${activeSubMenu === 'CONNECT' ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0 mt-0'}`}>
             {activeSubMenu === 'CONNECT' && defaultEdgeOptions && setDefaultEdgeOptions && (
                  <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm relative z-30 space-y-3">
                        <div className="text-[10px] text-blue-600 font-medium italic pb-2 border-b border-gray-100 bg-blue-50/50 -mx-3 px-3 pt-2 -mt-3 rounded-t-xl">
                           ✨ Tip: Hold <b>Shift + Click</b> to select multiple connection lines.
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Line Style</span>
                            <div className="flex gap-1">
                                <button onClick={handleDropper} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Icon.Pipette size={14}/></button>
                                <label className="p-1 hover:bg-gray-100 rounded text-gray-500 cursor-pointer relative">
                                    <Icon.Palette size={14}/>
                                    <input 
                                        type="color" 
                                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" 
                                        value={defaultEdgeOptions.color}
                                        onChange={(e) => setDefaultEdgeOptions({...defaultEdgeOptions, color: e.target.value})} 
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {['#cbd5e1', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map(c => (
                                <button 
                                  key={c} 
                                  onClick={() => setDefaultEdgeOptions({...defaultEdgeOptions, color: c})}
                                  className={`w-5 h-5 rounded-full shadow-sm border border-black/10 transition-transform hover:scale-110 ${defaultEdgeOptions.color === c ? 'ring-2 ring-blue-400' : ''}`}
                                  style={{backgroundColor: c}}
                                />
                            ))}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                            {['solid', 'dashed', 'dotted'].map(s => (
                              <button 
                                key={s} 
                                onClick={() => setDefaultEdgeOptions({...defaultEdgeOptions, stroke: s as any})}
                                className={`h-7 flex items-center justify-center rounded border ${defaultEdgeOptions.stroke === s ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}
                              >
                                <div className={`w-6 h-0.5 bg-gray-400 ${s === 'dashed' ? 'border-b-2 border-dashed border-gray-400 bg-transparent' : s === 'dotted' ? 'border-b-2 border-dotted border-gray-400 bg-transparent' : ''}`} />
                              </button>
                            ))}
                        </div>
                  </div>
             )}
          </div>

          <div className="shrink-0 flex flex-col">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 pl-1">Create</h3>
            <div className="grid grid-cols-4 gap-2 relative z-20">
              <SidebarBtn icon={Icon.ShapeRect} label="Node" isActive={activeSubMenu === 'NODE'} onClick={() => toggleSubMenu('NODE')} hasSub />
              
              <DraggableToolButton id="create:note" label="Note" iconName="StickyNote" onClick={() => toggleSubMenu('STICKY')}>
                  <SidebarBtn icon={Icon.StickyNote} label="Note" isActive={activeSubMenu === 'STICKY'} hasSub />
              </DraggableToolButton>

              <DraggableToolButton id="action:open-media-modal" label="Media" iconName="Image" onClick={() => onAction('open-media-modal')}>
                  <SidebarBtn icon={Icon.Image} label="Media" />
              </DraggableToolButton>

              <DraggableToolButton id="tool:DRAW" label="Draw" iconName="Pen" onClick={() => { toggleSubMenu('DRAW'); handleToolClick(ToolMode.DRAW); }}>
                  <SidebarBtn icon={Icon.Pen} label="Draw" isActive={activeSubMenu === 'DRAW'} hasSub shortcut="D" />
              </DraggableToolButton>

              <DraggableToolButton id="create:code" label="Code" iconName="Code" onClick={() => toggleSubMenu('CODE')}>
                  <SidebarBtn icon={Icon.Code} label="Code" isActive={activeSubMenu === 'CODE'} hasSub />
              </DraggableToolButton>

              <DraggableToolButton id="create:table" label="Table" iconName="Table" onClick={() => toggleSubMenu('TABLE')}>
                  <SidebarBtn icon={Icon.Table} label="Table" isActive={activeSubMenu === 'TABLE'} hasSub />
              </DraggableToolButton>
            </div>

             {/* DYNAMIC SUBMENUS */}
             <div className={`overflow-hidden transition-all duration-300 ease-in-out ${activeSubMenu && activeSubMenu !== 'CONNECT' && activeSubMenu !== 'LAYOUT' ? 'max-h-[500px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
                  <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm relative z-30">
                      {activeSubMenu === 'NODE' && (
                        <div className="flex flex-col gap-1">
                           <div className="text-[10px] text-gray-400 font-medium italic pb-2 mb-2 border-b border-gray-100">
                               <b>Enter</b> adds sibling, <b>Tab</b> adds child.
                           </div>
                           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Default Shape</span>
                           {[
                             { id: 'rectangle', label: 'Rectangle', icon: Icon.ShapeRect },
                             { id: 'rounded', label: 'Rounded', icon: () => <div className="w-3 h-2 border-2 border-current rounded-md"/> },
                             { id: 'circle', label: 'Circle', icon: Icon.ShapeCircle },
                             { id: 'diamond', label: 'Diamond', icon: () => <div className="w-2.5 h-2.5 border-2 border-current rotate-45"/> },
                             { id: 'triangle', label: 'Triangle', icon: Icon.ShapeTriangle },
                             { id: 'hexagon', label: 'Hexagon', icon: Icon.ShapeHexagon },
                             { id: 'cloud', label: 'Cloud', icon: Icon.ShapeCloud },
                             { id: 'default', label: 'Default Node', icon: Icon.Plus, action: 'add-node' }
                           ].map((item) => (
                             <DraggableToolButton 
                                key={item.id}
                                id={`shape:${item.id}`}
                                label={item.label}
                                iconName={item.id === 'default' ? 'Plus' : 'ShapeRect'}
                                onClick={() => item.action ? onAction(item.action) : onAction('add-node-shape', item.id)}
                             >
                                <button className="w-full flex items-center gap-3 p-2 hover:bg-blue-50 rounded text-sm text-gray-600 transition-colors text-left">
                                    <item.icon size={16} className="text-gray-400" />
                                    <span>{item.label}</span>
                                </button>
                             </DraggableToolButton>
                           ))}
                        </div>
                      )}

                      {activeSubMenu === 'STICKY' && (
                        <div className="space-y-3">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Note Color</span>
                          <div className="flex justify-between gap-1">
                              {[{ c: '#fef3c7' }, { c: '#fce7f3' }, { c: '#dbeafe' }, { c: '#dcfce7' }].map((item) => (
                                <button
                                  key={item.c}
                                  onClick={() => onAction('new-sticky-color', item.c)}
                                  className="w-8 h-8 rounded-full border border-black/10 shadow-sm hover:scale-110 transition-transform"
                                  style={{ backgroundColor: item.c }}
                                />
                              ))}
                          </div>
                        </div>
                      )}

                      {activeSubMenu === 'DRAW' && setDrawingSettings && drawingSettings && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Ink Color</span>
                                <div className="flex gap-1">
                                    <button onClick={handleDropper} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Icon.Pipette size={14}/></button>
                                    <input type="color" value={drawingSettings.color} onChange={(e) => setDrawingSettings({...drawingSettings, color: e.target.value})} className="w-6 h-6 rounded cursor-pointer" />
                                </div>
                            </div>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                {['pen', 'highlighter', 'eraser'].map(t => (
                                  <button 
                                      key={t}
                                      onClick={() => setDrawingSettings({...drawingSettings, tool: t})}
                                      className={`flex-1 py-1 rounded flex justify-center ${drawingSettings.tool === t ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
                                  >
                                      {t === 'pen' && <Icon.Pen size={16}/>}
                                      {t === 'highlighter' && <Icon.Highlighter size={16}/>}
                                      {t === 'eraser' && <Icon.Eraser size={16}/>}
                                  </button>
                                ))}
                            </div>
                        </div>
                      )}

                      {activeSubMenu === 'CODE' && (
                          <div className="space-y-2">
                             <button onClick={() => { onAction('code-node', 'JavaScript'); setActiveSubMenu(null); }} className="w-full py-2 text-[10px] font-bold uppercase bg-gray-100 hover:bg-gray-200 rounded text-gray-600">Add Code Block</button>
                          </div>
                      )}

                      {activeSubMenu === 'TABLE' && (
                          <div className="space-y-3">
                             <div className="flex gap-2 items-center">
                                 <input type="number" value={tableDims.rows} onChange={(e) => setTableDims({...tableDims, rows: parseInt(e.target.value)})} className="w-full p-1.5 text-xs border rounded bg-gray-50" />
                                 <span>x</span>
                                 <input type="number" value={tableDims.cols} onChange={(e) => setTableDims({...tableDims, cols: parseInt(e.target.value)})} className="w-full p-1.5 text-xs border rounded bg-gray-50" />
                             </div>
                             <button onClick={() => { onAction('table-node', tableDims); setActiveSubMenu(null); }} className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold border border-blue-200">Insert Table</button>
                          </div>
                      )}
                  </div>
             </div>
          </div>

          <div className="shrink-0">
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 pl-1">Actions</h3>
             <div className="grid grid-cols-4 gap-2 relative">
                <DraggableToolButton id="action:undo" label="Undo" iconName="Undo" onClick={() => onAction('undo')}>
                    <SidebarBtn icon={Icon.Undo} label="Undo" shortcut="Ctrl+Z" />
                </DraggableToolButton>
                
                <DraggableToolButton id="action:redo" label="Redo" iconName="Redo" onClick={() => onAction('redo')}>
                    <SidebarBtn icon={Icon.Redo} label="Redo" shortcut="Ctrl+Y" />
                </DraggableToolButton>

                <DraggableToolButton id="action:fit" label="Auto Layout" iconName="Layout" onClick={() => toggleSubMenu('LAYOUT')}>
                    <SidebarBtn icon={Icon.Layout} label="Auto" isActive={activeSubMenu === 'LAYOUT'} hasSub shortcut="L" />
                </DraggableToolButton>

                <DraggableToolButton id="action:center" label="Center" iconName="Navigation" onClick={() => onAction('center')}>
                    <SidebarBtn icon={Icon.Navigation} label="Center" shortcut="C" />
                </DraggableToolButton>
             </div>
             
             {/* LAYOUT SUBMENU */}
             <div className={`overflow-hidden transition-all duration-300 ease-in-out ${activeSubMenu === 'LAYOUT' ? 'max-h-96 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
                  <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm relative z-30 space-y-2">
                      <button onClick={() => { setLayoutDir(d => d==='LR'?'RL':'LR'); onAction('layout', layoutDir==='LR'?'MINDMAP_RL':'MINDMAP_LR'); }} className="w-full text-left flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg text-xs font-bold text-gray-600">
                          <Icon.Brain size={16} /> <span>Mind Map ({layoutDir})</span>
                      </button>
                      <button onClick={() => onAction('layout', 'TREE')} className="w-full text-left flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg text-xs font-bold text-gray-600">
                          <Icon.Layout size={16} /> <span>Tree (Top-Down)</span>
                      </button>
                      <button onClick={() => onAction('layout', 'RADIAL')} className="w-full text-left flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg text-xs font-bold text-gray-600">
                          <Icon.Sun size={16} /> <span>Radial Star</span>
                      </button>
                      <button onClick={() => onAction('layout', 'FLOWCHART')} className="w-full text-left flex items-center gap-2 p-2 hover:bg-blue-50 rounded-lg text-xs font-bold text-gray-600">
                          <Icon.Flowchart size={16} /> <span>Flowchart</span>
                      </button>
                      <button onClick={() => onAction('layout', 'FLOWER')} className="w-full text-left flex items-center gap-2 p-2 hover:bg-pink-50 rounded-lg text-xs font-bold text-pink-600">
                          <div className="w-4 h-4 rounded-full border-2 border-pink-500 flex items-center justify-center"><div className="w-1 h-1 bg-pink-500 rounded-full"/></div> 
                          <span>Flower (Organic)</span>
                      </button>
                  </div>
             </div>
          </div>
        </div>
      </div>
    </>
  );
};