
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Icon } from './Icons';
import * as pdfjsLib from 'pdfjs-dist';
import * as htmlToImage from 'html-to-image';
import { saveFile, getFile } from '../services/localDb';

// Set worker source for PDF.js dynamically
const pdfjsVersion = pdfjsLib.version || '5.4.449';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

interface NotepadScreenProps {
    onBack: () => void;
}

interface AnnotationPath {
    type: 'pen' | 'highlighter';
    points: { x: number; y: number }[];
    color: string;
    width: number;
}

interface ControlPoint {
    x: number;
    y: number;
}

interface StickyNote {
    id: string;
    x: number; // Relative to the Infinite Canvas Center
    y: number; 
    text: string;
    color: string;
    // Anchor is relative to Source Content (0-100%)
    anchor: { x: number; y: number } | null; 
    // Control points for the string (absolute canvas coordinates)
    controlPoints: ControlPoint[];
    minimized: boolean;
    page: number;
    // Connection Styling
    connectionColor?: string;
    connectionStyle?: 'straight' | 'curved' | 'orthogonal';
}

interface NoteConnection {
    id: string;
    sourceId: string;
    targetId: string;
    color?: string;
    style?: 'straight' | 'curved' | 'orthogonal';
    controlPoints?: ControlPoint[];
}

interface TextSection {
    id: string;
    title: string;
    content: string;
    pageLink?: number;
}

interface SavedNotepadMeta {
    id: string;
    title: string;
    lastModified: number;
    hasContent: boolean;
}

interface FullNotepadData {
    id: string;
    title: string;
    sections: TextSection[]; 
    activeSectionId: string;
    sourceName?: string;
    sourceType?: 'PDF' | 'IMAGE';
    annotations: Record<number, AnnotationPath[]>;
    stickyNotes?: Record<number, StickyNote[]>;
    noteConnections?: Record<number, NoteConnection[]>;
    lastModified: number;
    pdfBase64?: string; // Legacy support
}

const NOTE_COLORS = ['#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7', '#f3f4f6', '#ffedd5'];
const LINK_COLORS = ['#cbd5e1', '#94a3b8', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#000000'];
const generateId = () => `note_${Math.random().toString(36).substr(2, 9)}`;
const generateConnId = () => `conn_${Math.random().toString(36).substr(2, 9)}`;

// Infinite Canvas Config
const CANVAS_SIZE = 8000;
const CANVAS_CENTER = CANVAS_SIZE / 2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const INITIAL_ZOOM = 0.8;
const MAX_HISTORY = 100;

// Catmull-Rom Spline Helper for smooth string bending
const solveCatmullRom = (p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, tension: number = 0.5) => {
    const t0 = {
        x: (p2.x - p0.x) * tension,
        y: (p2.y - p0.y) * tension
    };
    const t1 = {
        x: (p3.x - p1.x) * tension,
        y: (p3.y - p1.y) * tension
    };
    return {
        cp1: { x: p1.x + t0.x / 3, y: p1.y + t0.y / 3 },
        cp2: { x: p2.x - t1.x / 3, y: p2.y - t1.y / 3 }
    };
};

const ConnectionRenderer: React.FC<{
    points: { x: number; y: number }[];
    style: 'straight' | 'curved' | 'orthogonal';
    color: string;
    isHovered: boolean;
    onHover: (h: boolean) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    renderAnchors?: boolean;
    anchorPos?: { x: number; y: number };
    noteId?: string;
    onAnchorDrag?: (e: React.MouseEvent) => void;
    controlPoints?: ControlPoint[];
    onControlPointDrag?: (index: number, e: React.MouseEvent, pt: {x: number, y: number}) => void;
    onControlPointContextMenu?: (index: number, e: React.MouseEvent) => void;
}> = ({ points, style, color, isHovered, onHover, onContextMenu, renderAnchors, anchorPos, onAnchorDrag, controlPoints, onControlPointDrag, onControlPointContextMenu }) => {
    const pathData = useMemo(() => {
        if (points.length < 2) return '';
        const start = points[0];
        
        if (style === 'straight') {
             return `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`;
        }

        if (style === 'orthogonal') {
            let d = `M ${start.x} ${start.y}`;
            for (let i = 0; i < points.length - 1; i++) {
                const curr = points[i];
                const next = points[i+1];
                const midX = (curr.x + next.x) / 2;
                d += ` L ${midX} ${curr.y} L ${midX} ${next.y} L ${next.x} ${next.y}`;
            }
            return d;
        }

        if (points.length === 2) {
             const end = points[1];
             const dx = end.x - start.x;
             const curvature = Math.min(Math.abs(dx) * 0.8, 150);
             return `M ${start.x} ${start.y} C ${start.x + curvature} ${start.y}, ${end.x - curvature} ${end.y}, ${end.x} ${end.y}`;
        } else {
             let d = `M ${points[0].x} ${points[0].y}`;
             const pStart = { x: points[0].x - (points[1].x - points[0].x), y: points[0].y - (points[1].y - points[0].y) };
             const pEnd = { x: points[points.length-1].x + (points[points.length-1].x - points[points.length-2].x), y: points[points.length-1].y + (points[points.length-1].y - points[points.length-2].y) };
             const fullPoints = [pStart, ...points, pEnd];
             for (let i = 1; i < fullPoints.length - 2; i++) {
                 const p0 = fullPoints[i-1];
                 const p1 = fullPoints[i];
                 const p2 = fullPoints[i+1];
                 const p3 = fullPoints[i+2];
                 const { cp1, cp2 } = solveCatmullRom(p0, p1, p2, p3);
                 d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
             }
             return d;
        }
    }, [points, style]);

    return (
        <g 
            onMouseEnter={() => onHover(true)} 
            onMouseLeave={() => onHover(false)} 
            onContextMenu={onContextMenu} 
            className="group"
            style={{ pointerEvents: 'auto' }}
        >
            {/* INVISIBLE HIT AREA FOR PATH - WIDER FOR EASIER HOVER/GRAB */}
            <path 
                d={pathData} 
                fill="none" 
                stroke="transparent" 
                strokeWidth={30} 
                className="cursor-pointer" 
            />

            {/* VISIBLE PATH */}
            <path 
                d={pathData} 
                fill="none" 
                stroke={color} 
                strokeWidth={isHovered ? 4 : 2} 
                strokeDasharray={style === 'straight' ? '5,5' : 'none'} 
                strokeLinecap="round" 
                className="pointer-events-none" 
            />

            {/* ANCHOR POINT */}
            {renderAnchors && anchorPos && (
                <g 
                    className="cursor-move" 
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                        onAnchorDrag && onAnchorDrag(e);
                    }}
                >
                    <circle cx={anchorPos.x} cy={anchorPos.y} r={24} fill="transparent" />
                    {/* Fixed radius instead of scale transform to prevent "flying away" effect */}
                    <circle cx={anchorPos.x} cy={anchorPos.y} r={isHovered ? 7 : 5} fill={color} stroke="white" strokeWidth={2} pointerEvents="none" />
                </g>
            )}

            {/* CONTROL POINTS */}
            {controlPoints && controlPoints.length > 0 && controlPoints.map((cp, idx) => (
                 <g 
                    key={idx} 
                    className="cursor-pointer" 
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                        onControlPointDrag && onControlPointDrag(idx, e, cp);
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onControlPointContextMenu && onControlPointContextMenu(idx, e);
                    }}
                 >
                    {/* Invisible Hit Circle */}
                    <circle cx={cp.x} cy={cp.y} r={20} fill="transparent" />
                    {/* Visible Control Point - Fixed radius to avoid CSS transform origin issues */}
                    <circle cx={cp.x} cy={cp.y} r={isHovered ? 7 : 5} fill="white" stroke={color} strokeWidth={2} pointerEvents="none" />
                 </g>
            ))}
        </g>
    );
};

const NotepadMinimap: React.FC<{
    viewport: { x: number, y: number, zoom: number };
    setViewport: React.Dispatch<React.SetStateAction<{ x: number, y: number, zoom: number }>>;
    contentDimensions: { width: number, height: number } | null;
    stickyNotes: StickyNote[];
    containerSize: { width: number, height: number };
}> = ({ viewport, setViewport, contentDimensions, stickyNotes, containerSize }) => {
    const MINIMAP_SIZE = 150;
    const SCALE = MINIMAP_SIZE / CANVAS_SIZE;
    const ref = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const updateViewport = (clientX: number, clientY: number) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        
        const mx = Math.max(0, Math.min(MINIMAP_SIZE, clientX - rect.left));
        const my = Math.max(0, Math.min(MINIMAP_SIZE, clientY - rect.top));
        
        const canvasX = mx / SCALE;
        const canvasY = my / SCALE;
        
        const newX = (containerSize.width / 2) - (canvasX * viewport.zoom);
        const newY = (containerSize.height / 2) - (canvasY * viewport.zoom);
        
        setViewport(prev => ({ ...prev, x: newX, y: newY }));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        updateViewport(e.clientX, e.clientY);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                e.preventDefault();
                updateViewport(e.clientX, e.clientY);
            }
        };
        const handleMouseUp = () => {
            setIsDragging(false);
        };
        
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, viewport.zoom, containerSize]);

    const viewRect = {
        x: (-viewport.x / viewport.zoom) * SCALE,
        y: (-viewport.y / viewport.zoom) * SCALE,
        w: (containerSize.width / viewport.zoom) * SCALE,
        h: (containerSize.height / viewport.zoom) * SCALE
    };

    const contentRect = contentDimensions ? {
        x: (CANVAS_CENTER - contentDimensions.width / 2) * SCALE,
        y: (CANVAS_CENTER - contentDimensions.height / 2) * SCALE,
        w: contentDimensions.width * SCALE,
        h: contentDimensions.height * SCALE
    } : null;

    return (
        <div 
            ref={ref}
            className="absolute bottom-6 right-6 bg-white border-2 border-gray-200 shadow-xl rounded-xl overflow-hidden z-50 cursor-pointer hover:border-indigo-400 transition-colors"
            style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
            onMouseDown={handleMouseDown}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="w-full h-full bg-gray-50 relative pointer-events-none">
                 <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#9ca3af 1px, transparent 1px)', backgroundSize: '10px 10px' }} />
                {contentRect && <div className="absolute bg-white border border-gray-300 shadow-sm" style={{ left: contentRect.x, top: contentRect.y, width: contentRect.w, height: contentRect.h }} />}
                {stickyNotes.map(note => <div key={note.id} className="absolute rounded-sm" style={{ left: note.x * SCALE, top: note.y * SCALE, width: (note.minimized ? 20 : 100) * SCALE, height: (note.minimized ? 20 : 80) * SCALE, backgroundColor: note.color, border: '1px solid rgba(0,0,0,0.1)' }} />)}
                <div className="absolute border-2 border-red-500 bg-red-500/10 cursor-move" style={{ left: viewRect.x, top: viewRect.y, width: viewRect.w, height: viewRect.h, pointerEvents: 'none' }} />
            </div>
        </div>
    );
};

export const NotepadScreen: React.FC<NotepadScreenProps> = ({ onBack }) => {
    // --- Global State ---
    const [activePadId, setActivePadId] = useState<string | null>(null);
    const [savedPads, setSavedPads] = useState<SavedNotepadMeta[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [activeTab, setActiveTab] = useState<'PADS' | 'NOTES'>('PADS');
    const [isLoading, setIsLoading] = useState(false);
    
    // --- Current Pad State ---
    const [title, setTitle] = useState('Untitled Note');
    const [sections, setSections] = useState<TextSection[]>([{ id: 'default', title: 'General Notes', content: '' }]);
    const [activeSectionId, setActiveSectionId] = useState<string>('default');
    
    // --- Source Content State (PDF or Image) ---
    const [sourceName, setSourceName] = useState<string | null>(null);
    const [sourceType, setSourceType] = useState<'PDF' | 'IMAGE' | null>(null);
    const [sourceData, setSourceData] = useState<ArrayBuffer | string | null>(null);
    const [pdfDocument, setPdfDocument] = useState<any>(null);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [pdfError, setPdfError] = useState<string | null>(null);
    
    const [aiLanguage, setAiLanguage] = useState("English");
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);

    const [contentDimensions, setContentDimensions] = useState<{ width: number, height: number } | null>(null);
    const hasAutoCentered = useRef(false);

    const [viewport, setViewport] = useState<{ x: number, y: number, zoom: number }>(() => ({
        x: (window.innerWidth / 2) - (CANVAS_CENTER * INITIAL_ZOOM),
        y: (window.innerHeight / 2) - (CANVAS_CENTER * INITIAL_ZOOM),
        zoom: INITIAL_ZOOM
    }));
    const [containerDimensions, setContainerDimensions] = useState<{ width: number, height: number }>({ width: 0, height: 0 });

    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    
    const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'select' | 'note'>('select');
    const [color, setColor] = useState('#ef4444');
    const [annotations, setAnnotations] = useState<Record<number, AnnotationPath[]>>({});
    const [stickyNotes, setStickyNotes] = useState<Record<number, StickyNote[]>>({});
    const [noteConnections, setNoteConnections] = useState<Record<number, NoteConnection[]>>({});

    const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
    
    // --- History Stack ---
    const [history, setHistory] = useState<Array<{annotations: Record<number, AnnotationPath[]>, stickyNotes: Record<number, StickyNote[]>, noteConnections: Record<number, NoteConnection[]>}>>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const [dragTarget, setDragTarget] = useState<{ id: string, type: 'note' | 'anchor' | 'controlPoint' | 'connPoint', index?: number, parentId?: string } | null>(null);
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

    const [linkingState, setLinkingState] = useState<{ sourceId: string, currentPos: { x: number, y: number } } | null>(null);
    const [anchorLinkingState, setAnchorLinkingState] = useState<{ noteId: string, currentPos: { x: number, y: number } } | null>(null);
    
    const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const cachedCanvasRect = useRef<DOMRect | null>(null);
    const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
    
    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ 
        x: number, 
        y: number, 
        type: 'connection' | 'canvas' | 'note' | 'controlPoint', 
        id?: string, 
        connectionType?: 'noteConnection' | 'anchorConnection', 
        pointIndex?: number,
        clickPos?: { x: number, y: number } // Store click position for creating points
    } | null>(null);

    const [splitRatio, setSplitRatio] = useState(30);
    const splitContainerRef = useRef<HTMLDivElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const captureContainerRef = useRef<HTMLDivElement>(null); 
    const isResizing = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const currentPath = useRef<AnnotationPath | null>(null);
    const renderTaskRef = useRef<any>(null);
    const lastDrawPoint = useRef<{ x: number, y: number } | null>(null);

    useEffect(() => { loadIndex(); }, []);

    useEffect(() => {
        const tabElement = document.getElementById(`tab-btn-${activeSectionId}`);
        if (tabElement) tabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [activeSectionId]);

    useEffect(() => {
        if (!canvasContainerRef.current) return;
        const ro = new ResizeObserver(entries => {
            for (let entry of entries) setContainerDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        ro.observe(canvasContainerRef.current);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const handleGlobalClick = (e: MouseEvent) => {
            if (contextMenu) setContextMenu(null);
            if (selectedNoteId) {
                const target = e.target as HTMLElement;
                if (!target.closest('[id^="sticky-note-"]')) setSelectedNoteId(null);
            }
        };
        window.addEventListener('mousedown', handleGlobalClick);
        return () => window.removeEventListener('mousedown', handleGlobalClick);
    }, [contextMenu, selectedNoteId]);

    // --- Unified History Management ---
    const commitToHistory = (
        newAnnotations: Record<number, AnnotationPath[]>, 
        newNotes: Record<number, StickyNote[]>, 
        newConns: Record<number, NoteConnection[]>
    ) => {
        setAnnotations(newAnnotations);
        setStickyNotes(newNotes);
        setNoteConnections(newConns);

        setHistory(prevHistory => {
            const newHistory = prevHistory.slice(0, historyIndex + 1);
            newHistory.push({
                annotations: JSON.parse(JSON.stringify(newAnnotations)),
                stickyNotes: JSON.parse(JSON.stringify(newNotes)),
                noteConnections: JSON.parse(JSON.stringify(newConns))
            });
            if (newHistory.length > MAX_HISTORY) newHistory.shift();
            return newHistory;
        });
        
        setHistoryIndex(prev => {
             const historyLength = Math.min(history.slice(0, historyIndex + 1).length + 1, MAX_HISTORY);
             return historyLength - 1;
        });
    };

    const undo = () => {
        if (historyIndex > 0) {
            const prev = history[historyIndex - 1];
            setAnnotations(prev.annotations);
            setStickyNotes(prev.stickyNotes);
            setNoteConnections(prev.noteConnections || {});
            setHistoryIndex(historyIndex - 1);
            setTimeout(() => requestAnimationFrame(redrawAnnotations), 0);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            const next = history[historyIndex + 1];
            setAnnotations(next.annotations);
            setStickyNotes(next.stickyNotes);
            setNoteConnections(next.noteConnections || {});
            setHistoryIndex(historyIndex + 1);
            setTimeout(() => requestAnimationFrame(redrawAnnotations), 0);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [history, historyIndex]);

    useEffect(() => {
        const container = canvasContainerRef.current;
        if (!container) return;
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                const zoomSensitivity = 0.0015;
                const delta = -e.deltaY * zoomSensitivity;
                setViewport(prev => {
                    const newZoom = Math.min(Math.max(MIN_ZOOM, prev.zoom + delta), MAX_ZOOM);
                    const rect = container.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const worldX = (mouseX - prev.x) / prev.zoom;
                    const worldY = (mouseY - prev.y) / prev.zoom;
                    const newX = mouseX - worldX * newZoom;
                    const newY = mouseY - worldY * newZoom;
                    return { x: newX, y: newY, zoom: newZoom };
                });
            } else {
                setViewport(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
        };
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    useEffect(() => {
        if (!sourceType || numPages === 0) return;
        const existingSection = sections.find(s => s.pageLink === pageNum);
        if (existingSection) {
            setActiveSectionId(existingSection.id);
        } else {
            if ((sourceType === 'PDF' && numPages >= 1) || (sourceType === 'IMAGE' && numPages === 1)) {
                const newId = generateId();
                const newSection: TextSection = { id: newId, title: `Page ${pageNum} Notes`, content: '', pageLink: pageNum };
                setSections(prev => [...prev, newSection]);
                setActiveSectionId(newId);
            }
        }
    }, [pageNum, sourceType, numPages]);

    const loadIndex = () => {
        try {
            const indexStr = localStorage.getItem('singularity-notepad-index');
            if (indexStr) {
                const index = JSON.parse(indexStr);
                index.sort((a: any, b: any) => b.lastModified - a.lastModified);
                setSavedPads(index);
                if (index.length > 0 && !activePadId) loadNotepad(index[0].id);
                else if (index.length === 0 && !activePadId) createNewNotepad();
            } else createNewNotepad();
        } catch (e) { console.error("Failed to load index", e); }
    };

    const createNewNotepad = () => {
        const newId = generateId();
        const newPad: SavedNotepadMeta = { id: newId, title: "New Untitled Note", lastModified: Date.now(), hasContent: false };
        setActivePadId(newId); setTitle(newPad.title); setSections([{ id: 'default', title: 'General Notes', content: '' }]); setActiveSectionId('default'); setSourceName(null); setSourceData(null); setSourceType(null); setPdfDocument(null); setAnnotations({}); setStickyNotes({}); setNoteConnections({}); setPageNum(1); setNumPages(0); setContentDimensions(null); hasAutoCentered.current = false;
        saveToStorage(newId, newPad.title, [{ id: 'default', title: 'General Notes', content: '' }], 'default', null, null, null, {}, {}, {});
        const newIndex = [newPad, ...savedPads];
        setSavedPads(newIndex);
        localStorage.setItem('singularity-notepad-index', JSON.stringify(newIndex));
        setHistory([{ annotations: {}, stickyNotes: {}, noteConnections: {} }]);
        setHistoryIndex(0);
    };

    const loadNotepad = async (id: string) => {
        setIsLoading(true); setSaveStatus('saved'); hasAutoCentered.current = false;
        try {
            const dataStr = localStorage.getItem(`singularity-notepad-${id}`);
            if (dataStr) {
                const data: FullNotepadData = JSON.parse(dataStr);
                setActivePadId(data.id); setTitle(data.title);
                if ((data as any).text && !data.sections) { setSections([{ id: 'default', title: 'General Notes', content: (data as any).text }]); setActiveSectionId('default'); } 
                else { setSections(data.sections || [{ id: 'default', title: 'General Notes', content: '' }]); setActiveSectionId(data.activeSectionId || (data.sections && data.sections[0]?.id) || 'default'); }
                
                const loadedAnnotations = data.annotations || {};
                const loadedNotes = data.stickyNotes || {};
                const loadedConnections = data.noteConnections || {};

                Object.values(loadedNotes).forEach(pageNotes => {
                    pageNotes.forEach(n => { if(!n.controlPoints) n.controlPoints = []; });
                });

                setAnnotations(loadedAnnotations); setStickyNotes(loadedNotes); setNoteConnections(loadedConnections);
                setHistory([{ annotations: loadedAnnotations, stickyNotes: loadedNotes, noteConnections: loadedConnections }]); 
                setHistoryIndex(0);

                setSourceName(data.sourceName || null); setSourceType(data.sourceType || null);

                const dbData = await getFile(id);
                let loadedSourceData = dbData || null;
                if (!loadedSourceData) {
                    if ((data as any).sourceData) loadedSourceData = (data as any).sourceData;
                    else if ((data as any).pdfBase64) loadedSourceData = (data as any).pdfBase64;
                }

                if (loadedSourceData) {
                    if (data.sourceType === 'IMAGE') {
                        setSourceData(loadedSourceData); setNumPages(1); setPageNum(1);
                    } else {
                        if (typeof loadedSourceData === 'string') {
                             const base64 = loadedSourceData.includes(',') ? loadedSourceData.split(',')[1] : loadedSourceData;
                             const binaryString = window.atob(base64);
                             const bytes = new Uint8Array(binaryString.length);
                             for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                             setSourceData(bytes.buffer);
                        } else { setSourceData(loadedSourceData); }
                    }
                } else { setSourceData(null); setPdfDocument(null); setNumPages(0); setContentDimensions(null); }
            }
        } catch (e) { console.error("Failed to load notepad", e); } finally { setIsLoading(false); }
    };

    const saveCurrentState = useCallback(async () => {
        if (!activePadId) return;
        setSaveStatus('saving');
        try {
            if (sourceData) await saveFile(activePadId, sourceData);
            saveToStorage(activePadId, title, sections, activeSectionId, sourceName, null, sourceType, annotations, stickyNotes, noteConnections);
            setSaveStatus('saved');
        } catch (e) { console.error("Save failed", e); setSaveStatus('error'); }
    }, [activePadId, title, sections, activeSectionId, sourceData, sourceName, sourceType, annotations, stickyNotes, noteConnections]);

    const saveToStorage = (id: string, t: string, secs: TextSection[], activeSec: string, sName: string | null, sData: string | null, sType: 'PDF'|'IMAGE'|null, ann: any, sticks: any, conns: any) => {
        const data: FullNotepadData = { id, title: t, sections: secs, activeSectionId: activeSec, sourceName: sName || undefined, sourceType: sType || undefined, annotations: ann, stickyNotes: sticks, noteConnections: conns, lastModified: Date.now() };
        localStorage.setItem(`singularity-notepad-${id}`, JSON.stringify(data));
        const updatedMeta: SavedNotepadMeta = { id, title: t, lastModified: Date.now(), hasContent: !!sName };
        const currentIndexStr = localStorage.getItem('singularity-notepad-index');
        let currentIndex: SavedNotepadMeta[] = currentIndexStr ? JSON.parse(currentIndexStr) : [];
        const existingIdx = currentIndex.findIndex(p => p.id === id);
        if (existingIdx >= 0) currentIndex[existingIdx] = updatedMeta; else currentIndex.unshift(updatedMeta);
        currentIndex.sort((a, b) => b.lastModified - a.lastModified);
        localStorage.setItem('singularity-notepad-index', JSON.stringify(currentIndex));
        setSavedPads(currentIndex);
    };

    useEffect(() => {
        const timer = setTimeout(() => { if (activePadId) saveCurrentState(); }, 2000);
        return () => clearTimeout(timer);
    }, [sections, activeSectionId, annotations, stickyNotes, noteConnections, title, activePadId]);

    const handleAddSection = () => { const newSec = { id: generateId(), title: 'New Section', content: '' }; setSections([...sections, newSec]); setActiveSectionId(newSec.id); };
    const handleDeleteSection = (secId: string) => { 
        if(sections.length <= 1) {
             setSections([{ id: 'default', title: 'General Notes', content: '' }]);
             setActiveSectionId('default');
             return;
        }
        const newSecs = sections.filter(s => s.id !== secId); 
        setSections(newSecs); 
        if (activeSectionId === secId) setActiveSectionId(newSecs[0].id);
    };
    const handleUpdateSection = (secId: string, updates: Partial<TextSection>) => { setSections(prev => prev.map(s => s.id === secId ? { ...s, ...updates } : s)); };
    const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];

    const centerView = useCallback(() => {
        if (!canvasContainerRef.current || !contentDimensions) return;
        const rect = canvasContainerRef.current.getBoundingClientRect();
        const { width: contentW, height: contentH } = contentDimensions;
        const margin = 60; 
        const availW = rect.width - (margin * 2);
        const availH = rect.height - (margin * 2);
        let fitZoom = 0.8;

        if (contentW > 0 && contentH > 0) {
            const scaleW = availW / contentW;
            const scaleH = availH / contentH;
            fitZoom = Math.min(scaleW, scaleH);
            fitZoom = Math.min(Math.max(fitZoom, MIN_ZOOM), MAX_ZOOM);
        }
        const newX = (rect.width / 2) - (CANVAS_CENTER * fitZoom);
        const newY = (rect.height / 2) - (CANVAS_CENTER * fitZoom);
        setViewport({ x: newX, y: newY, zoom: fitZoom });
    }, [contentDimensions]);

    useEffect(() => {
        if (contentDimensions && !hasAutoCentered.current && canvasContainerRef.current) {
            const timer = setTimeout(() => {
                centerView();
                hasAutoCentered.current = true;
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [contentDimensions, centerView]);

    useEffect(() => {
        if (!sourceData || sourceType !== 'PDF') return;
        const loadPdf = async () => {
            setPdfError(null);
            try {
                const bufferCopy = sourceData instanceof ArrayBuffer ? sourceData.slice(0) : sourceData;
                let data;
                if (typeof bufferCopy === 'string') {
                     const base64 = bufferCopy.includes(',') ? bufferCopy.split(',')[1] : bufferCopy;
                     const binaryString = window.atob(base64);
                     data = new Uint8Array(binaryString.length);
                     for (let i = 0; i < binaryString.length; i++) data[i] = binaryString.charCodeAt(i);
                } else { data = new Uint8Array(bufferCopy as ArrayBuffer); }
                const loadingTask = pdfjsLib.getDocument({ data, cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/cmaps/`, cMapPacked: true });
                const pdf = await loadingTask.promise;
                setPdfDocument(pdf); setNumPages(pdf.numPages);
            } catch (err) { console.error("Error loading PDF:", err); setPdfError("Failed to load PDF."); }
        };
        loadPdf();
    }, [sourceData, sourceType]);

    useEffect(() => {
        if (!sourceData || sourceType !== 'IMAGE') return;
        const img = new Image();
        img.onload = () => { setContentDimensions({ width: img.width, height: img.height }); setNumPages(1); setPageNum(1); };
        img.src = sourceData as string;
    }, [sourceData, sourceType]);

    const [renderScale, setRenderScale] = useState(1.5);
    useEffect(() => { if (isDrawing.current) return; const targetScale = Math.max(1.5, viewport.zoom * 1.5); const timer = setTimeout(() => { setRenderScale(targetScale); }, 200); return () => clearTimeout(timer); }, [viewport.zoom]);

    useEffect(() => {
        if (sourceType !== 'PDF' || !pdfDocument || !pdfCanvasRef.current) return;
        let isCancelled = false;
        const renderPage = async () => {
            if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} renderTaskRef.current = null; }
            try {
                const page = await pdfDocument.getPage(pageNum);
                if (isCancelled) return;
                const unscaledViewport = page.getViewport({ scale: 1 });
                setContentDimensions({ width: unscaledViewport.width, height: unscaledViewport.height });
                const pageViewport = page.getViewport({ scale: renderScale });
                const canvas = pdfCanvasRef.current!;
                const context = canvas.getContext('2d')!;
                canvas.height = pageViewport.height; canvas.width = pageViewport.width;
                if (annotationCanvasRef.current) { annotationCanvasRef.current.height = pageViewport.height; annotationCanvasRef.current.width = pageViewport.width; redrawAnnotations(); }
                const renderContext = { canvasContext: context, viewport: pageViewport };
                const task = page.render(renderContext as any);
                renderTaskRef.current = task;
                await task.promise;
                renderTaskRef.current = null;
            } catch (err: any) { if(err.name !== 'RenderingCancelledException') console.error("Page Render Error", err); }
        };
        renderPage();
        return () => { isCancelled = true; if (renderTaskRef.current) try { renderTaskRef.current.cancel(); } catch {} };
    }, [pdfDocument, pageNum, renderScale, sourceType]);

    useEffect(() => {
         if (sourceType === 'IMAGE' && contentDimensions && annotationCanvasRef.current) {
             const w = contentDimensions.width * renderScale; const h = contentDimensions.height * renderScale;
             annotationCanvasRef.current.width = w; annotationCanvasRef.current.height = h;
             redrawAnnotations();
         }
    }, [contentDimensions, renderScale, sourceType]);

    const redrawAnnotations = () => {
        const canvas = annotationCanvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pageAnnotations = annotations[pageNum] || [];
        pageAnnotations.forEach(path => {
            if (!path || !Array.isArray(path.points) || path.points.length < 2) return;
            ctx.beginPath();
            const p0 = path.points[0];
            if (!p0) return;
            ctx.moveTo(p0.x * renderScale, p0.y * renderScale);
            for (let i = 1; i < path.points.length; i++) { const pt = path.points[i]; if (pt) ctx.lineTo(pt.x * renderScale, pt.y * renderScale); }
            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.width * renderScale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = path.type === 'highlighter' ? 0.4 : 1.0;
            ctx.globalCompositeOperation = path.type === 'highlighter' ? 'multiply' : 'source-over';
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
        });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        setSourceName(file.name); setStickyNotes({}); setAnnotations({}); setSections([{ id: 'default', title: 'General Notes', content: '' }]); setActiveSectionId('default'); setContentDimensions(null); hasAutoCentered.current = false; setHistory([{ annotations: {}, stickyNotes: {}, noteConnections: {} }]); setHistoryIndex(0);
        if (file.type === 'application/pdf') {
            const buffer = await file.arrayBuffer(); setSourceType('PDF'); setSourceData(buffer); setPdfDocument(null); setPageNum(1);
        } else if (file.type.startsWith('image/')) {
             const reader = new FileReader();
             reader.onload = (ev) => { if (ev.target?.result) { setSourceType('IMAGE'); setSourceData(ev.target.result as string); setPageNum(1); setNumPages(1); } };
             reader.readAsDataURL(file);
        } else { alert("Unsupported file type."); }
        e.target.value = ''; setTimeout(saveCurrentState, 100);
    };

    const handleExport = async () => {
        if (!captureContainerRef.current) return;
        setIsLoading(true);
        try {
             let minX = CANVAS_CENTER, minY = CANVAS_CENTER, maxX = CANVAS_CENTER, maxY = CANVAS_CENTER;
             if (contentDimensions) {
                 const halfW = contentDimensions.width / 2;
                 const halfH = contentDimensions.height / 2;
                 minX = Math.min(minX, CANVAS_CENTER - halfW);
                 minY = Math.min(minY, CANVAS_CENTER - halfH);
                 maxX = Math.max(maxX, CANVAS_CENTER + halfW);
                 maxY = Math.max(maxY, CANVAS_CENTER + halfH);
             }
             const notes = stickyNotes[pageNum] || [];
             notes.forEach(note => {
                 minX = Math.min(minX, note.x);
                 minY = Math.min(minY, note.y);
                 maxX = Math.max(maxX, note.x + (note.minimized ? 40 : 220));
                 maxY = Math.max(maxY, note.y + (note.minimized ? 40 : 200));
             });
             const padding = 50;
             const cropX = minX - padding;
             const cropY = minY - padding;
             const cropWidth = (maxX - minX) + (padding * 2);
             const cropHeight = (maxY - minY) + (padding * 2);
             await new Promise(r => setTimeout(r, 50));
             const dataUrl = await htmlToImage.toPng(captureContainerRef.current, {
                 width: cropWidth,
                 height: cropHeight,
                 style: {
                     transform: `translate(${-cropX}px, ${-cropY}px) scale(1)`,
                     transformOrigin: 'top left',
                     width: `${cropWidth}px`,
                     height: `${cropHeight}px`,
                     backgroundColor: '#e5e7eb'
                 },
                 pixelRatio: 2,
                 skipAutoScale: true,
                 fontEmbedCSS: '', 
                 cacheBust: true,
             });
             const link = document.createElement('a');
             link.download = `Notepad_Page_${pageNum}.png`;
             link.href = dataUrl;
             link.click();
        } catch (err) { console.error("Export failed", err); alert("Export failed. Please try again."); } finally { setIsLoading(false); }
    };

    // --- STICKY NOTE LOGIC ---
    const addNoteAt = (x: number, y: number, relativeToPdf: boolean = false) => {
        if (!canvasContainerRef.current) return;
        const rect = canvasContainerRef.current.getBoundingClientRect();
        const mouseX = x - rect.left;
        const mouseY = y - rect.top;
        const canvasX = (mouseX - viewport.x) / viewport.zoom;
        const canvasY = (mouseY - viewport.y) / viewport.zoom;

        let anchor = null;
        let contentW = 0; let contentH = 0;
        if (contentDimensions) { contentW = contentDimensions.width; contentH = contentDimensions.height; }

        if (relativeToPdf && contentW > 0) {
            const topLeftX = CANVAS_CENTER - contentW / 2;
            const topLeftY = CANVAS_CENTER - contentH / 2;
            if (canvasX >= topLeftX && canvasX <= topLeftX + contentW && canvasY >= topLeftY && canvasY <= topLeftY + contentH) {
                const anchorX = ((canvasX - topLeftX) / contentW) * 100;
                const anchorY = ((canvasY - topLeftY) / contentH) * 100;
                anchor = { x: anchorX, y: anchorY };
            }
        }
        
        const noteX = relativeToPdf ? canvasX + 50 : canvasX;
        const noteY = relativeToPdf ? canvasY + 50 : canvasY;

        const newId = generateId();
        const newNote: StickyNote = { id: newId, x: noteX, y: noteY, text: '', color: NOTE_COLORS[0], anchor: anchor, minimized: false, page: pageNum, controlPoints: [] };
        const newNotes = { ...stickyNotes, [pageNum]: [...(stickyNotes[pageNum] || []), newNote] };
        
        commitToHistory(annotations, newNotes, noteConnections);
        setSelectedNoteId(newId);
        setTool('select');
    };

    const addChildNote = (parentId: string) => {
        const pageNotes = stickyNotes[pageNum] || [];
        const parent = pageNotes.find(n => n.id === parentId);
        if (!parent) return;

        const newId = generateId();
        const newX = parent.x + 300;
        const newY = parent.y;

        const newNote: StickyNote = { 
            id: newId, x: newX, y: newY, text: '', 
            color: parent.color, anchor: null, minimized: false, page: pageNum, controlPoints: [] 
        };

        const newConn: NoteConnection = {
            id: generateConnId(),
            sourceId: parentId,
            targetId: newId,
            color: '#cbd5e1',
            style: 'curved'
        };

        const newNotes = { ...stickyNotes, [pageNum]: [...pageNotes, newNote] };
        const newConns = { ...noteConnections, [pageNum]: [...(noteConnections[pageNum] || []), newConn] };
        
        commitToHistory(annotations, newNotes, newConns);
        setSelectedNoteId(newId);
    };

    const updateStickyNote = (id: string, updates: Partial<StickyNote>) => {
        const pageNotes = stickyNotes[pageNum] || [];
        const newPageNotes = pageNotes.map(n => n.id === id ? { ...n, ...updates } : n);
        const newNotes = { ...stickyNotes, [pageNum]: newPageNotes };
        setStickyNotes(newNotes);
    };

    const handleNoteTextChange = (id: string, text: string) => {
        const pageNotes = stickyNotes[pageNum] || [];
        const newPageNotes = pageNotes.map(n => n.id === id ? { ...n, text } : n);
        const newNotes = { ...stickyNotes, [pageNum]: newPageNotes };
        setStickyNotes(newNotes);
    };

    const deleteNote = (id: string) => {
        if (!window.confirm("Are you sure you want to delete this note?")) return;
        
        const pageNotes = stickyNotes[pageNum] || [];
        const newPageNotes = pageNotes.filter(n => n.id !== id);
        const newNotes = { ...stickyNotes, [pageNum]: newPageNotes };
        
        const pageConns = noteConnections[pageNum] || [];
        const newPageConns = pageConns.filter(c => c.sourceId !== id && c.targetId !== id);
        const newConns = { ...noteConnections, [pageNum]: newPageConns };

        commitToHistory(annotations, newNotes, newConns);
        if (selectedNoteId === id) setSelectedNoteId(null);
    };

    const deleteConnection = (connId: string) => {
        if (!window.confirm("Delete this connection?")) return;
        const pageConns = noteConnections[pageNum] || [];
        const newPageConns = pageConns.filter(c => c.id !== connId);
        const newConns = { ...noteConnections, [pageNum]: newPageConns };
        commitToHistory(annotations, stickyNotes, newConns);
    }

    const startLinking = (e: React.MouseEvent, sourceId: string) => {
        e.stopPropagation();
        e.preventDefault();
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if(rect) {
             const mouseX = e.clientX - rect.left;
             const mouseY = e.clientY - rect.top;
             const canvasX = (mouseX - viewport.x) / viewport.zoom;
             const canvasY = (mouseY - viewport.y) / viewport.zoom;
             setLinkingState({ sourceId, currentPos: { x: canvasX, y: canvasY } });
        }
    };
    
    const startAnchorLinking = (noteId: string) => {
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if(rect) {
             const note = stickyNotes[pageNum]?.find(n => n.id === noteId);
             if(note) {
                 const startX = note.x + (note.minimized ? 20 : 110);
                 const startY = note.y + 20;
                 setAnchorLinkingState({ noteId, currentPos: { x: startX, y: startY } });
             }
        }
    };

    // --- CONTEXT MENU HANDLERS ---
    const handleConnectionContextMenu = (e: React.MouseEvent, id: string, type: 'noteConnection' | 'anchorConnection') => {
        e.preventDefault();
        e.stopPropagation();
        
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        let clickPos = undefined;
        if (rect) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const canvasX = (mouseX - viewport.x) / viewport.zoom;
            const canvasY = (mouseY - viewport.y) / viewport.zoom;
            clickPos = { x: canvasX, y: canvasY };
        }

        setContextMenu({ 
            x: e.clientX, 
            y: e.clientY, 
            type: 'connection', 
            id, 
            connectionType: type,
            clickPos // Passed for accurate point creation
        });
    };

    const handleContentContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (e.button !== 2) e.stopPropagation(); 
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas' });
    };

    const handleNoteContextMenu = (e: React.MouseEvent, noteId: string) => {
        e.preventDefault();
        e.stopPropagation();
        const note = stickyNotes[pageNum]?.find(n => n.id === noteId);
        if (note && note.minimized) return;
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'note', id: noteId });
    };

    const handleControlPointContextMenu = (index: number, e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'controlPoint', id, pointIndex: index });
    };

    const handleContextMenuAction = (action: string, payload?: any) => {
        if (!contextMenu) return;
        const { id, type, connectionType, pointIndex, clickPos } = contextMenu;

        if (type === 'canvas' && action === 'create_note') {
             addNoteAt(contextMenu.x, contextMenu.y, true);
        } else if (type === 'note' && id) {
            if (action === 'delete') deleteNote(id);
            else if (action === 'color') {
                const updatedNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, color: payload } : n) };
                commitToHistory(annotations, updatedNotes, noteConnections);
            }
            else if (action === 'add_child') addChildNote(id);
            else if (action === 'add_anchor') startAnchorLinking(id);
        } else if (type === 'connection' && id) {
             if (connectionType === 'anchorConnection') {
                 const note = stickyNotes[pageNum]?.find(n => n.id === id);
                 if (note) {
                     if (action === 'delete_link') {
                         if(window.confirm("Delete this anchor link?")) {
                            const updatedNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, anchor: null, controlPoints: [] } : n) };
                            commitToHistory(annotations, updatedNotes, noteConnections);
                         }
                     }
                     else if (action === 'connection_color') {
                        const updatedNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, connectionColor: payload } : n) };
                        commitToHistory(annotations, updatedNotes, noteConnections);
                     }
                     else if (action === 'connection_style') {
                        const updatedNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, connectionStyle: payload } : n) };
                        commitToHistory(annotations, updatedNotes, noteConnections);
                     }
                     else if (action === 'add_point') {
                         const currentPoints = note.controlPoints || [];
                         let newPoint;
                         
                         if (clickPos) {
                             newPoint = clickPos;
                         } else {
                             const ax = note.anchor ? (CANVAS_CENTER - (contentDimensions?.width||0)/2) + (note.anchor.x/100)*(contentDimensions?.width||0) : note.x;
                             const ay = note.anchor ? (CANVAS_CENTER - (contentDimensions?.height||0)/2) + (note.anchor.y/100)*(contentDimensions?.height||0) : note.y;
                             const midX = (ax + note.x) / 2;
                             const midY = (ay + note.y) / 2;
                             newPoint = { x: midX, y: midY };
                         }
                         
                         const updatedNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, controlPoints: [...currentPoints, newPoint] } : n) };
                         commitToHistory(annotations, updatedNotes, noteConnections);
                     }
                 }
             } else if (connectionType === 'noteConnection') {
                 const pageConns = noteConnections[pageNum] || [];
                 const conn = pageConns.find(c => c.id === id);
                 if (conn) {
                     if (action === 'delete_link') deleteConnection(id);
                     else if (action === 'connection_color') {
                          const newConns = { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, color: payload } : c) };
                          commitToHistory(annotations, stickyNotes, newConns);
                     }
                     else if (action === 'connection_style') {
                          const newConns = { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, style: payload } : c) };
                          commitToHistory(annotations, stickyNotes, newConns);
                     }
                     else if (action === 'add_point') {
                          let newPoint;
                          if (clickPos) {
                              newPoint = clickPos;
                          } else {
                              const noteMap = new Map((stickyNotes[pageNum]||[]).map(n=>[n.id, n]));
                              const s = noteMap.get(conn.sourceId);
                              const t = noteMap.get(conn.targetId);
                              if(s && t) {
                                  const midX = (s.x + t.x) / 2;
                                  const midY = (s.y + t.y) / 2;
                                  newPoint = { x: midX, y: midY };
                              } else {
                                  newPoint = { x: 0, y: 0 };
                              }
                          }

                          const newConns = { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, controlPoints: [...(c.controlPoints||[]), newPoint] } : c) };
                          commitToHistory(annotations, stickyNotes, newConns);
                     }
                 }
             }
        } else if (type === 'controlPoint' && id && pointIndex !== undefined) {
             if (action === 'delete_point') {
                  const note = stickyNotes[pageNum]?.find(n => n.id === id);
                  if (note) {
                      const newPoints = [...(note.controlPoints || [])];
                      newPoints.splice(pointIndex, 1);
                      const updatedNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, controlPoints: newPoints } : n) };
                      commitToHistory(annotations, updatedNotes, noteConnections);
                  } else {
                      const pageConns = noteConnections[pageNum] || [];
                      const conn = pageConns.find(c => c.id === id);
                      if (conn && conn.controlPoints) {
                          const newPoints = [...conn.controlPoints];
                          newPoints.splice(pointIndex, 1);
                          const newConns = { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, controlPoints: newPoints } : c) };
                          commitToHistory(annotations, stickyNotes, newConns);
                      }
                  }
             }
        }
        setContextMenu(null);
    };

    // --- DRAG HANDLER (Optimized) ---
    const handleElementMouseDown = useCallback((
        e: React.MouseEvent, 
        target: { id: string, type: 'note' | 'anchor' | 'controlPoint' | 'connPoint', index?: number, parentId?: string }, 
        elementPos: { x: number, y: number }
    ) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        e.preventDefault(); 
        
        mousePosRef.current = { x: e.clientX, y: e.clientY };
        
        if (canvasContainerRef.current) {
            cachedCanvasRect.current = canvasContainerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - cachedCanvasRect.current.left;
            const mouseY = e.clientY - cachedCanvasRect.current.top;
            const canvasX = (mouseX - viewport.x) / viewport.zoom;
            const canvasY = (mouseY - viewport.y) / viewport.zoom;
            
            dragStartOffset.current = {
                x: canvasX - elementPos.x,
                y: canvasY - elementPos.y
            };
        }
        setDragTarget(target);
        if (target.type === 'note') setSelectedNoteId(target.id);
    }, [viewport]);

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        mousePosRef.current = { x: e.clientX, y: e.clientY };

        if (linkingState && canvasContainerRef.current) {
             const rect = canvasContainerRef.current.getBoundingClientRect();
             const mouseX = e.clientX - rect.left;
             const mouseY = e.clientY - rect.top;
             const canvasX = (mouseX - viewport.x) / viewport.zoom;
             const canvasY = (mouseY - viewport.y) / viewport.zoom;
             setLinkingState({ ...linkingState, currentPos: { x: canvasX, y: canvasY } });
        } else if (anchorLinkingState && canvasContainerRef.current) {
             const rect = canvasContainerRef.current.getBoundingClientRect();
             const mouseX = e.clientX - rect.left;
             const mouseY = e.clientY - rect.top;
             const canvasX = (mouseX - viewport.x) / viewport.zoom;
             const canvasY = (mouseY - viewport.y) / viewport.zoom;
             setAnchorLinkingState({ ...anchorLinkingState, currentPos: { x: canvasX, y: canvasY } });
        } else if (isPanning) {
            const currentLastPos = lastMousePos.current as { x: number, y: number };
            const dx = e.clientX - currentLastPos.x;
            const dy = e.clientY - currentLastPos.y;
            setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY }; 
        }
        
        if (dragTarget) e.preventDefault();
    };

    useEffect(() => {
        if (!dragTarget) return;
        let animationFrameId: number;

        const updateLoop = () => {
            if (canvasContainerRef.current) {
                const rect = cachedCanvasRect.current || canvasContainerRef.current.getBoundingClientRect();
                const currentMouse = mousePosRef.current as { x: number, y: number };
                const clientX = currentMouse.x;
                const clientY = currentMouse.y;
                const mouseX = clientX - rect.left;
                const mouseY = clientY - rect.top;
                const canvasX = (mouseX - viewport.x) / viewport.zoom;
                const canvasY = (mouseY - viewport.y) / viewport.zoom;
                
                const dragOffset = dragStartOffset.current as { x: number, y: number };

                if (dragTarget.type === 'note' || dragTarget.type === 'anchor' || dragTarget.type === 'controlPoint') {
                    setStickyNotes(prevNotes => {
                         const pageNotes = prevNotes[pageNum] || [];
                         let changed = false;
                         const newPageNotes = pageNotes.map(n => {
                             if (n.id !== dragTarget.id) return n;
                             if (dragTarget.type === 'note') {
                                const newX = canvasX - dragOffset.x;
                                const newY = canvasY - dragOffset.y;
                                if (n.x !== newX || n.y !== newY) { changed = true; n.x = newX; n.y = newY; }
                             } else if (dragTarget.type === 'anchor' && contentDimensions) {
                                const newX = canvasX - dragOffset.x;
                                const newY = canvasY - dragOffset.y;
                                const contentW = contentDimensions.width; const contentH = contentDimensions.height;
                                const pdfTopLeftX = CANVAS_CENTER - contentW / 2; const pdfTopLeftY = CANVAS_CENTER - contentH / 2;
                                const anchorX = Math.max(0, Math.min(100, ((newX - pdfTopLeftX) / contentW) * 100));
                                const anchorY = Math.max(0, Math.min(100, ((newY - pdfTopLeftY) / contentH) * 100));
                                
                                if (!n.anchor || n.anchor.x !== anchorX || n.anchor.y !== anchorY) { changed = true; n.anchor = { x: anchorX, y: anchorY }; }
                             } else if (dragTarget.type === 'controlPoint' && dragTarget.index !== undefined) {
                                const newX = canvasX - dragOffset.x;
                                const newY = canvasY - dragOffset.y;
                                if(n.controlPoints[dragTarget.index]) {
                                   if (n.controlPoints[dragTarget.index].x !== newX || n.controlPoints[dragTarget.index].y !== newY) {
                                       changed = true;
                                       const newPts = [...n.controlPoints];
                                       newPts[dragTarget.index] = { x: newX, y: newY };
                                       n.controlPoints = newPts;
                                   }
                                }
                             }
                             return n;
                         });
                         return changed ? { ...prevNotes, [pageNum]: newPageNotes } : prevNotes;
                     });
                }
                
                if (dragTarget.type === 'connPoint' && dragTarget.index !== undefined) {
                    setNoteConnections(prevConns => {
                        const pageConns = prevConns[pageNum] || [];
                        let changed = false;
                        const newPageConns = pageConns.map(c => {
                             if (c.id !== dragTarget.id) return c;
                             const newX = canvasX - dragOffset.x;
                             const newY = canvasY - dragOffset.y;
                             if(c.controlPoints && c.controlPoints[dragTarget.index!]) {
                                 if (c.controlPoints[dragTarget.index!].x !== newX || c.controlPoints[dragTarget.index!].y !== newY) {
                                    changed = true;
                                    const newPts = [...c.controlPoints];
                                    newPts[dragTarget.index!] = { x: newX, y: newY };
                                    c.controlPoints = newPts;
                                 }
                             }
                             return c;
                        });
                        return changed ? { ...prevConns, [pageNum]: newPageConns } : prevConns;
                    });
                }
            }
            animationFrameId = requestAnimationFrame(updateLoop);
        };
        animationFrameId = requestAnimationFrame(updateLoop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [dragTarget, viewport, contentDimensions, pageNum]);

    const handleCanvasMouseUp = (e: React.MouseEvent) => { 
        if (isPanning) setIsPanning(false); 
        
        if (linkingState) {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const noteEl = el?.closest('[id^="sticky-note-"]');
            
            if (noteEl) {
                const targetId = noteEl.id.replace('sticky-note-', '');
                if (targetId !== linkingState.sourceId) {
                    const existingConn = noteConnections[pageNum]?.find(c => 
                        (c.sourceId === linkingState.sourceId && c.targetId === targetId) || 
                        (c.sourceId === targetId && c.targetId === linkingState.sourceId)
                    );
                    
                    if (!existingConn) {
                        const newConn: NoteConnection = { id: generateConnId(), sourceId: linkingState.sourceId, targetId: targetId, color: '#cbd5e1', style: 'curved' };
                        const newConns = { ...noteConnections, [pageNum]: [...(noteConnections[pageNum] || []), newConn] };
                        commitToHistory(annotations, stickyNotes, newConns);
                    }
                }
            } else if (contentDimensions) {
                if (canvasContainerRef.current) {
                    const rect = canvasContainerRef.current.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const canvasX = (mouseX - viewport.x) / viewport.zoom;
                    const canvasY = (mouseY - viewport.y) / viewport.zoom;

                    const contentW = contentDimensions.width;
                    const contentH = contentDimensions.height;
                    const topLeftX = CANVAS_CENTER - contentW / 2;
                    const topLeftY = CANVAS_CENTER - contentH / 2;

                    if (canvasX >= topLeftX - 50 && canvasX <= topLeftX + contentW + 50 && 
                        canvasY >= topLeftY - 50 && canvasY <= topLeftY + contentH + 50) {
                        
                        const anchorX = Math.max(0, Math.min(100, ((canvasX - topLeftX) / contentW) * 100));
                        const anchorY = Math.max(0, Math.min(100, ((canvasY - topLeftY) / contentH) * 100));
                        const updatedNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === linkingState.sourceId ? { ...n, anchor: { x: anchorX, y: anchorY } } : n) };
                        commitToHistory(annotations, updatedNotes, noteConnections);
                    }
                }
            }
            setLinkingState(null);
        }

        if (anchorLinkingState && contentDimensions) {
             if (canvasContainerRef.current) {
                const rect = canvasContainerRef.current.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const canvasX = (mouseX - viewport.x) / viewport.zoom;
                const canvasY = (mouseY - viewport.y) / viewport.zoom;

                const contentW = contentDimensions.width;
                const contentH = contentDimensions.height;
                const topLeftX = CANVAS_CENTER - contentW / 2;
                const topLeftY = CANVAS_CENTER - contentH / 2;

                if (canvasX >= topLeftX - 50 && canvasX <= topLeftX + contentW + 50 && 
                    canvasY >= topLeftY - 50 && canvasY <= topLeftY + contentH + 50) {
                    
                    const anchorX = Math.max(0, Math.min(100, ((canvasX - topLeftX) / contentW) * 100));
                    const anchorY = Math.max(0, Math.min(100, ((canvasY - topLeftY) / contentH) * 100));

                    const updatedNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === anchorLinkingState.noteId ? { ...n, anchor: { x: anchorX, y: anchorY } } : n) };
                    commitToHistory(annotations, updatedNotes, noteConnections);
                }
             }
             setAnchorLinkingState(null);
        }

        if (dragTarget) { 
            // Commit to history on drag end
            commitToHistory(annotations, stickyNotes, noteConnections);
            setDragTarget(null); 
            cachedCanvasRect.current = null; 
        } 
    };

    const connectionElements = useMemo(() => {
        const notes = (stickyNotes[pageNum] || []) as StickyNote[];
        const conns = (noteConnections[pageNum] || []) as NoteConnection[];
        
        let contentW = 0; let contentH = 0;
        if (contentDimensions) { contentW = contentDimensions.width; contentH = contentDimensions.height; }
        const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2;
        
        const noteMap = new Map(notes.map(n => [n.id, n]));

        const elements = [];

        notes.forEach(note => {
            if (!note.anchor || contentW <= 0) return;
            const ax = topLeftX + (note.anchor.x / 100) * contentW;
            const ay = topLeftY + (note.anchor.y / 100) * contentH;
            const nx = note.x + (note.minimized ? 20 : 110);
            const ny = note.y + 20;
            const points = [{ x: ax, y: ay }, ...(note.controlPoints || []), { x: nx, y: ny }];
            
            const isDraggingThis = dragTarget && dragTarget.id === note.id && dragTarget.type === 'controlPoint';

            elements.push(
                <ConnectionRenderer 
                    key={`anchor-${note.id}`}
                    points={points}
                    style={note.connectionStyle || 'curved'}
                    color={note.connectionColor || note.color}
                    isHovered={hoveredConnectionId === note.id || isDraggingThis}
                    onHover={(h) => setHoveredConnectionId(h ? note.id : null)}
                    onContextMenu={(e) => handleConnectionContextMenu(e, note.id, 'anchorConnection')}
                    renderAnchors={true}
                    anchorPos={{x: ax, y: ay}}
                    noteId={note.id}
                    onAnchorDrag={(e) => handleElementMouseDown(e, { id: note.id, type: 'anchor' }, { x: ax, y: ay })}
                    controlPoints={note.controlPoints}
                    onControlPointDrag={(idx, e, pt) => handleElementMouseDown(e, { id: note.id, type: 'controlPoint', index: idx }, pt)}
                    onControlPointContextMenu={(idx, e) => handleControlPointContextMenu(idx, e, note.id)}
                />
            );
        });

        conns.forEach(conn => {
            const src = noteMap.get(conn.sourceId);
            const tgt = noteMap.get(conn.targetId);
            if (!src || !tgt) return;

            const sx = src.x + (src.minimized ? 20 : 110);
            const sy = src.y + (src.minimized ? 20 : 60);
            const tx = tgt.x + (tgt.minimized ? 20 : 110);
            const ty = tgt.y + (tgt.minimized ? 20 : 60);

            const points = [{ x: sx, y: sy }, ...(conn.controlPoints || []), { x: tx, y: ty }];
            
            const isDraggingThis = dragTarget && dragTarget.id === conn.id;

            elements.push(
                <ConnectionRenderer
                    key={conn.id}
                    points={points}
                    style={conn.style || 'curved'}
                    color={conn.color || '#cbd5e1'}
                    isHovered={hoveredConnectionId === conn.id || isDraggingThis}
                    onHover={(h) => setHoveredConnectionId(h ? conn.id : null)}
                    onContextMenu={(e) => handleConnectionContextMenu(e, conn.id, 'noteConnection')}
                    controlPoints={conn.controlPoints}
                    onControlPointDrag={(idx, e, pt) => handleElementMouseDown(e, { id: conn.id, type: 'connPoint', index: idx }, pt)}
                    onControlPointContextMenu={(idx, e) => handleControlPointContextMenu(idx, e, conn.id)}
                />
            );
        });

        if (linkingState) {
             const src = noteMap.get(linkingState.sourceId);
             if (src) {
                 const sx = src.x + (src.minimized ? 20 : 110);
                 const sy = src.y + (src.minimized ? 20 : 60);
                 const points = [{ x: sx, y: sy }, linkingState.currentPos];
                 elements.push(
                     <path 
                        key="temp-link"
                        d={`M ${sx} ${sy} L ${linkingState.currentPos.x} ${linkingState.currentPos.y}`}
                        stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" fill="none" className="pointer-events-none"
                     />
                 );
             }
        }

        if (anchorLinkingState) {
             const src = noteMap.get(anchorLinkingState.noteId);
             if (src) {
                 const sx = src.x + (src.minimized ? 20 : 110);
                 const sy = src.y + 20;
                 elements.push(
                    <path
                        key="temp-anchor-link"
                        d={`M ${sx} ${sy} L ${anchorLinkingState.currentPos.x} ${anchorLinkingState.currentPos.y}`}
                        stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" fill="none" className="pointer-events-none"
                    />
                 );
             }
        }

        return elements;
    }, [stickyNotes, noteConnections, pageNum, contentDimensions, hoveredConnectionId, linkingState, anchorLinkingState, handleElementMouseDown, dragTarget]);

    const extractCurrentPageText = async () => {
        if (!pdfDocument || sourceType !== 'PDF') return null;
        try {
            const page = await pdfDocument.getPage(pageNum);
            const textContent = await page.getTextContent();
            return textContent.items.map((item: any) => item.str).join(' ');
        } catch (error) {
            console.error("Failed to extract text", error);
            return null;
        }
    };

    const handleAiAction = async (actionType: 'SUMMARY' | 'EXPLANATION' | 'HIGHLIGHT_MAP') => {
        setIsAiModalOpen(false);
        if (sourceType !== 'PDF') {
            alert("This feature is currently optimized for PDF documents. Please upload a PDF.");
            return;
        }

        setIsExtracting(true);
        const text = await extractCurrentPageText();
        setIsExtracting(false);

        if (!text) {
            alert("Could not extract text from this page. It might be an image-only PDF.");
            return;
        }

        console.log("--- AI Action Triggered ---");
        console.log("Action:", actionType);
        console.log("Language:", aiLanguage);
        console.log("Extracted Text Preview:", text.substring(0, 100) + "...");
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (dragTarget) return; 
        
        if (e.button === 1 || tool === 'select' || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
             setIsPanning(true);
             lastMousePos.current = { x: e.clientX, y: e.clientY };
             return;
        }
        
        if (tool === 'note') {
             addNoteAt(e.clientX, e.clientY, false);
        }
    };

    const handleEraser = (x: number, y: number) => {
        setAnnotations(prev => {
            const pageAnns = prev[pageNum] || [];
            const threshold = 10 / renderScale; 
            let changed = false;
            const remaining = pageAnns.filter(path => {
                for (const pt of path.points) {
                    const dist = Math.hypot(pt.x - x, pt.y - y);
                    if (dist < threshold) {
                        changed = true;
                        return false;
                    }
                }
                return true;
            });
            if (changed) {
                return { ...prev, [pageNum]: remaining };
            }
            return prev;
        });
    };

    const handleContentMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 2) e.stopPropagation(); 

        if (tool === 'select' || tool === 'note') {
             if (tool === 'note') {
                 addNoteAt(e.clientX, e.clientY, true); 
             } else {
                 setIsPanning(true);
                 lastMousePos.current = { x: e.clientX, y: e.clientY };
             }
             return;
        }

        if (['pen', 'highlighter', 'eraser'].includes(tool)) {
             isDrawing.current = true;
             
             const rect = e.currentTarget.getBoundingClientRect();
             const scaleX = contentDimensions ? contentDimensions.width / rect.width : 1;
             const scaleY = contentDimensions ? contentDimensions.height / rect.height : 1;
             
             const ptX = (e.clientX - rect.left) * scaleX;
             const ptY = (e.clientY - rect.top) * scaleY;
             
             if (tool === 'eraser') {
                 handleEraser(ptX, ptY);
             } else {
                 currentPath.current = {
                     type: tool as 'pen' | 'highlighter',
                     points: [{ x: ptX, y: ptY }],
                     color: color,
                     width: tool === 'highlighter' ? 20 : 4
                 };
                 lastDrawPoint.current = { x: ptX, y: ptY };
                 
                 const ctx = annotationCanvasRef.current?.getContext('2d');
                 if (ctx) {
                    ctx.beginPath();
                    ctx.arc(ptX * renderScale, ptY * renderScale, (currentPath.current.width * renderScale) / 2, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    if(tool === 'highlighter') {
                         ctx.globalAlpha = 0.4;
                         ctx.globalCompositeOperation = 'multiply';
                    }
                    ctx.fill();
                    ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
                 }
             }
        }
    };

    const handleContentMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing.current) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const scaleX = contentDimensions ? contentDimensions.width / rect.width : 1;
        const scaleY = contentDimensions ? contentDimensions.height / rect.height : 1;
        const ptX = (e.clientX - rect.left) * scaleX;
        const ptY = (e.clientY - rect.top) * scaleY;
        
        if (tool === 'eraser') {
            handleEraser(ptX, ptY);
        } else if (currentPath.current) {
            currentPath.current.points.push({ x: ptX, y: ptY });
            
            const ctx = annotationCanvasRef.current?.getContext('2d');
            if (ctx && lastDrawPoint.current) {
                ctx.beginPath();
                ctx.moveTo(lastDrawPoint.current.x * renderScale, lastDrawPoint.current.y * renderScale);
                ctx.lineTo(ptX * renderScale, ptY * renderScale);
                ctx.strokeStyle = currentPath.current.color;
                ctx.lineWidth = currentPath.current.width * renderScale;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if (currentPath.current.type === 'highlighter') {
                     ctx.globalAlpha = 0.4;
                     ctx.globalCompositeOperation = 'multiply';
                } else {
                     ctx.globalAlpha = 1.0;
                     ctx.globalCompositeOperation = 'source-over';
                }
                ctx.stroke();
                ctx.globalAlpha = 1.0;
                ctx.globalCompositeOperation = 'source-over';
            }
            lastDrawPoint.current = { x: ptX, y: ptY };
        }
    };

    const handleContentMouseUp = () => {
        if (isDrawing.current) {
            isDrawing.current = false;
            if (tool === 'eraser') {
                commitToHistory(annotations, stickyNotes, noteConnections);
            } else if (currentPath.current) {
                const newAnnotations = {
                    ...annotations,
                    [pageNum]: [...(annotations[pageNum] || []), currentPath.current]
                };
                commitToHistory(newAnnotations, stickyNotes, noteConnections);
                currentPath.current = null;
            }
            lastDrawPoint.current = null;
        }
    };

    const handleNoteMouseDown = (e: React.MouseEvent, note: StickyNote) => {
        handleElementMouseDown(e, { id: note.id, type: 'note' }, { x: note.x, y: note.y });
    };

    return (
        <div className="flex h-screen bg-[#f0f4f8] overflow-hidden font-sans text-gray-800">
             <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden shrink-0 relative z-40 shadow-xl`}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h2 className="font-bold text-gray-700 flex items-center gap-2 text-sm uppercase tracking-wider"><Icon.Notebook size={16} className="text-indigo-500"/> Library</h2>
                    <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon.ChevronLeft size={18} /></button>
                </div>
                <div className="flex p-2 gap-1 border-b border-gray-100">
                    <button onClick={() => setActiveTab('PADS')} className={`flex-1 py-1.5 text-xs font-bold rounded ${activeTab === 'PADS' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>Notepads</button>
                    <button onClick={() => setActiveTab('NOTES')} className={`flex-1 py-1.5 text-xs font-bold rounded ${activeTab === 'NOTES' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>Notes</button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {activeTab === 'PADS' ? (
                        <>
                            <button onClick={createNewNotepad} className="m-3 w-[calc(100%-24px)] py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs shadow-md hover:bg-indigo-700 flex items-center justify-center gap-2 transition-all"><Icon.Plus size={14} /> New Notepad</button>
                            {savedPads.map(pad => (
                                <div key={pad.id} onClick={() => loadNotepad(pad.id)} className={`group px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 flex items-center justify-between transition-colors ${activePadId === pad.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}>
                                    <div className="min-w-0">
                                        <div className={`font-bold text-sm truncate ${activePadId === pad.id ? 'text-blue-700' : 'text-gray-700'}`}>{pad.title}</div>
                                        <div className="flex items-center gap-2 mt-1"><span className="text-[10px] text-gray-400">{new Date(pad.lastModified).toLocaleDateString()}</span>{pad.hasContent && <Icon.FileText size={10} className="text-gray-400" />}</div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); if(window.confirm('Delete Notepad?')) { const n = savedPads.filter(p=>p.id!==pad.id); setSavedPads(n); localStorage.setItem('singularity-notepad-index', JSON.stringify(n)); if(activePadId===pad.id) createNewNotepad(); } }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 text-gray-400"><Icon.Trash size={14}/></button>
                                </div>
                            ))}
                        </>
                    ) : (
                        <div className="p-2 space-y-2">
                             {Object.entries(stickyNotes).map(([page, notes]) => (
                                <div key={page} className="space-y-1">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase px-2 mt-2">Page {page}</div>
                                    {(notes as StickyNote[]).map(note => (
                                        <div key={note.id} onClick={() => { setPageNum(parseInt(page)); }} className="p-2 bg-gray-50 rounded border border-gray-100 text-xs cursor-pointer hover:bg-blue-50 hover:border-blue-200 group relative flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: note.color }} />
                                                <span className="font-bold truncate text-gray-700">{note.text || "Empty Note"}</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><Icon.Trash size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="absolute top-4 left-4 z-30 p-2 bg-white shadow-md rounded-lg text-gray-500 hover:text-blue-600"><Icon.PanelLeft size={20} /></button>}

            <div className="flex-1 flex flex-col min-w-0 relative">
                <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-20">
                    <div className="flex items-center gap-3 flex-1">
                        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveCurrentState} className="font-display font-bold text-xl text-gray-800 bg-transparent outline-none border-b border-transparent hover:border-gray-300 focus:border-indigo-500 transition-all px-1 w-full max-w-md" />
                        {isLoading && <Icon.Navigation className="animate-spin text-indigo-500" size={16} />}
                        <span className="text-xs text-gray-400 font-medium ml-2">{saveStatus === 'saved' ? 'Saved' : 'Saving...'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleExport} disabled={isLoading} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg font-bold text-xs px-4 flex items-center gap-2 border border-indigo-200 shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"><Icon.Download size={14}/> Export</button>
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Icon.Close size={20} /></button>
                    </div>
                </div>

                <div ref={splitContainerRef} className="flex-1 flex overflow-hidden relative">
                    <div className="flex flex-col border-r border-gray-200 bg-white relative z-0 h-full" style={{ width: `${splitRatio}%` }}>
                        <div className="flex overflow-x-auto border-b border-gray-200 custom-scrollbar bg-gray-50 p-1 gap-1">
                            {sections.map(section => (
                                <div 
                                    key={section.id} 
                                    id={`tab-btn-${section.id}`} 
                                    onClick={() => {
                                        setActiveSectionId(section.id);
                                        if (section.pageLink && sourceType === 'PDF') {
                                            setPageNum(section.pageLink);
                                        }
                                    }} 
                                    className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer min-w-[100px] max-w-[150px] border-b-2 transition-all ${activeSectionId === section.id ? 'bg-white border-indigo-500 text-indigo-600 font-bold shadow-sm' : 'bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200'}`}
                                >
                                    <input value={section.title} onChange={(e) => handleUpdateSection(section.id, { title: e.target.value })} className="bg-transparent outline-none w-full text-xs truncate" onDoubleClick={(e) => e.currentTarget.select()} />
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSection(section.id); }} className="text-gray-400 hover:text-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100"><Icon.Close size={10} /></button>
                                </div>
                            ))}
                            <button onClick={handleAddSection} className="px-2 py-1 text-gray-400 hover:text-indigo-600 hover:bg-gray-200 rounded"><Icon.Plus size={16} /></button>
                        </div>
                        
                        <div className="flex items-center gap-2 p-2 border-b border-gray-200 bg-gray-50/50">
                            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1.5 flex-1 shadow-sm">
                                <Icon.Globe size={14} className="text-gray-400" />
                                <input 
                                    type="text" 
                                    value={aiLanguage}
                                    onChange={(e) => setAiLanguage(e.target.value)}
                                    placeholder="Language (e.g. English)"
                                    className="bg-transparent outline-none text-xs font-bold w-full text-gray-700 placeholder-gray-400"
                                />
                            </div>
                            <button 
                                onClick={() => setIsAiModalOpen(true)}
                                disabled={isExtracting}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExtracting ? <Icon.Navigation className="animate-spin" size={14} /> : <Icon.Sparkles size={14} />}
                                {isExtracting ? "Scanning..." : "AI Explanation"}
                            </button>
                        </div>

                        <div className="flex-1 relative">
                            <textarea value={activeSection?.content || ''} onChange={(e) => handleUpdateSection(activeSectionId, { content: e.target.value })} className="w-full h-full resize-none outline-none text-base leading-loose text-slate-800 placeholder-slate-300 custom-scrollbar bg-transparent font-medium p-8" placeholder="Start typing your notes here..." spellCheck={false} />
                        </div>
                    </div>
                    
                    <div className="w-1.5 hover:w-2 bg-transparent hover:bg-blue-400 cursor-col-resize z-50 transition-all flex items-center justify-center group absolute h-full -ml-0.5" style={{ left: `${splitRatio}%` }} onMouseDown={(e) => { e.preventDefault(); isResizing.current = true; const handleMove = (ev: MouseEvent) => { if (!splitContainerRef.current) return; const rect = splitContainerRef.current.getBoundingClientRect(); const w = ((ev.clientX - rect.left) / rect.width) * 100; setSplitRatio(Math.max(20, Math.min(80, w))); }; const handleUp = () => { isResizing.current = false; document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); }; document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp); }}>
                        <div className="w-[1px] h-full bg-gray-200 group-hover:bg-transparent" />
                    </div>

                    <div 
                        className={`flex-1 flex flex-col bg-[#e5e7eb] relative min-w-0 h-full overflow-hidden ${dragTarget ? 'cursor-grabbing' : ''}`}
                    >
                        <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-3 shrink-0 z-20 shadow-sm relative">
                            <div className="flex items-center gap-1">
                                <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum<=1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><Icon.ChevronLeft size={16}/></button>
                                <span className="text-xs font-bold w-12 text-center text-gray-700">{pageNum} / {numPages || '-'}</span>
                                <button onClick={() => setPageNum(p => Math.min(numPages, p + 1))} disabled={pageNum>=numPages} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><Icon.ChevronRight size={16}/></button>
                            </div>

                            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 border border-gray-200">
                                {['select', 'pen', 'highlighter', 'eraser', 'note'].map(t => (
                                    <button key={t} onClick={() => setTool(t as any)} className={`p-1.5 rounded-md transition-all ${tool === t ? 'bg-white shadow text-indigo-600 ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200/50'}`} title={t.charAt(0).toUpperCase() + t.slice(1)}>
                                        {t === 'select' && <Icon.Select size={18} />}
                                        {t === 'pen' && <Icon.Pen size={18} />}
                                        {t === 'highlighter' && <Icon.Highlighter size={18} />}
                                        {t === 'eraser' && <Icon.Eraser size={18} />}
                                        {t === 'note' && <Icon.StickyNote size={18} />}
                                    </button>
                                ))}
                                <div className="w-px h-5 bg-gray-300 mx-1 my-auto" />
                                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 my-auto" title="Ink Color" />
                            </div>

                            <div className="flex items-center gap-2">
                                <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 transition-colors" title="Undo"><Icon.Undo size={16} /></button>
                                <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 transition-colors" title="Redo"><Icon.Redo size={16} /></button>
                                <div className="w-px h-4 bg-gray-200 mx-1" />
                                <button onClick={centerView} className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold text-xs rounded-lg border border-gray-200 transition-colors" title="Fit content to screen">Reset View</button>
                                <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors"><Icon.FileUp size={14} /> {sourceName ? "Replace" : "Upload PDF/Img"}</button>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} />
                            </div>
                        </div>

                        <div 
                            ref={canvasContainerRef}
                            className={`flex-1 relative overflow-hidden ${isPanning ? 'cursor-grabbing' : (tool === 'select' ? 'cursor-grab' : 'cursor-crosshair')}`}
                            onMouseDown={handleCanvasMouseDown}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={handleCanvasMouseUp}
                            onContextMenu={handleContentContextMenu}
                        >
                            <div 
                                ref={captureContainerRef} 
                                style={{
                                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                                    transformOrigin: 'top left',
                                    width: CANVAS_SIZE,
                                    height: CANVAS_SIZE,
                                    position: 'absolute',
                                    top: 0, 
                                    left: 0,
                                }}
                                className="bg-transparent"
                            >
                                <div 
                                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-2xl bg-white"
                                    style={{
                                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                        padding: '0',
                                        width: contentDimensions ? contentDimensions.width : 'auto',
                                        height: contentDimensions ? contentDimensions.height : 'auto'
                                    }}
                                    onMouseDown={handleContentMouseDown}
                                    onMouseMove={handleContentMouseMove}
                                    onMouseUp={handleContentMouseUp}
                                >
                                    {pdfError ? (
                                        <div className="w-[600px] h-[800px] bg-red-50 flex flex-col items-center justify-center text-red-600 border-2 border-dashed border-red-300 rounded-xl p-6 text-center"><Icon.AlertTriangle size={48} className="mb-4" /><p className="font-bold mb-2">PDF Load Error</p><p className="text-sm">{pdfError}</p></div>
                                    ) : sourceType === 'PDF' ? (
                                        <div className="relative" style={{ width: '100%', height: '100%' }}>
                                            <canvas ref={pdfCanvasRef} className="block" style={{ width: '100%', height: '100%' }} />
                                            <canvas ref={annotationCanvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%' }} />
                                        </div>
                                    ) : sourceType === 'IMAGE' ? (
                                        <div className="relative" style={{ width: '100%', height: '100%' }}>
                                            <img src={sourceData as string} alt="Uploaded" className="block" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            <canvas ref={annotationCanvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%' }} />
                                        </div>
                                    ) : (
                                        <div className="w-[600px] h-[800px] bg-white flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 rounded-xl"><Icon.FileText size={48} className="mb-4 text-gray-300" /><p className="font-bold text-lg">Empty Canvas</p><p className="text-sm mt-2">Upload a PDF or Image to start annotating</p></div>
                                    )}
                                </div>

                                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 20 }}>
                                    {connectionElements}
                                </svg>
                                
                                {(stickyNotes[pageNum] as StickyNote[] || []).map(note => (
                                    <div
                                        key={note.id}
                                        id={`sticky-note-${note.id}`}
                                        className={`absolute flex flex-col shadow-lg rounded-lg overflow-visible border border-black/10 transition-[box-shadow,transform] duration-200 hover:shadow-2xl hover:scale-[1.01] group/note
                                           ${selectedNoteId === note.id ? 'ring-2 ring-indigo-500 shadow-2xl z-50' : 'z-30'}
                                        `}
                                        style={{ 
                                            left: note.x, 
                                            top: note.y, 
                                            width: note.minimized ? '40px' : '220px', 
                                            height: note.minimized ? '40px' : 'auto', 
                                            backgroundColor: note.color, 
                                            transitionProperty: 'box-shadow, transform, background-color', 
                                            transitionDuration: '200ms'
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()} 
                                        onClick={(e) => { e.stopPropagation(); setSelectedNoteId(note.id); }}
                                        onContextMenu={(e) => handleNoteContextMenu(e, note.id)}
                                    >
                                        <div 
                                            className="h-7 w-full bg-black/5 flex items-center justify-between px-1 cursor-move border-b border-black/5" 
                                            onMouseDown={(e) => handleNoteMouseDown(e, note)}
                                            title="Drag to move"
                                        >
                                            <div className="flex gap-1 pl-1 items-center">
                                                {note.minimized && <div className="w-2 h-2 rounded-full bg-gray-400" />}
                                                
                                                {!note.minimized && (
                                                    <div className="flex gap-1 items-center" onMouseDown={e => e.stopPropagation()}>
                                                        {NOTE_COLORS.slice(0, 3).map(c => (
                                                            <button 
                                                                key={c} 
                                                                onClick={(e) => { e.stopPropagation(); updateStickyNote(note.id, { color: c }); }} 
                                                                className="w-3 h-3 rounded-full border border-black/10 hover:scale-125 transition-transform" 
                                                                style={{ backgroundColor: c }} 
                                                            />
                                                        ))}
                                                        <label className="w-3 h-3 rounded-full border border-black/10 hover:scale-125 transition-transform flex items-center justify-center bg-white cursor-pointer relative" title="Custom Color" onClick={e=>e.stopPropagation()}>
                                                            <Icon.Pipette size={8} className="text-gray-400" />
                                                            <input type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer p-0 border-0" value={note.color} onChange={(e) => updateStickyNote(note.id, { color: e.target.value })} onClick={e=>e.stopPropagation()} />
                                                        </label>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex gap-1 items-center" onMouseDown={e => e.stopPropagation()}>
                                                {note.minimized ? (
                                                     <button 
                                                        onClick={(e) => { e.stopPropagation(); updateStickyNote(note.id, { minimized: false }); }}
                                                        className="p-0.5 hover:bg-blue-100 hover:text-blue-600 rounded text-gray-500"
                                                        title="Expand"
                                                    >
                                                        <Icon.Plus size={10} />
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); updateStickyNote(note.id, { minimized: true }); }}
                                                            className="p-0.5 hover:bg-black/10 rounded text-gray-500 hover:text-gray-800"
                                                            title="Minimize"
                                                        >
                                                            <Icon.Minus size={10} />
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} 
                                                            className="p-0.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400"
                                                        >
                                                            <Icon.Close size={10} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {!note.minimized && (
                                            <>
                                                <div className={`absolute -right-8 top-0 flex flex-col gap-1 transition-opacity pointer-events-auto ${selectedNoteId === note.id ? 'opacity-100' : 'opacity-0 group-hover/note:opacity-100'}`}>
                                                    <button 
                                                        className="w-6 h-6 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                                        title="Add Child Note"
                                                        onClick={(e) => { e.stopPropagation(); addChildNote(note.id); }}
                                                    >
                                                        <Icon.Plus size={14} />
                                                    </button>
                                                    <button 
                                                        className="w-6 h-6 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-green-600 hover:bg-green-50 cursor-crosshair"
                                                        title="Drag to Link (Drop on Note to Connect, Drop on Empty Space to Anchor)"
                                                        onMouseDown={(e) => startLinking(e, note.id)}
                                                    >
                                                        <Icon.Connect size={14} />
                                                    </button>
                                                </div>

                                                <textarea 
                                                    className="w-full h-auto min-h-[120px] p-3 bg-transparent text-sm resize-none outline-none font-medium text-gray-800 custom-scrollbar leading-relaxed" 
                                                    value={note.text} 
                                                    onChange={(e) => {
                                                        handleNoteTextChange(note.id, e.target.value);
                                                        e.target.style.height = 'auto';
                                                        e.target.style.height = e.target.scrollHeight + 'px';
                                                    }}
                                                    placeholder="Type note..." 
                                                    onMouseDown={(e) => e.stopPropagation()} 
                                                    spellCheck={false}
                                                />
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <NotepadMinimap 
                        viewport={viewport} 
                        setViewport={setViewport} 
                        contentDimensions={contentDimensions}
                        stickyNotes={stickyNotes[pageNum] || []}
                        containerSize={containerDimensions}
                    />
                </div>
            </div>
            
            {contextMenu && (
                <div 
                    className="fixed z-[100] bg-white border border-gray-200 shadow-xl rounded-lg p-1 text-sm flex flex-col min-w-[200px] animate-pop origin-top-left"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onMouseDown={(e) => e.stopPropagation()} 
                >
                    {contextMenu.type === 'canvas' ? (
                         <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('create_note')}>
                            <Icon.StickyNote size={14} /> Create Sticky Note
                        </button>
                    ) : contextMenu.type === 'note' && contextMenu.id ? (
                        <>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('add_child')}>
                                <Icon.Plus size={14} /> Add Child Note
                            </button>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('add_anchor')}>
                                <Icon.Map size={14} /> Add Anchor Point
                            </button>
                            <div className="p-2 border-b border-t border-gray-100">
                                <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 pl-1">Note Color</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {NOTE_COLORS.map(c => (
                                        <button key={c} onClick={() => handleContextMenuAction('color', c)} className="w-5 h-5 rounded-full border border-black/10 hover:scale-125 transition-transform shadow-sm" style={{backgroundColor: c}}/>
                                    ))}
                                </div>
                            </div>
                            <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete')}>
                                <Icon.Trash size={14} /> Delete Note
                            </button>
                        </>
                    ) : contextMenu.type === 'controlPoint' && contextMenu.id ? (
                         <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete_point')}>
                            <Icon.Trash size={14} /> Delete Control Point
                        </button>
                    ) : (
                        <>
                            <div className="p-2 border-b border-gray-100">
                                <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 pl-1">Link Color</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {LINK_COLORS.map(c => (
                                        <button key={c} onClick={() => handleContextMenuAction('connection_color', c)} className="w-5 h-5 rounded-full border border-black/10 hover:scale-125 transition-transform shadow-sm" style={{backgroundColor: c}}/>
                                    ))}
                                </div>
                            </div>
                            <div className="p-2 border-b border-gray-100">
                                <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 pl-1">Link Style</div>
                                <div className="flex gap-1">
                                    <button onClick={() => handleContextMenuAction('connection_style', 'straight')} className="flex-1 py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-600">STR</button>
                                    <button onClick={() => handleContextMenuAction('connection_style', 'curved')} className="flex-1 py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-600">CRV</button>
                                    <button onClick={() => handleContextMenuAction('connection_style', 'orthogonal')} className="flex-1 py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-600">90°</button>
                                </div>
                            </div>
                            {(contextMenu.connectionType === 'noteConnection' || contextMenu.connectionType === 'anchorConnection') && (
                                <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2 mt-1" onClick={() => handleContextMenuAction('add_point')}>
                                    <Icon.Plus size={14} /> Add Control Point
                                </button>
                            )}
                            <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete_link')}>
                                <Icon.Trash size={14} /> Delete Connection
                            </button>
                        </>
                    )}
                </div>
            )}
            {isAiModalOpen && (
            <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsAiModalOpen(false)}>
                <div className="bg-white rounded-2xl shadow-2xl border border-white/20 p-6 w-full max-w-sm relative" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setIsAiModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
                        <Icon.Close size={20} />
                    </button>
                    
                    <div className="flex items-center gap-3 mb-4 text-indigo-600">
                        <div className="p-2 bg-indigo-50 rounded-lg">
                            <Icon.Sparkles size={24} />
                        </div>
                        <h3 className="font-bold text-lg text-gray-800">AI Page Analysis</h3>
                    </div>
                    
                    <p className="text-sm text-gray-500 mb-6">
                        Choose an action for the current page (Page {pageNum}). 
                        <br/>Target Language: <span className="font-bold text-gray-700">{aiLanguage}</span>
                    </p>

                    <div className="space-y-3">
                        <button 
                            onClick={() => handleAiAction('SUMMARY')}
                            className="w-full p-3 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-xl flex items-center gap-3 transition-all group text-left"
                        >
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:scale-110 transition-transform">
                                <Icon.FileText size={18} />
                            </div>
                            <div>
                                <div className="font-bold text-sm text-gray-700">Summary</div>
                                <div className="text-[10px] text-gray-400">Concise overview of the page content.</div>
                            </div>
                        </button>

                        <button 
                            onClick={() => handleAiAction('EXPLANATION')}
                            className="w-full p-3 bg-white border border-gray-200 hover:border-purple-300 hover:bg-purple-50 rounded-xl flex items-center gap-3 transition-all group text-left"
                        >
                            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg group-hover:scale-110 transition-transform">
                                <Icon.Help size={18} />
                            </div>
                            <div>
                                <div className="font-bold text-sm text-gray-700">Explanation</div>
                                <div className="text-[10px] text-gray-400">Deep dive into concepts found on this page.</div>
                            </div>
                        </button>

                        <button 
                            onClick={() => handleAiAction('HIGHLIGHT_MAP')}
                            className="w-full p-3 bg-white border border-gray-200 hover:border-green-300 hover:bg-green-50 rounded-xl flex items-center gap-3 transition-all group text-left"
                        >
                            <div className="p-2 bg-green-100 text-green-600 rounded-lg group-hover:scale-110 transition-transform">
                                <Icon.Map size={18} />
                            </div>
                            <div>
                                <div className="font-bold text-sm text-gray-700">Highlight & Map</div>
                                <div className="text-[10px] text-gray-400">Identify key terms and map relationships.</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        )}
        </div>
    );
};
