
import React, { memo, useState, useRef, useEffect } from 'react';
import { NodeType, SingularityNode, NodeShape } from '../types';
import { Icon } from './Icons';

interface NodeProps {
  node: SingularityNode;
  isSelected: boolean;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  isEditing: boolean;
  themeClasses: { root: string, main: string, sub: string };
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onContextMenu: (e: React.MouseEvent, nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (nodeId: string) => void;
  onExpandAI: (nodeId: string) => void;
  onLabelChange: (nodeId: string, newLabel: string) => void;
  onToggleTask: (nodeId: string) => void; 
  onEditStart: (nodeId: string) => void;
  onEditEnd: () => void;
  connectMode?: boolean;
  onListChange?: (nodeId: string, items: string[]) => void;
  onDataChange?: (nodeId: string, data: any) => void; 
  // Expansion Props
  isExpanded?: boolean; // True if children are visible
  onToggleExpand?: (nodeId: string) => void;
  onStartLink?: (e: React.MouseEvent, nodeId: string) => void;
}

// Helper to determine text color based on background luminance
const getContrastColor = (hexcolor: string) => {
    if (!hexcolor || !hexcolor.startsWith('#')) return '#1e293b'; // Default to slate-900
    let hex = hexcolor.replace('#', '');
    if (hex.length === 3) {
        hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    }
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#1e293b' : '#ffffff';
};

const NodeComponent: React.FC<NodeProps> = ({ 
  node, 
  isSelected, 
  isHighlighted, 
  isDimmed,
  isEditing,
  themeClasses,
  onMouseDown, 
  onContextMenu,
  onAddChild,
  onDelete,
  onExpandAI,
  onLabelChange,
  onToggleTask,
  onEditStart,
  onEditEnd,
  connectMode,
  onListChange,
  onDataChange,
  isExpanded = true,
  onToggleExpand,
  onStartLink
}) => {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [localLabel, setLocalLabel] = useState(node.label);
  const [isHovered, setIsHovered] = useState(false);
  
  // Description State
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [localDescription, setLocalDescription] = useState(node.data?.description || '');

  // Presentation State
  const [isDataDrawerOpen, setIsDataDrawerOpen] = useState(false);
  
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [localItemText, setLocalItemText] = useState('');
  
  // Code & Table State
  const [codeVal, setCodeVal] = useState(node.data?.codeSnippet || "// Write code here...");
  const [tableRows, setTableRows] = useState<string[][]>(node.data?.tableRows || [['Header 1', 'Header 2'], ['Data 1', 'Data 2']]);
  const [editingCell, setEditingCell] = useState<{r: number, c: number} | null>(null);
  const [localCellVal, setLocalCellVal] = useState("");

  const isDreaming = node.data?.isDreaming;

  useEffect(() => {
    setLocalLabel(node.label);
    setLocalDescription(node.data?.description || '');
    if(node.data?.codeSnippet !== undefined) setCodeVal(node.data.codeSnippet);
    if(node.data?.tableRows !== undefined) setTableRows(node.data.tableRows);
  }, [node.label, node.data]);

  useEffect(() => {
    if (isEditing && inputRef.current && editingItemIndex === null && node.type !== NodeType.CODE && node.type !== NodeType.TABLE) {
      inputRef.current.focus();
      (inputRef.current as any).select();
    }
  }, [isEditing, editingItemIndex, node.type]);
  
  const isUrl = (text: string) => {
      return text.match(/^(http|https):\/\/[^ "]+$/);
  };

  const openExternalLink = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (node.data?.url) {
          window.open(node.data.url, '_blank');
      }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCodeVal(e.target.value);
  };

  const saveCode = () => {
     if (onDataChange) onDataChange(node.id, { ...node.data, codeSnippet: codeVal });
  };

  const runCode = () => {
      saveCode();
      const lang = node.data?.codeLanguage || 'JavaScript';
      let output = "";
      
      if (lang.toLowerCase() === 'javascript' || lang.toLowerCase() === 'js') {
          const logs: string[] = [];
          const mockConsole = {
              log: (...args: any[]) => logs.push(args.join(' ')),
              warn: (...args: any[]) => logs.push('WARN: ' + args.join(' ')),
              error: (...args: any[]) => logs.push('ERROR: ' + args.join(' '))
          };
          try {
              // Simple sandbox attempt
              const fn = new Function('console', codeVal);
              const result = fn(mockConsole);
              if (result !== undefined) logs.push('Return: ' + result);
              output = logs.join('\n') || "Executed successfully (No Output)";
          } catch (e: any) {
              output = "Error: " + e.toString();
          }
      } else {
          output = `[Simulation] Executed ${lang} code.\nOutput generation not supported for this language in browser.`;
      }
      
      if (onDataChange) onDataChange(node.id, { ...node.data, codeSnippet: codeVal, codeOutput: output });
  };

  const handleCellEditStart = (r: number, c: number, val: string) => {
      setEditingCell({r, c});
      setLocalCellVal(val);
  };

  const handleCellEditEnd = () => {
      if (!editingCell) return;
      const newRows = [...tableRows];
      newRows[editingCell.r] = [...newRows[editingCell.r]];
      newRows[editingCell.r][editingCell.c] = localCellVal;
      setTableRows(newRows);
      setEditingCell(null);
      if (onDataChange) onDataChange(node.id, { ...node.data, tableRows: newRows });
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalDescription(e.target.value);
  };

  const saveDescription = () => {
      if (onDataChange) onDataChange(node.id, { ...node.data, description: localDescription });
  };

  // --- STYLING LOGIC ---
  const getNodeStyles = (type: NodeType, customColor?: string) => {
    if (customColor) {
        if (customColor.startsWith('#') || customColor.startsWith('rgb')) {
             return ''; // Custom color handled via inline style
        }
        if (customColor === 'transparent') return 'bg-transparent text-slate-900 border-2 border-transparent hover:border-gray-400 font-bold';
        return `${customColor} text-white border-white/40 font-bold`;
    }

    switch (type) {
      case NodeType.ROOT: return themeClasses.root + ' font-black tracking-wide';
      case NodeType.MAIN: return themeClasses.main + ' font-extrabold';
      case NodeType.SUB: return themeClasses.sub + ' font-bold';
      case NodeType.TASK: return themeClasses.sub + ' font-bold flex items-center gap-2 pl-3';
      case NodeType.NOTE: return 'bg-[#fff740] text-slate-900 shadow-[2px_2px_5px_rgba(0,0,0,0.1)] border-none rotate-1 font-display font-bold';
      case NodeType.CODE: return 'bg-[#1e1e1e] text-gray-300 border-gray-600 font-mono text-sm';
      case NodeType.TABLE: return 'bg-white text-gray-800 border-gray-300';
      default: return themeClasses.sub + ' font-bold';
    }
  };

  const getShapeStyles = (type: NodeType, shape?: NodeShape, isList?: boolean) => {
    // REMOVED transition-all to prevent drag sync issues. Only transitioning visual properties.
    const base = "flex flex-col items-center overflow-hidden transition-shadow transition-colors duration-200 relative";
    if (isList || type === NodeType.CODE || type === NodeType.TABLE) return `${base} rounded-lg`;
    if (shape === 'rectangle') return `${base} rounded-lg`;
    if (shape === 'circle') return `${base} rounded-full aspect-square justify-center`;
    if (shape === 'rounded') return `${base} rounded-[2rem] justify-center`;
    if (['diamond', 'triangle', 'hexagon', 'octagon', 'parallelogram', 'cloud'].includes(shape || '')) {
      return `${base} justify-center`;
    }
    switch (type) {
      case NodeType.ROOT: return `${base} rounded-[3rem] justify-center`;
      case NodeType.MAIN: return `${base} rounded-[2rem] justify-center`;
      case NodeType.SUB: return `${base} rounded-[1rem] justify-center`;
      case NodeType.TASK: return `${base} rounded-lg justify-center`;
      case NodeType.NOTE: return `${base} rounded-none aspect-square justify-start`; 
      default: return `${base} rounded-xl justify-center`;
    }
  };

  const getClipPath = (shape?: NodeShape, isList?: boolean) => {
    if (isList) return 'none';
    switch (shape) {
      case 'diamond': return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
      case 'triangle': return 'polygon(50% 0%, 0% 100%, 100% 100%)';
      case 'hexagon': return 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
      case 'octagon': return 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)';
      case 'parallelogram': return 'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)';
      case 'cloud': return 'url(#shape-cloud)'; // Reference scalable SVG ClipPath
      default: return 'none';
    }
  };

  const getSizeStyles = (type: NodeType, shape?: NodeShape, hasImage?: boolean, isList?: boolean) => {
    if (hasImage) return 'p-2 min-w-[200px] min-h-[200px]';
    if (isList) return 'min-w-[200px] h-auto'; 
    if (type === NodeType.CODE) return 'min-w-[320px] h-auto p-0 items-stretch text-left';
    if (type === NodeType.TABLE) return 'min-w-[300px] h-auto p-0 items-stretch';

    const isGeometric = ['diamond', 'triangle', 'hexagon', 'octagon', 'circle'].includes(shape || '');
    const extraPad = isGeometric ? 'p-8 aspect-square' : 'py-4 px-8';

    if (shape === 'circle') {
       return type === NodeType.ROOT ? 'w-48 h-48 text-xl' : 'w-32 h-32 text-sm';
    }
    switch (type) {
      case NodeType.ROOT: return `${extraPad} text-2xl min-w-[200px] min-h-[100px] border-[4px]`;
      case NodeType.MAIN: return `${extraPad} text-xl min-w-[160px] min-h-[80px] border-[3px]`;
      case NodeType.SUB: return `${extraPad} text-base min-w-[120px] border-[2px]`;
      case NodeType.TASK: return `py-3 px-4 text-base min-w-[150px] border-[2px]`;
      case NodeType.NOTE: return `p-5 text-lg font-hand min-w-[200px] min-h-[200px] text-left align-top items-start`;
      default: return 'py-3 px-6 text-base border-2';
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && node.type !== NodeType.NOTE && node.type !== NodeType.CODE) {
      onLabelChange(node.id, localLabel);
      onEditEnd();
    } else if (e.key === 'Escape') {
      setLocalLabel(node.label);
      onEditEnd();
    }
    e.stopPropagation();
  };

  const handleAddItem = () => {
      const newItems = [...(node.data?.items || []), 'New Item'];
      if (onListChange) onListChange(node.id, newItems);
  };
  
  const handleRemoveItem = (idx: number) => {
      if (window.confirm("Are you sure you want to delete this item?")) {
        const newItems = [...(node.data?.items || [])];
        newItems.splice(idx, 1);
        if (onListChange) onListChange(node.id, newItems);
      }
  };

  const handleItemChange = (idx: number, val: string) => {
      const newItems = [...(node.data?.items || [])];
      newItems[idx] = val;
      if (onListChange) onListChange(node.id, newItems);
  };

  const isRoot = node.type === NodeType.ROOT;
  const isTask = node.type === NodeType.TASK;
  const hasImage = !!node.data?.imageUrl;
  const isUrlLabel = isUrl(node.label);
  const isListMode = !!node.data?.items;
  const hasExternalLink = !!node.data?.url;
  const isCode = node.type === NodeType.CODE;
  const isTable = node.type === NodeType.TABLE;
  
  const baseColorClass = getNodeStyles(node.type, node.color);
  const shapeClass = getShapeStyles(node.type, node.shape, isListMode);
  const sizeClass = getSizeStyles(node.type, node.shape, hasImage || !!isUrlLabel, isListMode);
  const clipPath = getClipPath(node.shape, isListMode);
  const isClipped = clipPath !== 'none';
  const isNote = node.type === NodeType.NOTE;

  // Determine effective background color to calculate text contrast
  const effectiveBgColor = (node.color && node.color.startsWith('#')) ? node.color : undefined;
  
  let textColor = '#1e293b'; // Default dark
  if (effectiveBgColor) {
      textColor = getContrastColor(effectiveBgColor);
  } else if (isRoot && !baseColorClass.includes('text-slate-900')) {
      textColor = '#ffffff';
  } else if (node.color && node.color.includes('text-white')) {
      textColor = '#ffffff';
  }

  const textShadow = textColor === '#ffffff' 
      ? '0 1px 2px rgba(0,0,0,0.8)' 
      : '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff';

  const customStyle = (node.color?.startsWith('#') || node.color?.startsWith('rgb')) 
     ? { backgroundColor: node.color, borderColor: 'rgba(0,0,0,0.1)' } 
     : {};

  let shadowClass = '';
  
  if (!isClipped) {
      if (isHighlighted) {
          shadowClass = 'shadow-[0_0_25px_rgba(234,179,8,0.8)] ring-4 ring-yellow-400 scale-110 z-50';
      } else if (isSelected) {
          shadowClass = 'shadow-xl ring-4 ring-blue-500 scale-105 z-50';
      } else {
          shadowClass = isNote 
             ? 'shadow-[5px_5px_15px_rgba(0,0,0,0.1)]' 
             : 'shadow-clay-md hover:shadow-clay-lg hover:-translate-y-0.5';
      }
  }

  const renderListItem = (item: string, idx: number) => {
      const isEditingItem = editingItemIndex === idx;
      return (
          <div key={idx} className="group/item flex items-start gap-2 px-4 py-2 hover:bg-black/5 border-b border-black/5 last:border-0 transition-colors relative">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mt-2" />
              {isEditingItem ? (
                  <textarea 
                    autoFocus
                    value={localItemText}
                    onChange={(e) => {
                        setLocalItemText(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onFocus={(e) => {
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                         const val = e.target.value;
                         e.target.value = '';
                         e.target.value = val;
                    }}
                    onBlur={() => { handleItemChange(idx, localItemText); setEditingItemIndex(null); }}
                    onKeyDown={(e) => { 
                        e.stopPropagation();
                        if(e.key === 'Escape') {
                            setEditingItemIndex(null);
                            setLocalItemText(item);
                        }
                    }}
                    className="flex-1 bg-transparent outline-none text-sm min-w-[120px] resize-none overflow-hidden font-sans leading-relaxed w-full"
                    style={{ height: 'auto' }}
                    rows={1}
                    onClick={(e) => e.stopPropagation()}
                  />
              ) : (
                  <span 
                    className="flex-1 text-sm whitespace-pre-wrap break-words cursor-text leading-relaxed select-text"
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingItemIndex(idx); setLocalItemText(item); }}
                  >
                      {item}
                  </span>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); handleRemoveItem(idx); }}
                className={`p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-md transition-all ${isEditingItem ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`}
                title="Delete Item"
              >
                  <Icon.Trash size={14} />
              </button>
          </div>
      );
  };

  const renderPresentationDrawer = () => {
      if (!isDataDrawerOpen || !node.data?.presentationItems || node.data.presentationItems.length === 0) return null;
      
      return (
          <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-[320px] bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 p-4 z-[100] animate-drawer origin-top">
              <div className="grid grid-cols-3 gap-2">
                  {node.data.presentationItems.map((item, idx) => (
                      <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50/80 shadow-sm hover:scale-105 transition-transform cursor-pointer hover:shadow-md">
                          {item.type === 'image' ? (
                              <img src={item.content} className="w-full h-full object-cover" alt="Presentation Media" onClick={(e) => { e.stopPropagation(); window.open(item.content, '_blank'); }}/>
                          ) : (
                              <div className="w-full h-full p-2 text-[10px] overflow-hidden text-gray-700 leading-tight flex items-center justify-center text-center font-medium">
                                  {item.content}
                              </div>
                          )}
                      </div>
                  ))}
              </div>
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white/90 rotate-45 border-l border-t border-white/50" />
          </div>
      );
  };

  const renderDescriptionDrawer = () => {
      if (!isDescriptionOpen) return null;

      return (
          <div 
            className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-64 bg-yellow-50/95 backdrop-blur-sm border border-yellow-200/50 rounded-xl shadow-xl z-[90] animate-slide-up origin-top flex flex-col overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-yellow-50 rotate-45 border-l border-t border-yellow-200/50 z-20" />
              
              <div className="p-2 border-b border-yellow-200/30 bg-yellow-100/30 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider pl-1">Note Details</span>
              </div>
              <textarea 
                  className="w-full h-32 p-3 bg-transparent text-sm text-gray-700 resize-none outline-none custom-scrollbar"
                  placeholder="Add a brief description..."
                  value={localDescription}
                  onChange={handleDescriptionChange}
                  onBlur={saveDescription}
              />
          </div>
      );
  };

  const hasChildren = node.childrenIds.length > 0;

  return (
    <div
      className={`absolute group ${isDimmed ? 'opacity-10 grayscale pointer-events-none' : ''}`}
      data-node-id={node.id}
      style={{ 
        left: node.position.x,
        top: node.position.y,
        transform: 'translate(-50%, -50%)',
        zIndex: isSelected || isHighlighted ? 50 : 10,
      }}
      onMouseDown={(e) => {
          if (e.button === 2) return; 
          e.stopPropagation();
          onMouseDown(e, node.id);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={(e) => { e.stopPropagation(); if(!node.locked && !isListMode && !isCode && !isTable) onEditStart(node.id); }}
      onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, node.id);
      }}
    >
      {node.locked && (
        <div className="absolute -top-3 -right-3 z-30 bg-gray-800 text-white p-1.5 rounded-full shadow border border-white/20">
          <Icon.Lock size={12} />
        </div>
      )}
      
      {node.data?.presentationItems && node.data.presentationItems.length > 0 && (
          <div 
            onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setIsDataDrawerOpen(!isDataDrawerOpen); }}
            onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
            className={`
                absolute -top-2 -right-2 z-40 
                bg-white text-indigo-600 hover:text-white hover:bg-indigo-600
                w-6 h-6 flex items-center justify-center rounded-full shadow-sm border border-indigo-100 
                cursor-pointer transition-all duration-200
            `}
            title="Toggle Data Drawer"
          >
              <Icon.Layers size={14} />
          </div>
      )}

      {/* --- SIDE CONTROLS (ADD CHILD, LINK, EXPAND) --- */}
      <div 
        className={`absolute right-[-24px] top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 z-50 transition-opacity duration-200 
            ${isHovered || isSelected ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onMouseDown={(e) => e.stopPropagation()} // Prevent node drag when clicking controls
      >
          {/* Add Child (Triangle Up) */}
          <button
             onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
             className="w-5 h-5 bg-white hover:bg-blue-50 text-gray-400 hover:text-blue-500 rounded-full shadow-sm border border-gray-200 flex items-center justify-center transition-colors"
             title="Add Child Node"
          >
             <Icon.Plus size={12} strokeWidth={3} />
          </button>

          {/* Expand/Collapse (Middle) */}
          {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); if(onToggleExpand) onToggleExpand(node.id); }}
                className="w-5 h-5 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 rounded-full shadow-sm border border-gray-200 flex items-center justify-center transition-colors"
                title={isExpanded ? "Collapse Branch" : "Expand Branch"}
              >
                  {isExpanded ? <Icon.ChevronLeft size={14} /> : <Icon.ChevronRight size={14} />}
              </button>
          ) : (
              <div className="w-1 h-4 bg-gray-200 rounded-full" />
          )}

          {/* Link (Triangle Down/Right) */}
          <button
             onMouseDown={(e) => { 
                 e.stopPropagation(); 
                 e.preventDefault(); 
                 if(onStartLink) onStartLink(e, node.id); 
             }}
             className="w-5 h-5 bg-white hover:bg-green-50 text-gray-400 hover:text-green-500 rounded-full shadow-sm border border-gray-200 flex items-center justify-center transition-colors cursor-crosshair"
             title="Drag to Link"
          >
             <Icon.Arrow size={12} strokeWidth={3} className="-rotate-45 translate-x-0.5 translate-y-0.5" />
          </button>
      </div>

      {/* 3. DESCRIPTION DRAWER TOGGLE (v) - BOTTOM CENTER */}
      <div 
        onClick={(e) => { e.stopPropagation(); setIsDescriptionOpen(!isDescriptionOpen); }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`
            absolute -bottom-3 left-1/2 -translate-x-1/2 z-40
            w-8 h-4 bg-white/90 border border-gray-200 border-t-0 rounded-b-lg shadow-sm
            flex items-center justify-center cursor-pointer hover:bg-gray-50 hover:text-blue-600 text-gray-400
            transition-all duration-200 opacity-0 group-hover:opacity-100
            ${isDescriptionOpen ? 'opacity-100 bg-yellow-50 text-yellow-600 border-yellow-200' : ''}
        `}
        title="Toggle Description"
      >
          {isDescriptionOpen ? <Icon.ChevronUp size={14} /> : <Icon.ChevronDown size={14} />}
      </div>

      {renderPresentationDrawer()}
      {renderDescriptionDrawer()}
      
      {isDreaming && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur text-purple-600 px-3 py-1 rounded-full shadow-lg border border-purple-200 flex items-center gap-2 animate-bounce">
            <Icon.Sparkles size={14} className="animate-spin" />
            <span className="text-xs font-bold whitespace-nowrap">Dreaming...</span>
        </div>
      )}

      {hasExternalLink && !isEditing && (
          <div 
            className="absolute -top-3 -left-3 z-30 bg-blue-500 text-white p-1.5 rounded-full shadow hover:scale-110 cursor-pointer transition-transform border border-white/20"
            onClick={openExternalLink}
            title={`Open: ${node.data?.url}`}
          >
              <Icon.ExternalLink size={12} />
          </div>
      )}

      {/* PARENT WRAPPER FOR BACKPLATE + MAIN CONTENT */}
      <div className="relative">
          
          {isClipped && (isSelected || isHighlighted) && (
             <div 
               className={`absolute inset-0 transition-transform duration-200 ${isSelected ? 'bg-blue-500' : 'bg-yellow-400'}`}
               style={{
                   clipPath: clipPath,
                   transform: 'scale(1.1)', 
                   zIndex: -1, 
                   opacity: 0.8
               }}
             />
          )}

          <div
            className={`
              relative cursor-pointer select-none
              ${baseColorClass}
              ${shapeClass}
              ${sizeClass}
              ${connectMode ? 'cursor-crosshair hover:ring-4 hover:ring-green-400' : ''}
              ${node.locked ? 'cursor-not-allowed opacity-80' : ''}
              ${!isClipped ? shadowClass : ''} 
            `}
            style={{ 
              clipPath: clipPath,
              ...customStyle
            }}
          >
            {!isNote && !hasImage && !isUrlLabel && !isTask && !isCode && !isTable && (
                <div 
                    className="absolute inset-0 pointer-events-none z-0 mix-blend-overlay"
                    style={{
                        background: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 60%)'
                    }}
                />
            )}
            
            {hasImage && (
              <div className="relative w-full h-full flex items-center justify-center">
                  <img 
                    src={node.data!.imageUrl} 
                    alt="Node Media" 
                    className={`w-full h-auto max-h-[300px] object-contain rounded mb-2 pointer-events-none dark:invert-0 relative z-10 ${isDreaming ? 'opacity-50 blur-sm' : ''}`}
                  />
                  {isDreaming && (
                       <div className="absolute inset-0 flex items-center justify-center z-20">
                            <Icon.Sparkles size={32} className="text-white animate-spin" />
                       </div>
                  )}
                  {!isEditing && node.label && hasImage && (
                       <div className="absolute bottom-2 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 text-center backdrop-blur-sm mx-2 rounded">
                           {node.label}
                       </div>
                  )}
              </div>
            )}

            {isCode && (
              <div className="w-full h-full flex flex-col">
                  <div className="bg-[#2d2d2d] px-3 py-2 flex items-center justify-between border-b border-gray-700 rounded-t-lg">
                    <div className="flex gap-1.5 items-center">
                        <div className="w-3 h-3 rounded-full bg-red-500"/>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"/>
                        <div className="w-3 h-3 rounded-full bg-green-500"/>
                        <span className="text-xs text-gray-400 font-mono ml-2">{node.data?.codeLanguage || 'JavaScript'}</span>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); runCode(); }}
                        className="text-green-400 hover:text-green-300 p-1 hover:bg-white/10 rounded transition-colors"
                        title="Run Code"
                    >
                        <Icon.Play size={14} fill="currentColor" />
                    </button>
                  </div>
                  <textarea 
                    className="flex-1 bg-[#1e1e1e] text-gray-300 font-mono text-xs p-3 resize-none outline-none border-0 min-h-[150px] custom-scrollbar leading-normal"
                    value={codeVal}
                    onChange={handleCodeChange}
                    onMouseDown={(e) => e.stopPropagation()}
                    onBlur={saveCode}
                    spellCheck={false}
                  />
                  {node.data?.codeOutput && (
                      <div className="bg-black p-3 border-t border-gray-700 font-mono text-[10px] text-green-400 max-h-[100px] overflow-y-auto whitespace-pre-wrap">
                          {node.data.codeOutput}
                      </div>
                  )}
              </div>
            )}

            {isTable && (
              <div className="w-full h-full flex flex-col bg-white rounded-lg overflow-hidden">
                  <div className="bg-gray-100 p-2 border-b border-gray-200 font-bold text-xs text-center text-gray-600 uppercase tracking-wider flex items-center justify-between">
                    <span className="pl-2">{node.label}</span>
                    <span className="text-[9px] text-gray-400">{tableRows.length}x{tableRows[0]?.length}</span>
                  </div>
                  <div className="p-0 overflow-x-auto custom-scrollbar">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr>
                              {tableRows[0].map((h, i) => (
                                <th 
                                    key={i} 
                                    className="border border-gray-300 p-0 bg-gray-50 min-w-[60px]"
                                >
                                    {editingCell?.r === 0 && editingCell?.c === i ? (
                                        <input 
                                            autoFocus
                                            value={localCellVal}
                                            onChange={(e) => setLocalCellVal(e.target.value)}
                                            onBlur={handleCellEditEnd}
                                            onKeyDown={(e) => e.key === 'Enter' && handleCellEditEnd()}
                                            className="w-full h-full p-1 bg-white outline-none font-bold text-center"
                                        />
                                    ) : (
                                        <div 
                                            onDoubleClick={(e) => { e.stopPropagation(); handleCellEditStart(0, i, h); }}
                                            className="p-1.5 w-full h-full cursor-text text-center"
                                        >
                                            {h}
                                        </div>
                                    )}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.slice(1).map((row, rIdx) => {
                              const actualRowIdx = rIdx + 1;
                              return (
                                  <tr key={actualRowIdx}>
                                    {row.map((cell, cIdx) => (
                                        <td key={cIdx} className="border border-gray-300 p-0 min-w-[60px]">
                                            {editingCell?.r === actualRowIdx && editingCell?.c === cIdx ? (
                                                <input 
                                                    autoFocus
                                                    value={localCellVal}
                                                    onChange={(e) => setLocalCellVal(e.target.value)}
                                                    onBlur={handleCellEditEnd}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleCellEditEnd()}
                                                    className="w-full h-full p-1 bg-blue-50 outline-none"
                                                />
                                            ) : (
                                                <div 
                                                    onDoubleClick={(e) => { e.stopPropagation(); handleCellEditStart(actualRowIdx, cIdx, cell); }}
                                                    className="p-1.5 w-full h-full cursor-text min-h-[24px]"
                                                >
                                                    {cell}
                                                </div>
                                            )}
                                        </td>
                                    ))}
                                  </tr>
                              );
                          })}
                        </tbody>
                    </table>
                  </div>
                  <div className="bg-gray-50 p-1 text-[9px] text-center text-gray-400 italic border-t border-gray-200">
                      Double click cells to edit
                  </div>
              </div>
            )}

            {isListMode && (
                <div className="w-full flex flex-col h-full relative z-10 bg-white/50">
                    <div className="flex items-center gap-2 p-3 border-b border-black/10 bg-black/5">
                      <Icon.Layers size={16} className="opacity-50" />
                      {isEditing && editingItemIndex === null ? (
                            <input
                                ref={inputRef as any}
                                value={localLabel}
                                onChange={(e) => setLocalLabel(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={() => { onLabelChange(node.id, localLabel); onEditEnd(); }}
                                className="flex-1 bg-transparent font-bold outline-none min-w-0"
                                onClick={(e) => e.stopPropagation()}
                            />
                      ) : (
                            <span 
                                className="flex-1 font-bold truncate cursor-text"
                                onDoubleClick={(e) => { e.stopPropagation(); onEditStart(node.id); }}
                            >
                                {node.label}
                            </span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); handleAddItem(); }} className="p-1 hover:bg-black/10 rounded">
                          <Icon.Plus size={14} />
                      </button>
                    </div>
                    
                    <div className="flex-col pb-2 min-h-[40px]">
                        {node.data?.items?.map((item, idx) => renderListItem(item, idx))}
                    </div>
                </div>
            )}

            {!isListMode && !isCode && !isTable && (
                isEditing ? (
                  isNote ? (
                    <textarea
                      ref={inputRef as any}
                      value={localLabel}
                      onChange={(e) => setLocalLabel(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={() => { onLabelChange(node.id, localLabel); onEditEnd(); }}
                      className={`bg-transparent font-inherit w-full h-full outline-none resize-none relative z-20 text-slate-900 placeholder-gray-600`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <input
                      ref={inputRef as any}
                      value={localLabel}
                      onChange={(e) => setLocalLabel(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={() => { onLabelChange(node.id, localLabel); onEditEnd(); }}
                      className="bg-transparent text-center font-inherit w-full outline-none relative z-20 placeholder-gray-500"
                      style={{ color: textColor, textShadow }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )
                ) : (
                  (!hasImage && !isUrlLabel && !isTask) && (
                    <div 
                        className={`relative z-10 leading-tight max-w-[300px] break-words ${node.shape === 'triangle' ? 'pt-8' : ''} ${isNote ? 'whitespace-pre-wrap max-h-[300px] overflow-y-auto custom-scrollbar pr-1' : ''}`}
                        style={{ color: textColor, textShadow }}
                        onWheel={(e) => e.stopPropagation()} 
                    >
                      {node.label}
                    </div>
                  )
                )
            )}
            
            {isTask && !isEditing && (
                <div className="flex items-center relative z-10">
                    <div 
                        className={`mr-2 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${node.checked ? 'bg-green-500 border-green-500' : 'border-gray-400 hover:border-blue-500'}`}
                        onClick={(e) => { e.stopPropagation(); onToggleTask(node.id); }}
                    >
                        {node.checked && <Icon.Task size={14} className="text-white" />}
                    </div>
                    <div className={node.checked ? 'line-through opacity-50' : ''} style={{ color: textColor }}>{node.label}</div>
                </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default memo(NodeComponent);
