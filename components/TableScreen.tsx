
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';

// --- Types ---

type Direction = 'row' | 'col';
type ContentType = 'text' | 'todo' | 'image' | 'code' | 'draw';

interface Block {
  id: string;
  type: 'leaf' | 'container';
  direction?: Direction; // Only for containers
  children?: Block[];    // Only for containers
  weight: number;        // Flex-grow ratio
  
  // Leaf Properties
  contentType?: ContentType;
  content?: string;      // Text or Code
  imageUrl?: string;
  drawingData?: string;  // Base64 for drawing
  todoItems?: { id: string, text: string, done: boolean }[];
  color?: string;        
}

interface ProjectMetadata {
    id: string;
    name: string;
    lastModified: number;
}

// --- Helpers ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const DEFAULT_BLOCK: Block = {
    id: 'root',
    type: 'leaf',
    weight: 1,
    contentType: 'text',
    content: 'Start typing...',
    color: '#ffffff'
};

const COLORS = ['#ffffff', '#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7', '#f3f4f6', '#fee2e2', '#e0e7ff'];

// --- Drawing Component ---

const DrawingBlock: React.FC<{ 
    initialData?: string, 
    onSave: (data: string) => void,
    color: string
}> = ({ initialData, onSave, color }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const parent = canvas.parentElement;
        if(parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#000000";
            ctxRef.current = ctx;
            
            if (initialData) {
                const img = new Image();
                img.onload = () => ctx.drawImage(img, 0, 0);
                img.src = initialData;
            }
        }
    }, []);

    const startDrawing = ({ nativeEvent }: React.MouseEvent) => {
        const { offsetX, offsetY } = nativeEvent;
        ctxRef.current?.beginPath();
        ctxRef.current?.moveTo(offsetX, offsetY);
        setIsDrawing(true);
    };

    const draw = ({ nativeEvent }: React.MouseEvent) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = nativeEvent;
        ctxRef.current?.lineTo(offsetX, offsetY);
        ctxRef.current?.stroke();
    };

    const stopDrawing = () => {
        ctxRef.current?.closePath();
        setIsDrawing(false);
        if (canvasRef.current) {
            onSave(canvasRef.current.toDataURL());
        }
    };

    return (
        <div className="w-full h-full relative cursor-crosshair bg-white">
            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="w-full h-full block"
            />
            <div className="absolute top-2 right-2 text-[10px] text-gray-400 font-bold pointer-events-none select-none">
                DRAWING CANVAS
            </div>
        </div>
    );
};

// --- Recursive Block Component ---

const BlockRenderer: React.FC<{
  block: Block;
  parentId: string | null;
  parentDirection: Direction | null; 
  index: number;
  totalSiblings: number;
  activeBlockId: string | null;
  onBlockClick: (id: string) => void;
  onSplit: (id: string, dir: Direction) => void;
  onUpdate: (id: string, updates: Partial<Block>) => void;
  onResizeStart: (e: React.MouseEvent, parentId: string, index: number, direction: Direction) => void;
  onDelete: (id: string, parentId: string) => void;
  onSwap: (parentId: string, index1: number, index2: number) => void;
  onRotate: (parentId: string) => void;
}> = ({ block, parentId, parentDirection, index, totalSiblings, activeBlockId, onBlockClick, onSplit, onUpdate, onResizeStart, onDelete, onSwap, onRotate }) => {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  
  // Refs for Portal and Hover Persistence
  const cellRef = useRef<HTMLDivElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{top: number, left: number} | null>(null);

  // Update Toolbar Position
  useEffect(() => {
      const updatePosition = () => {
          if (cellRef.current) {
              const rect = cellRef.current.getBoundingClientRect();
              setToolbarPos({
                  top: rect.top,
                  left: rect.left + rect.width / 2
              });
          }
      };

      if (activeBlockId === block.id || showTypeMenu) {
          updatePosition();
          // Attach listeners to follow scroll/resize
          window.addEventListener('scroll', updatePosition, true);
          window.addEventListener('resize', updatePosition);
      }
      
      return () => {
          window.removeEventListener('scroll', updatePosition, true);
          window.removeEventListener('resize', updatePosition);
      };
  }, [activeBlockId, block.id, showTypeMenu]);

  // --- LEAF NODE (THE CELL) ---
  if (block.type === 'leaf') {
    const isActive = activeBlockId === block.id;
    // CHANGED: Toolbar only shows when active (clicked), NOT on hover
    const showToolbar = isActive || showTypeMenu;

    return (
      <div 
        ref={cellRef}
        className={`relative flex-1 min-w-0 min-h-0 border-r border-b border-gray-200 group transition-all duration-200 ${isActive ? 'z-30 ring-2 ring-inset ring-blue-400 shadow-md' : 'z-0'}`}
        style={{ flexGrow: block.weight, backgroundColor: block.color || '#ffffff' }}
        onClick={(e) => { e.stopPropagation(); onBlockClick(block.id); }}
      >
        {/* Content Renderers */}
        <div className="w-full h-full p-4 overflow-y-auto custom-scrollbar relative z-10">
            {block.contentType === 'text' && (
                <textarea
                    className="w-full h-full resize-none outline-none bg-transparent font-medium text-gray-700 leading-relaxed"
                    value={block.content || ''}
                    onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                    placeholder="Type something..."
                />
            )}

            {block.contentType === 'code' && (
                <div className="w-full h-full font-mono text-sm bg-gray-900 text-green-400 p-4 rounded-lg overflow-hidden flex flex-col shadow-inner">
                    <div className="flex gap-1.5 mb-2 opacity-50">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    </div>
                    <textarea
                        className="w-full h-full resize-none outline-none bg-transparent text-inherit"
                        value={block.content || ''}
                        onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                        placeholder="// Write code..."
                        spellCheck={false}
                    />
                </div>
            )}

            {block.contentType === 'image' && (
                <div className="w-full h-full flex flex-col items-center justify-center">
                    {block.imageUrl ? (
                        <div className="relative w-full h-full group/img">
                            <img src={block.imageUrl} className="w-full h-full object-contain" alt="Block Content" />
                            <button 
                                onClick={() => onUpdate(block.id, { imageUrl: undefined })}
                                className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-red-500"
                            >
                                <Icon.Close size={12} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <Icon.Image size={32} className="text-gray-300" />
                            <input 
                                type="text" 
                                placeholder="Paste Image URL..." 
                                className="border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-blue-500 w-48 text-center bg-white/50"
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter') onUpdate(block.id, { imageUrl: (e.target as HTMLInputElement).value });
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {block.contentType === 'draw' && (
                <div className="w-full h-full border border-gray-200 rounded overflow-hidden shadow-sm">
                    <DrawingBlock 
                        initialData={block.drawingData} 
                        onSave={(data) => onUpdate(block.id, { drawingData: data })}
                        color={block.color || '#000'}
                    />
                </div>
            )}

            {block.contentType === 'todo' && (
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Task List</h3>
                    {block.todoItems?.map((item, idx) => (
                        <div key={item.id} className="flex items-center gap-2 group/item">
                            <input 
                                type="checkbox" 
                                checked={item.done}
                                onChange={() => {
                                    const newItems = [...(block.todoItems || [])];
                                    newItems[idx].done = !newItems[idx].done;
                                    onUpdate(block.id, { todoItems: newItems });
                                }}
                                className="accent-blue-500 w-4 h-4 cursor-pointer"
                            />
                            <input 
                                type="text"
                                value={item.text}
                                onChange={(e) => {
                                    const newItems = [...(block.todoItems || [])];
                                    newItems[idx].text = e.target.value;
                                    onUpdate(block.id, { todoItems: newItems });
                                }}
                                className={`flex-1 bg-transparent outline-none text-sm ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}
                            />
                            <button 
                                onClick={() => {
                                    const newItems = [...(block.todoItems || [])];
                                    newItems.splice(idx, 1);
                                    onUpdate(block.id, { todoItems: newItems });
                                }}
                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity"
                            >
                                <Icon.Close size={14} />
                            </button>
                        </div>
                    ))}
                    <button 
                        onClick={() => {
                            const newItems = [...(block.todoItems || []), { id: generateId(), text: '', done: false }];
                            onUpdate(block.id, { todoItems: newItems });
                        }}
                        className="text-xs text-blue-500 font-bold flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded w-fit mt-2"
                    >
                        <Icon.Plus size={12} /> Add Item
                    </button>
                </div>
            )}
        </div>
        
        {/* --- FLOATING TOOLBAR (PORTAL) --- */}
        {showToolbar && toolbarPos && createPortal(
            <div 
                className="fixed z-[9999] flex flex-col items-center animate-pop"
                style={{
                    top: toolbarPos.top - 10,
                    left: toolbarPos.left,
                    transform: 'translate(-50%, -100%)'
                }}
                onMouseDown={(e) => e.stopPropagation()} 
            >
               <div className="flex items-center gap-1 bg-white shadow-clay-lg border border-gray-200 rounded-xl p-1.5 select-none transition-all">
                   {/* Type Switcher */}
                   <div className="relative">
                       <button 
                         onClick={() => setShowTypeMenu(!showTypeMenu)}
                         className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800"
                         title="Change Type"
                       >
                           {block.contentType === 'text' && <Icon.AlignLeft size={16} />}
                           {block.contentType === 'image' && <Icon.Image size={16} />}
                           {block.contentType === 'todo' && <Icon.Task size={16} />}
                           {block.contentType === 'code' && <Icon.Code size={16} />}
                           {block.contentType === 'draw' && <Icon.Pen size={16} />}
                       </button>
                       {showTypeMenu && (
                           <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden flex flex-col min-w-[140px] z-[110] animate-pop">
                               {['text', 'todo', 'image', 'code', 'draw'].map((t) => (
                                   <button 
                                       key={t}
                                       onClick={() => { onUpdate(block.id, { contentType: t as ContentType }); setShowTypeMenu(false); }}
                                       className={`px-3 py-2 text-xs font-bold text-left hover:bg-gray-50 capitalize flex items-center gap-2 ${block.contentType === t ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}
                                   >
                                       {t === 'text' && <Icon.AlignLeft size={14} />}
                                       {t === 'todo' && <Icon.Task size={14} />}
                                       {t === 'image' && <Icon.Image size={14} />}
                                       {t === 'code' && <Icon.Code size={14} />}
                                       {t === 'draw' && <Icon.Pen size={14} />}
                                       {t}
                                   </button>
                               ))}
                           </div>
                       )}
                   </div>

                   <div className="w-px h-4 bg-gray-200 mx-1" />

                   {/* Presets + Color Picker */}
                   <div className="flex items-center gap-1">
                       {COLORS.map(c => (
                           <button 
                                key={c}
                                onClick={() => onUpdate(block.id, { color: c })}
                                className={`w-4 h-4 rounded-full border border-gray-200 hover:scale-110 transition-transform ${block.color === c ? 'ring-1 ring-blue-400 scale-110' : ''}`}
                                style={{ backgroundColor: c }}
                           />
                       ))}
                       <div className="relative w-5 h-5 rounded-full overflow-hidden border border-gray-200 hover:scale-110 transition-transform ml-1">
                           <div className="absolute inset-0 bg-[conic-gradient(at_center,_red,_yellow,_green,_blue,_purple,_red)] opacity-50" />
                           <input 
                              type="color" 
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              value={block.color || '#ffffff'}
                              onChange={(e) => onUpdate(block.id, { color: e.target.value })}
                           />
                       </div>
                   </div>
                   
                   <div className="w-px h-4 bg-gray-200 mx-1" />

                   {/* Layout Actions (Split, Delete) - Removed Swap/Rotate from here as per request */}
                   <button onClick={() => onSplit(block.id, 'col')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-blue-600" title="Split Vertical"><Icon.Layout size={16} className="rotate-90"/></button>
                   <button onClick={() => onSplit(block.id, 'row')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-blue-600" title="Split Horizontal"><Icon.Layout size={16}/></button>
                   
                   <div className="w-px h-4 bg-gray-200 mx-1" />
                   
                   <button onClick={() => parentId && onDelete(block.id, parentId)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg" title="Delete Block"><Icon.Trash size={16}/></button>
               </div>
               
               {/* Invisible Bridge Area */}
               <div className="h-4 w-full bg-transparent" />
            </div>,
            document.body
        )}
      </div>
    );
  }

  // --- CONTAINER NODE (ROW/COL WRAPPER) ---
  const isRow = block.direction === 'row';
  
  return (
    <div 
      className={`flex flex-1 min-w-0 min-h-0 ${isRow ? 'flex-row' : 'flex-col'}`} 
      style={{ flexGrow: block.weight }}
    >
      {block.children?.map((child, i) => (
        <React.Fragment key={child.id}>
          {i > 0 && (
            <div
              className={`
                relative z-40 flex-shrink-0 bg-gray-200 hover:bg-blue-500 transition-colors group/divider select-none
                ${isRow ? 'w-1 cursor-col-resize h-auto' : 'h-1 cursor-row-resize w-auto'}
                flex items-center justify-center
              `}
              onMouseDown={(e) => onResizeStart(e, block.id, i - 1, block.direction!)}
            >
               {/* Invisible Grab Area - Widened for easier grabbing */}
               <div className={`absolute ${isRow ? '-left-3 -right-3 h-full' : '-top-3 -bottom-3 w-full'} z-40`} />
               
               {/* Divider Action Buttons - Only on Hover of the divider area */}
               {/* The white background ensures the line doesn't cut through the icon visually */}
               <div 
                  className={`
                    absolute z-50 flex items-center gap-1 p-1 bg-white border border-gray-300 shadow-sm rounded-full
                    opacity-0 group-hover/divider:opacity-100 transition-opacity duration-200
                    ${isRow ? 'flex-col top-1/2 -translate-y-1/2' : 'flex-row left-1/2 -translate-x-1/2'}
                  `}
                  onMouseDown={(e) => e.stopPropagation()} // Prevent drag start when clicking buttons
               >
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSwap(block.id, i - 1, i); }} 
                    className="p-1 hover:bg-gray-100 rounded-full text-gray-500 hover:text-blue-600"
                    title="Swap Blocks"
                  >
                    <Icon.Move size={12} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onRotate(block.id); }} 
                    className="p-1 hover:bg-gray-100 rounded-full text-gray-500 hover:text-purple-600"
                    title="Rotate Parent Layout"
                  >
                    <Icon.Redo size={12} />
                  </button>
               </div>
            </div>
          )}
          <BlockRenderer 
            block={child} 
            parentId={block.id} 
            parentDirection={block.direction || null}
            index={i} 
            totalSiblings={block.children?.length || 0}
            activeBlockId={activeBlockId}
            onBlockClick={onBlockClick}
            onSplit={onSplit} 
            onUpdate={onUpdate} 
            onResizeStart={onResizeStart}
            onDelete={onDelete}
            onSwap={onSwap}
            onRotate={onRotate}
          />
        </React.Fragment>
      ))}
    </div>
  );
};

// --- MAIN SCREEN ---

export const TableScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [root, setRoot] = useState<Block>(DEFAULT_BLOCK);
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  
  // Undo/Redo History
  const [history, setHistory] = useState<Block[]>([]);
  const [future, setFuture] = useState<Block[]>([]);
  
  // UI State
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string, name: string} | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [tempProjectName, setTempProjectName] = useState('');

  // IMPORTANT: Root Ref for Event Handlers to avoid Stale Closures
  const rootRef = useRef(root);
  useEffect(() => {
      rootRef.current = root;
  }, [root]);

  // Drag State
  const dragInfo = useRef<{ 
    parentId: string; 
    index: number; 
    direction: Direction; 
    startPos: number; 
    startWeights: [number, number]; 
    containerSize: number;
  } | null>(null);

  // Load Projects on Mount
  useEffect(() => {
      const storedProjects = localStorage.getItem('singularity-block-projects');
      if (storedProjects) {
          const parsed = JSON.parse(storedProjects);
          setProjects(parsed);
          if (parsed.length > 0) {
              loadProject(parsed[0].id);
          } else {
              createProject();
          }
      } else {
          createProject();
      }
  }, []);

  // Save State Function (doesn't change history)
  const saveState = (newRoot: Block) => {
      setRoot(newRoot);
      if (currentProjectId) {
          localStorage.setItem(`singularity-block-${currentProjectId}`, JSON.stringify(newRoot));
          
          // Update last modified
          setProjects(prev => {
              const next = prev.map(p => p.id === currentProjectId ? { ...p, lastModified: Date.now() } : p);
              localStorage.setItem('singularity-block-projects', JSON.stringify(next));
              return next;
          });
      }
  };

  // Push to history then save
  const pushState = (newRoot: Block) => {
      setHistory(prev => [...prev.slice(-49), root]); // Limit 50
      setFuture([]); // Clear redo
      saveState(newRoot);
  };

  const undo = () => {
      if (history.length === 0) return;
      const previous = history[history.length - 1];
      const newHistory = history.slice(0, -1);
      setFuture(prev => [root, ...prev]);
      setHistory(newHistory);
      saveState(previous);
  };

  const redo = () => {
      if (future.length === 0) return;
      const next = future[0];
      const newFuture = future.slice(1);
      setHistory(prev => [...prev, root]);
      setFuture(newFuture);
      saveState(next);
  };

  // --- Project Actions ---

  const createProject = () => {
      const id = generateId();
      const newProject: ProjectMetadata = { id, name: 'Untitled Project', lastModified: Date.now() };
      const newRoot: Block = { ...DEFAULT_BLOCK, id: generateId() }; // Fresh ID
      
      const newProjects = [newProject, ...projects];
      setProjects(newProjects);
      localStorage.setItem('singularity-block-projects', JSON.stringify(newProjects));
      localStorage.setItem(`singularity-block-${id}`, JSON.stringify(newRoot));
      
      setCurrentProjectId(id);
      setRoot(newRoot);
      setHistory([]);
      setFuture([]);
  };

  const loadProject = (id: string) => {
      const stored = localStorage.getItem(`singularity-block-${id}`);
      if (stored) {
          setCurrentProjectId(id);
          setRoot(JSON.parse(stored));
          setHistory([]);
          setFuture([]);
      }
  };

  const deleteProject = () => {
      if (!deleteConfirm) return;
      const id = deleteConfirm.id;
      
      const newProjects = projects.filter(p => p.id !== id);
      setProjects(newProjects);
      localStorage.setItem('singularity-block-projects', JSON.stringify(newProjects));
      localStorage.removeItem(`singularity-block-${id}`);
      
      if (currentProjectId === id) {
          if (newProjects.length > 0) loadProject(newProjects[0].id);
          else createProject();
      }
      setDeleteConfirm(null);
      setDeleteInput('');
  };

  const saveProjectName = () => {
      if (!editingProjectId) return;
      const newProjects = projects.map(p => p.id === editingProjectId ? { ...p, name: tempProjectName } : p);
      setProjects(newProjects);
      localStorage.setItem('singularity-block-projects', JSON.stringify(newProjects));
      setEditingProjectId(null);
  };

  // --- Block Actions ---

  const handleSplit = (targetId: string, splitDir: Direction) => {
    const clone = JSON.parse(JSON.stringify(root));
    const splitRecursive = (node: Block): boolean => {
      if (node.type === 'leaf') {
        if (node.id === targetId) {
          node.type = 'container';
          node.direction = splitDir;
          node.children = [
            { id: generateId(), type: 'leaf', weight: 1, contentType: node.contentType, content: node.content, imageUrl: node.imageUrl, drawingData: node.drawingData, todoItems: node.todoItems, color: node.color },
            { id: generateId(), type: 'leaf', weight: 1, contentType: 'text', content: '', color: '#ffffff' }
          ];
          // Clear leaf props from container
          delete node.content; delete node.imageUrl; delete node.todoItems; delete node.contentType; delete node.drawingData;
          return true;
        }
        return false;
      }
      if (node.children) {
        for (const child of node.children) if (splitRecursive(child)) return true;
      }
      return false;
    };
    splitRecursive(clone);
    pushState(clone);
  };

  const handleUpdate = (id: string, updates: Partial<Block>) => {
    const clone = JSON.parse(JSON.stringify(root));
    const updateRecursive = (node: Block) => {
      if (node.id === id) { Object.assign(node, updates); return; }
      node.children?.forEach(updateRecursive);
    };
    updateRecursive(clone);
    if (updates.content !== undefined) {
        saveState(clone); // Save but don't fill history
    } else {
        pushState(clone);
    }
  };

  const handleDelete = (id: string, parentId: string) => {
      const clone = JSON.parse(JSON.stringify(root));
      const deleteRecursive = (node: Block) => {
          if (node.id === parentId && node.children) {
              const idx = node.children.findIndex(c => c.id === id);
              if (idx !== -1) {
                  const deletedWeight = node.children[idx].weight;
                  node.children.splice(idx, 1);
                  if (node.children.length > 0) {
                      const siblingIdx = Math.max(0, idx - 1);
                      node.children[siblingIdx].weight += deletedWeight;
                  }
                  if (node.children.length === 1 && node.id !== 'root') {
                      const survivor = node.children[0];
                      Object.assign(node, survivor); // Promote child
                  }
                  return true;
              }
          }
          if (node.children) {
              for (const child of node.children) if (deleteRecursive(child)) return true;
          }
          return false;
      };
      deleteRecursive(clone);
      pushState(clone);
  };

  const handleSwap = (parentId: string, idx1: number, idx2: number) => {
      const clone = JSON.parse(JSON.stringify(root));
      const swapRecursive = (node: Block) => {
          if (node.id === parentId && node.children) {
              if (node.children[idx1] && node.children[idx2]) {
                  const temp = node.children[idx1];
                  node.children[idx1] = node.children[idx2];
                  node.children[idx2] = temp;
                  return true;
              }
          }
          if (node.children) {
              for (const child of node.children) if (swapRecursive(child)) return true;
          }
          return false;
      }
      swapRecursive(clone);
      pushState(clone);
  };

  const handleRotate = (parentId: string) => {
      const clone = JSON.parse(JSON.stringify(root));
      const rotateRecursive = (node: Block) => {
          if (node.id === parentId && node.type === 'container') {
              node.direction = node.direction === 'row' ? 'col' : 'row';
              return true;
          }
          if (node.children) {
              for (const child of node.children) if (rotateRecursive(child)) return true;
          }
          return false;
      };
      rotateRecursive(clone);
      pushState(clone);
  };

  // --- Resize Logic (Robust & Fixed) ---

  const handleResizeStart = (e: React.MouseEvent, parentId: string, index: number, direction: Direction) => {
    e.preventDefault();
    e.stopPropagation();
    
    const resizerEl = e.currentTarget;
    const containerEl = resizerEl.parentElement; 
    
    if (!containerEl) return;
    
    const rect = containerEl.getBoundingClientRect();
    const size = direction === 'row' ? rect.width : rect.height;

    // Find the current weights in the data structure
    const findWeights = (node: Block): [number, number] | null => {
        if (node.id === parentId && node.children) {
            return [node.children[index].weight, node.children[index + 1].weight];
        }
        if (node.children) {
            for (const child of node.children) {
                const res = findWeights(child);
                if (res) return res;
            }
        }
        return null;
    };

    const weights = findWeights(root);
    if (!weights) return;

    dragInfo.current = {
      parentId,
      index,
      direction,
      startPos: direction === 'row' ? e.clientX : e.clientY,
      startWeights: weights,
      containerSize: size
    };

    // Apply global cursor to prevent flicker
    document.body.style.cursor = direction === 'row' ? 'col-resize' : 'row-resize';
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!dragInfo.current) return;
    e.preventDefault(); 

    const { parentId, index, direction, startPos, startWeights, containerSize } = dragInfo.current;
    const currentPos = direction === 'row' ? e.clientX : e.clientY;
    const deltaPixels = currentPos - startPos;
    
    // Calculate new weights
    const sumWeights = startWeights[0] + startWeights[1]; 
    const deltaWeight = (deltaPixels / containerSize) * sumWeights;
    
    const newW1 = Math.max(0.05, startWeights[0] + deltaWeight);
    const newW2 = Math.max(0.05, startWeights[1] - deltaWeight);

    // Update using callback form to ensure we don't need 'root' dependency here
    setRoot(prev => {
        const clone = JSON.parse(JSON.stringify(prev));
        const updateWeights = (node: Block) => {
            if (node.id === parentId && node.children) {
                node.children[index].weight = newW1;
                node.children[index + 1].weight = newW2;
                return true;
            }
            if (node.children) for (const child of node.children) if (updateWeights(child)) return true;
            return false;
        };
        updateWeights(clone);
        return clone;
    });
  }, []);

  const handleResizeEnd = useCallback(() => {
    if (dragInfo.current) {
        // CRITICAL FIX: Save the LATEST state from ref, not the stale closure state
        pushState(rootRef.current);
    }
    dragInfo.current = null;
    document.body.style.cursor = ''; // Reset cursor
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, []); // Empty dependency array ensures this function instance is stable and not recreated

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              e.preventDefault();
              undo();
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
              e.preventDefault();
              redo();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, future, root]);

  return (
    <div className="flex h-screen w-full bg-[#f0f4f8] font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-white border-r border-gray-200 transition-all duration-300 flex flex-col shrink-0 overflow-hidden relative z-20 shadow-xl`}>
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="font-bold text-gray-700 flex items-center gap-2 text-sm uppercase tracking-wider"><Icon.Grid size={16} className="text-teal-500"/> Projects</h2>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon.ChevronsLeft size={18} /></button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
              <button 
                  onClick={createProject}
                  className="m-3 w-[calc(100%-24px)] py-2 bg-teal-600 text-white rounded-lg font-bold text-xs shadow-md hover:bg-teal-700 flex items-center justify-center gap-2 transition-all"
              >
                  <Icon.Plus size={14} /> New Block Project
              </button>

              <div className="space-y-1 p-2">
                  {projects.map(p => (
                      <div 
                          key={p.id}
                          className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${currentProjectId === p.id ? 'bg-teal-50 border border-teal-200' : 'hover:bg-gray-100 border border-transparent'}`}
                          onClick={() => loadProject(p.id)}
                      >
                          {editingProjectId === p.id ? (
                              <input 
                                  autoFocus
                                  value={tempProjectName}
                                  onChange={(e) => setTempProjectName(e.target.value)}
                                  onBlur={saveProjectName}
                                  onKeyDown={(e) => e.key === 'Enter' && saveProjectName()}
                                  className="bg-white border border-teal-300 rounded px-1 py-0.5 text-xs w-full"
                                  onClick={(e) => e.stopPropagation()}
                              />
                          ) : (
                              <div className="flex flex-col min-w-0">
                                  <span className={`text-xs font-bold truncate ${currentProjectId === p.id ? 'text-teal-700' : 'text-gray-700'}`}>{p.name}</span>
                                  <span className="text-[10px] text-gray-400">{new Date(p.lastModified).toLocaleDateString()}</span>
                              </div>
                          )}
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); setEditingProjectId(p.id); setTempProjectName(p.name); }} className="p-1 hover:bg-white rounded text-gray-400 hover:text-blue-500"><Icon.Edit size={12}/></button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({id: p.id, name: p.name}); }} className="p-1 hover:bg-white rounded text-gray-400 hover:text-red-500"><Icon.Trash size={12}/></button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm z-30">
            <div className="flex items-center gap-4">
                {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><Icon.PanelLeft size={20} /></button>}
                <div className="flex items-center gap-2 text-gray-400">
                    <button onClick={onBack} className="hover:text-gray-600"><Icon.Arrow size={20} className="rotate-180"/></button>
                    <span className="w-px h-4 bg-gray-300 mx-1"></span>
                    <h1 className="font-display font-bold text-lg text-gray-800 truncate">{projects.find(p => p.id === currentProjectId)?.name}</h1>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <button onClick={undo} disabled={history.length === 0} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 disabled:opacity-30 transition-colors" title="Undo (Ctrl+Z)"><Icon.Undo size={18} /></button>
                <button onClick={redo} disabled={future.length === 0} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 disabled:opacity-30 transition-colors" title="Redo (Ctrl+Y)"><Icon.Redo size={18} /></button>
                <div className="w-px h-6 bg-gray-200 mx-2"></div>
                <button 
                    onClick={() => { if(confirm("Clear everything?")) { const fresh = {...DEFAULT_BLOCK, id: generateId()}; setRoot(fresh); pushState(fresh); }}}
                    className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100"
                >
                    Reset Canvas
                </button>
            </div>
          </div>

          <div 
            className="flex-1 p-8 overflow-hidden flex flex-col relative bg-[#f8f9fa]"
            onClick={() => setActiveBlockId(null)}
          >
             {/* The Container - Added top padding to allow room for floating toolbar on top blocks */}
             {/* CHANGED: Removed overflow-hidden to allow toolbar to spill out. Increased margin-top. */}
             <div ref={containerRef} className="flex-1 bg-white border border-gray-300 shadow-xl rounded-xl overflow-visible flex flex-col relative ring-4 ring-gray-100 mt-16 mb-4 mx-4" onClick={(e) => e.stopPropagation()}>
                {/* Visual Header inside container for aesthetics */}
                <div className="absolute top-0 left-0 right-0 h-6 bg-gray-50 border-b border-gray-100 flex items-center px-4 rounded-t-xl">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    </div>
                </div>

                <BlockRenderer 
                  block={root} 
                  parentId={null} 
                  parentDirection={null}
                  index={0} 
                  totalSiblings={0}
                  activeBlockId={activeBlockId}
                  onBlockClick={setActiveBlockId}
                  onSplit={handleSplit}
                  onUpdate={handleUpdate}
                  onResizeStart={handleResizeStart}
                  onDelete={handleDelete}
                  onSwap={handleSwap}
                  onRotate={handleRotate}
                />
             </div>
          </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
            <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-red-600 mb-2">Delete Project?</h3>
                <p className="text-sm text-gray-600 mb-4">
                    Type <b>DELETE</b> to confirm deletion of "{deleteConfirm.name}".
                </p>
                <input 
                    className="w-full border border-gray-300 rounded p-2 mb-4 text-sm font-bold"
                    placeholder="DELETE"
                    value={deleteInput}
                    onChange={e => setDeleteInput(e.target.value)}
                    autoFocus
                />
                <div className="flex gap-2">
                    <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold text-xs text-gray-600">Cancel</button>
                    <button 
                        onClick={deleteProject} 
                        disabled={deleteInput !== 'DELETE'}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};
