
import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from './Icons';
import { GoogleGenAI } from "@google/genai";

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
  dueDate?: string; // ISO Date String YYYY-MM-DD
  subtasks: Subtask[]; 
  comments?: Comment[];
  timeSpent?: number; // In seconds
}

interface Column {
  id: string;
  title: string;
  color: string;
  taskIds: string[];
}

interface AutomationRule {
    id: string;
    triggerColumnId: string;
    actionType: 'SET_PRIORITY' | 'MARK_COMPLETE' | 'SET_COLOR';
    actionValue: string | boolean;
}

interface BoardData {
  id: string;
  name: string;
  columns: { [key: string]: Column };
  columnOrder: string[];
  tasks: { [key: string]: Task };
  lastModified: number;
  automations?: AutomationRule[];
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

const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
};

// Helper for Calendar
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

export const BoardScreen: React.FC<BoardScreenProps> = ({ onBack }) => {
  // --- STATE ---
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string>('default');
  const [boardData, setBoardData] = useState<BoardData>({
      id: 'default',
      name: 'My Board',
      columns: DEFAULT_COLUMNS,
      columnOrder: DEFAULT_ORDER,
      tasks: {},
      lastModified: Date.now(),
      automations: []
  });

  const [viewMode, setViewMode] = useState<'BOARD' | 'CALENDAR'>('BOARD');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Drag State
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [sourceColId, setSourceColId] = useState<string | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  
  // Time Tracking
  const [activeTimerTaskId, setActiveTimerTaskId] = useState<string | null>(null);
  
  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | 'ALL'>('ALL');
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'COMMENTS'>('DETAILS');
  const [newComment, setNewComment] = useState('');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeColumnForAdd, setActiveColumnForAdd] = useState<string | null>(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isAutomationOpen, setIsAutomationOpen] = useState(false);
  
  const [tempProjectName, setTempProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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

  // Timer Tick
  useEffect(() => {
      let interval: any;
      if (activeTimerTaskId) {
          interval = setInterval(() => {
              setBoardData(prev => {
                  const task = prev.tasks[activeTimerTaskId];
                  if (!task) return prev;
                  return {
                      ...prev,
                      tasks: {
                          ...prev.tasks,
                          [activeTimerTaskId]: { ...task, timeSpent: (task.timeSpent || 0) + 1 }
                      }
                  };
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [activeTimerTaskId]);

  // --- ACTIONS ---
  const createNewBoard = () => {
      const id = generateId();
      const newBoard: BoardData = {
          id,
          name: 'New Project',
          columns: DEFAULT_COLUMNS,
          columnOrder: DEFAULT_ORDER,
          tasks: {},
          lastModified: Date.now(),
          automations: []
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

  const handleDragStart = (e: React.DragEvent, taskId: string, colId: string) => {
      e.stopPropagation();
      setDraggedTaskId(taskId);
      setSourceColId(colId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('type', 'TASK');
      e.dataTransfer.setData('taskId', taskId);
      e.dataTransfer.setData('sourceColId', colId);
  };

  const handleColumnDragStart = (e: React.DragEvent, colId: string) => {
      setDraggedColumnId(colId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('type', 'COLUMN');
      e.dataTransfer.setData('colId', colId);
  };

  const checkAutomations = (targetColId: string, task: Task) => {
      const rules = boardData.automations || [];
      const applicableRules = rules.filter(r => r.triggerColumnId === targetColId);
      
      let updates: Partial<Task> = {};
      
      applicableRules.forEach(rule => {
          if (rule.actionType === 'MARK_COMPLETE') {
              const shouldComplete = rule.actionValue === true;
              // Check all subtasks
              updates.subtasks = task.subtasks.map(s => ({ ...s, completed: shouldComplete }));
          } else if (rule.actionType === 'SET_PRIORITY') {
              updates.priority = rule.actionValue as Priority;
          }
      });
      return updates;
  };

  const handleDrop = (e: React.DragEvent, targetColId: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const type = e.dataTransfer.getData('type');
      const taskId = e.dataTransfer.getData('taskId');
      const sourceCol = e.dataTransfer.getData('sourceColId');
      const draggedCol = e.dataTransfer.getData('colId');

      if (type === 'TASK') {
          if (!taskId || !sourceCol) return;
          if (sourceCol === targetColId) return; // Dropped in same column

          const newSourceTaskIds = boardData.columns[sourceCol].taskIds.filter(id => id !== taskId);
          const newTargetTaskIds = [...boardData.columns[targetColId].taskIds, taskId];

          // Run Automations
          const task = boardData.tasks[taskId];
          const automationUpdates = checkAutomations(targetColId, task);
          const updatedTask = { ...task, ...automationUpdates };

          setBoardData(prev => ({
              ...prev,
              columns: {
                  ...prev.columns,
                  [sourceCol]: { ...prev.columns[sourceCol], taskIds: newSourceTaskIds },
                  [targetColId]: { ...prev.columns[targetColId], taskIds: newTargetTaskIds }
              },
              tasks: {
                  ...prev.tasks,
                  [taskId]: updatedTask
              }
          }));

          // Confetti for Done column
          if (boardData.columns[targetColId].title.toLowerCase() === 'done') {
              // Trigger confetti (simplified for code brevity)
              console.log("Task Completed! 🎉");
          }

          setDraggedTaskId(null);
          setSourceColId(null);
      } else if (type === 'COLUMN') {
          if (!draggedCol) return;
          if (draggedCol === targetColId) return;
          
          const newOrder = [...boardData.columnOrder];
          const oldIdx = newOrder.indexOf(draggedCol);
          const newIdx = newOrder.indexOf(targetColId);
          
          if (oldIdx !== -1 && newIdx !== -1) {
              newOrder.splice(oldIdx, 1);
              newOrder.splice(newIdx, 0, draggedCol);
              setBoardData(prev => ({ ...prev, columnOrder: newOrder }));
          }
          setDraggedColumnId(null);
      }
  };

  const handleCalendarDrop = (e: React.DragEvent, dayStr: string) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData('taskId');
      if (taskId) {
          setBoardData(prev => ({
              ...prev,
              tasks: {
                  ...prev.tasks,
                  [taskId]: { ...prev.tasks[taskId], dueDate: dayStr }
              }
          }));
      }
  };

  const handleAddTask = (colId: string) => {
      setActiveColumnForAdd(colId);
      setEditingTask({ id: generateId(), title: '', description: '', priority: 'MEDIUM', tags: [], createdAt: Date.now(), subtasks: [], comments: [], timeSpent: 0 });
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
      if (!editingTask.title.trim()) { setEditingTask({...editingTask, title: 'Untitled Task'}); }
      setBoardData(prev => {
          const isEdit = !!prev.tasks[editingTask.id];
          const newTasks = { ...prev.tasks, [editingTask.id]: editingTask };
          let newColumns = { ...prev.columns };
          // If dragging from unscheduled (calendar sidebar) or creating new, add to column
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
          return { ...prev, tasks: newTasks, columns: { ...prev.columns, [colId]: { ...prev.columns[colId], taskIds: newColIds } } };
      });
  };

  const addColumn = () => {
      const newId = generateId();
      const newCol: Column = { id: newId, title: 'New Column', color: '#94a3b8', taskIds: [] };
      setBoardData(prev => ({ ...prev, columns: { ...prev.columns, [newId]: newCol }, columnOrder: [...prev.columnOrder, newId] }));
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
          return { ...prev, columns: newCols, tasks: newTasks, columnOrder: prev.columnOrder.filter(id => id !== colId) };
      });
  };

  const updateColumnTitle = (colId: string, title: string) => {
      setBoardData(prev => ({ ...prev, columns: { ...prev.columns, [colId]: { ...prev.columns[colId], title } } }));
  };

  const handleAddComment = () => {
      if(!newComment.trim() || !editingTask) return;
      const comment: Comment = { id: generateId(), text: newComment, createdAt: Date.now(), author: 'Me' };
      setEditingTask({ ...editingTask, comments: [...(editingTask.comments || []), comment] });
      setNewComment('');
  };

  const toggleTimer = (taskId: string) => {
      if (activeTimerTaskId === taskId) {
          setActiveTimerTaskId(null);
      } else {
          setActiveTimerTaskId(taskId);
      }
  };

  const addAutomation = (triggerCol: string, action: 'SET_PRIORITY' | 'MARK_COMPLETE', value: any) => {
      setBoardData(prev => ({
          ...prev,
          automations: [...(prev.automations || []), { id: generateId(), triggerColumnId: triggerCol, actionType: action, actionValue: value }]
      }));
  };

  // --- ANALYTICS ---
  const stats = useMemo(() => {
      const allTasks = Object.values(boardData.tasks);
      const total = allTasks.length;
      const doneColId = boardData.columnOrder.find(id => boardData.columns[id].title.toLowerCase() === 'done') || boardData.columnOrder[boardData.columnOrder.length - 1]; 
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

  // --- CALENDAR RENDERER ---
  const renderCalendar = () => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const daysInMonth = getDaysInMonth(year, month);
      const firstDay = getFirstDayOfMonth(year, month);
      const days = [];
      
      for (let i = 0; i < firstDay; i++) days.push(null);
      for (let i = 1; i <= daysInMonth; i++) days.push(i);

      // Tasks without dates to show in sidebar
      const unscheduledTasks = Object.values(boardData.tasks).filter(t => !t.dueDate);

      return (
          <div className="flex h-full bg-white">
              {/* Sidebar for Unscheduled */}
              <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
                  <div className="p-4 border-b border-gray-200">
                      <h3 className="text-xs font-bold uppercase text-gray-500 tracking-wider">Unscheduled</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {unscheduledTasks.map(task => (
                          <div 
                            key={task.id}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('taskId', task.id);
                                e.dataTransfer.setData('type', 'TASK');
                            }}
                            className="bg-white p-2 rounded shadow-sm border border-gray-200 cursor-move text-sm hover:border-indigo-400"
                          >
                              {task.title}
                          </div>
                      ))}
                      {unscheduledTasks.length === 0 && <div className="text-center text-xs text-gray-400 py-4">All tasks scheduled!</div>}
                  </div>
              </div>

              {/* Main Calendar Grid */}
              <div className="flex-1 flex flex-col p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-6 shrink-0">
                    <div className="flex items-center gap-4">
                        <h2 className="text-2xl font-black text-gray-800">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                        <div className="flex gap-1">
                            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-1 hover:bg-gray-100 rounded-full"><Icon.ChevronLeft size={20} /></button>
                            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-1 hover:bg-gray-100 rounded-full"><Icon.ChevronRight size={20} /></button>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-7 gap-4 text-center font-bold text-gray-400 text-xs mb-2 uppercase tracking-widest shrink-0">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-2 min-h-0">
                    {days.map((day, idx) => {
                        if (!day) return <div key={idx} className="bg-gray-50/50 rounded-xl" />;
                        
                        const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const dayTasks = Object.values(boardData.tasks).filter(t => t.dueDate === dayStr);
                        const isToday = new Date().toISOString().split('T')[0] === dayStr;

                        return (
                            <div 
                                key={day} 
                                className={`relative p-2 border rounded-xl flex flex-col gap-1 overflow-y-auto custom-scrollbar transition-all hover:shadow-md ${isToday ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-blue-200'}`}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleCalendarDrop(e, dayStr)}
                            >
                                <span className={`text-xs font-bold mb-1 ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{day}</span>
                                {dayTasks.map(task => (
                                    <div 
                                        key={task.id}
                                        draggable
                                        onDragStart={(e) => { e.dataTransfer.setData('taskId', task.id); }}
                                        onClick={() => { setEditingTask(task); setActiveColumnForAdd(boardData.columnOrder[0]); setIsTaskModalOpen(true); }}
                                        className={`text-[10px] p-1.5 rounded-lg border font-medium truncate cursor-pointer shadow-sm ${PRIORITY_COLORS[task.priority]}`}
                                    >
                                        {task.title}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
              </div>
          </div>
      );
  };

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
                          <input autoFocus value={tempProjectName} onChange={(e) => setTempProjectName(e.target.value)} onBlur={() => { const newProjects = projects.map(proj => proj.id === p.id ? { ...proj, name: tempProjectName } : proj); setProjects(newProjects); localStorage.setItem('singularity-board-index', JSON.stringify(newProjects)); if(currentBoardId === p.id) setBoardData(prev => ({...prev, name: tempProjectName})); setEditingProjectId(null); }} onKeyDown={(e) => e.key === 'Enter' && setEditingProjectId(null)} className="bg-white border border-indigo-300 rounded px-1 py-0.5 text-xs w-full" onClick={e => e.stopPropagation()} />
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

      {/* MAIN CONTENT */}
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
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                      <button onClick={() => setViewMode('BOARD')} className={`p-2 rounded-md transition-all ${viewMode === 'BOARD' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`} title="Board View"><Icon.Board size={18} /></button>
                      <button onClick={() => setViewMode('CALENDAR')} className={`p-2 rounded-md transition-all ${viewMode === 'CALENDAR' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`} title="Calendar View"><Icon.Calendar size={18} /></button>
                  </div>

                  <button onClick={() => setShowFilters(!showFilters)} className={`p-2 rounded-lg transition-colors ${showFilters || filterPriority !== 'ALL' ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-100 text-gray-500'}`} title="Filters"><Icon.Filter size={20} /></button>
                  <button onClick={() => setIsAutomationOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Automations"><Icon.Bot size={20} /></button>
                  
                  <button onClick={() => setIsAnalyticsOpen(!isAnalyticsOpen)} className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs transition-all ${isAnalyticsOpen ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}><Icon.Table size={16} /> Stats</button>
              </div>
          </div>

          {/* Filter Toolbar */}
          {showFilters && (
              <div className="h-12 bg-gray-50 border-b border-gray-200 flex items-center px-6 gap-4 animate-slide-up shrink-0">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Priority:</span>
                  {(['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(p => (
                      <button key={p} onClick={() => setFilterPriority(p)} className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${filterPriority === p ? 'bg-indigo-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>{p}</button>
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
                      <div className="flex justify-between text-xs"><span className="font-medium text-gray-500">Critical Tasks</span><span className="font-bold text-red-600">{stats.byPriority.CRITICAL}</span></div>
                      <div className="flex justify-between text-xs"><span className="font-medium text-gray-500">High Priority</span><span className="font-bold text-orange-600">{stats.byPriority.HIGH}</span></div>
                      <div className="flex justify-between text-xs"><span className="font-medium text-gray-500">Total Tasks</span><span className="font-bold text-gray-800">{stats.total}</span></div>
                  </div>
              </div>
          )}

          {/* Automations Modal */}
          {isAutomationOpen && (
              <div className="absolute top-20 right-6 z-50 bg-white rounded-2xl shadow-clay-xl p-6 w-80 animate-slide-up border border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Icon.Bot size={14}/> Automations</h3>
                      <button onClick={() => setIsAutomationOpen(false)}><Icon.Close size={14} className="text-gray-400"/></button>
                  </div>
                  <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
                      {boardData.automations?.map((rule, i) => (
                          <div key={i} className="text-xs bg-gray-50 p-2 rounded border border-gray-100 flex justify-between">
                              <span>If moved to <b>{boardData.columns[rule.triggerColumnId]?.title}</b> → {rule.actionType}</span>
                              <button onClick={() => setBoardData(prev => ({...prev, automations: prev.automations?.filter(r => r.id !== rule.id)}))} className="text-red-400"><Icon.Trash size={12}/></button>
                          </div>
                      ))}
                      {(!boardData.automations || boardData.automations.length === 0) && <div className="text-xs text-gray-400 italic">No rules active.</div>}
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-bold text-gray-600 mb-2">Add New Rule</p>
                      <div className="flex flex-col gap-2">
                          <button onClick={() => addAutomation(boardData.columnOrder[boardData.columnOrder.length-1], 'MARK_COMPLETE', true)} className="w-full py-2 bg-green-50 text-green-700 text-xs font-bold rounded border border-green-200 hover:bg-green-100">Auto-Complete on Done</button>
                          <button onClick={() => addAutomation(boardData.columnOrder[0], 'SET_PRIORITY', 'HIGH')} className="w-full py-2 bg-orange-50 text-orange-700 text-xs font-bold rounded border border-orange-200 hover:bg-orange-100">High Priority on Backlog</button>
                      </div>
                  </div>
              </div>
          )}

          {/* VIEW RENDERER */}
          {viewMode === 'CALENDAR' ? renderCalendar() : (
              <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-gray-100/50">
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
                                              <input autoFocus value={column.title} onChange={(e) => updateColumnTitle(colId, e.target.value)} onBlur={() => setEditingColumnId(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingColumnId(null)} className="bg-white border border-indigo-300 rounded px-1 text-sm font-bold w-full outline-none" />
                                          ) : (
                                              <h3 className="font-bold text-gray-700 cursor-pointer hover:text-indigo-600" onClick={() => setEditingColumnId(colId)}>{column.title}</h3>
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
                                                  className={`group bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-all relative ${task.priority === 'CRITICAL' ? 'border-l-4 border-l-red-500' : ''} ${draggedTaskId === taskId ? 'opacity-50' : 'opacity-100'}`}
                                              >
                                                  <div className="flex items-start justify-between mb-2">
                                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
                                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                          <button onClick={(e) => { e.stopPropagation(); toggleTimer(taskId); }} className={`p-1 rounded ${activeTimerTaskId === taskId ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-gray-100 text-gray-400'}`}><Icon.Clock size={12}/></button>
                                                          <button onClick={(e) => { e.stopPropagation(); deleteTask(taskId, colId); }} className="p-1 hover:bg-red-100 hover:text-red-500 text-gray-300"><Icon.Trash size={12} /></button>
                                                      </div>
                                                  </div>
                                                  <h4 className="font-bold text-gray-800 text-sm mb-1 leading-snug">{task.title}</h4>
                                                  
                                                  {(task.timeSpent || 0) > 0 && (
                                                      <div className="flex items-center gap-1 text-[10px] font-mono text-gray-500 mb-2">
                                                          <Icon.Clock size={10} className={activeTimerTaskId === taskId ? "text-green-500 animate-spin" : ""} /> {formatTime(task.timeSpent || 0)}
                                                      </div>
                                                  )}

                                                  {totalSubtasks > 0 && (
                                                      <div className="mt-2">
                                                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                              <div className={`h-full rounded-full ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
                                                          </div>
                                                      </div>
                                                  )}

                                                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
                                                      <div className="flex gap-1 overflow-hidden">
                                                          {task.tags.map((tag, i) => (
                                                              <span key={i} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium truncate">#{tag}</span>
                                                          ))}
                                                      </div>
                                                      <div className="flex items-center gap-2">
                                                          {task.comments && task.comments.length > 0 && (
                                                              <div className="flex items-center gap-0.5 text-gray-400"><Icon.Comment size={10} /><span className="text-[10px] font-bold">{task.comments.length}</span></div>
                                                          )}
                                                          {task.dueDate && (
                                                              <div className={`text-[10px] font-bold flex items-center gap-1 ${new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-gray-400'}`}><Icon.Calendar size={10} />{new Date(task.dueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</div>
                                                          )}
                                                      </div>
                                                  </div>
                                              </div>
                                          );
                                      })}
                                      <button onClick={() => handleAddTask(colId)} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs font-bold hover:border-indigo-300 hover:text-indigo-500 transition-colors flex items-center justify-center gap-2"><Icon.Plus size={14} /> Add Task</button>
                                  </div>
                              </div>
                          );
                      })}
                      
                      <div onClick={addColumn} className="w-12 h-full max-h-[80vh] rounded-2xl bg-gray-200/50 hover:bg-gray-200 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer transition-all shrink-0"><Icon.Plus size={24} /></div>
                  </div>
              </div>
          )}
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
                              <button onClick={() => setActiveTab('DETAILS')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeTab === 'DETAILS' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}>Details</button>
                              <button onClick={() => setActiveTab('COMMENTS')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeTab === 'COMMENTS' ? 'bg-white text-indigo-600 shadow' : 'text-gray-500'}`}>Comments ({editingTask.comments?.length || 0})</button>
                          </div>
                      </div>
                      <button onClick={() => setIsTaskModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full text-gray-500"><Icon.Close size={20}/></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {activeTab === 'DETAILS' ? (
                          <>
                            <div className="space-y-4">
                                <input value={editingTask.title} onChange={e => setEditingTask({...editingTask, title: e.target.value})} className="w-full text-2xl font-black text-gray-800 bg-transparent outline-none placeholder-gray-300 border-b-2 border-transparent focus:border-indigo-500 transition-colors py-1" placeholder="Task Title..." autoFocus />
                                <textarea value={editingTask.description || ''} onChange={e => setEditingTask({...editingTask, description: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none" placeholder="Add a detailed description..." />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button onClick={handleAiTagging} disabled={isGenerating || !editingTask.title} className="text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50">{isGenerating ? <Icon.Navigation className="animate-spin" size={14}/> : <Icon.Magic size={14}/>} AI Tags</button>
                                <button onClick={handleAiBreakdown} disabled={isGenerating || !editingTask.title} className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50">{isGenerating ? <Icon.Navigation className="animate-spin" size={14}/> : <Icon.Filter size={14}/>} AI Subtasks</button>
                            </div>
                            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Checklist</h3>
                                <div className="space-y-2">
                                    {editingTask.subtasks?.map((sub, idx) => (
                                        <div key={sub.id} className="flex items-center gap-3 group">
                                            <input type="checkbox" checked={sub.completed} onChange={() => { const newSubs = [...(editingTask.subtasks || [])]; newSubs[idx].completed = !newSubs[idx].completed; setEditingTask({...editingTask, subtasks: newSubs}); }} className="accent-indigo-600 w-4 h-4 cursor-pointer" />
                                            <input value={sub.text} onChange={(e) => { const newSubs = [...(editingTask.subtasks || [])]; newSubs[idx].text = e.target.value; setEditingTask({...editingTask, subtasks: newSubs}); }} className={`flex-1 bg-transparent border-b border-transparent focus:border-gray-300 outline-none text-sm ${sub.completed ? 'line-through text-gray-400' : 'text-gray-700'}`} />
                                            <button onClick={() => { const newSubs = editingTask.subtasks.filter((_, i) => i !== idx); setEditingTask({...editingTask, subtasks: newSubs}); }} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Icon.Close size={14}/></button>
                                        </div>
                                    ))}
                                    <button onClick={() => setEditingTask({...editingTask, subtasks: [...(editingTask.subtasks||[]), { id: generateId(), text: '', completed: false }]})} className="text-xs font-bold text-gray-500 hover:text-indigo-600 flex items-center gap-1 mt-2"><Icon.Plus size={12}/> Add Item</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Priority</label>
                                    <select value={editingTask.priority} onChange={e => setEditingTask({...editingTask, priority: e.target.value as Priority})} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Due Date</label>
                                    <input type="date" value={editingTask.dueDate || ''} onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                            </div>
                            {editingTask.tags.length > 0 && (
                                <div><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Tags</label><div className="flex flex-wrap gap-2">{editingTask.tags.map((tag, i) => ( <span key={i} className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium flex items-center gap-1">{tag}<button onClick={() => setEditingTask({...editingTask, tags: editingTask.tags.filter((_, idx) => idx !== i)})} className="hover:text-red-500"><Icon.Close size={10}/></button></span> ))}</div></div>
                            )}
                          </>
                      ) : (
                          <div className="flex flex-col h-full">
                              <div className="flex-1 space-y-4 mb-4">
                                  {editingTask.comments && editingTask.comments.length > 0 ? (
                                      editingTask.comments.map(comment => (
                                          <div key={comment.id} className="flex gap-3"><div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">{comment.author[0]}</div><div className="flex-1"><div className="bg-gray-50 p-3 rounded-2xl rounded-tl-none border border-gray-100"><div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-gray-700">{comment.author}</span><span className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleTimeString()}</span></div><p className="text-sm text-gray-600">{comment.text}</p></div></div></div>
                                      ))
                                  ) : (<div className="text-center text-gray-400 py-10 italic text-sm">No comments yet. Start the discussion!</div>)}
                              </div>
                              <div className="mt-auto"><div className="flex gap-2"><input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddComment()} placeholder="Write a comment..." className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" /><button onClick={handleAddComment} disabled={!newComment.trim()} className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 transition-colors"><Icon.Send size={18} /></button></div></div>
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
