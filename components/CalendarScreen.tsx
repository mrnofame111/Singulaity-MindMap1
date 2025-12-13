
import React, { useState, useMemo } from 'react';
import { Icon } from './Icons';

interface CalendarScreenProps {
  onBack: () => void;
}

// --- ADVANCED TYPES ---

type ViewType = 'MONTH' | 'WEEK' | 'LIST';
type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'rating' | 'tags' | 'time';

interface ModeField {
    key: string;
    label: string;
    type: FieldType;
    options?: string[]; // For select
    required?: boolean;
    defaultValue?: any;
    suffix?: string; // e.g. "kcal", "$", "hrs"
}

interface CalendarMode {
    id: string;
    label: string;
    color: string;
    icon: any; // Lucide Icon
    description: string;
    fields: ModeField[];
    isSystem?: boolean; // Cannot delete
}

interface CalendarEvent {
    id: string;
    title: string; // Acts as the primary label
    date: string; // ISO Date String YYYY-MM-DD
    startTime?: string; // HH:MM
    endTime?: string; // HH:MM
    modeId: string;
    data: Record<string, any>; // Dynamic data based on fields
}

// --- CONSTANTS & CONFIG ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const SYSTEM_MODES: CalendarMode[] = [
    { 
        id: 'schedule', 
        label: 'Schedule', 
        color: '#6366f1', // Indigo
        icon: Icon.Calendar, 
        description: 'Appointments & Meetings',
        fields: [
            { key: 'location', label: 'Location', type: 'text' },
            { key: 'attendees', label: 'Attendees', type: 'tags' },
            { key: 'notes', label: 'Notes', type: 'textarea' }
        ]
    },
    { 
        id: 'work', 
        label: 'Deep Work', 
        color: '#3b82f6', // Blue
        icon: Icon.Brain, 
        description: 'Tasks & Sprints',
        fields: [
            { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] },
            { key: 'ticket', label: 'Ticket / Ref', type: 'text' },
            { key: 'est_hours', label: 'Est. Hours', type: 'number', suffix: 'hrs' },
            { key: 'status', label: 'Status', type: 'select', options: ['To Do', 'In Progress', 'Done'] }
        ]
    },
    { 
        id: 'finance', 
        label: 'Finance', 
        color: '#10b981', // Emerald
        icon: Icon.Table, 
        description: 'Expenses & Income',
        fields: [
            { key: 'amount', label: 'Amount', type: 'number', suffix: '$', required: true },
            { key: 'category', label: 'Category', type: 'select', options: ['Food', 'Transport', 'Bills', 'Shopping', 'Income'] },
            { key: 'receipt', label: 'Has Receipt?', type: 'checkbox' }
        ]
    },
    { 
        id: 'health', 
        label: 'Health', 
        color: '#f43f5e', // Rose
        icon: Icon.Activity, 
        description: 'Fitness & Wellness',
        fields: [
            { key: 'activity', label: 'Activity Type', type: 'select', options: ['Cardio', 'Weights', 'Yoga', 'Rest', 'Meal'] },
            { key: 'calories', label: 'Calories', type: 'number', suffix: 'kcal' },
            { key: 'duration', label: 'Duration', type: 'number', suffix: 'mins' },
            { key: 'mood', label: 'Mood', type: 'rating' }
        ]
    },
    {
        id: 'journal',
        label: 'Journal',
        color: '#8b5cf6', // Violet
        icon: Icon.Notebook,
        description: 'Daily Reflections',
        fields: [
            { key: 'entry', label: 'Entry', type: 'textarea' },
            { key: 'tags', label: 'Tags', type: 'tags' }
        ]
    }
];

// --- COMPONENTS ---

const DynamicInput = ({ field, value, onChange }: { field: ModeField, value: any, onChange: (val: any) => void }) => {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex justify-between">
                {field.label}
                {field.required && <span className="text-red-500">*</span>}
            </label>
            
            {field.type === 'text' && (
                <input 
                    type="text" 
                    value={value || ''} 
                    onChange={e => onChange(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                />
            )}

            {field.type === 'number' && (
                <div className="relative">
                    <input 
                        type="number" 
                        value={value || ''} 
                        onChange={e => onChange(Number(e.target.value))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    />
                    {field.suffix && <span className="absolute right-3 top-2 text-xs text-gray-400 font-bold pointer-events-none">{field.suffix}</span>}
                </div>
            )}

            {field.type === 'textarea' && (
                <textarea 
                    value={value || ''} 
                    onChange={e => onChange(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all min-h-[80px] resize-none custom-scrollbar"
                    placeholder="Type details here..."
                />
            )}

            {field.type === 'select' && (
                <div className="relative">
                    <select 
                        value={value || ''} 
                        onChange={e => onChange(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all appearance-none"
                    >
                        <option value="" disabled>Select option...</option>
                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <Icon.ChevronDown className="absolute right-3 top-2.5 text-gray-400 pointer-events-none" size={14} />
                </div>
            )}

            {field.type === 'checkbox' && (
                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-2 rounded-lg border border-gray-200 hover:bg-gray-100">
                    <input 
                        type="checkbox" 
                        checked={!!value} 
                        onChange={e => onChange(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
                    />
                    <span className="text-sm text-gray-700 font-medium">Yes, {field.label.toLowerCase()}</span>
                </label>
            )}

            {field.type === 'rating' && (
                <div className="flex gap-2">
                    {[1,2,3,4,5].map(star => (
                        <button 
                            key={star}
                            onClick={() => onChange(star)}
                            className={`p-1 transition-transform hover:scale-110 ${value >= star ? 'text-yellow-400' : 'text-gray-300'}`}
                        >
                            <Icon.Star size={20} fill="currentColor" />
                        </button>
                    ))}
                </div>
            )}

            {field.type === 'tags' && (
                <input 
                    type="text" 
                    value={value || ''} 
                    onChange={e => onChange(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    placeholder="Separate tags with commas..."
                />
            )}
        </div>
    );
};

export const CalendarScreen: React.FC<CalendarScreenProps> = ({ onBack }) => {
  // --- STATE ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date()); // Selected day for Side Panel
  const [view, setView] = useState<ViewType>('MONTH');
  
  const [modes, setModes] = useState<CalendarMode[]>(SYSTEM_MODES);
  const [activeModeId, setActiveModeId] = useState<string>('all'); // Filter
  
  // Events Data (Ideally this comes from DB/Context)
  const [events, setEvents] = useState<CalendarEvent[]>([
      { id: '1', title: 'Q4 Strategy', date: new Date().toISOString().split('T')[0], startTime: '10:00', endTime: '11:30', modeId: 'schedule', data: { location: 'Room 303', attendees: 'Team A' } },
      { id: '2', title: 'Lunch', date: new Date().toISOString().split('T')[0], modeId: 'finance', data: { amount: 25, category: 'Food' } },
      { id: '3', title: 'Evening Run', date: new Date().toISOString().split('T')[0], modeId: 'health', data: { activity: 'Cardio', duration: 45, calories: 300, mood: 5 } },
  ]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Partial<CalendarEvent>>({});
  
  // --- HELPERS ---
  
  const getMode = (id: string) => modes.find(m => m.id === id) || modes[0];
  
  const getDaysInMonth = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const days = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();
      
      const res: (Date | null)[] = [];
      for(let i=0; i<firstDay; i++) res.push(null);
      for(let i=1; i<=days; i++) res.push(new Date(year, month, i));
      return res;
  };

  const getEventsForDate = (date: Date) => {
      const dateStr = date.toISOString().split('T')[0];
      return events.filter(e => e.date === dateStr);
  };

  // --- ACTIONS ---

  const handleDayClick = (date: Date) => {
      setSelectedDate(date);
  };

  const handleAddEvent = (date?: Date) => {
      const d = date || selectedDate || new Date();
      setEditingEvent({
          id: generateId(),
          date: d.toISOString().split('T')[0],
          modeId: 'schedule', // Default
          data: {}
      });
      setIsModalOpen(true);
  };

  const handleEditEvent = (event: CalendarEvent) => {
      setEditingEvent({ ...event });
      setIsModalOpen(true);
  };

  const handleSaveEvent = () => {
      if (!editingEvent.title || !editingEvent.date) {
          alert("Please enter at least a title.");
          return;
      }
      
      setEvents(prev => {
          const exists = prev.find(e => e.id === editingEvent.id);
          if (exists) {
              return prev.map(e => e.id === editingEvent.id ? editingEvent as CalendarEvent : e);
          } else {
              return [...prev, editingEvent as CalendarEvent];
          }
      });
      setIsModalOpen(false);
  };

  const handleDeleteEvent = (id: string) => {
      if(confirm("Are you sure?")) {
          setEvents(prev => prev.filter(e => e.id !== id));
          setIsModalOpen(false);
      }
  };

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // --- RENDERERS ---

  const renderGrid = () => {
      const days = getDaysInMonth(currentDate);
      const todayStr = new Date().toISOString().split('T')[0];
      const selectedStr = selectedDate?.toISOString().split('T')[0];

      return (
          <div className="grid grid-cols-7 auto-rows-fr gap-px bg-gray-200 border-t border-gray-200 flex-1 overflow-y-auto">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="bg-white p-2 text-center text-xs font-bold text-gray-400 uppercase tracking-widest sticky top-0 z-10">
                      {d}
                  </div>
              ))}
              
              {days.map((date, idx) => {
                  if (!date) return <div key={`empty-${idx}`} className="bg-gray-50/50 min-h-[100px]" />;
                  
                  const dateStr = date.toISOString().split('T')[0];
                  const dayEvents = getEventsForDate(date);
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedStr;

                  // Filter visibility by active mode filter if set
                  const visibleEvents = activeModeId === 'all' ? dayEvents : dayEvents.filter(e => e.modeId === activeModeId);

                  // Calculate Daily Total for Finance (Example Aggregation)
                  const dailySpend = dayEvents
                      .filter(e => e.modeId === 'finance')
                      .reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);

                  return (
                      <div 
                        key={dateStr}
                        onClick={() => handleDayClick(date)}
                        className={`bg-white min-h-[100px] p-2 relative group cursor-pointer transition-all hover:shadow-inner ${isSelected ? 'ring-2 ring-inset ring-indigo-500 z-10' : ''}`}
                      >
                          {/* Date Number */}
                          <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 transition-colors ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-500 group-hover:bg-gray-100'}`}>
                              {date.getDate()}
                          </div>

                          {/* Quick Add Button (Hover) */}
                          <button 
                             onClick={(e) => { e.stopPropagation(); handleAddEvent(date); }}
                             className="absolute top-2 right-2 p-1 rounded-full text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                              <Icon.Plus size={14} strokeWidth={3} />
                          </button>

                          {/* Events Stack */}
                          <div className="flex flex-col gap-1">
                              {visibleEvents.slice(0, 3).map(ev => {
                                  const mode = getMode(ev.modeId);
                                  return (
                                      <div key={ev.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded truncate border-l-2 text-gray-600 bg-gray-50 hover:brightness-95" style={{ borderLeftColor: mode.color }}>
                                          {ev.startTime && <span className="opacity-75 mr-1">{ev.startTime}</span>}
                                          {ev.title}
                                      </div>
                                  );
                              })}
                              {visibleEvents.length > 3 && (
                                  <div className="text-[9px] text-gray-400 font-bold pl-1">
                                      + {visibleEvents.length - 3} more
                                  </div>
                              )}
                          </div>

                          {/* Aggregation Badge (Example) */}
                          {dailySpend > 0 && activeModeId === 'all' && (
                              <div className="absolute bottom-2 right-2 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">
                                  ${dailySpend}
                              </div>
                          )}
                      </div>
                  );
              })}
          </div>
      );
  };

  // --- REPORT PANEL (RIGHT SIDE) ---
  const renderReportPanel = () => {
      if (!selectedDate) return <div className="p-8 text-center text-gray-400 text-sm">Select a date to view report</div>;

      const dateStr = selectedDate.toISOString().split('T')[0];
      const dayEvents = getEventsForDate(selectedDate);
      
      // Calculate Aggregates
      const totalSpend = dayEvents.filter(e => e.modeId === 'finance').reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
      const totalCals = dayEvents.filter(e => e.modeId === 'health').reduce((sum, e) => sum + (Number(e.data.calories) || 0), 0);
      const deepWorkHours = dayEvents.filter(e => e.modeId === 'work').reduce((sum, e) => sum + (Number(e.data.est_hours) || 0), 0);

      return (
          <div className="h-full flex flex-col bg-white">
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                  <h2 className="text-2xl font-display font-black text-gray-800">{selectedDate.toLocaleDateString('default', { weekday: 'long' })}</h2>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">{selectedDate.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  
                  {/* Aggregation Cards */}
                  <div className="flex gap-2 mt-4 overflow-x-auto pb-1 custom-scrollbar">
                      {totalSpend > 0 && (
                          <div className="flex-shrink-0 bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex flex-col min-w-[80px]">
                              <Icon.Table className="text-emerald-500 mb-1" size={16} />
                              <span className="text-[10px] text-emerald-600 font-bold uppercase">Spent</span>
                              <span className="text-lg font-black text-emerald-700">${totalSpend}</span>
                          </div>
                      )}
                      {totalCals > 0 && (
                          <div className="flex-shrink-0 bg-rose-50 border border-rose-100 rounded-xl p-3 flex flex-col min-w-[80px]">
                              <Icon.Activity className="text-rose-500 mb-1" size={16} />
                              <span className="text-[10px] text-rose-600 font-bold uppercase">Burned</span>
                              <span className="text-lg font-black text-rose-700">{totalCals}</span>
                          </div>
                      )}
                      {deepWorkHours > 0 && (
                          <div className="flex-shrink-0 bg-blue-50 border border-blue-100 rounded-xl p-3 flex flex-col min-w-[80px]">
                              <Icon.Brain className="text-blue-500 mb-1" size={16} />
                              <span className="text-[10px] text-blue-600 font-bold uppercase">Work</span>
                              <span className="text-lg font-black text-blue-700">{deepWorkHours}h</span>
                          </div>
                      )}
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {dayEvents.length === 0 && (
                      <div className="text-center py-10">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">
                              <Icon.Calendar size={24} />
                          </div>
                          <p className="text-sm text-gray-400 font-medium">No events for this day.</p>
                          <button onClick={() => handleAddEvent(selectedDate)} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">Add Entry</button>
                      </div>
                  )}

                  {dayEvents.map(ev => {
                      const mode = getMode(ev.modeId);
                      return (
                          <div 
                            key={ev.id} 
                            onClick={() => handleEditEvent(ev)}
                            className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-gray-200 transition-all cursor-pointer group"
                          >
                              <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                      <div className="p-1.5 rounded-lg text-white shadow-sm" style={{ backgroundColor: mode.color }}>
                                          <mode.icon size={14} />
                                      </div>
                                      <div>
                                          <h4 className="text-sm font-bold text-gray-800 leading-tight">{ev.title}</h4>
                                          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{mode.label}</span>
                                      </div>
                                  </div>
                                  <div className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded">
                                      {ev.startTime ? `${ev.startTime} - ${ev.endTime || ''}` : 'All Day'}
                                  </div>
                              </div>
                              
                              {/* Custom Data Visualization */}
                              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-50">
                                  {Object.entries(ev.data).map(([key, val]) => {
                                      const fieldDef = mode.fields.find(f => f.key === key);
                                      if (!fieldDef || val === '' || val === null) return null;
                                      return (
                                          <div key={key} className="flex flex-col">
                                              <span className="text-[9px] font-bold text-gray-400 uppercase">{fieldDef.label}</span>
                                              <span className="text-xs font-medium text-gray-700 truncate">
                                                  {fieldDef.type === 'checkbox' ? (val ? 'Yes' : 'No') : val.toString()} {fieldDef.suffix}
                                              </span>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      );
                  })}
              </div>

              <div className="p-4 border-t border-gray-200 bg-white">
                  <button 
                    onClick={() => handleAddEvent(selectedDate)}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                      <Icon.Plus size={18} /> Add Entry
                  </button>
              </div>
          </div>
      );
  };

  return (
    <div className="flex h-screen bg-[#f0f4f8] font-sans text-gray-800 overflow-hidden">
        
        {/* MAIN CALENDAR AREA */}
        <div className="flex-1 flex flex-col min-w-0 relative h-full bg-white shadow-xl z-10">
            {/* Header */}
            <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"><Icon.Arrow size={20} className="rotate-180"/></button>
                    <h1 className="font-display font-black text-2xl text-gray-800 tracking-tight">
                        {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h1>
                    <div className="flex items-center bg-gray-100 rounded-lg p-1 ml-4 shadow-inner">
                        <button onClick={handlePrevMonth} className="p-1 hover:bg-white rounded shadow-sm transition-all"><Icon.ChevronLeft size={16}/></button>
                        <button onClick={() => setCurrentDate(new Date())} className="px-3 text-xs font-bold hover:text-indigo-600 transition-colors">Today</button>
                        <button onClick={handleNextMonth} className="p-1 hover:bg-white rounded shadow-sm transition-all"><Icon.ChevronRight size={16}/></button>
                    </div>
                </div>
                
                {/* Mode Filters */}
                <div className="flex gap-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
                    <button 
                        onClick={() => setActiveModeId('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeModeId === 'all' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        <Icon.Grid size={14} /> All
                    </button>
                    {modes.map(mode => (
                        <button 
                            key={mode.id}
                            onClick={() => setActiveModeId(mode.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${activeModeId === mode.id ? 'bg-white shadow ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600'}`}
                            style={activeModeId === mode.id ? { color: mode.color } : {}}
                        >
                            <mode.icon size={14} /> {mode.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {renderGrid()}
        </div>

        {/* RIGHT SIDEBAR (REPORT & DETAILS) */}
        <div className="w-[350px] border-l border-gray-200 bg-white shrink-0 shadow-2xl relative z-20">
            {renderReportPanel()}
        </div>

        {/* --- DYNAMIC EVENT MODAL --- */}
        {isModalOpen && (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsModalOpen(false)}>
                <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                    
                    {/* Modal Header */}
                    <div className="p-6 pb-4 bg-gray-50 border-b border-gray-200 flex justify-between items-start">
                        <div>
                            <h2 className="text-xl font-display font-black text-gray-900">{editingEvent.id ? 'Edit Entry' : 'New Entry'}</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-1">
                                {new Date(editingEvent.date || Date.now()).toDateString()}
                            </p>
                        </div>
                        <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon.Close size={24} /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                        
                        {/* Title & Time */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Title</label>
                                <input 
                                    value={editingEvent.title || ''} 
                                    onChange={e => setEditingEvent({...editingEvent, title: e.target.value})}
                                    placeholder="e.g. Morning Meeting"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                    autoFocus
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Time</label>
                                    <input 
                                        type="time"
                                        value={editingEvent.startTime || ''}
                                        onChange={e => setEditingEvent({...editingEvent, startTime: e.target.value})}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Time</label>
                                    <input 
                                        type="time"
                                        value={editingEvent.endTime || ''}
                                        onChange={e => setEditingEvent({...editingEvent, endTime: e.target.value})}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Mode Selector */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Category (Mode)</label>
                            <div className="grid grid-cols-3 gap-2">
                                {modes.map(mode => (
                                    <button
                                        key={mode.id}
                                        onClick={() => setEditingEvent({...editingEvent, modeId: mode.id, data: {}})} // Reset data on mode switch? Optional.
                                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${editingEvent.modeId === mode.id ? `bg-white border-${mode.color} ring-2 ring-offset-1` : 'bg-gray-50 border-gray-200 hover:bg-white hover:border-gray-300'} ${editingEvent.modeId === mode.id ? 'shadow-md' : ''}`}
                                        style={editingEvent.modeId === mode.id ? { borderColor: mode.color, color: mode.color } : { color: '#6b7280' }}
                                    >
                                        <mode.icon size={20} />
                                        <span className="text-[10px] font-bold uppercase">{mode.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* DYNAMIC FIELDS */}
                        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200/60 space-y-4">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-2 flex items-center gap-2">
                                <Icon.List size={14} /> 
                                {getMode(editingEvent.modeId || 'schedule').label} Details
                            </h3>
                            
                            {getMode(editingEvent.modeId || 'schedule').fields.map(field => (
                                <DynamicInput 
                                    key={field.key}
                                    field={field}
                                    value={editingEvent.data?.[field.key]}
                                    onChange={(val) => setEditingEvent({
                                        ...editingEvent,
                                        data: { ...editingEvent.data, [field.key]: val }
                                    })}
                                />
                            ))}
                        </div>

                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                        {editingEvent.id && (
                            <button 
                                onClick={() => handleDeleteEvent(editingEvent.id!)}
                                className="text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-2 px-3 py-2 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <Icon.Trash size={16} /> Delete
                            </button>
                        )}
                        <div className="flex gap-3 ml-auto">
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-3 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveEvent}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-sm flex items-center gap-2"
                            >
                                <Icon.Check size={18} /> Save Entry
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        )}

    </div>
  );
};
