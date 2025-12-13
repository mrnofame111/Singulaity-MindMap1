
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from './Icons';
import { GoogleGenAI } from "@google/genai";
import * as htmlToImage from 'html-to-image';

interface BoardScreenProps {
  onBack: () => void;
}

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface Subtask {
    id: string;
    text: string;
    completed: boolean;
}

interface Comment {
    id: string;
    text: string;
    createdAt: number;
    author: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  tags: string[];
  createdAt: number;
  dueDate?: string;
  subtasks: Subtask[]; 
  comments?: Comment[]; // New: Chat/Activity
}

interface Column {
  id: string;
  title: string;
  color: string;
  taskIds: string[];
}

interface BoardData {
  id: string;
  name: string;
  columns: { [key: string]: Column };
  columnOrder: string[];
  tasks: { [key: string]: Task };
  lastModified: number;
}

interface ProjectMeta {
    id: string;
    name: string;
    lastModified: number;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const DEFAULT_COLUMNS = {
    'col-1': { id: 'col-1', title: 'To Do', color: '#6366f1', taskIds: [] },
    'col-2': { id: 'col-2', title: 'In Progress', color: '#f59e0b', taskIds: [] },
    'col-3': { id: 'col-3', title: 'Review', color: '#8b5cf6', taskIds: [] },
    'col-4': { id: 'col-4', title: 'Done', color: '#10b981', taskIds: [] },
};

const DEFAULT_ORDER = ['col-1', 'col-2', 'col-3', 'col-4'];

const PRIORITY_COLORS: Record<Priority, string> = {
    'LOW': 'bg-blue-100 text-blue-700 border-blue-200',
    'MEDIUM': 'bg-yellow-100 text-yellow-700 border-yellow-200',
    'HIGH': 'bg-orange-100 text-orange-700 border-orange-200',
    'CRITICAL': 'bg-red-100 text-red-700 border-red-200 animate-pulse-slow'
};

// --- AI SERVICE FOR BOARD ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const breakdownTaskWithAI = async (taskTitle: string, taskDesc: string) => {
    try {
        const prompt = `
            You are a project manager. Break down the task "${taskTitle}" (${taskDesc}) into 3-6 actionable subtasks.
            Return ONLY a JSON array of strings. Example: ["Step 1", "Step 2"].
        `;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        const text = response.text || "[]";
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return [];
    } catch (e) {
        console.error("AI Breakdown failed", e);
        return ["Analyze requirements", "Create draft", "Review output"];
    }
};

const suggestTagsWithAI = async (taskTitle: string, taskDesc: string) => {
    try {
        const prompt = `
            Suggest 3 short tags (1 word each) and a Priority level (LOW, MEDIUM, HIGH, CRITICAL) for this task: "${taskTitle}" - ${taskDesc}.
            Return JSON: { "tags": ["tag1", "tag2"], "priority": "HIGH" }
        `;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        const text = response.text || "{}";
        const jsonMatch = text.match(/\{.*\}/s);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { tags: [], priority: 'MEDIUM' };
    } catch (e) {
        return { tags: ['General'], priority: 'MEDIUM' };
    }
};

const triggerConfetti = () => {
  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.width = '8px';
    el.style.height = '8px';
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    el.style.borderRadius = '50%';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '9999';
    document.body.appendChild(el);

    const angle = Math.random() * Math.PI * 2;
    const velocity = 8 + Math.random() * 12;
    const dx = Math.cos(angle) * velocity;
    const dy = Math.sin(angle) * velocity;
    
    let x = 0, y = 0, opacity = 1, grav = 0;

    const anim = setInterval(() => {
      x += dx * 0.9; // friction
      y += dy * 0.9 + grav;
      grav += 0.5; // gravity
      opacity -= 0.02;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.opacity = opacity.toString();
      if (opacity <= 0) {
        clearInterval(anim);
        el.remove();
      }
    }, 16);
  }
};

export const BoardScreen: React.FC<BoardScreenProps> = ({ onBack }) => {
  // --- STATE ---
  const boardRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string>('default');
  const [boardData, setBoardData] = useState<BoardData>({
      id: 'default',
      name: 'My Board',
      columns: DEFAULT_COLUMNS,
      columnOrder: DEFAULT_ORDER,
      tasks: {},
      lastModified: Date.now()
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Drag State
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [sourceColId, setSourceColId] = useState<string | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  
  // Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | 'ALL'>('ALL');
  const [showFilters, setShowFilters] = useState(false);

  // Modals / Editing
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'COMMENTS'>('DETAILS');
  const [newComment, setNewComment] = useState('');
  
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeColumnForAdd, setActiveColumnForAdd] = useState<string | null>(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  
  const [tempProjectName, setTempProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

  // --- PERSISTENCE ---
  useEffect(() => {
      const indexStr = localStorage.getItem('singularity-board-index');
      if (indexStr) {
          const loadedIndex = JSON.parse(indexStr);
          setProjects(loadedIndex);
          if (loadedIndex.length > 0) loadBoard(loadedIndex[0].id);
          else createNewBoard();
      } else {
          createNewBoard();
      }
  }, []);

  useEffect(() => {
      const timer = setTimeout(() => {
          if (boardData) {
              localStorage.setItem(`singularity-board-${boardData.id}`, JSON.stringify(boardData));
              setProjects(prev => {
                  const idx = prev.findIndex(p => p.id === boardData.id);
                  if (idx >= 0) {
                      const newArr = [...prev];
                      newArr[idx] = { ...newArr[idx], lastModified: Date.now() };
                      localStorage.setItem('singularity-board-index', JSON.stringify(newArr));
                      return newArr;
                  }
                  return prev;
              });
          }
      }, 1000);
      return () => clearTimeout(timer);
  }, [boardData]);

  // --- ACTIONS ---
  const createNewBoard = () => {
      const id = generateId();
      const newBoard: BoardData = {
          id,
          name: 'New Project',
          columns: DEFAULT_COLUMNS,
          columnOrder: DEFAULT_ORDER,
          tasks: {},
          lastModified: Date.now()
      };
      setBoardData(newBoard);
      setCurrentBoardId(id);
      
      setProjects(prev => {
          const newIndex = [{ id, name: 'New Project', lastModified: Date.now() }, ...prev];
          localStorage.setItem('singularity-board-index', JSON.stringify(newIndex));
          return newIndex;
      });
      localStorage.setItem(`singularity-board-${id}`, JSON.stringify(newBoard));
  };

  const loadBoard = (id: string) => {
      const stored = localStorage.getItem(`singularity-board-${id}`);
      if (stored) {
          setBoardData(JSON.parse(stored));
          setCurrentBoardId(id);
      }
  };

  const handleExport = async () => {
      if (!boardRef.current) return;
      try {
          const dataUrl = await htmlToImage.toPng(boardRef.current, { backgroundColor: '#f3f4f6', pixelRatio: 2 });
          const link = document.createElement('a');
          link.download = `${boardData.name.replace(/\s+/g, '_')}_Board.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } catch (err) {
          console.error("Export failed", err);
          alert("Could not export board image.");
      }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string, colId: string) => {
      e.stopPropagation();
      setDraggedTaskId(taskId);
      setSourceColId(colId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('type', 'TASK');
      e.dataTransfer.setData('taskId', taskId);
  };

  const handleColumnDragStart = (e: React.DragEvent, colId: string) => {
      setDraggedColumnId(colId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('type', 'COLUMN');
      e.dataTransfer.setData('colId', colId);
  };

  const handleDrop = (e: React.DragEvent, targetColId: string) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('type');

      if (type === 'TASK') {
          if (!draggedTaskId || !sourceColId) return;
          if (sourceColId === targetColId) return; 

          const newSourceTaskIds = boardData.columns[sourceColId].taskIds.filter(id => id !== draggedTaskId);
          const newTargetTaskIds = [...boardData.columns[targetColId].taskIds, draggedTaskId];

          setBoardData(prev => ({
              ...prev,
              columns: {
                  ...prev.columns,
                  [sourceColId]: { ...prev.columns[sourceColId], taskIds: newSourceTaskIds },
                  [targetColId]: { ...prev.columns[targetColId], taskIds: newTargetTaskIds }
              }
          }));

          // Trigger Confetti if moving to the last column
          const lastColId = boardData.columnOrder[boardData.columnOrder.length - 1];
          if (targetColId === lastColId) {
              triggerConfetti();
          }

          setDraggedTaskId(null);
          setSourceColId(null);
      } else if (type === 'COLUMN') {
          if (!draggedColumnId) return;
          if (draggedColumnId === targetColId) return;

          const newOrder = [...boardData.columnOrder];
          const oldIdx = newOrder.indexOf(draggedColumnId);
          const newIdx = newOrder.indexOf(targetColId);
          
          newOrder.splice(oldIdx, 1);
          newOrder.splice(newIdx, 0, draggedColumnId);

          setBoardData(prev => ({ ...prev, columnOrder: newOrder }));
          setDraggedColumnId(null);
      }
  };

  const handleAddTask = (colId: string) => {
      setActiveColumnForAdd(colId);
      setEditingTask({
          id: generateId(),
          title: '',
          description: '',
          priority: 'MEDIUM',
          tags: [],
          createdAt: Date.now(),
          subtasks: [],
          comments: []
      });
      setActiveTab('DETAILS');
      setIsTaskModalOpen(true);
  };

  const handleAiBreakdown = async () => {
      if (!editingTask) return;
      setIsGenerating(true);
      const suggestions = await breakdownTaskWithAI(editingTask.title, editingTask.description || '');
      const newSubtasks = suggestions.map((s: string) => ({ id: generateId(), text: s, completed: false }));
      setEditingTask(prev => prev ? { ...prev, subtasks: [...prev.subtasks, ...newSubtasks] } : null);
      setIsGenerating(false);
  };

  const handleAiTagging = async () => {
      if (!editingTask) return;
      setIsGenerating(true);
      const result = await suggestTagsWithAI(editingTask.title, editingTask.description || '');
      setEditingTask(prev => prev ? { ...prev, tags: [...prev.tags, ...result.tags], priority: result.priority as Priority } : null);
      setIsGenerating(false);
  };

  const saveTask = () => {
      if (!editingTask || !activeColumnForAdd) return;
      if (!editingTask.title.trim()) {
          setEditingTask({...editingTask, title: 'Untitled Task'});
      }

      setBoardData(prev => {
          const isEdit = !!prev.tasks[editingTask.id];
          const newTasks = { ...prev.tasks, [editingTask.id]: editingTask };
          
          let newColumns = { ...prev.columns };
          if (!isEdit) {
              newColumns[activeColumnForAdd].taskIds = [...newColumns[activeColumnForAdd].taskIds, editingTask.id];
          }

          return { ...prev, tasks: newTasks, columns: newColumns };
      });
      setIsTaskModalOpen(false);
      setEditingTask(null);
  };

  const deleteTask = (taskId: string, colId: string) => {
      if(!window.confirm("Delete this task?")) return;
      setBoardData(prev => {
          const newTasks = { ...prev.tasks };
          delete newTasks[taskId];
          const newColIds = prev.columns[colId].taskIds.filter(id => id !== taskId);
          return {
              ...prev,
              tasks: newTasks,
              columns: { ...prev.columns, [colId]: { ...prev.columns[colId], taskIds: newColIds } }
          };
      });
  };

  const addColumn = () => {
      const newId = generateId();
      const newCol: Column = { id: newId, title: 'New Column', color: '#94a3b8', taskIds: [] };
      setBoardData(prev => ({
          ...prev,
          columns: { ...prev.columns, [newId]: newCol },
          columnOrder: [...prev.columnOrder, newId]
      }));
  };

  const deleteColumn = (colId: string) => {
      if (Object.keys(boardData.columns).length <= 1) return;
      if (!confirm("Delete column and all its tasks?")) return;
      setBoardData(prev => {
          const newCols = { ...prev.columns };
          const tasksToRemove = newCols[colId].taskIds;
          delete newCols[colId];
          const newTasks = { ...prev.tasks };
          tasksToRemove.forEach(tid => delete newTasks[tid]);
          return {
              ...prev,
              columns: newCols,
              tasks: newTasks,
              columnOrder: prev.columnOrder.filter(id => id !== colId)
          };
      });
  };

  const updateColumnTitle = (colId: string, title: string) => {
      setBoardData(prev => ({
          ...prev,
          columns: { ...prev.columns, [colId]: { ...prev.columns[colId], title } }
      }));
  };

  const handleAddComment = () => {
      if(!newComment.trim() || !editingTask) return;
      const comment: Comment = {
          id: generateId(),
          text: newComment,
          createdAt: Date.now(),
          author: 'Me' 
      };
      setEditingTask({ ...editingTask, comments: [...(editingTask.comments || []), comment] });
      setNewComment('');
  };

  // --- ANALYTICS ---
  const stats = useMemo(() => {
      const allTasks = Object.values(boardData.tasks);
      const total = allTasks.length;
      const doneColId = boardData.columnOrder[boardData.columnOrder.length - 1]; // Assume last col is done
      const completed = boardData.columns[doneColId]?.taskIds.length || 0;
      const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
      
      const byPriority = {
          LOW: allTasks.filter(t => t.priority === 'LOW').length,
          MEDIUM: allTasks.filter(t => t.priority === 'MEDIUM').length,
          HIGH: allTasks.filter(t => t.priority === 'HIGH').length,
          CRITICAL: allTasks.filter(t => t.priority === 'CRITICAL').length,
      };

      return { total, completed, progress, byPriority };
  }, [boardData]);

  const visibleColumns = isFocusMode 
      ? boardData.columnOrder.filter(id => boardData.columns[id].title.toLowerCase().includes('do') || boardData.columns[id].title.toLowerCase().includes('progress'))
      : boardData.columnOrder;

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-gray-800 overflow-hidden">
      
      {/* SIDEBAR */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden shrink-0 relative z-30 shadow-xl`}>
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h2 className="font-bold text-gray-700 flex items-center gap-2 text-sm uppercase tracking-wider"><Icon.Board size={16} className="text-indigo-500"/> My Boards</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon.ChevronLeft size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              <button onClick={createNewBoard} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs shadow-md hover:bg-indigo-700 flex items-center justify-center gap-2 mb-3"><Icon.Plus size={14} /> New Board</button>
              
              {projects.map(p => (
                  <div key={p.id} onClick={() => loadBoard(p.id)} className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${currentBoardId === p.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-100 border border-transparent'}`}>
                      {editingProjectId === p.id ? (
                          <input autoFocus value={tempProjectName} onChange={(e) => setTempProjectName(e.target.value)} onBlur={() => {
                              const newProjects = projects.map(proj => proj.id === p.id ? { ...proj, name: tempProjectName } : proj);
                              setProjects(newProjects);
                              localStorage.setItem('singularity-board-index', JSON.stringify(newProjects));
                              if(currentBoardId === p.id) setBoardData(prev => ({...prev, name: tempProjectName}));
                              setEditingProjectId(null);
                          }} onKeyDown={(e) => e.key === 'Enter' && setEditingProjectId(null)} className="bg-white border border-indigo-300 rounded px-1 py-0.5 text-xs w-full" onClick={e => e.stopPropagation()} />
                      ) : (
                          <div className="flex flex-col min-w-0">
                              <span className={`text-xs font-bold truncate ${currentBoardId === p.id ? 'text-indigo-700' : 'text-gray-700'}`}>{p.name}</span>
                              <span className="text-[10px] text-gray-400">{new Date(p.lastModified).toLocaleDateString()}</span>
                          </div>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); setEditingProjectId(p.id); setTempProjectName(p.name); }} className="p-1 hover:bg-white rounded text-gray-400 hover:text-blue-500"><Icon.Edit size={12}/></button>
                      </div>
                  </div>
              ))}
          </div>
      </div>

      {!isSidebarOpen && (
          <button onClick={() => setIsSidebarOpen(true)} className="absolute top-20 left-4 z-40 p-2 bg-white shadow-md rounded-lg text-gray-500 hover:text-indigo-600 border border-gray-200"><Icon.PanelLeft size={20} /></button>
      )}

      {/* MAIN BOARD */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          {/* Header */}
          <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-20">
              <div className="flex items-center gap-4">
                  <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><Icon.Arrow size={20} className="rotate-180"/></button>
                  <h1 className="font-display font-black text-2xl text-gray-800 tracking-tight">{boardData.name}</h1>
                  
                  {/* SEARCH BAR */}
                  <div className="relative group ml-4 hidden md:block">
                      <Icon.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500" size={16} />
                      <input 
                          type="text" 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search tasks..." 
                          className="pl-10 pr-4 py-2 bg-gray-100 border border-transparent focus:border-indigo-200 focus:bg-white rounded-xl text-sm outline-none transition-all w-64"
                      />
                  </div>
              </div>
              
              <div className="flex items-center gap-3">
                  <button onClick={() => setShowFilters(!showFilters)} className={`p-2 rounded-lg transition-colors ${showFilters || filterPriority !== 'ALL' ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-100 text-gray-500'}`} title="Filters">
                      <Icon.Filter size={20} />
                  </button>
                  
                  <button 
                    onClick={() => setIsAnalyticsOpen(!isAnalyticsOpen)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition-all ${isAnalyticsOpen ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                      <Icon.Table size={16} /> Stats
                  </button>
                  <button 
                    onClick={() => setIsFocusMode(!isFocusMode)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition-all ${isFocusMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                      <Icon.Zap size={16} className={isFocusMode ? "text-yellow-300" : ""} /> {isFocusMode ? 'Focus' : 'Focus'}
                  </button>
                  <button 
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-full font-bold text-xs transition-all"
                  >
                      <Icon.Image size={16} /> Export
                  </button>
              </div>
          </div>

          {/* Filter Toolbar */}
          {showFilters && (
              <div className="h-12 bg-gray-50 border-b border-gray-200 flex items-center px-6 gap-4 animate-slide-up">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Priority:</span>
                  {(['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(p => (
                      <button 
                          key={p}
                          onClick={() => setFilterPriority(p)}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${filterPriority === p ? 'bg-indigo-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                      >
                          {p}
                      </button>
                  ))}
              </div>
          )}

          {/* Analytics Overlay */}
          {isAnalyticsOpen && (
              <div className="absolute top-20 right-6 z-50 bg-white rounded-2xl shadow-clay-xl p-6 w-72 animate-slide-up border border-gray-200">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Project Stats</h3>
                  <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-gray-700">Completion</span>
                      <span className="text-sm font-bold text-indigo-600">{stats.progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full mb-6 overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${stats.progress}%` }} />
                  </div>
                  <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                          <span className="font-medium text-gray-500">Critical Tasks</span>
                          <span className="font-bold text-red-600">{stats.byPriority.CRITICAL}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                          <span className="font-medium text-gray-500">High Priority</span>
                          <span className="font-bold text-orange-600">{stats.byPriority.HIGH}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                          <span className="font-medium text-gray-500">Total Tasks</span>
                          <span className="font-bold text-gray-800">{stats.total}</span>
                      </div>
                  </div>
              </div>
          )}

          {/* Columns Container */}
          <div ref={boardRef} className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-gray-100/50">
              <div className="flex h-full gap-6 min-w-fit">
                  {visibleColumns.map(colId => {
                      const column = boardData.columns[colId];
                      return (
                          <div 
                            key={colId}
                            draggable
                            onDragStart={(e) => handleColumnDragStart(e, colId)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, colId)}
                            className={`flex flex-col w-80 bg-gray-50 rounded-2xl border border-gray-200 max-h-full shadow-sm transition-opacity ${draggedColumnId === colId ? 'opacity-50' : 'opacity-100'}`}
                          >
                              {/* Column Header */}
                              <div className="p-4 flex items-center justify-between shrink-0 group/col-header cursor-grab active:cursor-grabbing">
                                  <div className="flex items-center gap-2 flex-1">
                                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
                                      {editingColumnId === colId ? (
                                          <input 
                                            autoFocus
                                            value={column.title}
                                            onChange={(e) => updateColumnTitle(colId, e.target.value)}
                                            onBlur={() => setEditingColumnId(null)}
                                            onKeyDown={(e) => e.key === 'Enter' && setEditingColumnId(null)}
                                            className="bg-white border border-indigo-300 rounded px-1 text-sm font-bold w-full outline-none"
                                          />
                                      ) : (
                                          <h3 
                                            className="font-bold text-gray-700 cursor-pointer hover:text-indigo-600"
                                            onClick={() => setEditingColumnId(colId)}
                                          >
                                              {column.title}
                                          </h3>
                                      )}
                                      <span className="bg-gray-200 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{column.taskIds.length}</span>
                                  </div>
                                  <div className="flex gap-1 opacity-0 group-hover/col-header:opacity-100 transition-opacity">
                                      <button onClick={() => deleteColumn(colId)} className="p-1 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded"><Icon.Trash size={14} /></button>
                                      <button onClick={() => handleAddTask(colId)} className="p-1 hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 rounded"><Icon.Plus size={14} /></button>
                                  </div>
                              </div>

                              {/* Tasks List */}
                              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 custom-scrollbar">
                                  {column.taskIds.map((taskId, index) => {
                                      const task = boardData.tasks[taskId];
                                      if(!task) return null;
                                      
                                      // Filtering Logic
                                      if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return null;
                                      if (filterPriority !== 'ALL' && task.priority !== filterPriority) return null;

                                      const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0;
                                      const totalSubtasks = task.subtasks?.length || 0;
                                      const progress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

                                      return (
                                          <div
                                              key={taskId}
                                              draggable
                                              onDragStart={(e) => handleDragStart(e, taskId, colId)}
                                              onClick={() => { setActiveColumnForAdd(colId); setEditingTask(task); setIsTaskModalOpen(true); }}
                                              className={`
                                                  group bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-all relative
                                                  ${task.priority === 'CRITICAL' ? 'border-l-4 border-l-red-500' : ''}
                                                  ${draggedTaskId === taskId ? 'opacity-50' : 'opacity-100'}
                                              `}
                                          >
                                              <div className="flex items-start justify-between mb-2">
                                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${PRIORITY_COLORS[task.priority]}`}>
                                                      {task.priority}
                                                  </span>
                                                  <button 
                                                    onClick={(e) => { e.stopPropagation(); deleteTask(taskId, colId); }}
                                                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity p-1"
                                                  >
                                                      <Icon.Trash size={12} />
                                                  </button>
                                              </div>
                                              <h4 className="font-bold text-gray-800 text-sm mb-1 leading-snug">{task.title}</h4>
                                              
                                              {/* Subtask Progress Bar */}
                                              {totalSubtasks > 0 && (
                                                  <div className="mt-2">
                                                      <div className="flex justify-between text-[9px] text-gray-400 font-bold mb-1">
                                                          <span>Progress</span>
                                                          <span>{completedSubtasks}/{totalSubtasks}</span>
                                                      </div>
                                                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                          <div className={`h-full rounded-full ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
                                                      </div>
                                                  </div>
                                              )}

                                              {/* Meta Row */}
                                              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
                                                  <div className="flex gap-1 overflow-hidden">
                                                      {task.tags.map((tag, i) => (
                                                          <span key={i} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium truncate">#{tag}</span>
                                                      ))}
                                                  </div>
                                                  
                                                  <div className="flex items-center gap-2">
                                                      {task.comments && task.comments.length > 0 && (
                                                          <div className="flex items-center gap-0.5 text-gray-400">
                                                              <Icon.Comment size={10} />
                                                              <span className="text-[10px] font-bold">{task.comments.length}</span>
                                                          </div>
                                                      )}
                                                      {task.dueDate && (
                                                          <div className={`text-[10px] font-bold flex items-center gap-1 ${new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                                                              <Icon.Calendar size={10} />
                                                              {new Date(task.dueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                                  <button 
                                    onClick={() => handleAddTask(colId)} 
                                    className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs font-bold hover:border-indigo-300 hover:text-indigo-500 transition-colors flex items-center justify-center gap-2"
                                  >
                                      <Icon.Plus size={14} /> Add Task
                                  </button>
                              </div>
                          </div>
                      );
                  })}
                  
                  {/* New Column Button */}
                  <div 
                    onClick={addColumn}
                    className="w-12 h-full max-h-[80vh] rounded-2xl bg-gray-200/50 hover:bg-gray-200 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer transition-all shrink-0"
                  >
                      <Icon.Plus size={24} />
                  </div>
              </div>
          </div>
      </div>

      {/* TASK MODAL */}
      {isTaskModalOpen && editingTask && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsTaskModalOpen(false)}>
              <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                      <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${PRIORITY_COLORS[editingTask.priority].split(' ')[0]}`} />
                              <h2 className="text-lg font-display font-bold text-gray-800">Task Details</h2>
                          </div>
                          {/* Tabs */}
                          <div className="flex bg-gray-200 rounded-lg p-1">
                              <button 
                                  onClick={() => setActiveTab('DETAILS')}
                                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeTab === 'DETAILS' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}
                              >
                                  Details
                              </button>
                              <button 
                                  onClick={() => setActiveTab('COMMENTS')}
                                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeTab === 'COMMENTS' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}
                              >
                                  Comments ({editingTask.comments?.length || 0})
                              </button>
                          </div>
                      </div>
                      <button onClick={() => setIsTaskModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full text-gray-500"><Icon.Close size={20}/></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      
                      {activeTab === 'DETAILS' ? (
                          <>
                            {/* Title & Description */}
                            <div className="space-y-4">
                                <input 
                                    value={editingTask.title}
                                    onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                                    className="w-full text-2xl font-black text-gray-800 bg-transparent outline-none placeholder-gray-300 border-b-2 border-transparent focus:border-indigo-500 transition-colors py-1"
                                    placeholder="Task Title..."
                                    autoFocus
                                />
                                <textarea 
                                    value={editingTask.description || ''}
                                    onChange={e => setEditingTask({...editingTask, description: e.target.value})}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                                    placeholder="Add a detailed description..."
                                />
                            </div>

                            {/* AI Tools */}
                            <div className="flex justify-end gap-2">
                                <button 
                                    onClick={handleAiTagging}
                                    disabled={isGenerating || !editingTask.title}
                                    className="text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    {isGenerating ? <Icon.Navigation className="animate-spin" size={14}/> : <Icon.Magic size={14}/>}
                                    AI Tags
                                </button>
                                <button 
                                    onClick={handleAiBreakdown}
                                    disabled={isGenerating || !editingTask.title}
                                    className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    {isGenerating ? <Icon.Navigation className="animate-spin" size={14}/> : <Icon.Filter size={14}/>}
                                    AI Subtasks
                                </button>
                            </div>

                            {/* Checklist / Subtasks */}
                            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Checklist</h3>
                                <div className="space-y-2">
                                    {editingTask.subtasks?.map((sub, idx) => (
                                        <div key={sub.id} className="flex items-center gap-3 group">
                                            <input 
                                                type="checkbox" 
                                                checked={sub.completed}
                                                onChange={() => {
                                                    const newSubs = [...(editingTask.subtasks || [])];
                                                    newSubs[idx].completed = !newSubs[idx].completed;
                                                    setEditingTask({...editingTask, subtasks: newSubs});
                                                }}
                                                className="accent-indigo-600 w-4 h-4 cursor-pointer"
                                            />
                                            <input 
                                                value={sub.text}
                                                onChange={(e) => {
                                                    const newSubs = [...(editingTask.subtasks || [])];
                                                    newSubs[idx].text = e.target.value;
                                                    setEditingTask({...editingTask, subtasks: newSubs});
                                                }}
                                                className={`flex-1 bg-transparent border-b border-transparent focus:border-gray-300 outline-none text-sm ${sub.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}
                                            />
                                            <button 
                                                onClick={() => {
                                                    const newSubs = editingTask.subtasks.filter((_, i) => i !== idx);
                                                    setEditingTask({...editingTask, subtasks: newSubs});
                                                }}
                                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                                            >
                                                <Icon.Close size={14}/>
                                            </button>
                                        </div>
                                    ))}
                                    <button 
                                        onClick={() => setEditingTask({...editingTask, subtasks: [...(editingTask.subtasks||[]), { id: generateId(), text: '', completed: false }]})}
                                        className="text-xs font-bold text-gray-500 hover:text-indigo-600 flex items-center gap-1 mt-2"
                                    >
                                        <Icon.Plus size={12}/> Add Item
                                    </button>
                                </div>
                            </div>

                            {/* Metadata Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Priority</label>
                                    <select 
                                        value={editingTask.priority}
                                        onChange={e => setEditingTask({...editingTask, priority: e.target.value as Priority})}
                                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="CRITICAL">Critical</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Due Date</label>
                                    <input 
                                        type="date"
                                        value={editingTask.dueDate || ''}
                                        onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})}
                                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Tags Display */}
                            {editingTask.tags.length > 0 && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tags</label>
                                    <div className="flex flex-wrap gap-2">
                                        {editingTask.tags.map((tag, i) => (
                                            <span key={i} className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                                                {tag}
                                                <button onClick={() => setEditingTask({...editingTask, tags: editingTask.tags.filter((_, idx) => idx !== i)})} className="hover:text-red-500"><Icon.Close size={10}/></button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                          </>
                      ) : (
                          /* COMMENTS TAB */
                          <div className="flex flex-col h-full">
                              <div className="flex-1 space-y-4 mb-4">
                                  {editingTask.comments && editingTask.comments.length > 0 ? (
                                      editingTask.comments.map(comment => (
                                          <div key={comment.id} className="flex gap-3">
                                              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                                  {comment.author[0]}
                                              </div>
                                              <div className="flex-1">
                                                  <div className="bg-gray-50 p-3 rounded-2xl rounded-tl-none border border-gray-100">
                                                      <div className="flex justify-between items-center mb-1">
                                                          <span className="text-xs font-bold text-gray-700">{comment.author}</span>
                                                          <span className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleTimeString()}</span>
                                                      </div>
                                                      <p className="text-sm text-gray-600">{comment.text}</p>
                                                  </div>
                                              </div>
                                          </div>
                                      ))
                                  ) : (
                                      <div className="text-center text-gray-400 py-10 italic text-sm">No comments yet. Start the discussion!</div>
                                  )}
                              </div>
                              <div className="mt-auto">
                                  <div className="flex gap-2">
                                      <input 
                                          value={newComment}
                                          onChange={(e) => setNewComment(e.target.value)}
                                          onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                                          placeholder="Write a comment..."
                                          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                      />
                                      <button 
                                          onClick={handleAddComment}
                                          disabled={!newComment.trim()}
                                          className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 transition-colors"
                                      >
                                          <Icon.Send size={18} />
                                      </button>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
                  
                  <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                      <button onClick={() => setIsTaskModalOpen(false)} className="px-5 py-2.5 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                      <button onClick={saveTask} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all transform active:scale-95">Save Task</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
