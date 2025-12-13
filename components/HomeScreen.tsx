
import React, { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { TEMPLATES } from '../constants';
import { supabase } from '../lib/supabase';
import { fetchMapsFromCloud, deleteMapFromCloud, resetCloudStatus } from '../services/cloudService';
import { SettingsModal } from './SettingsModal';
import { UpgradeModal } from './UpgradeModal';

interface MapMetadata {
    id: string;
    name: string;
    lastModified: number;
    isDeleted?: boolean;
    isShared?: boolean;
}

interface HomeScreenProps {
    onOpenMap: (id: string) => void;
    onCreateMap: (data?: any) => void;
    onOpenNotepad: () => void;
    onOpenTables: () => void;
    onOpenScales: () => void;
    onOpenBoard: () => void;
    onOpenCalendar: () => void; // Added Prop
    onBackToLanding: () => void;
    onLoginClick: () => void; 
    user: any; 
}

type TabType = 'MY_MAPS' | 'TEMPLATES' | 'SHARED' | 'TRASH';

export const HomeScreen: React.FC<HomeScreenProps> = ({ onOpenMap, onCreateMap, onOpenNotepad, onOpenTables, onOpenScales, onOpenBoard, onOpenCalendar, onBackToLanding, onLoginClick, user }) => {
    const [maps, setMaps] = useState<MapMetadata[]>([]);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<TabType>('MY_MAPS');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isLoadingCloud, setIsLoadingCloud] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCloudOffline, setIsCloudOffline] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // Delete Confirmation State
    const [deleteConfirmation, setDeleteConfirmation] = useState<{
        isOpen: boolean;
        mapId: string;
        mapName: string;
        isPermanent: boolean;
    } | null>(null);
    const [deleteInput, setDeleteInput] = useState('');

    useEffect(() => {
        if (user) {
            loadCloudMaps();
        } else {
            loadLocalMaps();
        }
    }, [activeTab, user]);

    const loadLocalMaps = () => {
        const indexStr = localStorage.getItem('singularity-maps-index');
        if (indexStr) {
            try {
                let parsed: MapMetadata[] = JSON.parse(indexStr);
                parsed.sort((a, b) => b.lastModified - a.lastModified);
                setMaps(parsed);
            } catch (e) {
                console.error("Failed to load map index");
            }
        }
    };

    const loadCloudMaps = async (isRetry = false) => {
        if (isRetry) {
            resetCloudStatus();
        }
        setIsLoadingCloud(true);
        setIsCloudOffline(false);
        try {
            const cloudMaps = await fetchMapsFromCloud();
            if (cloudMaps === null) {
                // Cloud unavailable
                setIsCloudOffline(true);
                loadLocalMaps();
            } else {
                setMaps(cloudMaps);
            }
        } catch (e) {
            console.error("Failed to load cloud maps, falling back to local", e);
            setIsCloudOffline(true);
            loadLocalMaps();
        } finally {
            setIsLoadingCloud(false);
        }
    };

    // 5 MAP LIMIT LOGIC
    const activeMapsCount = maps.filter(m => !m.isDeleted).length;
    const mapLimit = 5;
    const isLimitReached = activeMapsCount >= mapLimit;

    const handleCreateNewMap = () => {
        if (isLimitReached) {
            setShowUpgradeModal(true);
            return;
        }
        onCreateMap();
    };

    const handleCreateTemplate = (key: string) => {
        if (isLimitReached) {
            setShowUpgradeModal(true);
            return;
        }

        // @ts-ignore
        const templateFn = TEMPLATES[key];
        if (templateFn) {
            const nodes = templateFn(0, 0);
            onCreateMap({ nodes, projectName: `${key.replace(/_/g, ' ')} Template` });
        }
    };

    const requestDelete = (e: React.MouseEvent, map: MapMetadata, isPermanent: boolean = false) => {
        e.stopPropagation();
        setDeleteConfirmation({
            isOpen: true,
            mapId: map.id,
            mapName: map.name,
            isPermanent
        });
        setDeleteInput('');
    };

    const executeDelete = async () => {
        if (!deleteConfirmation) return;
        const { mapId, isPermanent } = deleteConfirmation;

        if (user && !isCloudOffline) {
            // Cloud Delete
            try {
                await deleteMapFromCloud(mapId, isPermanent);
                loadCloudMaps(); // Refresh
            } catch (e) {
                console.error("Delete failed", e);
                alert("Failed to delete map");
            }
        } else {
            // Local Delete
            if (isPermanent) {
                localStorage.removeItem(`singularity-map-${mapId}`);
                const newMaps = maps.filter(m => m.id !== mapId);
                localStorage.setItem('singularity-maps-index', JSON.stringify(newMaps));
                setMaps(newMaps);
            } else {
                const newMaps = maps.map(m => m.id === mapId ? { ...m, isDeleted: true } : m);
                localStorage.setItem('singularity-maps-index', JSON.stringify(newMaps));
                setMaps(newMaps);
            }
        }
        setDeleteConfirmation(null);
    };

    const handleRestore = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (user && !isCloudOffline) {
             // Cloud Restore (Update is_deleted = false)
             await supabase.from('maps').update({ map_data: { isDeleted: false } }).eq('id', id); 
             loadCloudMaps();
        } else {
            const newMaps = maps.map(m => m.id === id ? { ...m, isDeleted: false } : m);
            localStorage.setItem('singularity-maps-index', JSON.stringify(newMaps));
            setMaps(newMaps);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        // No reload needed, App.tsx handles state change
    };

    const filteredMaps = maps.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

    const visibleMaps = filteredMaps.filter(m => {
        if (activeTab === 'TRASH') return m.isDeleted;
        if (activeTab === 'SHARED') return !m.isDeleted && m.isShared;
        if (activeTab === 'MY_MAPS') return !m.isDeleted;
        return false;
    });

    const sharedMaps = activeTab === 'SHARED' && visibleMaps.length === 0 ? [{ id: 'demo-shared', name: 'Team Brainstorm (Demo)', lastModified: Date.now(), isShared: true, isDeleted: false }] : visibleMaps;
    const displayList = activeTab === 'SHARED' ? sharedMaps : visibleMaps;

    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const SidebarButton = ({ id, label, icon: IconC }: { id: TabType, label: string, icon: any }) => (
        <button 
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                activeTab === id 
                ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
            title={isSidebarCollapsed ? label : undefined}
        >
            <IconC size={18} className={activeTab === id ? 'text-blue-600' : 'text-gray-400'} /> 
            {!isSidebarCollapsed && <span className="truncate">{label}</span>}
        </button>
    );

    return (
        <div className="w-full h-full bg-[#f0f4f8] flex overflow-hidden">
            
            {/* Sidebar */}
            <div className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 flex flex-col shrink-0 z-20 shadow-sm transition-all duration-300 ease-in-out`}>
                <div className={`p-6 border-b border-gray-100 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {isSidebarCollapsed ? (
                        <div className="mb-2">
                             <Icon.Brain size={28} className="text-indigo-600" />
                        </div>
                    ) : (
                        <div className="flex flex-col overflow-hidden">
                             <div className="flex items-center gap-3 text-indigo-600 mb-1">
                                <Icon.Brain size={28} className="shrink-0" />
                                <span className="font-display font-black text-xl tracking-tight truncate">SINGULARITY</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-10 truncate">Workspace</span>
                        </div>
                    )}
                </div>

                {/* Profile Section */}
                <div className="px-4 py-4 border-b border-gray-100">
                     {user ? (
                         <div className={`flex flex-col gap-2 ${isSidebarCollapsed ? 'items-center' : ''}`}>
                             <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                                 <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 text-white flex items-center justify-center font-bold text-xs shadow-md cursor-pointer" onClick={() => setIsSettingsOpen(true)}>
                                     {user.email?.[0].toUpperCase()}
                                 </div>
                                 {!isSidebarCollapsed && (
                                     <div className="min-w-0">
                                         <div className="text-xs font-bold text-gray-700 truncate">{user.email}</div>
                                         {isCloudOffline ? (
                                             <div className="flex flex-col items-start">
                                                 <div className="text-[9px] text-orange-600 font-bold flex items-center gap-1">
                                                     <Icon.CloudOff size={10} /> Offline Mode
                                                 </div>
                                                 <button 
                                                    onClick={() => loadCloudMaps(true)}
                                                    className="text-[9px] text-blue-600 hover:underline font-bold ml-3"
                                                 >
                                                    Retry Connection
                                                 </button>
                                             </div>
                                         ) : (
                                             <div className="text-[9px] text-green-600 font-bold flex items-center gap-1">
                                                 <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Online
                                             </div>
                                         )}
                                     </div>
                                 )}
                             </div>
                             
                             {!isSidebarCollapsed ? (
                                <div className="flex gap-1 mt-2">
                                    <button 
                                        onClick={() => setIsSettingsOpen(true)}
                                        className="flex-1 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-[10px] font-bold rounded border border-gray-200 flex items-center justify-center gap-1"
                                    >
                                        <Icon.Settings size={12} /> Settings
                                    </button>
                                    <button 
                                        onClick={handleLogout}
                                        className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold rounded border border-red-100 flex items-center justify-center gap-1"
                                    >
                                        <Icon.LogOut size={12} /> Logout
                                    </button>
                                </div>
                             ) : (
                                 <button onClick={handleLogout} className="text-red-400 hover:text-red-600 p-1" title="Logout">
                                     <Icon.LogOut size={16} />
                                 </button>
                             )}
                         </div>
                     ) : (
                         <button 
                            onClick={onLoginClick}
                            className={`w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-2 ${isSidebarCollapsed ? 'px-0' : 'px-4'}`}
                         >
                             <Icon.Arrow size={14} /> {!isSidebarCollapsed && "Login / Sync"}
                         </button>
                     )}
                </div>

                <div className="flex-1 py-6 px-4 space-y-2 overflow-hidden">
                    <SidebarButton id="MY_MAPS" label="My Maps" icon={Icon.Layout} />
                    
                    {/* MY CALENDAR LINK (NEW) */}
                    <button 
                        onClick={onOpenCalendar}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-gray-600 hover:bg-gray-50 hover:text-gray-900 ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                        title={isSidebarCollapsed ? "My Calendar" : undefined}
                    >
                        <Icon.Calendar size={18} className="text-pink-500" /> 
                        {!isSidebarCollapsed && <span className="truncate">My Calendar</span>}
                    </button>

                    {/* MY NOTEPAD LINK */}
                    <button 
                        onClick={onOpenNotepad}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-gray-600 hover:bg-gray-50 hover:text-gray-900 ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                        title={isSidebarCollapsed ? "My Notepad" : undefined}
                    >
                        <Icon.Notebook size={18} className="text-orange-500" /> 
                        {!isSidebarCollapsed && <span className="truncate">My Notepad</span>}
                    </button>

                    {/* MY BLOCKS LINK */}
                    <button 
                        onClick={onOpenTables}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-gray-600 hover:bg-gray-50 hover:text-gray-900 ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                        title={isSidebarCollapsed ? "My Blocks" : undefined}
                    >
                        <Icon.Grid size={18} className="text-teal-500" /> 
                        {!isSidebarCollapsed && <span className="truncate">My Blocks</span>}
                    </button>

                    {/* MY TIMELINE LINK */}
                    <button 
                        onClick={onOpenScales}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-gray-600 hover:bg-gray-50 hover:text-gray-900 ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                        title={isSidebarCollapsed ? "My Timeline" : undefined}
                    >
                        <Icon.Scale size={18} className="text-purple-500" /> 
                        {!isSidebarCollapsed && <span className="truncate">My Timeline</span>}
                    </button>

                    {/* MY BOARD LINK */}
                    <button 
                        onClick={onOpenBoard}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-gray-600 hover:bg-gray-50 hover:text-gray-900 ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                        title={isSidebarCollapsed ? "My Board" : undefined}
                    >
                        <Icon.Board size={18} className="text-indigo-500" /> 
                        {!isSidebarCollapsed && <span className="truncate">My Board</span>}
                    </button>
                    
                    <div className="h-px bg-gray-100 my-2" />

                    <SidebarButton id="TEMPLATES" label="Templates" icon={Icon.Sparkles} />
                    <SidebarButton id="SHARED" label="Shared with Me" icon={Icon.Share} />
                    <SidebarButton id="TRASH" label="Trash" icon={Icon.Trash} />
                </div>
                
                {/* Map Limit Indicator */}
                {!isSidebarCollapsed && activeTab === 'MY_MAPS' && (
                    <div className="px-4 py-2 mb-2">
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1.5">
                                <span>Free Plan Usage</span>
                                <span className={isLimitReached ? 'text-red-500' : 'text-blue-500'}>{activeMapsCount} / {mapLimit}</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${isLimitReached ? 'bg-red-500' : 'bg-blue-500'}`} 
                                    style={{ width: `${Math.min((activeMapsCount / mapLimit) * 100, 100)}%` }}
                                />
                            </div>
                            {isLimitReached && (
                                <div onClick={() => setShowUpgradeModal(true)} className="text-[9px] text-red-500 mt-2 font-bold cursor-pointer hover:underline text-center">
                                    Limit Reached. Upgrade Now &rarr;
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="p-4 border-t border-gray-200">
                    <button onClick={onBackToLanding} className={`flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors w-full px-2 py-2 rounded-lg hover:bg-gray-50 ${isSidebarCollapsed ? 'justify-center' : ''}`} title={isSidebarCollapsed ? "Back to Landing" : undefined}>
                        <Icon.Arrow className="rotate-180 shrink-0" size={12} /> 
                        {!isSidebarCollapsed && <span className="truncate">Back to Landing</span>}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden relative bg-[#f8f9fa]">
                 {/* Decorative background elements */}
                <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-white to-transparent pointer-events-none" />

                <div className="p-8 pb-4 flex items-center justify-between relative z-10 shrink-0">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <button 
                                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                                className="p-2 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm hover:shadow-md active:scale-95"
                                title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                            >
                                <Icon.PanelLeft size={20} />
                            </button>
                            <h1 className="text-3xl font-display font-black text-gray-800 flex items-center gap-3">
                                {activeTab === 'MY_MAPS' && <><Icon.Layout className="text-blue-500"/> My Maps</>}
                                {activeTab === 'TEMPLATES' && <><Icon.Sparkles className="text-purple-500"/> Templates</>}
                                {activeTab === 'SHARED' && <><Icon.Share className="text-green-500"/> Shared with Me</>}
                                {activeTab === 'TRASH' && <><Icon.Trash className="text-red-500"/> Trash</>}
                            </h1>
                        </div>
                        <p className="text-gray-500 font-medium ml-14">
                            {activeTab === 'MY_MAPS' && (isCloudOffline ? 'Local Workspace (Offline)' : (user ? 'Cloud Workspace (Synced)' : 'Local Workspace (Unsynced)'))}
                            {activeTab === 'TEMPLATES' && 'Start fast with pre-built structures'}
                            {activeTab === 'SHARED' && 'Collaborate on ideas with your team'}
                            {activeTab === 'TRASH' && 'Deleted maps (stored for 30 days)'}
                        </p>
                    </div>
                    
                    <div className="flex gap-4">
                        {(activeTab === 'MY_MAPS' || activeTab === 'TEMPLATES') && (
                            <div className="relative group">
                                <Icon.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Search..." 
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm w-64 transition-all"
                                />
                            </div>
                        )}
                        {(activeTab === 'MY_MAPS' || activeTab === 'TEMPLATES') && (
                            <button 
                                onClick={handleCreateNewMap}
                                className={`${isLimitReached ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5'} text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 active:scale-95`}
                                title={isLimitReached ? "Map Limit Reached" : "Create New Map"}
                            >
                                {isLimitReached ? <Icon.Lock size={18} /> : <Icon.Plus size={18} strokeWidth={3} />} 
                                New Map
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 pt-2 content-start relative z-10 custom-scrollbar">
                    
                    {isLoadingCloud ? (
                        <div className="flex flex-col items-center justify-center h-64">
                             <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
                             <p className="text-gray-500 font-bold">Syncing with Cloud...</p>
                        </div>
                    ) : (
                        <>
                        {/* MY MAPS VIEW */}
                        {activeTab === 'MY_MAPS' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                                <button 
                                    onClick={handleCreateNewMap}
                                    className={`group relative aspect-[4/3] bg-white/50 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 transition-all
                                        ${isLimitReached 
                                            ? 'border-red-200 hover:bg-red-50 cursor-not-allowed' 
                                            : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'
                                        }
                                    `}
                                >
                                    <div className={`w-16 h-16 rounded-full shadow-sm flex items-center justify-center transition-transform border border-gray-100 ${isLimitReached ? '' : 'group-hover:scale-110 bg-white'}`}>
                                        {isLimitReached ? <Icon.Lock className="text-red-400" size={32} /> : <Icon.Plus className="text-indigo-500" size={32} />}
                                    </div>
                                    <span className={`font-bold ${isLimitReached ? 'text-red-400' : 'text-gray-500 group-hover:text-indigo-600'}`}>
                                        {isLimitReached ? "Upgrade to Create" : "Create New Map"}
                                    </span>
                                </button>

                                {displayList.map(map => (
                                    <div 
                                        key={map.id}
                                        onClick={() => onOpenMap(map.id)}
                                        className="group bg-white rounded-2xl shadow-clay-sm border border-white hover:shadow-clay-md hover:-translate-y-1 transition-all cursor-pointer overflow-hidden flex flex-col aspect-[4/3] relative ring-1 ring-black/5"
                                    >
                                        <div className="flex-1 bg-gray-50 relative overflow-hidden p-4 group-hover:bg-blue-50/30 transition-colors">
                                            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:10px_10px]" />
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-10 bg-white rounded-lg border-2 border-gray-200 shadow-sm flex items-center justify-center transform group-hover:scale-110 transition-transform duration-500">
                                                <div className="w-8 h-1.5 bg-gray-200 rounded-full" />
                                            </div>
                                            <div className="absolute top-1/2 left-1/2 w-32 h-32 -translate-x-1/2 -translate-y-1/2 border border-gray-200 rounded-full opacity-30" />
                                        </div>

                                        <div className="p-4 border-t border-gray-100 flex items-start justify-between bg-white relative z-10">
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-gray-800 truncate max-w-[140px] group-hover:text-indigo-600 transition-colors text-sm">{map.name}</h3>
                                                <p className="text-xs text-gray-400 mt-1 font-medium">Edited {formatDate(map.lastModified)}</p>
                                            </div>
                                            <button 
                                                onClick={(e) => requestDelete(e, map, false)}
                                                className="p-2 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="Move to Trash"
                                            >
                                                <Icon.Trash size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* TEMPLATES VIEW */}
                        {activeTab === 'TEMPLATES' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                                {Object.keys(TEMPLATES).map((key) => (
                                    <button
                                        key={key}
                                        onClick={() => handleCreateTemplate(key)}
                                        className="group bg-white p-6 rounded-2xl shadow-clay-sm border border-white hover:shadow-clay-md hover:border-purple-200 hover:ring-2 hover:ring-purple-100 transition-all text-left flex flex-col h-full relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-purple-50 to-transparent rounded-bl-full opacity-50 group-hover:opacity-100 transition-opacity"/>
                                        
                                        <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform text-purple-600 border border-purple-100">
                                            {key === 'SWOT' && <Icon.Grid size={24} />}
                                            {key === 'ROADMAP' && <Icon.Map size={24} />}
                                            {key === 'PROJECT_PLAN' && <Icon.Layers size={24} />}
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-800 mb-1 group-hover:text-purple-700 transition-colors">{key.replace(/_/g, ' ')}</h3>
                                        <p className="text-sm text-gray-500 leading-relaxed">Start with a pre-configured {key.toLowerCase()} structure for rapid planning.</p>
                                        <div className="mt-auto pt-4 flex items-center text-xs font-bold text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0">
                                            Use Template <Icon.Arrow size={12} className="ml-1" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* SHARED VIEW */}
                        {activeTab === 'SHARED' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                                {displayList.map(map => (
                                    <div 
                                        key={map.id}
                                        onClick={() => map.id === 'demo-shared' ? alert("This is a demo shared map.") : onOpenMap(map.id)}
                                        className="group bg-white rounded-2xl shadow-clay-sm border border-white hover:shadow-clay-md hover:border-green-200 transition-all cursor-pointer overflow-hidden flex flex-col aspect-[4/3] relative ring-1 ring-black/5"
                                    >
                                        <div className="absolute top-3 right-3 z-20">
                                            <div className="flex -space-x-2">
                                                <div className="w-6 h-6 rounded-full bg-blue-400 border-2 border-white" />
                                                <div className="w-6 h-6 rounded-full bg-green-400 border-2 border-white" />
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 bg-gray-50 relative overflow-hidden p-4 flex items-center justify-center">
                                            <Icon.Share className="text-green-200 group-hover:text-green-300 group-hover:scale-110 transition-all" size={48} />
                                        </div>

                                        <div className="p-4 border-t border-gray-100 flex items-start justify-between bg-white relative z-10">
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-gray-800 truncate max-w-[140px] group-hover:text-green-600 transition-colors text-sm">{map.name}</h3>
                                                <p className="text-xs text-gray-400 mt-1 font-medium">Shared by Alice</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {displayList.length === 0 && (
                                    <div className="col-span-full flex flex-col items-center justify-center h-64 text-center">
                                        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-4">
                                            <Icon.Share size={32} className="text-green-300" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-700 mb-2">No Shared Maps</h3>
                                        <p className="text-gray-500 max-w-sm">Maps shared with you by other Singularity users will appear here.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TRASH VIEW */}
                        {activeTab === 'TRASH' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                                {displayList.map(map => (
                                    <div 
                                        key={map.id}
                                        className="group bg-white rounded-2xl shadow-sm border border-gray-200 opacity-75 hover:opacity-100 transition-all flex flex-col aspect-[4/3] relative overflow-hidden"
                                    >
                                        <div className="flex-1 bg-gray-100 flex items-center justify-center relative">
                                            <Icon.Trash size={32} className="text-gray-300" />
                                            <div className="absolute inset-0 bg-black/5" />
                                        </div>

                                        <div className="p-4 border-t border-gray-200 bg-white relative z-10">
                                            <h3 className="font-bold text-gray-600 truncate text-sm line-through decoration-red-400">{map.name}</h3>
                                            
                                            <div className="flex gap-2 mt-3">
                                                <button 
                                                    onClick={(e) => handleRestore(e, map.id)}
                                                    className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    Restore
                                                </button>
                                                <button 
                                                    onClick={(e) => requestDelete(e, map, true)}
                                                    className="flex-1 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                
                                {displayList.length === 0 && (
                                    <div className="col-span-full flex flex-col items-center justify-center h-64 text-center">
                                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                            <Icon.Trash size={32} className="text-gray-300" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-700 mb-2">Trash is Empty</h3>
                                        <p className="text-gray-500 max-w-sm">Deleted maps will be stored here for 30 days before permanent deletion.</p>
                                    </div>
                                )}
                            </div>
                        )}
                        </>
                    )}
                </div>
            </div>

            {/* Settings Modal */}
            {user && (
                <SettingsModal 
                    isOpen={isSettingsOpen} 
                    onClose={() => setIsSettingsOpen(false)} 
                    userId={user.id}
                    userEmail={user.email}
                />
            )}

            {/* Upgrade Modal */}
            <UpgradeModal 
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
            />

            {/* Delete Confirmation Modal */}
            {deleteConfirmation && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setDeleteConfirmation(null)}>
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-white/20 p-6 relative overflow-hidden" onClick={e => e.stopPropagation()}>
                        
                        <div className="flex items-center gap-3 mb-4 text-red-600">
                            <div className="p-3 bg-red-50 rounded-xl">
                                <Icon.Trash size={24} />
                            </div>
                            <h2 className="text-xl font-display font-bold text-gray-900">
                                {deleteConfirmation.isPermanent ? 'Delete Forever?' : 'Move to Trash?'}
                            </h2>
                        </div>
                        
                        <p className="text-gray-600 mb-2 text-sm">
                            You are about to delete <b>{deleteConfirmation.mapName}</b>.
                        </p>
                        <p className="text-gray-500 mb-6 text-sm">
                            To confirm deletion, please type <b>Delete</b> below.
                        </p>

                        <input 
                            type="text"
                            value={deleteInput}
                            onChange={(e) => setDeleteInput(e.target.value)}
                            placeholder="Type 'Delete'"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-red-500 transition-all mb-6"
                            autoFocus
                        />

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setDeleteConfirmation(null)}
                                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={executeDelete}
                                disabled={deleteInput !== 'Delete'}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                {deleteConfirmation.isPermanent ? 'Delete Forever' : 'Delete Map'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
