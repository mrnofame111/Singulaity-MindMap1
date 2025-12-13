
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from './Icons';
import { generateId } from '../constants';

interface MyCalendarProps {
  onBack: () => void;
}

// --- TYPES ---

// Updated Field Types based on user request
type FieldType = 
    | 'text' 
    | 'textarea' 
    | 'number' 
    | 'tags' 
    | 'date_time' 
    | 'date_range' 
    | 'checkbox' 
    | 'select' 
    | 'rating' 
    | 'image' 
    | 'location';

interface ModeField {
    id: string;
    label: string;
    type: FieldType;
    options?: string[]; // For select
}

interface CalendarMode {
    id: string;
    label: string;
    color: string;
    fields: ModeField[];
    isDefault?: boolean;
}

interface CalendarEvent {
    id: string;
    title: string;
    startDate: string; // ISO YYYY-MM-DD
    endDate: string;   // ISO YYYY-MM-DD
    modeId: string;
    data: Record<string, any>;
}

interface CalendarProject {
    id: string;
    name: string;
    modes: CalendarMode[];
    events: CalendarEvent[];
    lastModified: number;
}

// --- CONSTANTS ---

const FIELD_TYPES: { type: FieldType; label: string; icon: any }[] = [
    { type: 'text', label: 'Text', icon: Icon.Type },
    { type: 'textarea', label: 'Text Area', icon: Icon.AlignLeft },
    { type: 'number', label: 'Number', icon: Icon.Hash }, // Replaces simple 'number'
    { type: 'tags', label: 'Tags', icon: Icon.Tag },
    { type: 'date_time', label: 'Date & Time', icon: Icon.Clock },
    { type: 'date_range', label: 'Date Range', icon: Icon.Calendar },
    { type: 'checkbox', label: 'Checkbox', icon: Icon.CheckSquare },
    { type: 'select', label: 'Select', icon: Icon.List },
    { type: 'rating', label: 'Rating (1-5)', icon: Icon.Star },
    { type: 'image', label: 'Image Upload', icon: Icon.Image },
    { type: 'location', label: 'Location', icon: Icon.Map },
];

const DEFAULT_MODES: CalendarMode[] = [
    { 
        id: 'work', 
        label: 'Work', 
        color: '#3b82f6', 
        isDefault: true,
        fields: [
            { id: 'f1', label: 'Description', type: 'textarea' },
            { id: 'f2', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
            { id: 'f3', label: 'Location', type: 'location' }
        ]
    },
    { 
        id: 'personal', 
        label: 'Personal', 
        color: '#10b981', 
        isDefault: true,
        fields: [
            { id: 'f1', label: 'Mood', type: 'rating' },
            { id: 'f2', label: 'Photo', type: 'image' }
        ]
    },
    { 
        id: 'deadline', 
        label: 'Deadline', 
        color: '#ef4444', 
        isDefault: true,
        fields: [
            { id: 'f1', label: 'Urgency', type: 'checkbox' },
            { id: 'f2', label: 'Due Time', type: 'date_time' }
        ]
    }
];

// --- HELPERS ---

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const addDays = (dateStr: string, days: number) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
};

const dateDiff = (start: string, end: string) => {
    const d1 = new Date(start);
    const d2 = new Date(end);
    return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
};

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// --- COMPONENT ---

export const MyCalendarScreen: React.FC<MyCalendarProps> = ({ onBack }) => {
    // --- STATE ---
    const [projects, setProjects] = useState<CalendarProject[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    
    // View State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
    
    // Modal / Interaction State
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Partial<CalendarEvent>>({});
    
    // Dragging State
    const [dragEventId, setDragEventId] = useState<string | null>(null);
    const [dragType, setDragType] = useState<'START' | 'END' | 'MOVE' | null>(null);
    const [dragStartDay, setDragStartDay] = useState<string | null>(null);

    // Mode Editing State
    const [isModeEditorOpen, setIsModeEditorOpen] = useState(false);
    const [editingMode, setEditingMode] = useState<CalendarMode | null>(null);

    // --- EFFECTS ---
    useEffect(() => {
        const saved = localStorage.getItem('singularity-calendar-projects');
        if (saved) {
            const parsed = JSON.parse(saved);
            setProjects(parsed);
            if (parsed.length > 0) setActiveProjectId(parsed[0].id);
            else createProject();
        } else {
            createProject();
        }
    }, []);

    useEffect(() => {
        if (projects.length > 0) {
            localStorage.setItem('singularity-calendar-projects', JSON.stringify(projects));
        }
    }, [projects]);

    const activeProject = projects.find(p => p.id === activeProjectId);
    const activeModeId = useRef<string>('work'); // To track last selected mode for new events

    // --- ACTIONS ---

    const createProject = () => {
        const newId = generateId();
        const newProject: CalendarProject = {
            id: newId,
            name: `Calendar ${projects.length + 1}`,
            modes: JSON.parse(JSON.stringify(DEFAULT_MODES)),
            events: [],
            lastModified: Date.now()
        };
        setProjects(prev => [...prev, newProject]);
        setActiveProjectId(newId);
    };

    const updateProject = (id: string, updates: Partial<CalendarProject>) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates, lastModified: Date.now() } : p));
    };

    const handleDateClick = (dateStr: string) => {
        setSelectedDate(dateStr);
        // If we have a special "Report Mode" active (conceptually), we show the report. 
        // For this UI, we can trigger report if clicking the header or specific button, 
        // but user requested "If the user clicks on the report mode, then clicks on any date... pop-up for the report."
        // We'll assume a "Report Mode" state in the sidebar or a dedicated toggle. 
        // For now, let's implement the logic: If a user selects "Report Mode" from sidebar.
        
        // Since we are implementing a robust system, let's check if the user "Selected" report mode.
        // We will add a "Report Mode" button in the right sidebar.
    };

    // Helper for handling image uploads
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldId: string) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setEditingEvent(prev => ({
                    ...prev,
                    data: { ...prev.data, [fieldId]: ev.target?.result }
                }));
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const saveEvent = () => {
        if (!activeProject || !editingEvent.title) return;
        const newEvents = activeProject.events.filter(e => e.id !== editingEvent.id);
        newEvents.push(editingEvent as CalendarEvent);
        updateProject(activeProject.id, { events: newEvents });
        setIsEventModalOpen(false);
    };

    const deleteEvent = (id: string) => {
        if (!activeProject) return;
        if (confirm("Delete this event?")) {
            const newEvents = activeProject.events.filter(e => e.id !== id);
            updateProject(activeProject.id, { events: newEvents });
            setIsEventModalOpen(false);
        }
    };

    // --- DRAG LOGIC ---
    const handleDragStart = (e: React.MouseEvent, eventId: string, type: 'START' | 'END' | 'MOVE', dateStr: string) => {
        e.stopPropagation();
        setDragEventId(eventId);
        setDragType(type);
        setDragStartDay(dateStr);
    };

    const handleDrop = (targetDateStr: string) => {
        if (!activeProject || !dragEventId || !dragType || !dragStartDay) return;
        
        const event = activeProject.events.find(e => e.id === dragEventId);
        if (!event) return;

        let newStart = event.startDate;
        let newEnd = event.endDate;
        const diff = dateDiff(dragStartDay, targetDateStr);

        if (dragType === 'START') {
            newStart = addDays(event.startDate, diff);
            if (newStart > event.endDate) newStart = event.endDate; 
        } else if (dragType === 'END') {
            newEnd = addDays(event.endDate, diff);
            if (newEnd < event.startDate) newEnd = event.startDate;
        } else if (dragType === 'MOVE') {
            newStart = addDays(event.startDate, diff);
            newEnd = addDays(event.endDate, diff);
        }

        const newEvents = activeProject.events.map(e => e.id === dragEventId ? { ...e, startDate: newStart, endDate: newEnd } : e);
        updateProject(activeProject.id, { events: newEvents });
        
        setDragEventId(null);
        setDragType(null);
        setDragStartDay(null);
    };

    // --- RENDERING HELPERS ---

    const renderMonthGrid = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        
        const weeks = [];
        let currentWeek = [];
        
        for (let i = 0; i < firstDay; i++) currentWeek.push(null);
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            currentWeek.push(dateStr);
            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
        }
        
        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) currentWeek.push(null);
            weeks.push(currentWeek);
        }

        return (
            <div className="flex flex-col flex-1 h-full overflow-y-auto bg-white">
                <div className="grid grid-cols-7 border-b border-gray-200">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="p-2 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
                            {d}
                        </div>
                    ))}
                </div>

                {weeks.map((week, wIdx) => (
                    <div key={wIdx} className="grid grid-cols-7 flex-1 min-h-[120px] relative border-b border-gray-100 group/week">
                        {week.map((dateStr, dIdx) => (
                            <div 
                                key={dIdx} 
                                className={`
                                    border-r border-gray-100 p-2 relative transition-colors
                                    ${dateStr ? 'hover:bg-gray-50 cursor-pointer' : 'bg-gray-50/30'}
                                    ${dateStr === new Date().toISOString().split('T')[0] ? 'bg-blue-50/30' : ''}
                                `}
                                onClick={() => {
                                    if (!dateStr) return;
                                    handleDateClick(dateStr);
                                    if (activeModeId.current === 'REPORT') {
                                        setIsReportModalOpen(true);
                                    } else {
                                        setEditingEvent({
                                            id: generateId(),
                                            title: '',
                                            startDate: dateStr,
                                            endDate: dateStr,
                                            modeId: activeModeId.current,
                                            data: {}
                                        });
                                        setIsEventModalOpen(true);
                                    }
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => dateStr && handleDrop(dateStr)}
                            >
                                {dateStr && (
                                    <span className={`
                                        text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                                        ${dateStr === new Date().toISOString().split('T')[0] ? 'bg-indigo-600 text-white' : 'text-gray-500'}
                                    `}>
                                        {parseInt(dateStr.split('-')[2])}
                                    </span>
                                )}
                            </div>
                        ))}

                        <div className="absolute inset-0 top-8 px-2 pointer-events-none flex flex-col gap-1">
                            {renderEventBars(week)}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderEventBars = (weekDates: (string | null)[]) => {
        if (!activeProject) return null;
        
        const weekStart = weekDates.find(d => d !== null) || '';
        const weekEnd = [...weekDates].reverse().find(d => d !== null) || '';
        
        if (!weekStart || !weekEnd) return null;

        const visibleEvents = activeProject.events.filter(e => {
            return (e.startDate <= weekEnd && e.endDate >= weekStart);
        });

        return visibleEvents.map(event => {
            const mode = activeProject.modes.find(m => m.id === event.modeId);
            
            let startIndex = 0;
            let endIndex = 6;
            
            const eventStartIndex = weekDates.findIndex(d => d === event.startDate);
            const eventEndIndex = weekDates.findIndex(d => d === event.endDate);

            if (event.startDate > weekStart) startIndex = Math.max(0, eventStartIndex);
            if (event.endDate < weekEnd) endIndex = Math.min(6, eventEndIndex);
            
            // Correction for events spanning from previous weeks
            if (eventStartIndex === -1 && event.startDate < weekStart) startIndex = 0;

            const isStart = event.startDate >= weekStart;
            const isEnd = event.endDate <= weekEnd;

            // Don't render if it shouldn't be in this row (sanity check)
            if (startIndex === -1 && event.startDate > weekStart) return null;

            return (
                <div 
                    key={event.id}
                    className="pointer-events-auto h-6 rounded px-2 text-[10px] font-bold text-white flex items-center justify-between shadow-sm hover:brightness-110 transition-all cursor-move relative group"
                    style={{
                        backgroundColor: mode?.color || '#ccc',
                        marginLeft: `${(startIndex / 7) * 100}%`,
                        width: `${((endIndex - startIndex + 1) / 7) * 100}%`,
                        borderTopLeftRadius: isStart ? '6px' : '0',
                        borderBottomLeftRadius: isStart ? '6px' : '0',
                        borderTopRightRadius: isEnd ? '6px' : '0',
                        borderBottomRightRadius: isEnd ? '6px' : '0',
                    }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, event.id, 'MOVE', weekDates[startIndex]!)}
                    onClick={(e) => { e.stopPropagation(); setEditingEvent(event); setIsEventModalOpen(true); }}
                >
                    <span className="truncate">{event.title}</span>
                    
                    {isStart && (
                        <div 
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 rounded-l"
                            draggable
                            onDragStart={(e) => handleDragStart(e, event.id, 'START', event.startDate)}
                            onClick={e => e.stopPropagation()}
                        />
                    )}
                    {isEnd && (
                        <div 
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 rounded-r"
                            draggable
                            onDragStart={(e) => handleDragStart(e, event.id, 'END', event.endDate)}
                            onClick={e => e.stopPropagation()}
                        />
                    )}
                </div>
            );
        });
    };

    const saveMode = () => {
        if (!activeProject || !editingMode) return;
        const isNew = !activeProject.modes.find(m => m.id === editingMode.id);
        let newModes = [...activeProject.modes];
        if (isNew) {
            newModes.push(editingMode);
        } else {
            newModes = newModes.map(m => m.id === editingMode.id ? editingMode : m);
        }
        updateProject(activeProject.id, { modes: newModes });
        setIsModeEditorOpen(false);
        setEditingMode(null);
    };

    const deleteMode = (modeId: string) => {
        if (!activeProject) return;
        if (confirm("Delete this mode? Events using it will lose styling.")) {
            updateProject(activeProject.id, { modes: activeProject.modes.filter(m => m.id !== modeId) });
        }
    };

    const renderInputForField = (field: ModeField, value: any, onChange: (val: any) => void) => {
        switch (field.type) {
            case 'textarea':
                return <textarea className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm min-h-[80px]" value={value || ''} onChange={e => onChange(e.target.value)} />;
            case 'select':
                return (
                    <select className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm" value={value || ''} onChange={e => onChange(e.target.value)}>
                        <option value="">Select...</option>
                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                );
            case 'checkbox':
                return (
                    <label className="flex items-center gap-2 p-2 border border-gray-200 rounded bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="w-5 h-5 accent-indigo-600" />
                        <span className="text-sm font-medium">{field.label}</span>
                    </label>
                );
            case 'rating':
                return (
                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(v => (
                            <button key={v} onClick={() => onChange(v)} className={`p-1 ${value >= v ? 'text-yellow-400' : 'text-gray-300'}`}>
                                <Icon.Star size={24} fill="currentColor" />
                            </button>
                        ))}
                    </div>
                );
            case 'tags':
                return <input type="text" className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm" placeholder="Separate tags with commas..." value={value || ''} onChange={e => onChange(e.target.value)} />;
            case 'date_time':
                return <input type="datetime-local" className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm" value={value || ''} onChange={e => onChange(e.target.value)} />;
            case 'date_range':
                return (
                    <div className="flex gap-2">
                        <input type="date" className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm" value={value?.start || ''} onChange={e => onChange({ ...value, start: e.target.value })} />
                        <span className="self-center">-</span>
                        <input type="date" className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm" value={value?.end || ''} onChange={e => onChange({ ...value, end: e.target.value })} />
                    </div>
                );
            case 'image':
                return (
                    <div className="space-y-2">
                        {value && <img src={value} alt="Preview" className="w-full h-32 object-cover rounded-lg border border-gray-200" />}
                        <input type="file" accept="image/*" onChange={e => handleImageUpload(e, field.id)} className="text-xs text-gray-500 file:mr-2 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                    </div>
                );
            case 'location':
                return (
                    <div className="relative">
                        <Icon.Map size={16} className="absolute left-3 top-2.5 text-gray-400" />
                        <input type="text" className="w-full bg-gray-50 border border-gray-200 rounded p-2 pl-9 text-sm" placeholder="Add location..." value={value || ''} onChange={e => onChange(e.target.value)} />
                    </div>
                );
            case 'number':
                return <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm" value={value || ''} onChange={e => onChange(e.target.value)} />;
            default: // Text
                return <input type="text" className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm" value={value || ''} onChange={e => onChange(e.target.value)} />;
        }
    };

    return (
        <div className="flex h-screen bg-[#f0f4f8] font-sans text-gray-800 overflow-hidden">
            
            {/* LEFT SIDEBAR: PROJECTS */}
            <div className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 shadow-xl z-30 ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h2 className="font-bold text-gray-700 uppercase tracking-wider text-xs">Calendars</h2>
                    <button onClick={() => setIsSidebarOpen(false)}><Icon.ChevronLeft size={16} className="text-gray-400"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    <button onClick={createProject} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs shadow-md hover:bg-indigo-700 flex items-center justify-center gap-2 mb-3"><Icon.Plus size={14} /> New Calendar</button>
                    {projects.map(p => (
                        <button 
                            key={p.id}
                            onClick={() => setActiveProjectId(p.id)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${activeProjectId === p.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <Icon.Calendar size={14} /> {p.name}
                        </button>
                    ))}
                </div>
            </div>

            {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="absolute top-20 left-4 z-40 p-2 bg-white shadow-md rounded-lg text-gray-500 hover:text-indigo-600"><Icon.PanelLeft size={20} /></button>}

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Header */}
                <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><Icon.Arrow size={20} className="rotate-180"/></button>
                        <h1 className="font-display font-black text-2xl text-gray-800 tracking-tight">
                            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h1>
                        <div className="flex items-center bg-gray-100 rounded-lg p-1 ml-4 shadow-inner">
                            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-1 hover:bg-white rounded shadow-sm"><Icon.ChevronLeft size={16}/></button>
                            <button onClick={() => setCurrentDate(new Date())} className="px-3 text-xs font-bold hover:text-indigo-600">Today</button>
                            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-1 hover:bg-white rounded shadow-sm"><Icon.ChevronRight size={16}/></button>
                        </div>
                    </div>
                    <button onClick={() => setIsRightPanelOpen(!isRightPanelOpen)} className={`p-2 rounded-lg ${isRightPanelOpen ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-gray-100 text-gray-500'}`}><Icon.Settings size={20}/></button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {renderMonthGrid()}
                </div>
            </div>

            {/* RIGHT SIDEBAR: MODES */}
            <div className={`bg-white border-l border-gray-200 flex flex-col transition-all duration-300 shadow-xl z-30 ${isRightPanelOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h2 className="font-bold text-gray-700 uppercase tracking-wider text-xs">Modes & Fields</h2>
                    <button onClick={() => setIsRightPanelOpen(false)}><Icon.ChevronRight size={16} className="text-gray-400"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    
                    {/* REPORT MODE TOGGLE */}
                    <button 
                        onClick={() => activeModeId.current = 'REPORT'}
                        className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 border-2 transition-all ${activeModeId.current === 'REPORT' ? 'bg-gray-800 text-white border-gray-800 shadow-lg scale-105' : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'}`}
                    >
                        <Icon.Chart size={16} /> Report Mode
                    </button>

                    <div className="h-px bg-gray-200 my-2" />

                    <button 
                        onClick={() => {
                            setEditingMode({ id: generateId(), label: 'New Mode', color: '#6366f1', fields: [] });
                            setIsModeEditorOpen(true);
                        }}
                        className="w-full py-2 bg-white border-2 border-dashed border-gray-300 text-gray-400 rounded-lg font-bold text-xs hover:border-indigo-400 hover:text-indigo-500 flex items-center justify-center gap-2"
                    >
                        <Icon.Plus size={14} /> Create Custom Mode
                    </button>

                    {activeProject?.modes.map(mode => (
                        <button 
                            key={mode.id}
                            onClick={() => activeModeId.current = mode.id}
                            className={`w-full text-left border rounded-xl p-3 relative group transition-all ${activeModeId.current === mode.id ? 'ring-2 ring-offset-1 border-transparent shadow-md scale-105' : 'border-gray-200 hover:border-gray-300'}`}
                            style={activeModeId.current === mode.id ? { '--tw-ring-color': mode.color } as React.CSSProperties : {}}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mode.color }} />
                                    <span className="font-bold text-sm text-gray-800">{mode.label}</span>
                                </div>
                                <div className="flex gap-1">
                                    <div onClick={(e) => { e.stopPropagation(); setEditingMode(mode); setIsModeEditorOpen(true); }} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 cursor-pointer"><Icon.Edit size={12}/></div>
                                    {!mode.isDefault && <div onClick={(e) => { e.stopPropagation(); deleteMode(mode.id); }} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600 cursor-pointer"><Icon.Trash size={12}/></div>}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {mode.fields.map(f => (
                                    <span key={f.id} className="text-[9px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{f.label}</span>
                                ))}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* EVENT MODAL */}
            {isEventModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsEventModalOpen(false)}>
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-6 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-black text-gray-800">{editingEvent.id && activeProject?.events.find(e => e.id === editingEvent.id) ? 'Edit Event' : 'New Event'}</h2>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{activeProject?.modes.find(m => m.id === editingEvent.modeId)?.label} Mode</p>
                            </div>
                            <button onClick={() => setIsEventModalOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon.Close size={20}/></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <input 
                                value={editingEvent.title}
                                onChange={e => setEditingEvent({...editingEvent, title: e.target.value})}
                                placeholder="Event Title"
                                className="w-full text-lg font-bold border-b-2 border-gray-200 outline-none focus:border-indigo-500 bg-transparent py-1"
                                autoFocus
                            />
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Start Date</label>
                                    <input type="date" value={editingEvent.startDate} onChange={e => setEditingEvent({...editingEvent, startDate: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm mt-1" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">End Date</label>
                                    <input type="date" value={editingEvent.endDate} onChange={e => setEditingEvent({...editingEvent, endDate: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm mt-1" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Mode</label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {activeProject?.modes.map(mode => (
                                        <button 
                                            key={mode.id}
                                            onClick={() => setEditingEvent({...editingEvent, modeId: mode.id})}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${editingEvent.modeId === mode.id ? 'ring-2 ring-offset-1' : 'hover:bg-gray-50'}`}
                                            style={{ borderColor: mode.color, backgroundColor: editingEvent.modeId === mode.id ? mode.color : 'white', color: editingEvent.modeId === mode.id ? 'white' : mode.color }}
                                        >
                                            {mode.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Dynamic Fields */}
                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                {activeProject?.modes.find(m => m.id === editingEvent.modeId)?.fields.map(field => (
                                    <div key={field.id}>
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1.5 flex items-center gap-2">
                                            {FIELD_TYPES.find(t => t.type === field.type)?.icon && React.createElement(FIELD_TYPES.find(t => t.type === field.type)!.icon, { size: 14 })}
                                            {field.label}
                                        </label>
                                        {renderInputForField(field, editingEvent.data?.[field.id], (val) => setEditingEvent({ ...editingEvent, data: { ...editingEvent.data, [field.id]: val } }))}
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between pt-4 mt-2 border-t border-gray-100">
                                {editingEvent.id && activeProject?.events.find(e => e.id === editingEvent.id) && (
                                    <button onClick={() => deleteEvent(editingEvent.id!)} className="text-red-500 text-xs font-bold hover:bg-red-50 px-3 py-2 rounded">Delete</button>
                                )}
                                <div className="flex gap-2 ml-auto">
                                    <button onClick={() => setIsEventModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold text-sm">Cancel</button>
                                    <button onClick={saveEvent} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700">Save</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* REPORT MODAL */}
            {isReportModalOpen && selectedDate && activeProject && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsReportModalOpen(false)}>
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="bg-gray-900 text-white p-6 pb-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-2xl font-black font-display">{new Date(selectedDate).toLocaleDateString('default', { weekday: 'long' })}</h2>
                                    <p className="text-gray-400 font-medium">{formatDate(selectedDate)}</p>
                                </div>
                                <button onClick={() => setIsReportModalOpen(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"><Icon.Close size={20} /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 space-y-6 custom-scrollbar">
                            {/* Filter events that cover this date (Start <= Selected <= End) */}
                            {(() => {
                                const activeEvents = activeProject.events.filter(e => e.startDate <= selectedDate && e.endDate >= selectedDate);
                                if (activeEvents.length === 0) return <div className="text-center text-gray-400 py-10 italic">No activity recorded for this date.</div>;
                                
                                return activeEvents.map(event => {
                                    const mode = activeProject.modes.find(m => m.id === event.modeId);
                                    if (!mode) return null;
                                    
                                    const isMultiDay = event.startDate !== event.endDate;
                                    let dayLabel = '';
                                    if (isMultiDay) {
                                        const dayNum = dateDiff(event.startDate, selectedDate) + 1;
                                        const totalDays = dateDiff(event.startDate, event.endDate) + 1;
                                        dayLabel = `Day ${dayNum} of ${totalDays}`;
                                    }

                                    return (
                                        <div key={event.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                            <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center" style={{ backgroundColor: `${mode.color}10` }}>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mode.color }} />
                                                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: mode.color }}>{mode.label}</span>
                                                </div>
                                                {isMultiDay && <span className="text-[10px] font-bold bg-white px-2 py-1 rounded text-gray-500 border border-gray-100">{dayLabel}</span>}
                                            </div>
                                            <div className="p-4 space-y-3">
                                                <h3 className="text-lg font-bold text-gray-800">{event.title}</h3>
                                                <div className="grid grid-cols-2 gap-4">
                                                    {mode.fields.map(field => {
                                                        const val = event.data[field.id];
                                                        if (val === undefined || val === null || val === '') return null;
                                                        return (
                                                            <div key={field.id} className="text-sm">
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">{field.label}</span>
                                                                {field.type === 'image' ? (
                                                                    <img src={val} className="h-20 w-auto rounded border border-gray-200" alt="Evidence" />
                                                                ) : field.type === 'rating' ? (
                                                                    <div className="flex text-yellow-400"><Icon.Star size={14} fill="currentColor"/> <span className="text-gray-600 ml-1 font-bold">{val}/5</span></div>
                                                                ) : field.type === 'checkbox' ? (
                                                                    <span className={val ? "text-green-600 font-bold" : "text-gray-400"}>{val ? "Yes" : "No"}</span>
                                                                ) : (
                                                                    <span className="font-medium text-gray-700">{val.toString()}</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* MODE EDITOR MODAL */}
            {isModeEditorOpen && editingMode && (
                <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsModeEditorOpen(false)}>
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-black text-gray-800 mb-6 border-b border-gray-100 pb-2">Edit Mode</h2>
                        <div className="space-y-6 overflow-y-auto custom-scrollbar flex-1 pr-2">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Mode Name</label>
                                <input value={editingMode.label} onChange={e => setEditingMode({...editingMode, label: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-sm mt-1 font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Color</label>
                                <div className="flex gap-2 mt-2 items-center flex-wrap">
                                    {['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'].map(c => (
                                        <button key={c} onClick={() => setEditingMode({...editingMode, color: c})} className={`w-8 h-8 rounded-full shadow-sm hover:scale-110 transition-transform ${editingMode.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`} style={{ backgroundColor: c }} />
                                    ))}
                                    <div className="w-px h-6 bg-gray-300 mx-2" />
                                    {/* Custom Color Picker */}
                                    <label className="w-8 h-8 rounded-full overflow-hidden cursor-pointer relative border border-gray-300 flex items-center justify-center bg-white hover:bg-gray-50 shadow-sm" title="Custom Color">
                                        <div className="absolute inset-0 bg-gradient-to-br from-red-500 via-green-500 to-blue-500 opacity-50" />
                                        <Icon.Plus size={12} className="text-gray-600 relative z-10"/>
                                        <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={editingMode.color} onChange={(e) => setEditingMode({...editingMode, color: e.target.value})} />
                                    </label>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase flex justify-between items-center mb-2">
                                    Custom Fields
                                    <button 
                                        onClick={() => setEditingMode({...editingMode, fields: [...editingMode.fields, { id: generateId(), label: 'New Field', type: 'text' }]})}
                                        className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-xs font-bold flex items-center gap-1"
                                    >
                                        <Icon.Plus size={12} /> Add Field
                                    </button>
                                </label>
                                <div className="space-y-2 bg-gray-50 p-2 rounded-xl border border-gray-100 max-h-[250px] overflow-y-auto custom-scrollbar">
                                    {editingMode.fields.map((field, idx) => (
                                        <div key={field.id} className="flex gap-2 items-center bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                                            <div className="p-1.5 bg-gray-100 rounded text-gray-500">
                                                {FIELD_TYPES.find(t => t.type === field.type)?.icon && React.createElement(FIELD_TYPES.find(t => t.type === field.type)!.icon, { size: 14 })}
                                            </div>
                                            <input 
                                                value={field.label} 
                                                onChange={e => { const newFields = [...editingMode.fields]; newFields[idx].label = e.target.value; setEditingMode({...editingMode, fields: newFields}); }} 
                                                className="flex-1 bg-transparent text-sm font-medium outline-none placeholder-gray-400" 
                                                placeholder="Field Name"
                                            />
                                            <select 
                                                value={field.type} 
                                                onChange={e => { const newFields = [...editingMode.fields]; newFields[idx].type = e.target.value as FieldType; setEditingMode({...editingMode, fields: newFields}); }} 
                                                className="w-28 bg-gray-50 border border-gray-200 rounded px-1 py-1 text-xs outline-none"
                                            >
                                                {FIELD_TYPES.map(t => (
                                                    <option key={t.type} value={t.type}>{t.label}</option>
                                                ))}
                                            </select>
                                            <button onClick={() => { const newFields = editingMode.fields.filter(f => f.id !== field.id); setEditingMode({...editingMode, fields: newFields}); }} className="text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded"><Icon.Trash size={14}/></button>
                                        </div>
                                    ))}
                                    {editingMode.fields.length === 0 && <div className="text-center text-gray-400 text-xs py-4 italic">No fields added yet.</div>}
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 mt-4">
                            <button onClick={saveMode} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-transform active:scale-95">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
