
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
    opacity: number;
    isEraser?: boolean;
}

interface ControlPoint {
    x: number;
    y: number;
}

interface StickyNote {
    id: string;
    x: number;
    y: number; 
    text: string;
    color: string;
    anchor: { x: number; y: number } | null; 
    controlPoints: ControlPoint[];
    minimized: boolean;
    page: number;
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
    pdfBase64?: string; 
    autoCreateTabs?: boolean;
}

// Updated Colors
const NOTE_COLORS = ['#ffccbc', '#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7', '#f3f4f6']; // 0 is now Reddish-Orange
const LINK_COLORS = ['#ff0000', '#cbd5e1', '#94a3b8', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
const INK_COLORS = ['#1e293b', '#ff0000', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ffffff'];

const generateId = () => `note_${Math.random().toString(36).substr(2, 9)}`;
const generateConnId = () => `conn_${Math.random().toString(36).substr(2, 9)}`;

// Infinite Canvas Config
const CANVAS_SIZE = 8000;
const CANVAS_CENTER = CANVAS_SIZE / 2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const INITIAL_ZOOM = 0.8;
const MAX_HISTORY = 100;

// Helper: Smooth curve rendering (Quadratic Bezier)
const drawSmoothPath = (ctx: CanvasRenderingContext2D, points: {x:number, y:number}[], scale: number) => {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x * scale, points[0].y * scale);

    if (points.length === 2) {
        ctx.lineTo(points[1].x * scale, points[1].y * scale);
    } else {
        for (let i = 1; i < points.length - 2; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            ctx.quadraticCurveTo(p1.x * scale, p1.y * scale, midX * scale, midY * scale);
        }
        const lastP = points[points.length - 2];
        const endP = points[points.length - 1];
        ctx.quadraticCurveTo(lastP.x * scale, lastP.y * scale, endP.x * scale, endP.y * scale);
    }
};

const solveCatmullRom = (p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, tension: number = 0.5) => {
    const t0 = { x: (p2.x - p0.x) * tension, y: (p2.y - p0.y) * tension };
    const t1 = { x: (p3.x - p1.x) * tension, y: (p3.y - p1.y) * tension };
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
        if (style === 'straight') return `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`;
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
            <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} className="cursor-pointer" />
            <path d={pathData} fill="none" stroke={color} strokeWidth={isHovered ? 4 : 2} strokeDasharray={style === 'straight' ? '5,5' : 'none'} strokeLinecap="round" className="pointer-events-none" />
            {renderAnchors && anchorPos && (
                <g className="cursor-move" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); onAnchorDrag && onAnchorDrag(e); }}>
                    <circle cx={anchorPos.x} cy={anchorPos.y} r={24} fill="transparent" />
                    <circle cx={anchorPos.x} cy={anchorPos.y} r={isHovered ? 7 : 5} fill={color} stroke="white" strokeWidth={2} pointerEvents="none" />
                </g>
            )}
            {controlPoints && controlPoints.length > 0 && controlPoints.map((cp, idx) => (
                 <g key={idx} className="cursor-pointer" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); onControlPointDrag && onControlPointDrag(idx, e, cp); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onControlPointContextMenu && onControlPointContextMenu(idx, e); }}>
                    <circle cx={cp.x} cy={cp.y} r={20} fill="transparent" />
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

    return (
        <div 
            ref={ref}
            className="absolute bottom-6 right-6 bg-white border-2 border-gray-200 shadow-xl rounded-xl overflow-hidden z-50 cursor-pointer hover:border-indigo-400 transition-colors"
            style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); updateViewport(e.clientX, e.clientY); }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {isDragging && <div className="fixed inset-0 z-[100]" onMouseMove={e=>updateViewport(e.clientX, e.clientY)} onMouseUp={()=>setIsDragging(false)} />}
            <div className="w-full h-full bg-gray-50 relative pointer-events-none">
                 <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#9ca3af 1px, transparent 1px)', backgroundSize: '10px 10px' }} />
                {contentDimensions && <div className="absolute bg-white border border-gray-300 shadow-sm" style={{ left: (CANVAS_CENTER - contentDimensions.width / 2) * SCALE, top: (CANVAS_CENTER - contentDimensions.height / 2) * SCALE, width: contentDimensions.width * SCALE, height: contentDimensions.height * SCALE }} />}
                {stickyNotes.map(note => <div key={note.id} className="absolute rounded-sm" style={{ left: note.x * SCALE, top: note.y * SCALE, width: (note.minimized ? 20 : 100) * SCALE, height: (note.minimized ? 20 : 80) * SCALE, backgroundColor: note.color, border: '1px solid rgba(0,0,0,0.1)' }} />)}
                <div className="absolute border-2 border-red-500 bg-red-500/10" style={{ left: (-viewport.x / viewport.zoom) * SCALE, top: (-viewport.y / viewport.zoom) * SCALE, width: (containerSize.width / viewport.zoom) * SCALE, height: (containerSize.height / viewport.zoom) * SCALE }} />
            </div>
        </div>
    );
};

export const NotepadScreen: React.FC<NotepadScreenProps> = ({ onBack }) => {
    const [activePadId, setActivePadId] = useState<string | null>(null);
    const [savedPads, setSavedPads] = useState<SavedNotepadMeta[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false); // New Settings Panel
    const [activeTab, setActiveTab] = useState<'PADS' | 'NOTES'>('PADS');
    const [isLoading, setIsLoading] = useState(false);
    const [title, setTitle] = useState('Untitled Note');
    const [sections, setSections] = useState<TextSection[]>([{ id: 'default', title: 'General Notes', content: '' }]);
    const [activeSectionId, setActiveSectionId] = useState<string>('default');
    const [sourceName, setSourceName] = useState<string | null>(null);
    const [sourceType, setSourceType] = useState<'PDF' | 'IMAGE' | null>(null);
    const [sourceData, setSourceData] = useState<ArrayBuffer | string | null>(null);
    const [pdfDocument, setPdfDocument] = useState<any>(null);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [contentDimensions, setContentDimensions] = useState<{ width: number, height: number } | null>(null);
    const hasAutoCentered = useRef(false);
    const [viewport, setViewport] = useState<{ x: number, y: number, zoom: number }>(() => ({ x: (window.innerWidth / 2) - (CANVAS_CENTER * INITIAL_ZOOM), y: (window.innerHeight / 2) - (CANVAS_CENTER * INITIAL_ZOOM), zoom: INITIAL_ZOOM }));
    const [containerDimensions, setContainerDimensions] = useState<{ width: number, height: number }>({ width: 0, height: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePos = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    const cursorRef = useRef<HTMLDivElement>(null);
    
    // Tools & Settings
    const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'select' | 'note'>('select');
    const [color, setColor] = useState('#1e293b');
    const [strokeWidth, setStrokeWidth] = useState(2);
    const [strokeOpacity, setStrokeOpacity] = useState(1);
    const [eraserMode, setEraserMode] = useState<'magic' | 'rubber'>('magic');
    const [autoCreateTabs, setAutoCreateTabs] = useState(true); // New Preference

    const [annotations, setAnnotations] = useState<Record<number, AnnotationPath[]>>({});
    const [stickyNotes, setStickyNotes] = useState<Record<number, StickyNote[]>>({});
    const [noteConnections, setNoteConnections] = useState<Record<number, NoteConnection[]>>({});
    const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
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
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'connection' | 'canvas' | 'note' | 'controlPoint', id?: string, connectionType?: 'noteConnection' | 'anchorConnection', pointIndex?: number, clickPos?: { x: number, y: number } } | null>(null);
    
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
    const isShiftPressed = useRef(false);
    const [renderScale, setRenderScale] = useState(1.5);

    useEffect(() => { loadIndex(); }, []);

    // --- SHORTCUTS LOGIC ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return;
            const key = e.key.toLowerCase();
            if (key === 'v' || key === 'escape') setTool('select');
            if (key === 'h') setTool('select'); 
            if (key === 'p') setTool('pen');
            if (key === 'm') setTool('highlighter');
            if (key === 'e') setTool('eraser');
            if (key === 'n') setTool('note');
            if (e.ctrlKey || e.metaKey) {
                if (key === 'z') { e.preventDefault(); undo(); }
                if (key === 'y') { e.preventDefault(); redo(); }
                if (key === 's') { e.preventDefault(); saveCurrentState(); }
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNoteId) deleteNote(selectedNoteId);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNoteId, historyIndex, history]);

    useEffect(() => {
        if (tool === 'highlighter') { setStrokeWidth(20); setStrokeOpacity(0.5); setColor('#f59e0b'); } 
        else if (tool === 'pen') { setStrokeWidth(2); setStrokeOpacity(1); setColor('#1e293b'); }
    }, [tool]);

    useEffect(() => {
        if (!canvasContainerRef.current) return;
        const ro = new ResizeObserver(entries => {
            for (let entry of entries) setContainerDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        ro.observe(canvasContainerRef.current);
        return () => ro.disconnect();
    }, []);

    // Explicitly redraw annotations on canvas whenever state changes
    useEffect(() => {
        requestAnimationFrame(redrawAnnotations);
    }, [annotations, pageNum, renderScale]);

    const redrawAnnotations = useCallback(() => {
        const canvas = annotationCanvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pageAnnotations = annotations[pageNum] || [];
        
        pageAnnotations.forEach(path => {
            if (!path || !Array.isArray(path.points) || path.points.length < 2) return;
            
            if (path.isEraser) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = path.width * renderScale;
                ctx.globalAlpha = 1.0;
            } else if (path.type === 'highlighter') {
                ctx.globalCompositeOperation = 'multiply';
                ctx.lineWidth = path.width * renderScale;
                ctx.globalAlpha = path.opacity !== undefined ? path.opacity : 0.4;
                ctx.strokeStyle = path.color;
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.lineWidth = path.width * renderScale;
                ctx.globalAlpha = path.opacity !== undefined ? path.opacity : 1.0;
                ctx.strokeStyle = path.color;
            }

            ctx.lineCap = 'round'; 
            ctx.lineJoin = 'round';
            drawSmoothPath(ctx, path.points, renderScale);
            ctx.stroke();
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
        });
    }, [annotations, pageNum, renderScale]);

    const commitToHistory = (newAnnotations: Record<number, AnnotationPath[]>, newNotes: Record<number, StickyNote[]>, newConns: Record<number, NoteConnection[]>) => {
        setAnnotations(newAnnotations);
        setStickyNotes(newNotes);
        setNoteConnections(newConns);
        setHistory(prevHistory => {
            const newHistory = prevHistory.slice(0, historyIndex + 1);
            newHistory.push({ annotations: JSON.parse(JSON.stringify(newAnnotations)), stickyNotes: JSON.parse(JSON.stringify(newNotes)), noteConnections: JSON.parse(JSON.stringify(newConns)) });
            if (newHistory.length > MAX_HISTORY) newHistory.shift();
            return newHistory;
        });
        setHistoryIndex(prev => Math.min(history.slice(0, historyIndex + 1).length + 1, MAX_HISTORY) - 1);
    };

    const undo = () => { if (historyIndex > 0) { const prev = history[historyIndex - 1]; setAnnotations(prev.annotations); setStickyNotes(prev.stickyNotes); setNoteConnections(prev.noteConnections || {}); setHistoryIndex(historyIndex - 1); } };
    const redo = () => { if (historyIndex < history.length - 1) { const next = history[historyIndex + 1]; setAnnotations(next.annotations); setStickyNotes(next.stickyNotes); setNoteConnections(next.noteConnections || {}); setHistoryIndex(historyIndex + 1); } };

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
                    return { x: mouseX - worldX * newZoom, y: mouseY - worldY * newZoom, zoom: newZoom };
                });
            } else { setViewport(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY })); }
        };
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

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
        setHistory([{ annotations: {}, stickyNotes: {}, noteConnections: {} }]); setHistoryIndex(0);
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
                Object.values(loadedNotes).forEach(pageNotes => { pageNotes.forEach(n => { if(!n.controlPoints) n.controlPoints = []; }); });
                setAnnotations(loadedAnnotations); setStickyNotes(loadedNotes); setNoteConnections(data.noteConnections || {});
                setHistory([{ annotations: loadedAnnotations, stickyNotes: loadedNotes, noteConnections: data.noteConnections || {} }]); setHistoryIndex(0);
                setSourceName(data.sourceName || null); setSourceType(data.sourceType || null);
                setAutoCreateTabs(data.autoCreateTabs !== false); // Default true if undefined
                const dbData = await getFile(id);
                let loadedSourceData = dbData || null;
                if (!loadedSourceData) { if ((data as any).sourceData) loadedSourceData = (data as any).sourceData; else if ((data as any).pdfBase64) loadedSourceData = (data as any).pdfBase64; }
                if (loadedSourceData) {
                    if (data.sourceType === 'IMAGE') { setSourceData(loadedSourceData); setNumPages(1); setPageNum(1); } else {
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
            saveToStorage(activePadId, title, sections, activeSectionId, sourceName, null, sourceType, annotations, stickyNotes, noteConnections, autoCreateTabs);
            setSaveStatus('saved');
        } catch (e) { console.error("Save failed", e); setSaveStatus('error'); }
    }, [activePadId, title, sections, activeSectionId, sourceData, sourceName, sourceType, annotations, stickyNotes, noteConnections, autoCreateTabs]);

    const saveToStorage = (id: string, t: string, secs: TextSection[], activeSec: string, sName: string | null, sData: string | null, sType: 'PDF'|'IMAGE'|null, ann: any, sticks: any, conns: any, autoCreate: boolean = true) => {
        const data: FullNotepadData = { id, title: t, sections: secs, activeSectionId: activeSec, sourceName: sName || undefined, sourceType: sType || undefined, annotations: ann, stickyNotes: sticks, noteConnections: conns, lastModified: Date.now(), autoCreateTabs: autoCreate };
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

    useEffect(() => { const timer = setTimeout(() => { if (activePadId) saveCurrentState(); }, 2000); return () => clearTimeout(timer); }, [sections, activeSectionId, annotations, stickyNotes, noteConnections, title, activePadId, autoCreateTabs]);
    const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];
    const centerView = useCallback(() => {
        if (!canvasContainerRef.current || !contentDimensions) return;
        const rect = canvasContainerRef.current.getBoundingClientRect();
        const { width: contentW, height: contentH } = contentDimensions;
        const margin = 60; const availW = rect.width - (margin * 2); const availH = rect.height - (margin * 2);
        let fitZoom = 0.8;
        if (contentW > 0 && contentH > 0) { const scaleW = availW / contentW; const scaleH = availH / contentH; fitZoom = Math.min(scaleW, scaleH); fitZoom = Math.min(Math.max(fitZoom, MIN_ZOOM), MAX_ZOOM); }
        setViewport({ x: (rect.width / 2) - (CANVAS_CENTER * fitZoom), y: (rect.height / 2) - (CANVAS_CENTER * fitZoom), zoom: fitZoom });
    }, [contentDimensions]);

    useEffect(() => { if (contentDimensions && !hasAutoCentered.current && canvasContainerRef.current) { const timer = setTimeout(() => { centerView(); hasAutoCentered.current = true; }, 50); return () => clearTimeout(timer); } }, [contentDimensions, centerView]);
    
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
                
                // AUTO CREATE TAB FOR PAGE 1 IF MISSING
                if (autoCreateTabs) {
                     const pageTitle = "Page 1";
                     const exists = sections.some(s => s.title === pageTitle);
                     if (!exists) {
                         const newId = generateId();
                         setSections(prev => [...prev, { id: newId, title: pageTitle, content: '', pageLink: 1 }]);
                         // Optional: Auto switch to it? setActiveSectionId(newId);
                     }
                }

            } catch (err) { console.error("Error loading PDF:", err); setPdfError("Failed to load PDF."); }
        };
        loadPdf();
    }, [sourceData, sourceType, autoCreateTabs]); // Added autoCreateTabs dependency to check on load

    useEffect(() => { if (sourceData && sourceType === 'IMAGE') { const img = new Image(); img.onload = () => { setContentDimensions({ width: img.width, height: img.height }); setNumPages(1); setPageNum(1); }; img.src = sourceData as string; } }, [sourceData, sourceType]);
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
                const canvas = pdfCanvasRef.current!; const context = canvas.getContext('2d')!;
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

    useEffect(() => { if (sourceType === 'IMAGE' && contentDimensions && annotationCanvasRef.current) { const w = contentDimensions.width * renderScale; const h = contentDimensions.height * renderScale; annotationCanvasRef.current.width = w; annotationCanvasRef.current.height = h; redrawAnnotations(); } }, [contentDimensions, renderScale, sourceType]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        setSourceName(file.name); setStickyNotes({}); setAnnotations({}); setSections([{ id: 'default', title: 'General Notes', content: '' }]); setActiveSectionId('default'); setContentDimensions(null); hasAutoCentered.current = false; setHistory([{ annotations: {}, stickyNotes: {}, noteConnections: {} }]); setHistoryIndex(0);
        if (file.type === 'application/pdf') { const buffer = await file.arrayBuffer(); setSourceType('PDF'); setSourceData(buffer); setPdfDocument(null); setPageNum(1); } 
        else if (file.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = (ev) => { if (ev.target?.result) { setSourceType('IMAGE'); setSourceData(ev.target.result as string); setPageNum(1); setNumPages(1); } }; reader.readAsDataURL(file); } 
        else { alert("Unsupported file type."); }
        e.target.value = ''; setTimeout(saveCurrentState, 100);
    };

    const handleExport = async () => {
        if (!captureContainerRef.current) return;
        setIsLoading(true);
        try {
             let minX = CANVAS_CENTER, minY = CANVAS_CENTER, maxX = CANVAS_CENTER, maxY = CANVAS_CENTER;
             if (contentDimensions) { const halfW = contentDimensions.width / 2; const halfH = contentDimensions.height / 2; minX = Math.min(minX, CANVAS_CENTER - halfW); minY = Math.min(minY, CANVAS_CENTER - halfH); maxX = Math.max(maxX, CANVAS_CENTER + halfW); maxY = Math.max(maxY, CANVAS_CENTER + halfH); }
             const notes = stickyNotes[pageNum] || [];
             notes.forEach(note => { minX = Math.min(minX, note.x); minY = Math.min(minY, note.y); maxX = Math.max(maxX, note.x + (note.minimized ? 40 : 220)); maxY = Math.max(maxY, note.y + (note.minimized ? 40 : 200)); });
             const padding = 50; const cropX = minX - padding; const cropY = minY - padding; const cropWidth = (maxX - minX) + (padding * 2); const cropHeight = (maxY - minY) + (padding * 2);
             await new Promise(r => setTimeout(r, 50));
             const dataUrl = await htmlToImage.toPng(captureContainerRef.current, { width: cropWidth, height: cropHeight, style: { transform: `translate(${-cropX}px, ${-cropY}px) scale(1)`, transformOrigin: 'top left', width: `${cropWidth}px`, height: `${cropHeight}px`, backgroundColor: '#e5e7eb' }, pixelRatio: 2, skipAutoScale: true, fontEmbedCSS: '', cacheBust: true });
             const link = document.createElement('a'); link.download = `Notepad_Page_${pageNum}.png`; link.href = dataUrl; link.click();
        } catch (err) { console.error("Export failed", err); alert("Export failed. Please try again."); } finally { setIsLoading(false); }
    };

    const handleElementMouseDown = useCallback((e: React.MouseEvent, target: { id: string, type: 'note' | 'anchor' | 'controlPoint' | 'connPoint', index?: number, parentId?: string }, elementPos: { x: number, y: number }) => {
        e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); e.preventDefault(); 
        mousePosRef.current = { x: e.clientX, y: e.clientY };
        if (canvasContainerRef.current) {
            cachedCanvasRect.current = canvasContainerRef.current.getBoundingClientRect();
            dragStartOffset.current = { x: ((e.clientX - cachedCanvasRect.current.left) - viewport.x) / viewport.zoom - elementPos.x, y: ((e.clientY - cachedCanvasRect.current.top) - viewport.y) / viewport.zoom - elementPos.y };
        }
        setDragTarget(target);
        if (target.type === 'note') setSelectedNoteId(target.id);
    }, [viewport]);

    const addNoteAt = (x: number, y: number, relativeToPdf: boolean = false) => {
        if (!canvasContainerRef.current) return;
        const rect = canvasContainerRef.current.getBoundingClientRect();
        const canvasX = ((x - rect.left) - viewport.x) / viewport.zoom;
        const canvasY = ((y - rect.top) - viewport.y) / viewport.zoom;
        let anchor = null, contentW = 0, contentH = 0;
        if (contentDimensions) { contentW = contentDimensions.width; contentH = contentDimensions.height; }
        if (relativeToPdf && contentW > 0) {
            const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2;
            if (canvasX >= topLeftX && canvasX <= topLeftX + contentW && canvasY >= topLeftY && canvasY <= topLeftY + contentH) {
                anchor = { x: ((canvasX - topLeftX) / contentW) * 100, y: ((canvasY - topLeftY) / contentH) * 100 };
            }
        }
        const newId = generateId();
        const newNote: StickyNote = { id: newId, x: relativeToPdf ? canvasX + 50 : canvasX, y: relativeToPdf ? canvasY + 50 : canvasY, text: '', color: NOTE_COLORS[0], anchor: anchor, minimized: false, page: pageNum, controlPoints: [] };
        commitToHistory(annotations, { ...stickyNotes, [pageNum]: [...(stickyNotes[pageNum] || []), newNote] }, noteConnections);
        setSelectedNoteId(newId); setTool('select');
    };

    const addChildNote = (parentId: string) => {
        const pageNotes = stickyNotes[pageNum] || [];
        const parent = pageNotes.find(n => n.id === parentId);
        if (!parent) return;
        const newId = generateId();
        const newNote: StickyNote = { id: newId, x: parent.x + 300, y: parent.y, text: '', color: parent.color, anchor: null, minimized: false, page: pageNum, controlPoints: [] };
        const newConn: NoteConnection = { id: generateConnId(), sourceId: parentId, targetId: newId, color: '#ff0000', style: 'curved' }; 
        commitToHistory(annotations, { ...stickyNotes, [pageNum]: [...pageNotes, newNote] }, { ...noteConnections, [pageNum]: [...(noteConnections[pageNum] || []), newConn] });
        setSelectedNoteId(newId);
    };

    const updateStickyNote = (id: string, updates: Partial<StickyNote>) => { setStickyNotes({ ...stickyNotes, [pageNum]: (stickyNotes[pageNum] || []).map(n => n.id === id ? { ...n, ...updates } : n) }); };
    
    // --- SAFE DELETE FUNCTIONS (UPDATED) ---
    const deleteNote = (id: string) => {
        if (!window.confirm("Are you sure you want to delete this note and its connections?")) return;
        
        setStickyNotes(prev => ({
             ...prev, 
             [pageNum]: (prev[pageNum] || []).filter(n => n.id !== id) 
        }));
        
        setNoteConnections(prev => ({
             ...prev, 
             [pageNum]: (prev[pageNum] || []).filter(c => c.sourceId !== id && c.targetId !== id) 
        }));

        // Note: Commit to history logic should be called with the *new* state, but since setState is async, 
        // we usually calculate new state first.
        // Fixed:
        const newNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum] || []).filter(n => n.id !== id) };
        const newConns = { ...noteConnections, [pageNum]: (noteConnections[pageNum] || []).filter(c => c.sourceId !== id && c.targetId !== id) };
        commitToHistory(annotations, newNotes, newConns);

        if (selectedNoteId === id) setSelectedNoteId(null);
    };

    const deleteConnection = (connId: string) => {
        if (!window.confirm("Delete this connection?")) return;
        const newConns = { ...noteConnections, [pageNum]: (noteConnections[pageNum] || []).filter(c => c.id !== connId) };
        setNoteConnections(newConns);
        commitToHistory(annotations, stickyNotes, newConns);
    };

    const startLinking = (e: React.MouseEvent, sourceId: string) => {
        e.stopPropagation(); e.preventDefault();
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if(rect) {
             const canvasX = ((e.clientX - rect.left) - viewport.x) / viewport.zoom;
             const canvasY = ((e.clientY - rect.top) - viewport.y) / viewport.zoom;
             setLinkingState({ sourceId, currentPos: { x: canvasX, y: canvasY } });
        }
    };
    const startAnchorLinking = (noteId: string) => {
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if(rect) {
             const note = stickyNotes[pageNum]?.find(n => n.id === noteId);
             if(note) setAnchorLinkingState({ noteId, currentPos: { x: note.x + (note.minimized ? 20 : 110), y: note.y + 20 } });
        }
    };

    const handleConnectionContextMenu = (e: React.MouseEvent, id: string, type: 'noteConnection' | 'anchorConnection') => {
        e.preventDefault(); e.stopPropagation();
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        let clickPos = undefined;
        if (rect) {
            clickPos = { x: ((e.clientX - rect.left) - viewport.x) / viewport.zoom, y: ((e.clientY - rect.top) - viewport.y) / viewport.zoom };
        }
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'connection', id, connectionType: type, clickPos });
    };

    const handleContextMenuAction = (action: string, payload?: any) => {
        if (!contextMenu) return;
        const { id, type, connectionType, pointIndex, clickPos } = contextMenu;
        if (type === 'canvas' && action === 'create_note') addNoteAt(contextMenu.x, contextMenu.y, true);
        else if (type === 'note' && id) {
            if (action === 'delete') deleteNote(id);
            else if (action === 'color') commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, color: payload } : n) }, noteConnections);
            else if (action === 'add_child') addChildNote(id);
            else if (action === 'add_anchor') startAnchorLinking(id);
        } else if (type === 'connection' && id) {
             if (connectionType === 'anchorConnection') {
                 const note = stickyNotes[pageNum]?.find(n => n.id === id);
                 if (note) {
                     if (action === 'delete_link') { 
                         if(window.confirm("Remove this anchor link?")) {
                             const newNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, anchor: null, controlPoints: [] } : n) };
                             setStickyNotes(newNotes);
                             commitToHistory(annotations, newNotes, noteConnections);
                         }
                     }
                     else if (action === 'connection_color') commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, connectionColor: payload } : n) }, noteConnections);
                     else if (action === 'connection_style') commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, connectionStyle: payload } : n) }, noteConnections);
                     else if (action === 'add_point') {
                         const currentPoints = note.controlPoints || [];
                         const newPoint = clickPos || { x: note.x, y: note.y }; 
                         commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, controlPoints: [...currentPoints, newPoint] } : n) }, noteConnections);
                     }
                 }
             } else if (connectionType === 'noteConnection') {
                 const pageConns = noteConnections[pageNum] || [];
                 if (pageConns.find(c => c.id === id)) {
                     if (action === 'delete_link') deleteConnection(id);
                     else if (action === 'connection_color') commitToHistory(annotations, stickyNotes, { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, color: payload } : c) });
                     else if (action === 'connection_style') commitToHistory(annotations, stickyNotes, { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, style: payload } : c) });
                     else if (action === 'add_point') {
                          const newPoint = clickPos || { x: 0, y: 0 };
                          commitToHistory(annotations, stickyNotes, { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, controlPoints: [...(c.controlPoints||[]), newPoint] } : c) });
                     }
                 }
             }
        } else if (type === 'controlPoint' && id && pointIndex !== undefined) {
             if (action === 'delete_point') {
                  if(!window.confirm("Remove this control point?")) { setContextMenu(null); return; }
                  const note = stickyNotes[pageNum]?.find(n => n.id === id);
                  if (note) {
                      const newPoints = [...(note.controlPoints || [])]; newPoints.splice(pointIndex, 1);
                      const newNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, controlPoints: newPoints } : n) };
                      setStickyNotes(newNotes);
                      commitToHistory(annotations, newNotes, noteConnections);
                  } else {
                      const pageConns = noteConnections[pageNum] || [];
                      const conn = pageConns.find(c => c.id === id);
                      if (conn && conn.controlPoints) {
                          const newPoints = [...conn.controlPoints]; newPoints.splice(pointIndex, 1);
                          const newConns = { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, controlPoints: newPoints } : c) };
                          setNoteConnections(newConns);
                          commitToHistory(annotations, stickyNotes, newConns);
                      }
                  }
             }
        }
        setContextMenu(null);
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        mousePosRef.current = { x: e.clientX, y: e.clientY };
        
        if (cursorRef.current && canvasContainerRef.current) {
            const rect = canvasContainerRef.current.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                 cursorRef.current.style.display = 'block';
                 cursorRef.current.style.left = `${e.clientX}px`;
                 cursorRef.current.style.top = `${e.clientY}px`;
            } else {
                 cursorRef.current.style.display = 'none';
            }
        }

        if (linkingState && canvasContainerRef.current) {
             const rect = canvasContainerRef.current.getBoundingClientRect();
             setLinkingState({ ...linkingState, currentPos: { x: ((e.clientX - rect.left) - viewport.x) / viewport.zoom, y: ((e.clientY - rect.top) - viewport.y) / viewport.zoom } });
        } else if (anchorLinkingState && canvasContainerRef.current) {
             const rect = canvasContainerRef.current.getBoundingClientRect();
             setAnchorLinkingState({ ...anchorLinkingState, currentPos: { x: ((e.clientX - rect.left) - viewport.x) / viewport.zoom, y: ((e.clientY - rect.top) - viewport.y) / viewport.zoom } });
        } else if (isPanning) {
            const currentLastPos = lastMousePos.current;
            const dx = e.clientX - currentLastPos.x; const dy = e.clientY - currentLastPos.y;
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
                const canvasX = ((mousePosRef.current.x - rect.left) - viewport.x) / viewport.zoom;
                const canvasY = ((mousePosRef.current.y - rect.top) - viewport.y) / viewport.zoom;
                const dragOffset = dragStartOffset.current;
                
                if (dragTarget.type === 'note' || dragTarget.type === 'anchor' || dragTarget.type === 'controlPoint') {
                    setStickyNotes(prevNotes => {
                         const pageNotes = prevNotes[pageNum] || [];
                         let changed = false;
                         const newPageNotes = pageNotes.map(n => {
                             if (n.id !== dragTarget.id) return n;
                             if (dragTarget.type === 'note') {
                                const newX = canvasX - dragOffset.x; const newY = canvasY - dragOffset.y;
                                if (n.x !== newX || n.y !== newY) { changed = true; n.x = newX; n.y = newY; }
                             } else if (dragTarget.type === 'anchor' && contentDimensions) {
                                const newX = canvasX - dragOffset.x; const newY = canvasY - dragOffset.y;
                                const contentW = contentDimensions.width; const contentH = contentDimensions.height;
                                const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2;
                                const anchorX = Math.max(0, Math.min(100, ((newX - topLeftX) / contentW) * 100));
                                const anchorY = Math.max(0, Math.min(100, ((newY - topLeftY) / contentH) * 100));
                                if (!n.anchor || n.anchor.x !== anchorX || n.anchor.y !== anchorY) { changed = true; n.anchor = { x: anchorX, y: anchorY }; }
                             } else if (dragTarget.type === 'controlPoint' && dragTarget.index !== undefined) {
                                const newX = canvasX - dragOffset.x; const newY = canvasY - dragOffset.y;
                                if(n.controlPoints[dragTarget.index]) {
                                   if (n.controlPoints[dragTarget.index].x !== newX || n.controlPoints[dragTarget.index].y !== newY) {
                                       changed = true; const newPts = [...n.controlPoints]; newPts[dragTarget.index] = { x: newX, y: newY }; n.controlPoints = newPts;
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
                             const newX = canvasX - dragOffset.x; const newY = canvasY - dragOffset.y;
                             const targetIndex = dragTarget.index!;
                             if(c.controlPoints && c.controlPoints[targetIndex]) {
                                 if (c.controlPoints[targetIndex].x !== newX || c.controlPoints[targetIndex].y !== newY) {
                                    changed = true;
                                    const newPts = [...c.controlPoints];
                                    newPts[targetIndex] = { x: newX, y: newY };
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
                    const existingConn = noteConnections[pageNum]?.find(c => (c.sourceId === linkingState.sourceId && c.targetId === targetId) || (c.sourceId === targetId && c.targetId === linkingState.sourceId));
                    if (!existingConn) {
                        const newConn: NoteConnection = { id: generateConnId(), sourceId: linkingState.sourceId, targetId: targetId, color: '#ff0000', style: 'curved' };
                        commitToHistory(annotations, stickyNotes, { ...noteConnections, [pageNum]: [...(noteConnections[pageNum] || []), newConn] });
                    }
                }
            } else if (contentDimensions && canvasContainerRef.current) {
                    const rect = canvasContainerRef.current.getBoundingClientRect();
                    const canvasX = ((e.clientX - rect.left) - viewport.x) / viewport.zoom;
                    const canvasY = ((e.clientY - rect.top) - viewport.y) / viewport.zoom;
                    const contentW = contentDimensions.width; const contentH = contentDimensions.height;
                    const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2;
                    if (canvasX >= topLeftX - 50 && canvasX <= topLeftX + contentW + 50 && canvasY >= topLeftY - 50 && canvasY <= topLeftY + contentH + 50) {
                        const anchorX = Math.max(0, Math.min(100, ((canvasX - topLeftX) / contentW) * 100));
                        const anchorY = Math.max(0, Math.min(100, ((canvasY - topLeftY) / contentH) * 100));
                        commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === linkingState.sourceId ? { ...n, anchor: { x: anchorX, y: anchorY } } : n) }, noteConnections);
                    }
            }
            setLinkingState(null);
        }
        if (anchorLinkingState && contentDimensions && canvasContainerRef.current) {
             const rect = canvasContainerRef.current.getBoundingClientRect();
             const canvasX = ((e.clientX - rect.left) - viewport.x) / viewport.zoom;
             const canvasY = ((e.clientY - rect.top) - viewport.y) / viewport.zoom;
             const contentW = contentDimensions.width; const contentH = contentDimensions.height;
             const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2;
             if (canvasX >= topLeftX - 50 && canvasX <= topLeftX + contentW + 50 && canvasY >= topLeftY - 50 && canvasY <= topLeftY + contentH + 50) {
                const anchorX = Math.max(0, Math.min(100, ((canvasX - topLeftX) / contentW) * 100));
                const anchorY = Math.max(0, Math.min(100, ((canvasY - topLeftY) / contentH) * 100));
                commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === anchorLinkingState.noteId ? { ...n, anchor: { x: anchorX, y: anchorY } } : n) }, noteConnections);
             }
             setAnchorLinkingState(null);
        }
        if (dragTarget) { commitToHistory(annotations, stickyNotes, noteConnections); setDragTarget(null); cachedCanvasRect.current = null; } 
    };

    const handleEraser = (x: number, y: number) => {
        if (eraserMode === 'magic') {
            setAnnotations(prev => {
                const pageAnns = prev[pageNum] || [];
                const threshold = 15 / renderScale;
                let changed = false;
                const remaining = pageAnns.filter(path => {
                    for (const pt of path.points) {
                        if (Math.hypot(pt.x - x, pt.y - y) < threshold) { changed = true; return false; }
                    }
                    return true;
                });
                if (changed) return { ...prev, [pageNum]: remaining };
                return prev;
            });
        }
    };

    const handleContentMouseDown = (e: React.MouseEvent) => {
        setContextMenu(null);
        if (e.button !== 2) e.stopPropagation(); 
        if (tool === 'select' || tool === 'note') {
             if (tool === 'note') addNoteAt(e.clientX, e.clientY, true); 
             else { setIsPanning(true); lastMousePos.current = { x: e.clientX, y: e.clientY }; }
             return;
        }

        if (['pen', 'highlighter', 'eraser'].includes(tool)) {
             isDrawing.current = true;
             const rect = e.currentTarget.getBoundingClientRect();
             const scaleX = contentDimensions ? contentDimensions.width / rect.width : 1;
             const scaleY = contentDimensions ? contentDimensions.height / rect.height : 1;
             const ptX = (e.clientX - rect.left) * scaleX;
             const ptY = (e.clientY - rect.top) * scaleY;
             
             if (tool === 'eraser' && eraserMode === 'magic') {
                 handleEraser(ptX, ptY);
             } else {
                 const isEraser = tool === 'eraser';
                 currentPath.current = {
                     type: isEraser ? 'pen' : (tool as 'pen' | 'highlighter'),
                     points: [{ x: ptX, y: ptY }],
                     color: isEraser ? '#ffffff' : color, 
                     width: isEraser ? 30 : strokeWidth,
                     opacity: isEraser ? 1 : strokeOpacity,
                     isEraser: isEraser
                 };
                 lastDrawPoint.current = { x: ptX, y: ptY };

                 const ctx = annotationCanvasRef.current?.getContext('2d');
                 if (ctx) {
                    ctx.beginPath();
                    ctx.arc(ptX * renderScale, ptY * renderScale, (currentPath.current.width * renderScale) / 2, 0, Math.PI * 2);
                    
                    if (isEraser) {
                        ctx.globalCompositeOperation = 'destination-out';
                        ctx.fillStyle = 'rgba(0,0,0,1)'; 
                    } else if(tool === 'highlighter') {
                        ctx.globalCompositeOperation = 'multiply';
                        ctx.globalAlpha = strokeOpacity;
                        ctx.fillStyle = color;
                    } else {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.globalAlpha = 1.0;
                        ctx.fillStyle = color;
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
        
        if (tool === 'eraser' && eraserMode === 'magic') {
            handleEraser(ptX, ptY);
        } else if (currentPath.current) {
            let finalX = ptX, finalY = ptY;
            if (isShiftPressed.current && currentPath.current.points.length > 0) {
                const start = currentPath.current.points[0];
                Math.abs(ptX - start.x) > Math.abs(ptY - start.y) ? finalY = start.y : finalX = start.x;
            }
            currentPath.current.points.push({ x: finalX, y: finalY });
            
            const ctx = annotationCanvasRef.current?.getContext('2d');
            if (ctx && lastDrawPoint.current) {
                ctx.beginPath();
                ctx.moveTo(lastDrawPoint.current.x * renderScale, lastDrawPoint.current.y * renderScale);
                ctx.lineTo(finalX * renderScale, finalY * renderScale);
                
                ctx.lineWidth = currentPath.current.width * renderScale;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                if (currentPath.current.isEraser) {
                     ctx.globalCompositeOperation = 'destination-out';
                     ctx.strokeStyle = 'rgba(0,0,0,1)';
                     ctx.globalAlpha = 1.0;
                } else if (currentPath.current.type === 'highlighter') {
                     ctx.globalCompositeOperation = 'multiply';
                     ctx.globalAlpha = strokeOpacity;
                     ctx.strokeStyle = color;
                } else {
                     ctx.globalCompositeOperation = 'source-over';
                     ctx.globalAlpha = 1.0;
                     ctx.strokeStyle = color;
                }
                ctx.stroke();
                ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
            }
            lastDrawPoint.current = { x: finalX, y: finalY };
        }
    };

    const handleContentMouseUp = () => {
        if (isDrawing.current) {
            isDrawing.current = false;
            if (tool === 'eraser' && eraserMode === 'magic') {
                commitToHistory(annotations, stickyNotes, noteConnections);
            } else if (currentPath.current && currentPath.current.points.length > 0) {
                const newAnnotations = { ...annotations, [pageNum]: [...(annotations[pageNum] || []), currentPath.current] };
                commitToHistory(newAnnotations, stickyNotes, noteConnections);
                currentPath.current = null;
            }
            lastDrawPoint.current = null;
        }
    };

    const renderToolProperties = () => {
        if (tool === 'select' || tool === 'note') return null;
        return (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-white/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-200 p-2 flex items-center gap-4 animate-fade-in">
                {tool === 'eraser' ? (
                     <div className="flex bg-gray-100 rounded p-0.5 gap-0.5">
                        <button onClick={() => setEraserMode('magic')} className={`px-2 py-1 text-xs rounded font-bold ${eraserMode === 'magic' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Magic (Object)</button>
                        <button onClick={() => setEraserMode('rubber')} className={`px-2 py-1 text-xs rounded font-bold ${eraserMode === 'rubber' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Rubber (Pixel)</button>
                     </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            <input type="range" min="1" max={tool === 'highlighter' ? 50 : 20} value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} className="w-24 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                            <div className="w-4 h-4 rounded-full bg-gray-400" />
                        </div>
                        <div className="w-px h-6 bg-gray-300" />
                        {tool === 'highlighter' && (
                            <>
                                <div className="flex items-center gap-2" title="Opacity">
                                    <Icon.Sun size={14} className="text-gray-400" />
                                    <input type="range" min="0.1" max="1" step="0.1" value={strokeOpacity} onChange={(e) => setStrokeOpacity(parseFloat(e.target.value))} className="w-20 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                                </div>
                                <div className="w-px h-6 bg-gray-300" />
                            </>
                        )}
                        <div className="flex items-center gap-1.5">
                            {INK_COLORS.map(c => <button key={c} onClick={() => setColor(c)} className={`w-5 h-5 rounded-full border border-black/5 hover:scale-125 transition-transform ${color === c ? 'ring-2 ring-offset-1 ring-indigo-500' : ''}`} style={{ backgroundColor: c }} />)}
                            <label className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-100 relative overflow-hidden" title="Custom Color">
                                <input type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} />
                                <div className="w-full h-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500 opacity-50" />
                            </label>
                        </div>
                    </>
                )}
            </div>
        );
    }

    const handleAddSection = () => {
        const newId = generateId();
        setSections([...sections, { id: newId, title: 'New Section', content: '' }]);
        setActiveSectionId(newId);
    };

    const handleDeleteSection = (id: string) => {
        if (sections.length <= 1) return;
        if (window.confirm("Are you sure you want to delete this section?")) {
            const newSections = sections.filter(s => s.id !== id);
            setSections(newSections);
            if (activeSectionId === id) {
                setActiveSectionId(newSections[0].id);
            }
        }
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        setContextMenu(null); 
        if (e.button === 1 || (tool === 'select' && e.button === 0)) {
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            if (!dragTarget) setSelectedNoteId(null);
        }
    };

    const handleContentContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (tool === 'select') {
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas' });
        }
    };

    const handleNoteContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'note', id });
    };

    const handleNoteMouseDown = (e: React.MouseEvent, note: StickyNote) => {
        e.stopPropagation();
        handleElementMouseDown(e, { id: note.id, type: 'note' }, { x: note.x, y: note.y });
    };

    const handleNoteTextChange = (id: string, text: string) => {
        setStickyNotes(prev => ({
            ...prev,
            [pageNum]: (prev[pageNum] || []).map(n => n.id === id ? { ...n, text } : n)
        }));
    };

    // Auto-create/switch section when page changes
    const changePage = (newPage: number) => {
        if (newPage === pageNum) return;
        setPageNum(newPage);
        
        // Auto Tab Switch/Create Logic
        if (sourceType === 'PDF' && autoCreateTabs) {
            const pageTitle = `Page ${newPage}`;
            const existingSection = sections.find(s => s.title === pageTitle);
            
            if (existingSection) {
                setActiveSectionId(existingSection.id);
            } else {
                const newId = generateId();
                const newSection = { id: newId, title: pageTitle, content: '', pageLink: newPage };
                setSections(prev => [...prev, newSection]);
                setActiveSectionId(newId);
            }
        }
    };

    const connectionElements = useMemo(() => {
        const pageConns = noteConnections[pageNum] || [];
        const pageNotes = stickyNotes[pageNum] || [];

        return (
            <>
                {pageConns.map(conn => {
                     const source = pageNotes.find(n => n.id === conn.sourceId);
                     const target = pageNotes.find(n => n.id === conn.targetId);
                     if (!source || !target) return null;
                     
                     const srcW = source.minimized ? 40 : 220;
                     const srcH = source.minimized ? 40 : 150; 
                     const tgtW = target.minimized ? 40 : 220;
                     const tgtH = target.minimized ? 40 : 150;

                     const start = { x: source.x + srcW/2, y: source.y + srcH/2 };
                     const end = { x: target.x + tgtW/2, y: target.y + tgtH/2 };
                     
                     const points = [start, ...(conn.controlPoints || []), end];
                     
                     return (
                         <ConnectionRenderer 
                             key={conn.id}
                             points={points}
                             style={conn.style || 'curved'}
                             color={conn.color || '#ef4444'}
                             isHovered={hoveredConnectionId === conn.id}
                             onHover={(h) => setHoveredConnectionId(h ? conn.id : null)}
                             onContextMenu={(e) => handleConnectionContextMenu(e, conn.id, 'noteConnection')}
                             controlPoints={conn.controlPoints}
                             onControlPointDrag={(idx, e, pt) => handleElementMouseDown(e, { id: conn.id, type: 'connPoint', index: idx }, pt)}
                             onControlPointContextMenu={(idx, e) => {
                                 e.preventDefault(); e.stopPropagation();
                                 setContextMenu({ x: e.clientX, y: e.clientY, type: 'controlPoint', id: conn.id, pointIndex: idx });
                             }}
                         />
                     );
                })}
                
                {pageNotes.filter(n => n.anchor).map(note => {
                     if (!contentDimensions || !note.anchor) return null;
                     const contentW = contentDimensions.width;
                     const contentH = contentDimensions.height;
                     const topLeftX = CANVAS_CENTER - contentW / 2; 
                     const topLeftY = CANVAS_CENTER - contentH / 2;
                     
                     const anchorX = topLeftX + (note.anchor.x / 100) * contentW;
                     const anchorY = topLeftY + (note.anchor.y / 100) * contentH;
                     
                     const start = { x: anchorX, y: anchorY };
                     const noteW = note.minimized ? 40 : 220;
                     const noteH = note.minimized ? 40 : 150;
                     const end = { x: note.x + noteW/2, y: note.y + noteH/2 };
                     
                     const points = [start, ...(note.controlPoints || []), end];

                     return (
                         <ConnectionRenderer
                             key={`anchor-${note.id}`}
                             points={points}
                             style={note.connectionStyle || 'straight'}
                             color={note.connectionColor || '#ef4444'}
                             isHovered={hoveredConnectionId === note.id}
                             onHover={(h) => setHoveredConnectionId(h ? note.id : null)}
                             onContextMenu={(e) => handleConnectionContextMenu(e, note.id, 'anchorConnection')}
                             renderAnchors={true}
                             anchorPos={start}
                             onAnchorDrag={(e) => handleElementMouseDown(e, { id: note.id, type: 'anchor' }, start)}
                             controlPoints={note.controlPoints}
                             onControlPointDrag={(idx, e, pt) => handleElementMouseDown(e, { id: note.id, type: 'controlPoint', index: idx }, pt)}
                             onControlPointContextMenu={(idx, e) => {
                                 e.preventDefault(); e.stopPropagation();
                                 setContextMenu({ x: e.clientX, y: e.clientY, type: 'controlPoint', id: note.id, pointIndex: idx });
                             }}
                         />
                     );
                })}
                
                {linkingState && (
                     <path 
                         d={`M ${(() => {
                             const source = pageNotes.find(n => n.id === linkingState.sourceId);
                             const srcW = source ? (source.minimized ? 40 : 220) : 0;
                             const srcH = source ? (source.minimized ? 40 : 150) : 0;
                             return source ? `${source.x + srcW/2} ${source.y + srcH/2}` : '0 0';
                         })()} L ${linkingState.currentPos.x} ${linkingState.currentPos.y}`}
                         stroke="#ef4444"
                         strokeWidth="2"
                         strokeDasharray="5,5"
                         fill="none"
                         pointerEvents="none"
                     />
                )}
                 {anchorLinkingState && (
                     <path 
                         d={`M ${(() => {
                             const source = pageNotes.find(n => n.id === anchorLinkingState.noteId);
                             const srcW = source ? (source.minimized ? 40 : 220) : 0;
                             const srcH = source ? (source.minimized ? 40 : 150) : 0;
                             return source ? `${source.x + srcW/2} ${source.y + srcH/2}` : '0 0';
                         })()} L ${anchorLinkingState.currentPos.x} ${anchorLinkingState.currentPos.y}`}
                         stroke="#ef4444"
                         strokeWidth="2"
                         strokeDasharray="5,5"
                         fill="none"
                         pointerEvents="none"
                     />
                )}
            </>
        );
    }, [noteConnections, stickyNotes, pageNum, hoveredConnectionId, contentDimensions, linkingState, anchorLinkingState, handleElementMouseDown]);

    return (
        <div className="flex h-screen bg-[#f0f4f8] overflow-hidden font-sans text-gray-800">
             <div 
                 ref={cursorRef} 
                 className="fixed pointer-events-none rounded-full border border-black/50 z-[100] hidden mix-blend-difference"
                 style={{ 
                     width: (tool === 'highlighter' ? strokeWidth : (tool === 'eraser' && eraserMode === 'rubber' ? 30 : strokeWidth)) * viewport.zoom, 
                     height: (tool === 'highlighter' ? strokeWidth : (tool === 'eraser' && eraserMode === 'rubber' ? 30 : strokeWidth)) * viewport.zoom,
                     transform: 'translate(-50%, -50%)',
                     backgroundColor: tool === 'eraser' ? 'rgba(255, 255, 255, 0.5)' : color,
                     opacity: 0.5
                 }}
             />

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
                                        <div key={note.id} onClick={() => { changePage(parseInt(page)); }} className="p-2 bg-gray-50 rounded border border-gray-100 text-xs cursor-pointer hover:bg-blue-50 hover:border-blue-200 group relative flex items-center justify-between">
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
                        <button onClick={() => setIsSettingsPanelOpen(true)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Icon.Settings size={20} /></button>
                        <button onClick={handleExport} disabled={isLoading} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg font-bold text-xs px-4 flex items-center gap-2 border border-indigo-200 shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"><Icon.Download size={14}/> Export</button>
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Icon.Close size={20} /></button>
                    </div>
                </div>

                <div ref={splitContainerRef} className="flex-1 flex overflow-hidden relative">
                    <div className="flex flex-col border-r border-gray-200 bg-white relative z-0 h-full" style={{ width: `${splitRatio}%` }}>
                        <div className="flex overflow-x-auto border-b border-gray-200 custom-scrollbar bg-gray-50 p-1 gap-1">
                            {sections.map(section => (
                                <div key={section.id} id={`tab-btn-${section.id}`} onClick={() => { setActiveSectionId(section.id); if (section.pageLink && sourceType === 'PDF') { changePage(section.pageLink); } }} className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer min-w-[100px] max-w-[150px] border-b-2 transition-all ${activeSectionId === section.id ? 'bg-white border-indigo-500 text-indigo-600 font-bold shadow-sm' : 'bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200'}`}>
                                    <input value={section.title} onChange={(e) => { const newSecs = sections.map(s => s.id === section.id ? { ...s, title: e.target.value } : s); setSections(newSecs); }} className="bg-transparent outline-none w-full text-xs truncate" onDoubleClick={(e) => e.currentTarget.select()} />
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteSection(section.id); }} className="text-gray-400 hover:text-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100"><Icon.Close size={10} /></button>
                                </div>
                            ))}
                            <button onClick={handleAddSection} className="px-2 py-1 text-gray-400 hover:text-indigo-600 hover:bg-gray-200 rounded"><Icon.Plus size={16} /></button>
                        </div>
                        
                        <div className="flex-1 relative">
                            <textarea value={activeSection?.content || ''} onChange={(e) => { const newSecs = sections.map(s => s.id === activeSectionId ? { ...s, content: e.target.value } : s); setSections(newSecs); }} className="w-full h-full resize-none outline-none text-base leading-loose text-slate-800 placeholder-slate-300 custom-scrollbar bg-transparent font-medium p-8" placeholder="Start typing your notes here..." spellCheck={false} />
                        </div>
                    </div>
                    
                    <div className="w-1.5 hover:w-2 bg-transparent hover:bg-blue-400 cursor-col-resize z-50 transition-all flex items-center justify-center group absolute h-full -ml-0.5" style={{ left: `${splitRatio}%` }} onMouseDown={(e) => { e.preventDefault(); isResizing.current = true; const handleMove = (ev: MouseEvent) => { if (!splitContainerRef.current) return; const rect = splitContainerRef.current.getBoundingClientRect(); const w = ((ev.clientX - rect.left) / rect.width) * 100; setSplitRatio(Math.max(20, Math.min(80, w))); }; const handleUp = () => { isResizing.current = false; document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); }; document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleUp); }}>
                        <div className="w-[1px] h-full bg-gray-200 group-hover:bg-transparent" />
                    </div>

                    <div className={`flex-1 flex flex-col bg-[#e5e7eb] relative min-w-0 h-full overflow-hidden ${dragTarget ? 'cursor-grabbing' : ''}`}>
                        {renderToolProperties()}

                        <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-3 shrink-0 z-20 shadow-sm relative">
                            <div className="flex items-center gap-1">
                                <button onClick={() => changePage(Math.max(1, pageNum - 1))} disabled={pageNum<=1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><Icon.ChevronLeft size={16}/></button>
                                <span className="text-xs font-bold w-12 text-center text-gray-700">{pageNum} / {numPages || '-'}</span>
                                <button onClick={() => changePage(Math.min(numPages, pageNum + 1))} disabled={pageNum>=numPages} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><Icon.ChevronRight size={16}/></button>
                            </div>

                            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 border border-gray-200">
                                {['select', 'pen', 'highlighter', 'eraser', 'note'].map(t => (
                                    <button key={t} onClick={() => setTool(t as any)} className={`p-1.5 rounded-md transition-all flex items-center justify-center ${tool === t ? 'bg-white shadow text-indigo-600 ring-1 ring-black/5 scale-105' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200/50'}`} title={t.charAt(0).toUpperCase() + t.slice(1)}>
                                        {t === 'select' && <Icon.Select size={18} />}
                                        {t === 'pen' && <Icon.Pen size={18} />}
                                        {t === 'highlighter' && <Icon.Highlighter size={18} />}
                                        {t === 'eraser' && <Icon.Eraser size={18} />}
                                        {t === 'note' && <Icon.StickyNote size={18} />}
                                    </button>
                                ))}
                                <div className="w-px h-5 bg-gray-300 mx-1 my-auto" />
                                <div className="w-6 h-6 rounded my-auto border border-gray-300 shadow-sm relative overflow-hidden" title="Active Ink Color">
                                     <div className="w-full h-full" style={{ backgroundColor: color, opacity: tool === 'highlighter' ? strokeOpacity : 1 }} />
                                </div>
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
                            className={`flex-1 relative overflow-hidden ${isPanning ? 'cursor-grabbing' : tool === 'select' ? 'cursor-grab' : tool === 'pen' ? 'cursor-pen' : tool === 'highlighter' ? 'cursor-highlighter' : tool === 'eraser' ? 'cursor-eraser' : 'cursor-crosshair'}`}
                            onMouseDown={handleCanvasMouseDown}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={handleCanvasMouseUp}
                            onContextMenu={handleContentContextMenu}
                        >
                            <div ref={captureContainerRef} style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: 'top left', width: CANVAS_SIZE, height: CANVAS_SIZE, position: 'absolute', top: 0, left: 0 }} className="bg-transparent">
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-2xl bg-white" style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', padding: '0', width: contentDimensions ? contentDimensions.width : 'auto', height: contentDimensions ? contentDimensions.height : 'auto' }} onMouseDown={handleContentMouseDown} onMouseMove={handleContentMouseMove} onMouseUp={handleContentMouseUp}>
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
                                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 20 }}>{connectionElements}</svg>
                                {(stickyNotes[pageNum] as StickyNote[] || []).map(note => (
                                    <div key={note.id} id={`sticky-note-${note.id}`} className={`absolute flex flex-col shadow-lg rounded-lg overflow-visible border border-black/10 transition-[box-shadow,transform] duration-200 hover:shadow-2xl hover:scale-[1.01] group/note ${selectedNoteId === note.id ? 'ring-2 ring-indigo-500 shadow-2xl z-50' : 'z-30'}`} style={{ left: note.x, top: note.y, width: note.minimized ? '40px' : '220px', height: note.minimized ? '40px' : 'auto', backgroundColor: note.color, transitionProperty: 'box-shadow, transform, background-color', transitionDuration: '200ms' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setSelectedNoteId(note.id); }} onContextMenu={(e) => handleNoteContextMenu(e, note.id)}>
                                        <div className="h-7 w-full bg-black/5 flex items-center justify-between px-1 cursor-move border-b border-black/5" onMouseDown={(e) => handleNoteMouseDown(e, note)} title="Drag to move">
                                            <div className="flex gap-1 pl-1 items-center">
                                                {note.minimized && <div className="w-2 h-2 rounded-full bg-gray-400" />}
                                                {!note.minimized && <div className="flex gap-1 items-center" onMouseDown={e => e.stopPropagation()}>{NOTE_COLORS.slice(0, 3).map(c => <button key={c} onClick={(e) => { e.stopPropagation(); updateStickyNote(note.id, { color: c }); }} className="w-3 h-3 rounded-full border border-black/10 hover:scale-125 transition-transform" style={{ backgroundColor: c }} />)}</div>}
                                            </div>
                                            <div className="flex gap-1 items-center" onMouseDown={e => e.stopPropagation()}>
                                                {note.minimized ? <button onClick={(e) => { e.stopPropagation(); updateStickyNote(note.id, { minimized: false }); }} className="p-0.5 hover:bg-blue-100 hover:text-blue-600 rounded text-gray-500" title="Expand"><Icon.Plus size={10} /></button> : <><button onClick={(e) => { e.stopPropagation(); updateStickyNote(note.id, { minimized: true }); }} className="p-0.5 hover:bg-black/10 rounded text-gray-500 hover:text-gray-800" title="Minimize"><Icon.Minus size={10} /></button><button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className="p-0.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400"><Icon.Close size={10} /></button></>}
                                            </div>
                                        </div>
                                        {!note.minimized && <><div className={`absolute -right-8 top-0 flex flex-col gap-1 transition-opacity pointer-events-auto ${selectedNoteId === note.id ? 'opacity-100' : 'opacity-0 group-hover/note:opacity-100'}`}><button className="w-6 h-6 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-blue-50" title="Add Child Note" onClick={(e) => { e.stopPropagation(); addChildNote(note.id); }}><Icon.Plus size={14} /></button><button className="w-6 h-6 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-green-600 hover:bg-green-50 cursor-crosshair" title="Drag to Link" onMouseDown={(e) => startLinking(e, note.id)}><Icon.Connect size={14} /></button></div><textarea className="w-full h-auto min-h-[120px] p-3 bg-transparent text-sm resize-none outline-none font-medium text-gray-800 custom-scrollbar leading-relaxed" value={note.text} onChange={(e) => { handleNoteTextChange(note.id, e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="Type note..." onMouseDown={(e) => e.stopPropagation()} spellCheck={false} /></>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <NotepadMinimap viewport={viewport} setViewport={setViewport} contentDimensions={contentDimensions} stickyNotes={stickyNotes[pageNum] || []} containerSize={containerDimensions} />
                </div>
            </div>

            {/* Settings Sidebar */}
            <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-[200] transform transition-transform duration-300 ease-in-out ${isSettingsPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2"><Icon.Settings size={20} className="text-gray-500"/> Preferences</h2>
                    <button onClick={() => setIsSettingsPanelOpen(false)} className="p-1 hover:bg-gray-200 rounded text-gray-500"><Icon.Close size={20}/></button>
                </div>
                <div className="p-4 space-y-6">
                    <div>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Automation</h3>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Auto-create Tabs</span>
                            <div className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${autoCreateTabs ? 'bg-green-500' : 'bg-gray-300'}`} onClick={() => setAutoCreateTabs(!autoCreateTabs)}>
                                <div className={`w-3 h-3 bg-white rounded-full absolute top-1 shadow-sm transition-all ${autoCreateTabs ? 'left-6' : 'left-1'}`}/>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-500">Automatically creates a new note tab for the page when you switch PDF pages.</p>
                    </div>

                    <div>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Display</h3>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Visual Grid</span>
                            <div className="w-10 h-5 rounded-full relative cursor-pointer bg-green-500">
                                <div className="w-3 h-3 bg-white rounded-full absolute top-1 left-6 shadow-sm"/>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Danger Zone</h3>
                        <button 
                            onClick={() => {
                                if(window.confirm("Clear ALL annotations and notes on this page? This cannot be undone easily.")) {
                                    setAnnotations(prev => ({...prev, [pageNum]: []}));
                                    setStickyNotes(prev => ({...prev, [pageNum]: []}));
                                    setNoteConnections(prev => ({...prev, [pageNum]: []}));
                                }
                            }}
                            className="w-full py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                        >
                            <Icon.Trash size={16}/> Clear Page
                        </button>
                    </div>
                </div>
            </div>
            
            {contextMenu && (
                <div className="fixed z-[100] bg-white border border-gray-200 shadow-xl rounded-lg p-1 text-sm flex flex-col min-w-[200px] animate-pop origin-top-left" style={{ top: contextMenu.y, left: contextMenu.x }} onMouseDown={(e) => e.stopPropagation()}>
                    {contextMenu.type === 'canvas' ? <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('create_note')}><Icon.StickyNote size={14} /> Create Sticky Note</button> :
                    contextMenu.type === 'note' && contextMenu.id ? <><button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('add_child')}><Icon.Plus size={14} /> Add Child Note</button><button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('add_anchor')}><Icon.Map size={14} /> Add Anchor Point</button><div className="p-2 border-b border-t border-gray-100"><div className="text-[10px] font-bold text-gray-400 uppercase mb-2 pl-1">Note Color</div><div className="flex flex-wrap gap-1.5">{NOTE_COLORS.map(c => <button key={c} onClick={() => handleContextMenuAction('color', c)} className="w-5 h-5 rounded-full border border-black/10 hover:scale-125 transition-transform shadow-sm" style={{backgroundColor: c}}/>)}</div></div><button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete')}><Icon.Trash size={14} /> Delete Note</button></> :
                    contextMenu.type === 'controlPoint' && contextMenu.id ? <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete_point')}><Icon.Trash size={14} /> Delete Control Point</button> :
                    <><div className="p-2 border-b border-gray-100"><div className="text-[10px] font-bold text-gray-400 uppercase mb-2 pl-1">Link Color</div><div className="flex flex-wrap gap-1.5">{LINK_COLORS.map(c => <button key={c} onClick={() => handleContextMenuAction('connection_color', c)} className="w-5 h-5 rounded-full border border-black/10 hover:scale-125 transition-transform shadow-sm" style={{backgroundColor: c}}/>)}</div></div><div className="p-2 border-b border-gray-100"><div className="text-[10px] font-bold text-gray-400 uppercase mb-2 pl-1">Link Style</div><div className="flex gap-1"><button onClick={() => handleContextMenuAction('connection_style', 'straight')} className="flex-1 py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-600">STR</button><button onClick={() => handleContextMenuAction('connection_style', 'curved')} className="flex-1 py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-600">CRV</button><button onClick={() => handleContextMenuAction('connection_style', 'orthogonal')} className="flex-1 py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-600">90°</button></div></div>{(contextMenu.connectionType === 'noteConnection' || contextMenu.connectionType === 'anchorConnection') && <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2 mt-1" onClick={() => handleContextMenuAction('add_point')}><Icon.Plus size={14} /> Add Control Point</button>}<button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete_link')}><Icon.Trash size={14} /> Delete Connection</button></>}
                </div>
            )}
        </div>
    );
};
