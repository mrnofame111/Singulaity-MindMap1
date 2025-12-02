
import React, { useState } from 'react';
import { Icon } from './Icons';
import { CanvasSettings, SmartStylingRules, NodeShape, EdgeOptions, SingularityNode } from '../types';
import { APP_THEMES } from '../constants';

interface RightPanelProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  canvasSettings: CanvasSettings;
  setCanvasSettings: (s: CanvasSettings) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  onShowShortcuts: () => void;
  onExport: (type: 'JSON' | 'MD' | 'PNG' | 'JPEG' | 'TXT' | 'SVG' | 'PDF' | 'DOC' | 'EXCEL' | 'OPML' | 'VIDEO' | 'HTML') => void;
  smartRules?: SmartStylingRules;
  setSmartRules?: (rules: SmartStylingRules) => void;
  onAction?: (action: string, payload?: any) => void;
  selectedEdgeIds?: Set<string>;
  linkSelectionMode?: boolean;
  setLinkSelectionMode?: (v: boolean) => void;
  defaultEdgeOptions?: EdgeOptions;
  setDefaultEdgeOptions?: (opts: EdgeOptions) => void;
  defaultNodeShape?: NodeShape;
  setDefaultNodeShape?: (s: NodeShape) => void;
  defaultNodeColor?: string;
  setDefaultNodeColor?: (c: string) => void;
  isSelectionMode?: boolean;
  onToolSelect?: (toolId: string, label: string, iconName: string) => void;
  selectedNode?: SingularityNode | null;
}

// ... (Constants remain same: SHAPES, LINK_COLORS, PRESET_COLORS)
const SHAPES: { id: NodeShape, label: string, icon: any }[] = [
    { id: 'rectangle', label: 'Rectangle', icon: Icon.ShapeRect },
    { id: 'rounded', label: 'Rounded', icon: () => <div className="w-3 h-2 border-2 border-current rounded-md"/> },
    { id: 'circle', label: 'Circle', icon: Icon.ShapeCircle },
    { id: 'diamond', label: 'Diamond', icon: () => <div className="w-2.5 h-2.5 border-2 border-current rotate-45"/> },
    { id: 'triangle', label: 'Triangle', icon: Icon.ShapeTriangle },
    { id: 'hexagon', label: 'Hexagon', icon: Icon.ShapeHexagon },
    { id: 'octagon', label: 'Octagon', icon: Icon.ShapeOctagon },
    { id: 'cloud', label: 'Cloud', icon: Icon.ShapeCloud },
    { id: 'parallelogram', label: 'Parallelogram', icon: Icon.ShapePara }
];

const LINK_COLORS = [
    '#cbd5e1', '#94a3b8', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#000000'
];

const PRESET_COLORS = [
    '#ffffff', '#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'
];

// ... (Helper components remain same: handleDropper, TipBox, ThemeCard, ToggleSwitch, ColorControl, ShapeDropdown)
const handleDropper = async (onChange: (c: string) => void) => {
    if (!(window as any).EyeDropper) {
        alert("Eyedropper is not supported in this browser.");
        return;
    }
    try {
        const eyeDropper = new (window as any).EyeDropper();
        const result = await eyeDropper.open();
        onChange(result.sRGBHex);
    } catch (e) {
        console.log("Eyedropper cancelled", e);
    }
};

const TipBox = ({ icon: IconC, title, text }: { icon: any, title: string, text: React.ReactNode }) => (
  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex gap-3 items-start">
      <IconC size={16} className="text-indigo-500 mt-0.5 shrink-0" />
      <div>
          <h4 className="text-xs font-bold text-indigo-700 mb-0.5">{title}</h4>
          <p className="text-[10px] text-indigo-600 leading-relaxed">{text}</p>
      </div>
  </div>
);

const ThemeCard = ({ theme, selected, onClick }: any) => (
    <button
      onClick={onClick}
      className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 relative overflow-hidden group
        ${selected ? 'border-blue-500 ring-2 ring-blue-100 bg-gray-50' : 'border-gray-200 hover:border-gray-400 bg-white'}
      `}
    >
      <div className="w-8 h-8 rounded-full border shadow-sm shrink-0" style={{ backgroundColor: theme.bg }} />
      <div className="flex flex-col items-start">
          <span className="text-xs font-bold text-gray-700">{theme.name}</span>
          <span className="text-[10px] text-gray-400 uppercase">{theme.isDark ? 'Dark' : 'Light'}</span>
      </div>
      {selected && <div className="absolute right-3 text-blue-500"><Icon.Task size={16} /></div>}
    </button>
);

const ToggleSwitch = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) => (
    <div className="flex items-center justify-between py-1.5 cursor-pointer" onClick={onChange}>
        <span className="text-xs font-medium text-gray-600 select-none">{label}</span>
        <button 
           className={`w-8 h-4 rounded-full relative transition-colors ${checked ? 'bg-green-500' : 'bg-gray-300'}`}
        >
           <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${checked ? 'left-4.5' : 'left-0.5'}`} style={{ left: checked ? '18px' : '2px' }} />
        </button>
    </div>
);

const ColorControl = ({ selected, onChange, allowAny = false, label, colors = PRESET_COLORS }: { selected: string, onChange: (c: string) => void, allowAny?: boolean, label: string, colors?: string[] }) => (
    <div className="space-y-2">
        <div className="flex items-center justify-between">
           <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
           <div className="flex gap-1">
               <button
                  onClick={() => handleDropper(onChange)}
                  className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-blue-600 transition-colors shadow-sm"
                  title="Pick color"
               >
                  <Icon.Pipette size={14} />
               </button>
               <div className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer relative overflow-hidden">
                  <input
                      type="color"
                      value={selected === 'any' ? '#ffffff' : selected}
                      onChange={(e) => onChange(e.target.value)}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                  />
                  <div 
                      className="w-3 h-3 rounded-full border border-gray-300" 
                      style={{ 
                          backgroundColor: selected === 'any' ? 'transparent' : selected,
                          backgroundImage: selected === 'any' ? 'linear-gradient(to bottom right, transparent 45%, red 50%, transparent 55%)' : 'none'
                      }} 
                  />
               </div>
           </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
            {allowAny && (
                <button
                  onClick={() => onChange('any')}
                  className={`w-6 h-6 rounded-md border flex items-center justify-center text-[8px] font-bold bg-gray-50 text-gray-500 ${selected === 'any' ? 'ring-2 ring-blue-400 border-blue-400 text-blue-600' : 'border-gray-200 hover:border-blue-300'}`}
                >
                    ANY
                </button>
            )}
            {colors.map(c => (
                <button
                   key={c}
                   onClick={() => onChange(c)}
                   className={`w-6 h-6 rounded-md border border-black/5 shadow-sm transition-all ${selected === c ? 'ring-2 ring-blue-400 scale-110 z-10' : 'hover:scale-105'}`}
                   style={{ backgroundColor: c }}
                />
            ))}
        </div>
    </div>
);

const ShapeDropdown = ({ selected, onChange, allowAny = false, label }: { selected: string, onChange: (s: any) => void, allowAny?: boolean, label: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectedShape = SHAPES.find(s => s.id === selected);
    return (
      <div className="space-y-1 relative">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
          <button 
              onClick={() => setIsOpen(!isOpen)}
              className="w-full text-xs p-2 bg-white border border-gray-200 rounded-lg outline-none font-medium text-gray-700 flex items-center justify-between hover:border-blue-300"
          >
              <div className="flex items-center gap-2">
                  {selected === 'any' ? <span>Any Shape</span> : (
                      <>
                          {selectedShape && <selectedShape.icon size={14} />}
                          <span>{selectedShape?.label || selected}</span>
                      </>
                  )}
              </div>
              <Icon.Arrow size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          {isOpen && (
              <>
              <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)}/>
              <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[101] max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {allowAny && (
                      <button 
                          onClick={() => { onChange('any'); setIsOpen(false); }}
                          className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-50 text-gray-700 font-medium flex items-center gap-2"
                      >
                          <span>Any Shape</span>
                      </button>
                  )}
                  {SHAPES.map(s => (
                      <button 
                          key={s.id}
                          onClick={() => { onChange(s.id); setIsOpen(false); }}
                          className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-50 text-gray-700 font-medium flex items-center gap-2 ${selected === s.id ? 'bg-blue-50 text-blue-600' : ''}`}
                      >
                          <s.icon size={14} />
                          <span>{s.label}</span>
                      </button>
                  ))}
              </div>
              </>
          )}
      </div>
    );
};

// --- MAIN COMPONENT ---

export const RightPanel: React.FC<RightPanelProps> = ({ 
  isOpen, 
  setIsOpen,
  canvasSettings,
  setCanvasSettings,
  isDarkMode,
  toggleTheme,
  onShowShortcuts,
  onExport,
  smartRules,
  setSmartRules,
  onAction,
  selectedEdgeIds,
  linkSelectionMode,
  setLinkSelectionMode,
  defaultEdgeOptions,
  setDefaultEdgeOptions,
  defaultNodeShape,
  setDefaultNodeShape,
  defaultNodeColor,
  setDefaultNodeColor,
  isSelectionMode,
  onToolSelect,
  selectedNode
}) => {
  const [activeTab, setActiveTab] = useState<'SETTINGS' | 'ACTIONS'>('SETTINGS');

  // Global Replace State
  const [findShape, setFindShape] = useState<NodeShape | 'any'>('any');
  const [findColor, setFindColor] = useState<string>('any');
  const [findLinkColor, setFindLinkColor] = useState<string>('any');
  
  const [replaceShape, setReplaceShape] = useState<NodeShape | 'any'>('any');
  const [replaceColor, setReplaceColor] = useState<string>('any');
  const [replaceLinkColor, setReplaceLinkColor] = useState<string>('any');
  
  const [replaceStatus, setReplaceStatus] = useState<'idle' | 'success'>('idle');

  // Presentation Item State
  const [newItemContent, setNewItemContent] = useState('');
  const [newItemType, setNewItemType] = useState<'text' | 'image'>('text');

  const handleGlobalReplace = () => {
      if (onAction) {
          const payload = {
              find: {
                  shape: findShape === 'any' ? undefined : findShape,
                  color: findColor === 'any' ? undefined : findColor,
                  linkColor: findLinkColor === 'any' ? undefined : findLinkColor
              },
              replace: {
                  shape: replaceShape === 'any' ? undefined : replaceShape,
                  color: replaceColor === 'any' ? undefined : replaceColor,
                  linkColor: replaceLinkColor === 'any' ? undefined : replaceLinkColor
              }
          };
          onAction('replace-global-style', payload);
          setReplaceStatus('success');
          setTimeout(() => setReplaceStatus('idle'), 2000);
      }
  };

  const handleAddPresentationItem = () => {
      if (!newItemContent.trim() || !onAction) return;
      if (selectedNode) {
          const currentItems = selectedNode.data?.presentationItems || [];
          if (currentItems.length >= 9) {
              alert("Maximum 9 items allowed per node.");
              return;
          }
          const newItem = {
              id: Math.random().toString(36).substr(2, 9),
              type: newItemType,
              content: newItemContent
          };
          const newItems = [...currentItems, newItem];
          onAction('update-node-data', { id: selectedNode.id, data: { ...selectedNode.data, presentationItems: newItems } });
          setNewItemContent('');
      }
  };

  const handleRemovePresentationItem = (index: number) => {
      if (selectedNode && onAction) {
          const newItems = [...(selectedNode.data?.presentationItems || [])];
          newItems.splice(index, 1);
          onAction('update-node-data', { id: selectedNode.id, data: { ...selectedNode.data, presentationItems: newItems } });
      }
  };

  // Wrapper for draggable buttons
  const DraggableToolButton = ({ id, label, iconName, onClick, children, className, ...props }: any) => {
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
            className={isSelectionMode ? `ring-2 ring-indigo-400 ring-offset-1 rounded-xl cursor-copy animate-pulse ${className}` : className}
            {...props}
          >
              {children}
          </div>
      );
  };

  const ExportButton = ({ id, label, icon, action }: { id: string, label: string, icon: any, action: string }) => (
      <DraggableToolButton 
        id={`export:${action}`} 
        label={label} 
        iconName="Download" 
        onClick={() => onExport(action as any)}
        className="h-full"
      >
        <button className="w-full h-full px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-600 border border-gray-200 flex flex-col items-center justify-center gap-1.5 text-center transition-all hover:border-blue-300 hover:text-blue-600">
            {React.createElement(icon, { size: 18 })}
            <span className="text-[9px] leading-tight">{label}</span>
        </button>
      </DraggableToolButton>
  );

  return (
    <div 
      className={`
        fixed z-[60] bg-white shadow-2xl transition-transform duration-300 ease-in-out flex flex-col
        
        /* Mobile: Bottom Sheet */
        inset-x-0 bottom-0 h-[85vh] w-full rounded-t-3xl border-t border-gray-300
        ${isOpen ? 'translate-y-0' : 'translate-y-full'}

        /* Desktop: Side Panel */
        md:inset-auto md:right-0 md:top-[60px] md:bottom-0 md:w-[320px] md:h-auto md:rounded-none md:border-l md:border-t-0
        md:translate-y-0
        ${isOpen ? 'md:translate-x-0' : 'md:translate-x-full'}
      `}
    >
         {/* Header */}
         <div className={`h-14 flex items-center justify-between px-6 border-b border-gray-200 shrink-0 ${isSelectionMode ? 'bg-indigo-50' : 'bg-gray-50'}`}>
           <h2 className={`font-display font-black text-lg tracking-wide ${isSelectionMode ? 'text-indigo-600' : 'text-gray-800'}`}>
               {isSelectionMode ? 'SELECT ACTION' : 'PREFERENCES'}
           </h2>
           <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors">
             <Icon.Close size={20} />
           </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-6 pb-2 shrink-0">
          <div className="flex p-1 bg-gray-100 rounded-xl">
            <button 
              onClick={() => setActiveTab('SETTINGS')}
              className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${activeTab === 'SETTINGS' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Design
            </button>
            <button 
              onClick={() => setActiveTab('ACTIONS')}
              className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${activeTab === 'ACTIONS' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Actions
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-8 custom-scrollbar pb-32">
          
          {activeTab === 'SETTINGS' && (
            <>
              {/* Navigation Settings Section */}
              <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Icon.Navigation size={12}/> Navigation & View
                  </h3>
                  <div className="space-y-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                      {/* Zoom Sensitivity */}
                      <div>
                          <div className="flex justify-between mb-1">
                              <span className="text-xs font-bold text-gray-600">Zoom Speed</span>
                              <span className="text-[10px] font-mono bg-gray-200 px-1.5 rounded text-gray-600">{canvasSettings.zoomSensitivity?.toFixed(1) || 1.0}x</span>
                          </div>
                          <input 
                              type="range" 
                              min="0.1" 
                              max="3.0" 
                              step="0.1"
                              value={canvasSettings.zoomSensitivity || 1.0}
                              onChange={(e) => setCanvasSettings({...canvasSettings, zoomSensitivity: parseFloat(e.target.value)})}
                              className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          />
                      </div>

                      {/* Inertia Toggle */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                          <div className="flex items-center gap-2">
                              <Icon.Move size={14} className="text-gray-500"/>
                              <span className="text-xs font-bold text-gray-600">Smooth Inertia</span>
                          </div>
                          <ToggleSwitch 
                              label="" 
                              checked={canvasSettings.zoomInertia || false}
                              onChange={() => setCanvasSettings({...canvasSettings, zoomInertia: !canvasSettings.zoomInertia})}
                          />
                      </div>
                      <p className="text-[9px] text-gray-400 leading-tight pt-1">
                          Enables smooth momentum when zooming in or out.
                      </p>
                  </div>
              </div>

              {/* PRESENTATION DECK EDITOR */}
              {selectedNode && (
                  <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4 space-y-4 animate-fade-in">
                      <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                              <Icon.MonitorPlay size={12}/> Presentation Deck
                          </h3>
                          <span className="text-[10px] font-bold text-indigo-400">
                              {selectedNode.data?.presentationItems?.length || 0} / 9
                          </span>
                      </div>
                      
                      <div className="space-y-2">
                          <div className="flex gap-2">
                              <select 
                                  value={newItemType}
                                  onChange={(e) => setNewItemType(e.target.value as any)}
                                  className="bg-white text-xs font-bold border border-indigo-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"
                              >
                                  <option value="text">Text</option>
                                  <option value="image">Image</option>
                              </select>
                              <input 
                                  type="text" 
                                  value={newItemContent}
                                  onChange={(e) => setNewItemContent(e.target.value)}
                                  placeholder={newItemType === 'image' ? "Image URL..." : "Short note..."}
                                  className="flex-1 bg-white text-xs px-2 py-1.5 rounded-lg border border-indigo-200 outline-none focus:border-indigo-400"
                              />
                              <button 
                                  onClick={handleAddPresentationItem}
                                  disabled={(selectedNode.data?.presentationItems?.length || 0) >= 9}
                                  className="bg-indigo-500 hover:bg-indigo-600 text-white p-1.5 rounded-lg disabled:opacity-50 transition-colors"
                              >
                                  <Icon.Plus size={16} />
                              </button>
                          </div>
                          
                          {/* List of Items */}
                          <div className="space-y-1 max-h-[150px] overflow-y-auto custom-scrollbar">
                              {selectedNode.data?.presentationItems?.map((item, idx) => (
                                  <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-indigo-100 text-xs">
                                      <div className="text-gray-400">
                                          {item.type === 'image' ? <Icon.Image size={12}/> : <Icon.Type size={12}/>}
                                      </div>
                                      <div className="flex-1 truncate text-gray-600 font-medium" title={item.content}>
                                          {item.content}
                                      </div>
                                      <button onClick={() => handleRemovePresentationItem(idx)} className="text-red-400 hover:text-red-600">
                                          <Icon.Trash size={12} />
                                      </button>
                                  </div>
                              ))}
                              {(!selectedNode.data?.presentationItems || selectedNode.data.presentationItems.length === 0) && (
                                  <div className="text-center text-[10px] text-indigo-300 py-2 italic">No items in deck</div>
                              )}
                          </div>
                          
                          <div className="text-[9px] text-indigo-400 leading-tight">
                              These items will appear in the drawer ('v' icon) during presentation mode.
                          </div>
                      </div>
                  </div>
              )}

              {/* BULK CONNECTION SETTINGS */}
              {selectedEdgeIds && selectedEdgeIds.size > 0 && onAction && (
                  <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 space-y-4 animate-fade-in">
                       {/* ... existing content ... */}
                       <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                                    <Icon.Connect size={12}/> Connection Settings ({selectedEdgeIds.size})
                            </h3>
                            <span className="bg-blue-100 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded">BULK</span>
                       </div>

                       <TipBox 
                          icon={Icon.Select} 
                          title="Multi-Select Trick" 
                          text={<span>Hold <b>Shift + Click</b> on edges to select multiple links at once.</span>}
                       />
                       
                       <ColorControl 
                            selected={'any'} 
                            onChange={(c) => onAction('edge-bulk-update', { color: c })}
                            label="Line Color"
                            colors={LINK_COLORS}
                       />

                       <div className="space-y-2">
                           <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Routing</span>
                           <div className="grid grid-cols-3 gap-1">
                               <button onClick={() => onAction('edge-bulk-update', { routingType: 'straight' })} className="py-1.5 bg-white border border-blue-200 text-blue-600 text-[10px] font-bold rounded hover:bg-blue-100">STR</button>
                               <button onClick={() => onAction('edge-bulk-update', { routingType: 'curved' })} className="py-1.5 bg-white border border-blue-200 text-blue-600 text-[10px] font-bold rounded hover:bg-blue-100">CRV</button>
                               <button onClick={() => onAction('edge-bulk-update', { routingType: 'orthogonal' })} className="py-1.5 bg-white border border-blue-200 text-blue-600 text-[10px] font-bold rounded hover:bg-blue-100">90°</button>
                           </div>
                       </div>
                       
                       <div className="space-y-2 pt-2 border-t border-blue-100">
                           <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Global Alignment</span>
                           <div className="flex gap-2">
                               <button onClick={() => onAction('edge-align-horizontal')} className="flex-1 py-2 bg-white border border-gray-200 rounded text-xs font-bold text-gray-600 hover:text-blue-600">Align Horiz.</button>
                               <button onClick={() => onAction('edge-align-vertical')} className="flex-1 py-2 bg-white border border-gray-200 rounded text-xs font-bold text-gray-600 hover:text-blue-600">Align Vert.</button>
                           </div>
                       </div>
                  </div>
              )}

              {/* ... Smart Styling and other settings ... */}
              {smartRules && setSmartRules && (
                 <div>
                    <div className="flex items-center justify-between mb-4">
                         <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                             <Icon.Magic size={12} className={smartRules.active ? "text-green-500" : ""}/> Smart Styling
                         </h3>
                         <button 
                            onClick={() => setSmartRules({...smartRules, active: !smartRules.active})}
                            className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${smartRules.active ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                         >
                             {smartRules.active ? 'ACTIVE' : 'DISABLED'}
                         </button>
                    </div>
                    
                    {smartRules.active && (
                        <div className="space-y-4 bg-gray-50 p-3 rounded-xl border border-gray-100 animate-fade-in">
                            <TipBox 
                                icon={Icon.Sparkles} 
                                title="Inheritance" 
                                text="New nodes will automatically copy color/shape from their parent or sibling."
                            />
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase mb-1 border-b border-gray-200 pb-1">Sibling Inheritance (Enter)</div>
                                
                                <DraggableToolButton 
                                    id="toggle:smart-sibling-color" 
                                    label="Sibling Color" 
                                    iconName="Palette"
                                    onClick={() => setSmartRules({...smartRules, sibling: {...smartRules.sibling, color: !smartRules.sibling.color}})}
                                >
                                    <div className={isSelectionMode ? "pointer-events-none" : ""}>
                                        <ToggleSwitch 
                                            label="Copy Color" 
                                            checked={smartRules.sibling.color} 
                                            onChange={() => {}} // Handled by wrapper onClick 
                                        />
                                    </div>
                                </DraggableToolButton>

                                <DraggableToolButton 
                                    id="toggle:smart-sibling-shape" 
                                    label="Sibling Shape" 
                                    iconName="ShapeRect"
                                    onClick={() => setSmartRules({...smartRules, sibling: {...smartRules.sibling, shape: !smartRules.sibling.shape}})}
                                >
                                    <div className={isSelectionMode ? "pointer-events-none" : ""}>
                                        <ToggleSwitch 
                                            label="Copy Shape" 
                                            checked={smartRules.sibling.shape} 
                                            onChange={() => {}} // Handled by wrapper onClick
                                        />
                                    </div>
                                </DraggableToolButton>
                            </div>
                        </div>
                    )}
                 </div>
              )}
              
              {/* GLOBAL STYLE SWAP */}
              {onAction && (
                <div>
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                         <Icon.Palette size={12}/> Global Style Swap
                    </h3>
                    <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-5">
                        <div className="space-y-3">
                            <div className="text-[10px] font-bold text-blue-600 mb-2 flex justify-between items-center border-b border-blue-100 pb-1">
                                <span>FIND MATCHES</span>
                            </div>
                            <div className="space-y-3 pl-1">
                                <ShapeDropdown selected={findShape} onChange={setFindShape} allowAny label="Node Shape" />
                                <ColorControl selected={findColor} onChange={setFindColor} allowAny label="Node Color" />
                                <ColorControl selected={findLinkColor} onChange={setFindLinkColor} allowAny label="Link Color" colors={LINK_COLORS} />
                            </div>
                        </div>
                        
                        <div className="flex justify-center -my-1">
                            <div className="bg-white p-1.5 rounded-full border border-gray-200 shadow-sm z-10">
                                <Icon.Arrow size={16} className="text-gray-400 rotate-90" />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="text-[10px] font-bold text-green-600 mb-2 flex justify-between items-center border-b border-green-100 pb-1">
                                <span>REPLACE WITH</span>
                            </div>
                            <div className="space-y-3 pl-1">
                                <ShapeDropdown selected={replaceShape} onChange={setReplaceShape} allowAny label="New Shape" />
                                <ColorControl selected={replaceColor} onChange={setReplaceColor} allowAny label="New Node Color" />
                                <ColorControl selected={replaceLinkColor} onChange={setReplaceLinkColor} allowAny label="New Link Color" colors={LINK_COLORS} />
                            </div>
                        </div>
                        
                        <button 
                            onClick={handleGlobalReplace}
                            className={`w-full py-2.5 text-xs font-bold rounded-lg transition-colors shadow-md active:scale-95 ${replaceStatus === 'success' ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                        >
                            {replaceStatus === 'success' ? 'Matches Replaced!' : 'Run Replace'}
                        </button>
                    </div>
                </div>
              )}

              <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Icon.Palette size={12}/> Pro Themes
                </h3>
                <div className="space-y-3">
                   {Object.values(APP_THEMES).map(theme => (
                       <ThemeCard 
                          key={theme.id} 
                          theme={theme} 
                          selected={canvasSettings.theme === theme.id}
                          onClick={() => setCanvasSettings({...canvasSettings, theme: theme.id})}
                       />
                   ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'ACTIONS' && (
             <div className="space-y-6">
                
                {/* MASTER CONTROL PANEL */}
                {defaultEdgeOptions && setDefaultEdgeOptions && defaultNodeShape && setDefaultNodeShape && defaultNodeColor && setDefaultNodeColor && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                     {/* ... existing default creation styles ... */}
                     <div className="bg-red-50 px-4 py-3 border-b border-red-100 flex items-center justify-between">
                        <h3 className="text-[10px] font-black text-red-600 uppercase tracking-widest">DEFAULT CREATION STYLES</h3>
                        <Icon.Settings size={14} className="text-red-400"/>
                     </div>
                     
                     <div className="p-4 space-y-6">
                         {/* Link Section */}
                         <div className="space-y-3 relative">
                            <div className="absolute -left-4 top-2 w-1 h-8 bg-green-500 rounded-r-full"/>
                            <h4 className="text-[10px] font-bold text-green-600 uppercase tracking-wider pl-2 flex items-center gap-2">
                                <Icon.Connect size={12}/> New Links
                            </h4>
                            
                            <div className="space-y-3 pl-2">
                                <div className="space-y-1">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase">Default Routing</span>
                                    <div className="grid grid-cols-3 gap-1">
                                        <button onClick={() => setDefaultEdgeOptions({...defaultEdgeOptions, routingType: 'straight'})} className={`py-2 text-[10px] font-bold rounded border transition-all ${defaultEdgeOptions.routingType === 'straight' ? 'bg-green-500 text-white border-green-600 shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>STR</button>
                                        <button onClick={() => setDefaultEdgeOptions({...defaultEdgeOptions, routingType: 'curved'})} className={`py-2 text-[10px] font-bold rounded border transition-all ${defaultEdgeOptions.routingType === 'curved' ? 'bg-green-500 text-white border-green-600 shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>CRV</button>
                                        <button onClick={() => setDefaultEdgeOptions({...defaultEdgeOptions, routingType: 'orthogonal'})} className={`py-2 text-[10px] font-bold rounded border transition-all ${defaultEdgeOptions.routingType === 'orthogonal' ? 'bg-green-500 text-white border-green-600 shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>90°</button>
                                    </div>
                                </div>

                                <ColorControl 
                                    selected={defaultEdgeOptions.color || '#cbd5e1'} 
                                    onChange={(c) => setDefaultEdgeOptions({...defaultEdgeOptions, color: c})} 
                                    label="Link Color" 
                                    colors={LINK_COLORS}
                                />
                            </div>
                         </div>
                         
                         <div className="h-px bg-gray-100 mx-2"/>

                         {/* Node Section */}
                         <div className="space-y-3 relative">
                            <div className="absolute -left-4 top-2 w-1 h-8 bg-pink-500 rounded-r-full"/>
                            <h4 className="text-[10px] font-bold text-pink-500 uppercase tracking-wider pl-2 flex items-center gap-2">
                                <Icon.ShapeRect size={12}/> New Nodes
                            </h4>
                            
                            <div className="space-y-3 pl-2">
                                <ShapeDropdown 
                                    selected={defaultNodeShape} 
                                    onChange={(s) => setDefaultNodeShape(s)} 
                                    label="Default Shape" 
                                />
                                
                                <ColorControl 
                                    selected={defaultNodeColor} 
                                    onChange={(c) => setDefaultNodeColor(c)} 
                                    label="Node Color" 
                                />
                            </div>
                         </div>
                     </div>
                  </div>
                )}

                {/* Interaction Settings */}
                {setLinkSelectionMode && linkSelectionMode !== undefined && (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Input Mode</h3>
                        <DraggableToolButton 
                            id="toggle:link-paint" 
                            label="Link Paint Mode" 
                            iconName="Connect"
                            onClick={() => setLinkSelectionMode(!linkSelectionMode)}
                        >
                            <div className={isSelectionMode ? "pointer-events-none" : ""}>
                                <ToggleSwitch 
                                    label="Link Paint Mode" 
                                    checked={linkSelectionMode} 
                                    onChange={() => {}} // Handled by wrapper onClick 
                                />
                            </div>
                        </DraggableToolButton>
                        <div className="mt-2 text-[10px] text-gray-500 leading-relaxed border-l-2 border-blue-300 pl-2">
                            When active, click & drag to paint over links to select them. Nodes will not be selected in this mode. <span className="font-bold text-indigo-500">Shortcut: Shift + Drag</span>
                        </div>
                        {linkSelectionMode && (
                            <div className="mt-2 text-[10px] text-green-600 font-bold flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/> Active
                            </div>
                        )}
                    </div>
                )}

                {onAction && (
                    <DraggableToolButton id="action:present" label="Present" iconName="Present" onClick={() => onAction('present')}>
                        <button 
                        className="w-full py-3 bg-pink-50 hover:bg-pink-100 text-pink-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-pink-200"
                        >
                        <Icon.Present size={18} /> Dynamic Narrative Mode
                        </button>
                    </DraggableToolButton>
                )}

                <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Universal Output</h3>
                  <div className="space-y-4">
                      
                      {/* VISUAL & PRINT */}
                      <div className="space-y-2">
                          <div className="text-[9px] font-bold text-gray-400 px-1 flex items-center gap-2">
                              <Icon.Image size={10}/> Visual & Print
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                              <ExportButton id="export:PNG" label="8K Image" icon={Icon.Image} action="PNG" />
                              <ExportButton id="export:SVG" label="SVG Vector" icon={Icon.Pen} action="SVG" />
                              <ExportButton id="export:PDF" label="PDF (Print)" icon={Icon.FileText} action="PDF" />
                              <ExportButton id="export:JPEG" label="JPEG" icon={Icon.Image} action="JPEG" />
                          </div>
                      </div>

                      {/* WEB & INTERACTIVE */}
                      <div className="space-y-2">
                          <div className="text-[9px] font-bold text-gray-400 px-1 flex items-center gap-2">
                              <Icon.Globe size={10}/> Web & Interactive
                          </div>
                          <div className="grid grid-cols-1">
                              <ExportButton id="export:HTML" label="Interactive HTML Viewer" icon={Icon.Globe} action="HTML" />
                          </div>
                      </div>

                      {/* DOCUMENTATION */}
                      <div className="space-y-2">
                          <div className="text-[9px] font-bold text-gray-400 px-1 flex items-center gap-2">
                              <Icon.FileText size={10}/> Documentation
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                              <ExportButton id="export:DOC" label="Word Doc" icon={Icon.FileText} action="DOC" />
                              <ExportButton id="export:MD" label="Markdown" icon={Icon.Code} action="MD" />
                              <ExportButton id="export:TXT" label="Text Outline" icon={Icon.AlignLeft} action="TXT" />
                          </div>
                      </div>

                      {/* DATA & SYSTEM */}
                      <div className="space-y-2">
                          <div className="text-[9px] font-bold text-gray-400 px-1 flex items-center gap-2">
                              <Icon.Database size={10}/> Data & Integration
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                              <ExportButton id="export:EXCEL" label="Excel / CSV" icon={Icon.Table} action="EXCEL" />
                              <ExportButton id="export:JSON" label="JSON" icon={Icon.Code} action="JSON" />
                              <ExportButton id="export:OPML" label="OPML" icon={Icon.Layers} action="OPML" />
                              <ExportButton id="export:VIDEO" label="Record Video" icon={Icon.Camera} action="VIDEO" />
                          </div>
                      </div>

                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Quick Reference</h3>
                  
                  <div className="space-y-3">
                      {/* ... TipBoxes ... */}
                      <TipBox 
                         icon={Icon.Navigation} 
                         title="Navigation" 
                         text={<span>Hold <b>SPACE</b> and drag to pan around large maps without switching tools.</span>}
                      />
                      <TipBox 
                         icon={Icon.Select} 
                         title="Selection" 
                         text={<span><b>Shift + Click</b> to select multiple items. <b>Alt + Click</b> a node to select its entire branch.</span>}
                      />
                       <TipBox 
                         icon={Icon.Zap} 
                         title="Fast Creation" 
                         text={<span>Press <b>TAB</b> for child nodes, <b>ENTER</b> for sibling nodes.</span>}
                      />
                  </div>

                  <button 
                    onClick={onShowShortcuts}
                    className="w-full mt-6 py-3 text-blue-600 font-bold text-xs bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Icon.Keyboard size={16}/> Open Knowledge Base
                  </button>
                </div>
             </div>
          )}

        </div>
    </div>
  );
};
