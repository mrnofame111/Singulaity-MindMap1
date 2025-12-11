
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Icon } from './Icons';
import * as pdfjsLib from 'pdfjs-dist';
import * as htmlToImage from 'html-to-image';
import { saveFile, getFile } from '../services/localDb';
import { NotepadExportModal } from './NotepadExportModal';

// Set worker source for PDF.js dynamically
const pdfjsVersion = pdfjsLib.version || '5.4.449';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

interface NotepadScreenProps {
    onBack: () => void;
}

// ... (Keep existing interfaces and constants same as before) ...
type AnnotationType = 'pen' | 'highlighter' | 'laser' | 'line' | 'rectangle' | 'circle' | 'star' | 'emphasis' | 'box_highlight' | 'arrow';

interface AnnotationPath {
    id: string;
    type: AnnotationType;
    points: { x: number; y: number }[];
    color: string;
    width: number;
    opacity: number;
    isEraser?: boolean;
    arrowType?: 'single' | 'double';
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
    
    // New Fields for Multimedia
    contentType?: 'text' | 'image' | 'audio' | 'table' | 'drawing';
    mediaUrl?: string;
    tableData?: string[][];
    isPlaceholder?: boolean;
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
const NOTE_COLORS = ['#ffccbc', '#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7', '#f3f4f6']; 
const LINK_COLORS = ['#ff0000', '#cbd5e1', '#94a3b8', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
const INK_COLORS = ['#1e293b', '#ff0000', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ffffff'];

const generateId = () => `note_${Math.random().toString(36).substr(2, 9)}`;
const generateConnId = () => `conn_${Math.random().toString(36).substr(2, 9)}`;
const generatePathId = () => `path_${Math.random().toString(36).substr(2, 9)}`;

// Infinite Canvas Config
const CANVAS_SIZE = 8000;
const CANVAS_CENTER = CANVAS_SIZE / 2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const INITIAL_ZOOM = 0.8;
const MAX_HISTORY = 50;

// ... (Keep existing helper functions: dist2, getInsertionIndex, etc. same) ...
const sqr = (x: number) => x * x;
const dist2 = (v: ControlPoint, w: ControlPoint) => sqr(v.x - w.x) + sqr(v.y - w.y);
const distToSegmentSquared = (p: ControlPoint, v: ControlPoint, w: ControlPoint) => {
  const l2 = dist2(v, w);
  if (l2 === 0) return dist2(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
};

const getInsertionIndex = (points: ControlPoint[], newPoint: ControlPoint, start: ControlPoint, end: ControlPoint) => {
    const allPoints = [start, ...points, end];
    let minD2 = Infinity;
    let insertIndex = 0;
    for (let i = 0; i < allPoints.length - 1; i++) {
        const d2 = distToSegmentSquared(newPoint, allPoints[i], allPoints[i+1]);
        if (d2 < minD2) { minD2 = d2; insertIndex = i; }
    }
    return insertIndex;
};

const getNoteCenter = (note: StickyNote) => {
    const w = note.minimized ? 40 : (note.contentType === 'image' || note.contentType === 'table' || note.contentType === 'drawing' ? 300 : 220);
    const h = note.minimized ? 40 : (note.contentType === 'image' || note.contentType === 'drawing' ? 200 : 150);
    return { x: note.x + w/2, y: note.y + h/2 };
};

const isPointNearPath = (x: number, y: number, path: AnnotationPath, threshold: number = 10): boolean => {
    if (path.points.length < 2) return false;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    path.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    });
    if (x < minX - threshold || x > maxX + threshold || y < minY - threshold || y > maxY + threshold) return false;
    if (['rectangle', 'box_highlight', 'circle', 'star'].includes(path.type)) return true; 
    for (let i = 0; i < path.points.length - 1; i++) {
        const p1 = path.points[i];
        const p2 = path.points[i+1];
        const d2 = distToSegmentSquared({x, y}, p1, p2);
        if (d2 < threshold * threshold) return true;
    }
    return false;
};

// ... (Keep render helpers: drawStar, drawArrow, drawSmoothPath, solveCatmullRom same) ...
const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) => {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;
        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
};

const drawArrow = (ctx: CanvasRenderingContext2D, start: {x:number, y:number}, end: {x:number, y:number}, width: number, type: 'single' | 'double' = 'single') => {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLen = Math.max(15, width * 3); 
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.lineTo(end.x, end.y);
    ctx.fill();
    if (type === 'double') {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(start.x + headLen * Math.cos(angle - Math.PI / 6), start.y + headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(start.x + headLen * Math.cos(angle + Math.PI / 6), start.y + headLen * Math.sin(angle + Math.PI / 6));
        ctx.lineTo(start.x, start.y);
        ctx.fill();
    }
};

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

const ConnectionRenderer: React.FC<any> = ({ points, style, color, isHovered, isSelected, onHover, onClick, onContextMenu, renderAnchors, anchorPos, onAnchorDrag, controlPoints, onControlPointDrag, onControlPointContextMenu }) => {
    const pathData = useMemo(() => {
        if (points.length < 2) return '';
        const start = points[0];
        if (style === 'straight') return `M ${points.map((p: any) => `${p.x} ${p.y}`).join(' L ')}`;
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
            onClick={(e) => { e.stopPropagation(); onClick && onClick(e); }}
            className="group"
            style={{ pointerEvents: 'auto' }}
        >
            <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} className="cursor-pointer" />
            {isSelected && <path d={pathData} fill="none" stroke="#3b82f6" strokeWidth={8} strokeLinecap="round" opacity={0.5} className="animate-pulse" />}
            <path d={pathData} fill="none" stroke={color} strokeWidth={isHovered || isSelected ? 4 : 2} strokeDasharray={style === 'straight' ? '5,5' : 'none'} strokeLinecap="round" className="pointer-events-none" />
            {renderAnchors && anchorPos && (
                <g className="cursor-move" onMouseDown={(e) => { if (e.button === 2) return; e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); onAnchorDrag && onAnchorDrag(e); }}>
                    <circle cx={anchorPos.x} cy={anchorPos.y} r={24} fill="transparent" />
                    <circle cx={anchorPos.x} cy={anchorPos.y} r={isHovered ? 7 : 5} fill={color} stroke="white" strokeWidth={2} pointerEvents="none" />
                </g>
            )}
            {controlPoints && controlPoints.length > 0 && controlPoints.map((cp: any, idx: number) => (
                 <g key={idx} className="cursor-pointer" onMouseDown={(e) => { if (e.button === 2) return; e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); onControlPointDrag && onControlPointDrag(idx, e, cp); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onControlPointContextMenu && onControlPointContextMenu(idx, e); }}>
                    <circle cx={cp.x} cy={cp.y} r={20} fill="transparent" />
                    <circle cx={cp.x} cy={cp.y} r={isHovered ? 7 : 5} fill="white" stroke={color} strokeWidth={2} pointerEvents="none" />
                 </g>
            ))}
        </g>
    );
};

const NotepadMinimap: React.FC<any> = ({ viewport, setViewport, contentDimensions, stickyNotes, containerSize }) => {
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
        setViewport((prev: any) => ({ ...prev, x: newX, y: newY }));
    };

    return (
        <div 
            ref={ref}
            className="absolute bottom-16 right-6 bg-white border-2 border-gray-200 shadow-xl rounded-xl overflow-hidden z-50 cursor-pointer hover:border-indigo-400 transition-colors"
            style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); updateViewport(e.clientX, e.clientY); }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {isDragging && <div className="fixed inset-0 z-[100]" onMouseMove={e=>updateViewport(e.clientX, e.clientY)} onMouseUp={()=>setIsDragging(false)} />}
            <div className="w-full h-full bg-gray-50 relative pointer-events-none">
                 <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#9ca3af 1px, transparent 1px)', backgroundSize: '10px 10px' }} />
                {contentDimensions && <div className="absolute bg-white border border-gray-300 shadow-sm" style={{ left: (CANVAS_CENTER - contentDimensions.width / 2) * SCALE, top: (CANVAS_CENTER - contentDimensions.height / 2) * SCALE, width: contentDimensions.width * SCALE, height: contentDimensions.height * SCALE }} />}
                {stickyNotes.map((note: any) => <div key={note.id} className="absolute rounded-sm" style={{ left: note.x * SCALE, top: note.y * SCALE, width: (note.minimized ? 20 : 100) * SCALE, height: (note.minimized ? 20 : 80) * SCALE, backgroundColor: note.color, border: '1px solid rgba(0,0,0,0.1)' }} />)}
                <div className="absolute border-2 border-red-500 bg-red-500/10" style={{ left: (-viewport.x / viewport.zoom) * SCALE, top: (-viewport.y / viewport.zoom) * SCALE, width: (containerSize.width / viewport.zoom) * SCALE, height: (containerSize.height / viewport.zoom) * SCALE }} />
            </div>
        </div>
    );
};

const DrawingArea = ({ initialImage, onSave, strokeColor }: { initialImage?: string, onSave: (data: string) => void, strokeColor: string }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if(!canvas) return;
        const scale = 2;
        canvas.width = 600; 
        canvas.height = 400;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        const ctx = canvas.getContext('2d');
        if(ctx) {
            ctx.scale(scale, scale);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.lineWidth = 2;
            ctx.strokeStyle = strokeColor;
            contextRef.current = ctx;
            if (initialImage) {
                const img = new Image();
                img.onload = () => { ctx.drawImage(img, 0, 0, 300, 200); };
                img.src = initialImage;
            }
        }
    }, []);

    useEffect(() => { if(contextRef.current) contextRef.current.strokeStyle = strokeColor; }, [strokeColor]);

    const startDrawing = ({ nativeEvent }: React.MouseEvent) => {
        const { offsetX, offsetY } = nativeEvent;
        contextRef.current?.beginPath();
        contextRef.current?.moveTo(offsetX, offsetY);
        setIsDrawing(true);
    };

    const draw = ({ nativeEvent }: React.MouseEvent) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = nativeEvent;
        contextRef.current?.lineTo(offsetX, offsetY);
        contextRef.current?.stroke();
    };

    const stopDrawing = () => {
        contextRef.current?.closePath();
        setIsDrawing(false);
        if(canvasRef.current) onSave(canvasRef.current.toDataURL());
    };

    return (
        <div className="w-full h-full min-h-[200px] bg-white rounded cursor-crosshair border border-gray-200 relative">
            <canvas ref={canvasRef} className="w-full h-full" onMouseDown={(e) => { e.stopPropagation(); startDrawing(e); }} onMouseMove={(e) => { e.stopPropagation(); draw(e); }} onMouseUp={(e) => { e.stopPropagation(); stopDrawing(); }} onMouseLeave={stopDrawing} />
            <div className="absolute top-2 right-2 text-[9px] font-bold text-gray-300 pointer-events-none">DRAWING AREA</div>
        </div>
    );
};

export const NotepadScreen: React.FC<NotepadScreenProps> = ({ onBack }) => {
    // ... (Keep all existing state and refs) ...
    const [activePadId, setActivePadId] = useState<string | null>(null);
    const [savedPads, setSavedPads] = useState<SavedNotepadMeta[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [activeTab, setActiveTab] = useState<'PADS' | 'NOTES'>('PADS');
    const [isLoading, setIsLoading] = useState(false);
    
    // Core Data
    const [title, setTitle] = useState('Untitled Note');
    const [sections, setSections] = useState<TextSection[]>([{ id: 'default', title: 'General Notes', content: '' }]);
    const [activeSectionId, setActiveSectionId] = useState<string>('default');
    
    // Source
    const [sourceName, setSourceName] = useState<string | null>(null);
    const [sourceType, setSourceType] = useState<'PDF' | 'IMAGE' | null>(null);
    const [sourceData, setSourceData] = useState<ArrayBuffer | string | null>(null);
    const [pdfDocument, setPdfDocument] = useState<any>(null);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [pdfError, setPdfError] = useState<string | null>(null);
    
    // Canvas
    const [contentDimensions, setContentDimensions] = useState<{ width: number, height: number } | null>(null);
    const hasAutoCentered = useRef(false);
    const [viewport, setViewport] = useState<{ x: number, y: number, zoom: number }>(() => ({ x: (window.innerWidth / 2) - (CANVAS_CENTER * INITIAL_ZOOM), y: (window.innerHeight / 2) - (CANVAS_CENTER * INITIAL_ZOOM), zoom: INITIAL_ZOOM }));
    const [containerDimensions, setContainerDimensions] = useState<{ width: number, height: number }>({ width: 0, height: 0 });
    const lastMousePos = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
    const cursorRef = useRef<HTMLDivElement>(null);
    
    // Selection
    const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    
    const [isRightPanning, setIsRightPanning] = useState(false);
    const hasRightPanMoved = useRef(false);
    const [selectionBox, setSelectionBox] = useState<{ start: {x: number, y: number}, current: {x: number, y: number} } | null>(null);
    
    // Tools
    const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser' | 'select' | 'note' | 'laser'>('select');
    const [activeShape, setActiveShape] = useState<'freehand' | 'line' | 'rectangle' | 'circle' | 'star' | 'emphasis' | 'box_highlight' | 'arrow'>('freehand');
    const [activeArrowType, setActiveArrowType] = useState<'single' | 'double'>('single');
    
    const [color, setColor] = useState('#1e293b');
    const [strokeWidth, setStrokeWidth] = useState(2);
    const [strokeOpacity, setStrokeOpacity] = useState(1);
    const [eraserMode, setEraserMode] = useState<'magic' | 'rubber'>('magic');
    const [autoCreateTabs, setAutoCreateTabs] = useState(true);

    // Objects
    const [annotations, setAnnotations] = useState<Record<number, AnnotationPath[]>>({});
    const [stickyNotes, setStickyNotes] = useState<Record<number, StickyNote[]>>({});
    const [noteConnections, setNoteConnections] = useState<Record<number, NoteConnection[]>>({});
    const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
    
    // Laser Trail
    const [laserPath, setLaserPath] = useState<{x: number, y: number, time: number}[]>([]);
    
    // History
    const [history, setHistory] = useState<any[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    
    // Audio
    const [recordingNoteId, setRecordingNoteId] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    
    // Interaction
    const [dragTarget, setDragTarget] = useState<any>(null);
    const [selectedConnectionId, setSelectedConnectionId] = useState<any>(null);
    const [linkingState, setLinkingState] = useState<any>(null);
    const [anchorLinkingState, setAnchorLinkingState] = useState<any>(null);
    const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const cachedCanvasRect = useRef<DOMRect | null>(null);
    const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<any>(null);
    
    const uploadTriggerPos = useRef<{ x: number, y: number } | null>(null);

    // Refs
    const [splitRatio, setSplitRatio] = useState(30);
    const splitContainerRef = useRef<HTMLDivElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const captureContainerRef = useRef<HTMLDivElement>(null); 
    const contentContainerRef = useRef<HTMLDivElement>(null); 
    const isResizing = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageUploadRef = useRef<HTMLInputElement>(null);
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
    const laserCanvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const currentPath = useRef<AnnotationPath | null>(null);
    const renderTaskRef = useRef<any>(null);
    const lastDrawPoint = useRef<{ x: number, y: number } | null>(null);
    const drawStartPoint = useRef<{ x: number, y: number } | null>(null); 
    const isShiftPressed = useRef(false);
    const [renderScale, setRenderScale] = useState(1.5);
    const tabsListRef = useRef<HTMLDivElement>(null);

    // EXPORT MODAL STATE
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // Initialization & Effects (Identical to previous)
    useEffect(() => { loadIndex(); }, []);
    useEffect(() => { if (selectedAnnotationId) { const pageAnns = annotations[pageNum] || []; const selected = pageAnns.find(a => a.id === selectedAnnotationId); if (selected) { setColor(prev => selected.color !== prev ? selected.color : prev); setStrokeWidth(prev => selected.width !== prev ? selected.width : prev); setStrokeOpacity(prev => selected.opacity !== prev ? selected.opacity : prev); if (selected.type === 'arrow' && selected.arrowType) { setActiveArrowType(prev => selected.arrowType !== prev ? selected.arrowType : prev); } } } }, [selectedAnnotationId, annotations, pageNum]);
    useEffect(() => { if (selectedAnnotationId) { setAnnotations(prev => { const pageAnns = prev[pageNum] || []; const idx = pageAnns.findIndex(a => a.id === selectedAnnotationId); if (idx === -1) return prev; const updated = { ...pageAnns[idx], color, width: strokeWidth, opacity: strokeOpacity, arrowType: activeArrowType }; if (JSON.stringify(pageAnns[idx]) === JSON.stringify(updated)) return prev; const newPageAnns = [...pageAnns]; newPageAnns[idx] = updated; return { ...prev, [pageNum]: newPageAnns }; }); } }, [color, strokeWidth, strokeOpacity, activeArrowType]); 
    useEffect(() => { if (tabsListRef.current) { const activeBtn = document.getElementById(`tab-btn-${activeSectionId}`); if (activeBtn) { activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } } }, [activeSectionId, sections]);
    useEffect(() => { if (tool === 'highlighter') { setStrokeWidth(20); setStrokeOpacity(0.5); setColor('#f59e0b'); setActiveShape('freehand'); setSelectedAnnotationId(null); } else if (tool === 'pen') { setStrokeWidth(2); setStrokeOpacity(1); setColor('#1e293b'); setActiveShape('freehand'); setSelectedAnnotationId(null); } else if (tool === 'laser') { setStrokeWidth(4); setStrokeOpacity(0.8); setColor('#ef4444'); setSelectedAnnotationId(null); } else if (tool === 'select') { /* */ } else { setSelectedAnnotationId(null); } }, [tool]);
    useEffect(() => { if (!canvasContainerRef.current) return; const ro = new ResizeObserver(entries => { for (let entry of entries) setContainerDimensions({ width: entry.contentRect.width, height: entry.contentRect.height }); }); ro.observe(canvasContainerRef.current); return () => ro.disconnect(); }, []);
    useEffect(() => { let animId: number; const renderLaser = () => { if (laserPath.length === 0) return; const canvas = laserCanvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); const now = Date.now(); const survivingPath = laserPath.filter(p => now - p.time < 1000); if (survivingPath.length > 1) { ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; for (let i = 1; i < survivingPath.length; i++) { const p1 = survivingPath[i-1]; const p2 = survivingPath[i]; const age = now - p2.time; const opacity = Math.max(0, 1 - age / 1000); ctx.beginPath(); ctx.moveTo(p1.x * renderScale, p1.y * renderScale); ctx.lineTo(p2.x * renderScale, p2.y * renderScale); ctx.globalAlpha = opacity; ctx.lineWidth = (4 * renderScale) * (1 - age/1500); ctx.stroke(); } } if (survivingPath.length !== laserPath.length) { setLaserPath(survivingPath); } if (survivingPath.length > 0) { animId = requestAnimationFrame(renderLaser); } else { ctx.clearRect(0, 0, canvas.width, canvas.height); } }; if (laserPath.length > 0) { animId = requestAnimationFrame(renderLaser); } return () => cancelAnimationFrame(animId); }, [laserPath, renderScale]);
    useEffect(() => { requestAnimationFrame(redrawAnnotations); }, [annotations, pageNum, renderScale]);

    const redrawAnnotations = useCallback(() => { /* ... existing redraw logic ... */ 
        const canvas = annotationCanvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); const pageAnnotations = annotations[pageNum] || []; pageAnnotations.forEach(path => { if (!path || !Array.isArray(path.points) || path.points.length < 2) return; if (path.isEraser) { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = path.width * renderScale; ctx.globalAlpha = 1.0; } else if (path.type === 'highlighter' || path.type === 'box_highlight') { ctx.globalCompositeOperation = 'multiply'; ctx.lineWidth = path.width * renderScale; ctx.globalAlpha = path.opacity !== undefined ? path.opacity : 0.4; ctx.strokeStyle = path.color; ctx.fillStyle = path.color; } else { ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = path.width * renderScale; ctx.globalAlpha = path.opacity !== undefined ? path.opacity : 1.0; ctx.strokeStyle = path.color; ctx.fillStyle = path.color; } ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const startP = path.points[0]; const endP = path.points[path.points.length - 1]; if (path.type === 'line') { ctx.beginPath(); ctx.moveTo(startP.x * renderScale, startP.y * renderScale); ctx.lineTo(endP.x * renderScale, endP.y * renderScale); ctx.stroke(); } else if (path.type === 'arrow') { drawArrow(ctx, { x: startP.x * renderScale, y: startP.y * renderScale }, { x: endP.x * renderScale, y: endP.y * renderScale }, path.width * renderScale, path.arrowType); } else if (path.type === 'rectangle') { ctx.strokeRect(startP.x * renderScale, startP.y * renderScale, (endP.x - startP.x) * renderScale, (endP.y - startP.y) * renderScale); } else if (path.type === 'box_highlight') { ctx.fillRect(startP.x * renderScale, startP.y * renderScale, (endP.x - startP.x) * renderScale, (endP.y - startP.y) * renderScale); } else if (path.type === 'circle') { const radius = Math.sqrt(Math.pow(endP.x - startP.x, 2) + Math.pow(endP.y - startP.y, 2)); ctx.beginPath(); ctx.arc(startP.x * renderScale, startP.y * renderScale, radius * renderScale, 0, 2 * Math.PI); ctx.stroke(); } else if (path.type === 'star') { const radius = Math.sqrt(Math.pow(endP.x - startP.x, 2) + Math.pow(endP.y - startP.y, 2)); drawStar(ctx, startP.x * renderScale, startP.y * renderScale, 5, radius * renderScale, (radius / 2) * renderScale); ctx.stroke(); } else if (path.type === 'emphasis') { ctx.beginPath(); const midX = (startP.x + endP.x) / 2; const midY = Math.max(startP.y, endP.y) + 10; ctx.moveTo(startP.x * renderScale, startP.y * renderScale); ctx.quadraticCurveTo(midX * renderScale, midY * renderScale, endP.x * renderScale, endP.y * renderScale); ctx.moveTo((startP.x + 2) * renderScale, (startP.y + 4) * renderScale); ctx.quadraticCurveTo(midX * renderScale, (midY + 4) * renderScale, (endP.x - 2) * renderScale, (endP.y + 4) * renderScale); ctx.stroke(); } else { drawSmoothPath(ctx, path.points, renderScale); ctx.stroke(); } ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; });
    }, [annotations, pageNum, renderScale]);

    // ... (Keep all interaction logic: handleZoom, commitToHistory, undo, redo, deleteNote, addNoteAt, etc.) ...
    const touchStateRef = useRef<{ dist: number; center: {x: number, y: number} } | null>(null);
    const handleZoom = useCallback((delta: number, center?: { x: number, y: number }) => { setViewport(prev => { const newZoom = Math.min(Math.max(prev.zoom + delta, MIN_ZOOM), MAX_ZOOM); if (!center || !canvasContainerRef.current) { const container = canvasContainerRef.current; const w = container ? container.clientWidth : window.innerWidth; const h = container ? container.clientHeight : window.innerHeight; const cx = (w/2 - prev.x) / prev.zoom; const cy = (h/2 - prev.y) / prev.zoom; return { x: w/2 - cx * newZoom, y: h/2 - cy * newZoom, zoom: newZoom }; } const rect = canvasContainerRef.current!.getBoundingClientRect(); const mouseX = center.x - rect.left; const mouseY = center.y - rect.top; const contentX = (mouseX - prev.x) / prev.zoom; const contentY = (mouseY - prev.y) / prev.zoom; return { x: mouseX - contentX * newZoom, y: mouseY - contentY * newZoom, zoom: newZoom }; }); }, []);
    useEffect(() => { const container = canvasContainerRef.current; if (!container) return; const onWheel = (e: WheelEvent) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return; e.preventDefault(); const isPinch = e.ctrlKey; const delta = -e.deltaY; let zoomDelta = 0; if (isPinch) { zoomDelta = delta * 0.01; } else { const sign = Math.sign(delta); zoomDelta = sign * 0.1; if (Math.abs(e.deltaY) < 50) zoomDelta = delta * 0.002; } setViewport(prev => { const newZoom = Math.min(Math.max(prev.zoom + zoomDelta, MIN_ZOOM), MAX_ZOOM); const rect = container.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top; const contentX = (mouseX - prev.x) / prev.zoom; const contentY = (mouseY - prev.y) / prev.zoom; return { x: mouseX - contentX * newZoom, y: mouseY - contentY * newZoom, zoom: newZoom }; }); }; const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) { e.preventDefault(); const t1 = e.touches[0]; const t2 = e.touches[1]; const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }; touchStateRef.current = { dist, center }; } }; const onTouchMove = (e: TouchEvent) => { if (e.touches.length === 2 && touchStateRef.current) { e.preventDefault(); const t1 = e.touches[0]; const t2 = e.touches[1]; const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }; const scale = dist / touchStateRef.current.dist; setViewport(prev => { const newZoom = Math.min(Math.max(prev.zoom * scale, MIN_ZOOM), MAX_ZOOM); const rect = container.getBoundingClientRect(); const mouseX = center.x - rect.left; const mouseY = center.y - rect.top; const contentX = (mouseX - prev.x) / prev.zoom; const contentY = (mouseY - prev.y) / prev.zoom; return { x: mouseX - (contentX * newZoom), y: mouseY - (contentY * newZoom), zoom: newZoom }; }); touchStateRef.current = { dist, center }; } }; const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) touchStateRef.current = null; }; container.addEventListener('wheel', onWheel, { passive: false }); container.addEventListener('touchstart', onTouchStart, { passive: false }); container.addEventListener('touchmove', onTouchMove, { passive: false }); container.addEventListener('touchend', onTouchEnd); return () => { container.removeEventListener('wheel', onWheel); container.removeEventListener('touchstart', onTouchStart); container.removeEventListener('touchmove', onTouchMove); container.removeEventListener('touchend', onTouchEnd); }; }, []);
    
    const commitToHistory = useCallback((newAnnotations: Record<number, AnnotationPath[]>, newNotes: Record<number, StickyNote[]>, newConns: Record<number, NoteConnection[]>, newSections?: TextSection[]) => { const sectionsToSave = newSections || sections; setAnnotations(newAnnotations); setStickyNotes(newNotes); setNoteConnections(newConns); if (newSections) setSections(newSections); setHistory(prevHistory => { const newHistory = prevHistory.slice(0, historyIndex + 1); newHistory.push({ annotations: JSON.parse(JSON.stringify(newAnnotations)), stickyNotes: JSON.parse(JSON.stringify(newNotes)), noteConnections: JSON.parse(JSON.stringify(newConns)), sections: JSON.parse(JSON.stringify(sectionsToSave)) }); if (newHistory.length > MAX_HISTORY) newHistory.shift(); return newHistory; }); setHistoryIndex(prev => Math.min(history.slice(0, historyIndex + 1).length + 1, MAX_HISTORY) - 1); }, [history, historyIndex, sections]);
    const undo = () => { if (historyIndex > 0) { const prev = history[historyIndex - 1]; setAnnotations(prev.annotations); setStickyNotes(prev.stickyNotes); setNoteConnections(prev.noteConnections || {}); if (prev.sections) setSections(prev.sections); setHistoryIndex(historyIndex - 1); } };
    const redo = () => { if (historyIndex < history.length - 1) { const next = history[historyIndex + 1]; setAnnotations(next.annotations); setStickyNotes(next.stickyNotes); setNoteConnections(next.noteConnections || {}); if (next.sections) setSections(next.sections); setHistoryIndex(historyIndex + 1); } };
    const deleteNote = useCallback((id: string, pageId?: number) => { let targetPage = pageId; if (targetPage === undefined) { const foundEntry = Object.entries(stickyNotes).find(([p, notes]) => (notes as StickyNote[]).some(n => n.id === id)); if (foundEntry) targetPage = Number(foundEntry[0]); else targetPage = pageNum; } const currentNotes = stickyNotes[targetPage] || []; if (!currentNotes.find(n => n.id === id)) return; const newNotesMap = { ...stickyNotes }; newNotesMap[targetPage] = currentNotes.filter(n => n.id !== id); const currentConns = noteConnections[targetPage] || []; const newConnsMap = { ...noteConnections }; newConnsMap[targetPage] = currentConns.filter(c => c.sourceId !== id && c.targetId !== id); commitToHistory(annotations, newNotesMap, newConnsMap); setSelectedNoteIds(prev => { const next = new Set(prev); next.delete(id); return next; }); }, [stickyNotes, noteConnections, annotations, pageNum, commitToHistory]);
    const deleteSelectedNotes = useCallback(() => { if (selectedNoteIds.size === 0) return; const currentNotes = stickyNotes[pageNum] || []; const newNotes = currentNotes.filter(n => !selectedNoteIds.has(n.id)); const currentConns = noteConnections[pageNum] || []; const newConns = currentConns.filter(c => !selectedNoteIds.has(c.sourceId) && !selectedNoteIds.has(c.targetId)); const newNotesMap = { ...stickyNotes, [pageNum]: newNotes }; const newConnsMap = { ...noteConnections, [pageNum]: newConns }; commitToHistory(annotations, newNotesMap, newConnsMap); setSelectedNoteIds(new Set()); }, [selectedNoteIds, stickyNotes, noteConnections, pageNum, annotations, commitToHistory]);
    const deleteConnection = useCallback((connId: string) => { const currentConns = noteConnections[pageNum] || []; const newConnsMap = { ...noteConnections }; newConnsMap[pageNum] = currentConns.filter(c => c.id !== connId); commitToHistory(annotations, stickyNotes, newConnsMap); setSelectedConnectionId(null); }, [noteConnections, pageNum, annotations, stickyNotes, commitToHistory]);
    const deleteAnchorConnection = useCallback((noteId: string) => { const currentNotes = stickyNotes[pageNum] || []; const newNotesMap = { ...stickyNotes }; newNotesMap[pageNum] = currentNotes.map(n => n.id === noteId ? { ...n, anchor: null, controlPoints: [] } : n); commitToHistory(annotations, newNotesMap, noteConnections); setSelectedConnectionId(null); }, [stickyNotes, pageNum, annotations, noteConnections, commitToHistory]);
    const startRecording = async (noteId: string) => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const mediaRecorder = new MediaRecorder(stream); mediaRecorderRef.current = mediaRecorder; audioChunksRef.current = []; mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); }; mediaRecorder.onstop = () => { const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); const reader = new FileReader(); reader.readAsDataURL(audioBlob); reader.onloadend = () => { const base64data = reader.result as string; updateStickyNote(noteId, { mediaUrl: base64data, contentType: 'audio' }); }; stream.getTracks().forEach(track => track.stop()); }; mediaRecorder.start(); setRecordingNoteId(noteId); } catch (err) { console.error("Mic access denied", err); alert("Microphone access denied."); } };
    const stopRecording = () => { if (mediaRecorderRef.current && recordingNoteId) { mediaRecorderRef.current.stop(); setRecordingNoteId(null); } };
    const updateTableCell = (noteId: string, r: number, c: number, value: string) => { const note = stickyNotes[pageNum]?.find(n => n.id === noteId); if (!note || !note.tableData) return; const newData = [...note.tableData]; newData[r] = [...newData[r]]; newData[r][c] = value; updateStickyNote(noteId, { tableData: newData }); };
    const addTableRow = (noteId: string) => { const note = stickyNotes[pageNum]?.find(n => n.id === noteId); if (!note || !note.tableData) return; const cols = note.tableData[0].length; const newRow = new Array(cols).fill(''); updateStickyNote(noteId, { tableData: [...note.tableData, newRow] }); };
    const addTableCol = (noteId: string) => { const note = stickyNotes[pageNum]?.find(n => n.id === noteId); if (!note || !note.tableData) return; const newData = note.tableData.map(row => [...row, '']); updateStickyNote(noteId, { tableData: newData }); };
    const handleDeleteSection = (e: React.MouseEvent, id: string) => { e.preventDefault(); e.stopPropagation(); if (sections.length === 1) { const newDefault = { id: 'default', title: 'General Notes', content: '' }; setSections([newDefault]); setActiveSectionId(newDefault.id); commitToHistory(annotations, stickyNotes, noteConnections, [newDefault]); return; } const index = sections.findIndex(s => s.id === id); const newSections = sections.filter(s => s.id !== id); if (activeSectionId === id) setActiveSectionId(newSections[Math.max(0, index - 1)].id); setSections(newSections); commitToHistory(annotations, stickyNotes, noteConnections, newSections); };
    useEffect(() => { const handleKeyDown = (e: KeyboardEvent) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return; if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedNoteIds.size > 0) deleteSelectedNotes(); else if (selectedConnectionId) { if (selectedConnectionId.type === 'noteConnection') deleteConnection(selectedConnectionId.id); else if (selectedConnectionId.type === 'anchorConnection' && selectedConnectionId.noteId) deleteAnchorConnection(selectedConnectionId.noteId); } else if (selectedAnnotationId) { const pageAnns = annotations[pageNum] || []; const newAnns = pageAnns.filter(a => a.id !== selectedAnnotationId); setAnnotations({ ...annotations, [pageNum]: newAnns }); commitToHistory({ ...annotations, [pageNum]: newAnns }, stickyNotes, noteConnections); setSelectedAnnotationId(null); } } if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); } if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); } }; window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [selectedNoteIds, selectedConnectionId, pageNum, deleteSelectedNotes, deleteConnection, deleteAnchorConnection, selectedAnnotationId, undo, redo]);
    const loadIndex = () => { try { const indexStr = localStorage.getItem('singularity-notepad-index'); if (indexStr) { const index = JSON.parse(indexStr); index.sort((a: any, b: any) => b.lastModified - a.lastModified); setSavedPads(index); if (index.length > 0 && !activePadId) loadNotepad(index[0].id); else if (index.length === 0 && !activePadId) createNewNotepad(); } else createNewNotepad(); } catch (e) { console.error("Failed to load index", e); } };
    const createNewNotepad = () => { const newId = generateId(); const newPad: SavedNotepadMeta = { id: newId, title: "New Untitled Note", lastModified: Date.now(), hasContent: false }; setActivePadId(newId); setTitle(newPad.title); setSections([{ id: 'default', title: 'General Notes', content: '' }]); setActiveSectionId('default'); setSourceName(null); setSourceData(null); setSourceType(null); setPdfDocument(null); setAnnotations({}); setStickyNotes({}); setNoteConnections({}); setPageNum(1); setNumPages(0); setContentDimensions(null); hasAutoCentered.current = false; saveToStorage(newId, newPad.title, [{ id: 'default', title: 'General Notes', content: '' }], 'default', null, null, null, {}, {}, {}); const newIndex = [newPad, ...savedPads]; setSavedPads(newIndex); localStorage.setItem('singularity-notepad-index', JSON.stringify(newIndex)); setHistory([{ annotations: {}, stickyNotes: {}, noteConnections: {}, sections: [{ id: 'default', title: 'General Notes', content: '' }] }]); setHistoryIndex(0); };
    const loadNotepad = async (id: string) => { setIsLoading(true); setSaveStatus('saved'); hasAutoCentered.current = false; try { const dataStr = localStorage.getItem(`singularity-notepad-${id}`); if (dataStr) { const data: FullNotepadData = JSON.parse(dataStr); setActivePadId(data.id); setTitle(data.title); const loadedSections = data.sections || [{ id: 'default', title: 'General Notes', content: '' }]; setSections(loadedSections); setActiveSectionId(data.activeSectionId || (loadedSections[0]?.id) || 'default'); setHistory([{ annotations: data.annotations || {}, stickyNotes: data.stickyNotes || {}, noteConnections: data.noteConnections || {}, sections: loadedSections }]); const loadedAnnotations = data.annotations || {}; Object.values(loadedAnnotations).forEach(pageAnns => { pageAnns.forEach(a => { if(!a.id) a.id = generatePathId(); }); }); const loadedNotes = data.stickyNotes || {}; Object.values(loadedNotes).forEach(pageNotes => { pageNotes.forEach(n => { if(!n.controlPoints) n.controlPoints = []; }); }); setAnnotations(loadedAnnotations); setStickyNotes(loadedNotes); setNoteConnections(data.noteConnections || {}); setHistoryIndex(0); setSourceName(data.sourceName || null); setSourceType(data.sourceType || null); setAutoCreateTabs(data.autoCreateTabs !== false); const dbData = await getFile(id); let loadedSourceData = dbData || null; if (!loadedSourceData) { if ((data as any).sourceData) loadedSourceData = (data as any).sourceData; else if ((data as any).pdfBase64) loadedSourceData = (data as any).pdfBase64; } if (loadedSourceData) { if (data.sourceType === 'IMAGE') { setSourceData(loadedSourceData); setNumPages(1); setPageNum(1); } else { if (typeof loadedSourceData === 'string') { const base64 = loadedSourceData.includes(',') ? loadedSourceData.split(',')[1] : loadedSourceData; const binaryString = window.atob(base64); const bytes = new Uint8Array(binaryString.length); for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i); setSourceData(bytes.buffer); } else { setSourceData(loadedSourceData); } } } else { setSourceData(null); setPdfDocument(null); setNumPages(0); setContentDimensions(null); } } } catch (e) { console.error("Failed to load notepad", e); } finally { setIsLoading(false); } };
    const saveCurrentState = useCallback(async () => { if (!activePadId) return; setSaveStatus('saving'); try { if (sourceData) await saveFile(activePadId, sourceData); saveToStorage(activePadId, title, sections, activeSectionId, sourceName, null, sourceType, annotations, stickyNotes, noteConnections, autoCreateTabs); setSaveStatus('saved'); } catch (e) { console.error("Save failed", e); setSaveStatus('error'); } }, [activePadId, title, sections, activeSectionId, sourceData, sourceName, sourceType, annotations, stickyNotes, noteConnections, autoCreateTabs]);
    const saveToStorage = (id: string, t: string, secs: TextSection[], activeSec: string, sName: string | null, sData: string | null, sType: 'PDF'|'IMAGE'|null, ann: any, sticks: any, conns: any, autoCreate: boolean = true) => { const data: FullNotepadData = { id, title: t, sections: secs, activeSectionId: activeSec, sourceName: sName || undefined, sourceType: sType || undefined, annotations: ann, stickyNotes: sticks, noteConnections: conns, lastModified: Date.now(), autoCreateTabs: autoCreate }; localStorage.setItem(`singularity-notepad-${id}`, JSON.stringify(data)); const updatedMeta: SavedNotepadMeta = { id, title: t, lastModified: Date.now(), hasContent: !!sName }; const currentIndexStr = localStorage.getItem('singularity-notepad-index'); let currentIndex: SavedNotepadMeta[] = currentIndexStr ? JSON.parse(currentIndexStr) : []; const existingIdx = currentIndex.findIndex(p => p.id === id); if (existingIdx >= 0) currentIndex[existingIdx] = updatedMeta; else currentIndex.unshift(updatedMeta); currentIndex.sort((a, b) => b.lastModified - a.lastModified); localStorage.setItem('singularity-notepad-index', JSON.stringify(currentIndex)); setSavedPads(currentIndex); };
    useEffect(() => { const timer = setTimeout(() => { if (activePadId) saveCurrentState(); }, 2000); return () => clearTimeout(timer); }, [sections, activeSectionId, annotations, stickyNotes, noteConnections, title, activePadId, autoCreateTabs]);
    const centerView = useCallback(() => { if (!canvasContainerRef.current || !contentDimensions) return; const rect = canvasContainerRef.current.getBoundingClientRect(); const { width: contentW, height: contentH } = contentDimensions; const margin = 60; const availW = rect.width - (margin * 2); const availH = rect.height - (margin * 2); let fitZoom = 0.8; if (contentW > 0 && contentH > 0) { const scaleW = availW / contentW; const scaleH = availH / contentH; fitZoom = Math.min(scaleW, scaleH); fitZoom = Math.min(Math.max(fitZoom, MIN_ZOOM), MAX_ZOOM); } setViewport({ x: (rect.width / 2) - (CANVAS_CENTER * fitZoom), y: (rect.height / 2) - (CANVAS_CENTER * fitZoom), zoom: fitZoom }); }, [contentDimensions]);
    useEffect(() => { if (contentDimensions && !hasAutoCentered.current && canvasContainerRef.current) { const timer = setTimeout(() => { centerView(); hasAutoCentered.current = true; }, 50); return () => clearTimeout(timer); } }, [contentDimensions, centerView]);
    useEffect(() => { if (!sourceData || sourceType !== 'PDF') return; const loadPdf = async () => { setPdfError(null); try { const bufferCopy = sourceData instanceof ArrayBuffer ? sourceData.slice(0) : sourceData; let data; if (typeof bufferCopy === 'string') { const base64 = bufferCopy.includes(',') ? bufferCopy.split(',')[1] : bufferCopy; const binaryString = window.atob(base64); data = new Uint8Array(binaryString.length); for (let i = 0; i < binaryString.length; i++) data[i] = binaryString.charCodeAt(i); } else { data = new Uint8Array(bufferCopy as ArrayBuffer); } const loadingTask = pdfjsLib.getDocument({ data, cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/cmaps/`, cMapPacked: true }); const pdf = await loadingTask.promise; setPdfDocument(pdf); setNumPages(pdf.numPages); if (autoCreateTabs) { const pageTitle = `Page ${1}`; const exists = sections.some(s => s.title === pageTitle); if (!exists) { const newId = generateId(); setSections(prev => { if (prev.some(s => s.title === pageTitle)) return prev; return [...prev, { id: newId, title: pageTitle, content: '', pageLink: 1 }]; }); } } } catch (err) { console.error("Error loading PDF:", err); setPdfError("Failed to load PDF."); } }; loadPdf(); }, [sourceData, sourceType]);
    useEffect(() => { if (sourceData && sourceType === 'IMAGE') { const img = new Image(); img.onload = () => { setContentDimensions({ width: img.width, height: img.height }); setNumPages(1); setPageNum(1); }; img.src = sourceData as string; } }, [sourceData, sourceType]);
    useEffect(() => { if (isDrawing.current) return; const targetScale = Math.max(1.5, viewport.zoom * 1.5); const timer = setTimeout(() => { setRenderScale(targetScale); }, 200); return () => clearTimeout(timer); }, [viewport.zoom]);
    useEffect(() => { if (sourceType !== 'PDF' || !pdfDocument || !pdfCanvasRef.current) return; let isCancelled = false; const renderPage = async () => { if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} renderTaskRef.current = null; } try { const page = await pdfDocument.getPage(pageNum); if (isCancelled) return; const unscaledViewport = page.getViewport({ scale: 1 }); setContentDimensions({ width: unscaledViewport.width, height: unscaledViewport.height }); const pageViewport = page.getViewport({ scale: renderScale }); const canvas = pdfCanvasRef.current!; const context = canvas.getContext('2d')!; canvas.height = pageViewport.height; canvas.width = pageViewport.width; if (annotationCanvasRef.current) { annotationCanvasRef.current.height = pageViewport.height; annotationCanvasRef.current.width = pageViewport.width; redrawAnnotations(); } const renderContext = { canvasContext: context, viewport: pageViewport }; const task = page.render(renderContext as any); renderTaskRef.current = task; await task.promise; renderTaskRef.current = null; } catch (err: any) { if(err.name !== 'RenderingCancelledException') console.error("Page Render Error", err); } }; renderPage(); return () => { isCancelled = true; if (renderTaskRef.current) try { renderTaskRef.current.cancel(); } catch {} }; }, [pdfDocument, pageNum, renderScale, sourceType]);
    useEffect(() => { if (sourceType === 'IMAGE' && contentDimensions && annotationCanvasRef.current) { const w = contentDimensions.width * renderScale; const h = contentDimensions.height * renderScale; annotationCanvasRef.current.width = w; annotationCanvasRef.current.height = h; redrawAnnotations(); } }, [contentDimensions, renderScale, sourceType]);
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setSourceName(file.name); setStickyNotes({}); setAnnotations({}); setSections([{ id: 'default', title: 'General Notes', content: '' }]); setActiveSectionId('default'); setContentDimensions(null); hasAutoCentered.current = false; setHistory([{ annotations: {}, stickyNotes: {}, noteConnections: {}, sections: [{ id: 'default', title: 'General Notes', content: '' }] }]); setHistoryIndex(0); if (file.type === 'application/pdf') { const buffer = await file.arrayBuffer(); setSourceType('PDF'); setSourceData(buffer); setPdfDocument(null); setPageNum(1); } else if (file.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = (ev) => { if (ev.target?.result) { setSourceType('IMAGE'); setSourceData(ev.target.result as string); setPageNum(1); setNumPages(1); } }; reader.readAsDataURL(file); } else { alert("Unsupported file type."); } e.target.value = ''; setTimeout(saveCurrentState, 100); };
    
    // REPLACED OLD EXPORT LOGIC WITH MODAL TRIGGER
    const handleExport = () => {
        setIsExportModalOpen(true);
    };

    const handleElementMouseDown = useCallback((e: React.MouseEvent, target: any, elementPos: { x: number, y: number }) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); e.preventDefault(); mousePosRef.current = { x: e.clientX, y: e.clientY }; if (canvasContainerRef.current) { cachedCanvasRect.current = canvasContainerRef.current.getBoundingClientRect(); dragStartOffset.current = { x: ((e.clientX - cachedCanvasRect.current.left) - viewport.x) / viewport.zoom - elementPos.x, y: ((e.clientY - cachedCanvasRect.current.top) - viewport.y) / viewport.zoom - elementPos.y }; } setDragTarget(target); setSelectedConnectionId(null); }, [viewport]);
    const addNoteAt = (x: number, y: number, relativeToPdf: boolean = false, type: 'text' | 'image' | 'audio' | 'table' | 'drawing' = 'text', initialData?: any) => { if (!canvasContainerRef.current) return; const rect = canvasContainerRef.current.getBoundingClientRect(); const canvasX = ((x - rect.left) - viewport.x) / viewport.zoom; const canvasY = ((y - rect.top) - viewport.y) / viewport.zoom; let anchor = null, contentW = 0, contentH = 0; if (contentDimensions) { contentW = contentDimensions.width; contentH = contentDimensions.height; } if (relativeToPdf && contentW > 0) { const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2; if (canvasX >= topLeftX && canvasX <= topLeftX + contentW && canvasY >= topLeftY && canvasY <= topLeftY + contentH) { anchor = { x: ((canvasX - topLeftX) / contentW) * 100, y: ((canvasY - topLeftY) / contentH) * 100 }; } } const newId = generateId(); const newNote: StickyNote = { id: newId, x: relativeToPdf ? canvasX + 50 : canvasX, y: relativeToPdf ? canvasY + 50 : canvasY, text: initialData?.text || '', color: NOTE_COLORS[0], anchor: anchor, minimized: false, page: pageNum, controlPoints: [], contentType: type, mediaUrl: initialData?.mediaUrl, isPlaceholder: initialData?.isPlaceholder, tableData: initialData?.tableData || [['Header', 'Value'], ['', '']] }; commitToHistory(annotations, { ...stickyNotes, [pageNum]: [...(stickyNotes[pageNum] || []), newNote] }, noteConnections); setSelectedNoteIds(new Set([newId])); setTool('select'); };
    const addChildNote = (parentId: string) => { const pageNotes = stickyNotes[pageNum] || []; const parent = pageNotes.find(n => n.id === parentId); if (!parent) return; const newId = generateId(); const newNote: StickyNote = { id: newId, x: parent.x + 300, y: parent.y, text: '', color: parent.color, anchor: null, minimized: false, page: pageNum, controlPoints: [], contentType: 'text' }; const newConn: NoteConnection = { id: generateConnId(), sourceId: parentId, targetId: newId, color: '#ff0000', style: 'curved' }; commitToHistory(annotations, { ...stickyNotes, [pageNum]: [...pageNotes, newNote] }, { ...noteConnections, [pageNum]: [...(noteConnections[pageNum] || []), newConn] }); setSelectedNoteIds(new Set([newId])); };
    const updateStickyNote = (id: string, updates: Partial<StickyNote>) => { setStickyNotes({ ...stickyNotes, [pageNum]: (stickyNotes[pageNum] || []).map(n => n.id === id ? { ...n, ...updates } : n) }); };
    const startLinking = (e: React.MouseEvent, sourceId: string) => { e.stopPropagation(); e.preventDefault(); const rect = canvasContainerRef.current?.getBoundingClientRect(); if(rect) { const canvasX = ((e.clientX - rect.left) - viewport.x) / viewport.zoom; const canvasY = ((e.clientY - rect.top) - viewport.y) / viewport.zoom; setLinkingState({ sourceId, currentPos: { x: canvasX, y: canvasY } }); } };
    const startAnchorLinking = (noteId: string) => { const rect = canvasContainerRef.current?.getBoundingClientRect(); if(rect) { const note = stickyNotes[pageNum]?.find(n => n.id === noteId); if(note) setAnchorLinkingState({ noteId, currentPos: { x: note.x + (note.minimized ? 20 : 110), y: note.y + 20 } }); } };
    const handleConnectionContextMenu = (e: React.MouseEvent, id: string, type: 'noteConnection' | 'anchorConnection') => { e.preventDefault(); e.stopPropagation(); if (hasRightPanMoved.current) return; let clickPos = undefined; if (canvasContainerRef.current) { const rect = canvasContainerRef.current.getBoundingClientRect(); clickPos = { x: ((e.clientX - rect.left) - viewport.x) / viewport.zoom, y: ((e.clientY - rect.top) - viewport.y) / viewport.zoom }; } setContextMenu({ x: e.clientX, y: e.clientY, type: 'connection', id, connectionType: type, clickPos }); };
    const handleConnectionClick = (e: React.MouseEvent, id: string, type: 'noteConnection' | 'anchorConnection', noteId?: string) => { e.stopPropagation(); setSelectedConnectionId({ id, type, noteId }); setSelectedNoteIds(new Set()); };
    const handleSnipText = () => { const selection = window.getSelection(); if (selection && selection.toString().trim().length > 0) { if (contextMenu) { addNoteAt(contextMenu.x, contextMenu.y, true, 'text', { text: selection.toString() }); } } else { alert("Select text on the PDF/Canvas first, then right click > Snip Text."); } };
    const handleImageUpload = (id?: string) => { if (imageUploadRef.current) { imageUploadRef.current.click(); if(id) setSelectedNoteIds(new Set([id])); else setSelectedNoteIds(new Set()); } };
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result) {
                    const result = reader.result as string;
                    const selectedId = Array.from(selectedNoteIds)[0];
                    if (selectedId && stickyNotes[pageNum].find(n => n.id === selectedId)?.isPlaceholder) {
                        updateStickyNote(selectedId, { contentType: 'image', mediaUrl: result, isPlaceholder: false });
                    } else if (uploadTriggerPos.current) {
                        addNoteAt(uploadTriggerPos.current.x, uploadTriggerPos.current.y, true, 'image', { mediaUrl: result });
                        uploadTriggerPos.current = null;
                    } else if (contextMenu) {
                        addNoteAt(contextMenu.x, contextMenu.y, true, 'image', { mediaUrl: result });
                    }
                }
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };
    const handlePaste = async () => { try { try { const permission = await navigator.permissions.query({ name: 'clipboard-read' as any }); if (permission.state === 'denied') { throw new Error("Clipboard permission denied"); } } catch (e) {} const items = await navigator.clipboard.read(); for (const item of items) { if (item.types.includes('image/png') || item.types.includes('image/jpeg')) { const blob = await item.getType(item.types[0]); const reader = new FileReader(); reader.onload = (e) => { if (e.target?.result && contextMenu) { addNoteAt(contextMenu.x, contextMenu.y, true, 'image', { mediaUrl: e.target.result as string }); } }; reader.readAsDataURL(blob); } else if (item.types.includes('text/plain')) { const blob = await item.getType('text/plain'); const text = await blob.text(); if (text && contextMenu) { addNoteAt(contextMenu.x, contextMenu.y, true, 'text', { text }); } } } } catch (err) { console.error("Paste failed", err); try { const text = await navigator.clipboard.readText(); if (text && contextMenu) addNoteAt(contextMenu.x, contextMenu.y, true, 'text', { text }); } catch (e) { alert("Could not access clipboard. Please use Ctrl+V to paste."); } } };
    useEffect(() => { const handleGlobalPaste = (e: ClipboardEvent) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).isContentEditable) return; e.preventDefault(); const items = e.clipboardData?.items; if (!items) return; const x = mousePosRef.current.x > 0 ? mousePosRef.current.x : window.innerWidth / 2; const y = mousePosRef.current.y > 0 ? mousePosRef.current.y : window.innerHeight / 2; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { const blob = items[i].getAsFile(); if (blob) { const reader = new FileReader(); reader.onload = (event) => { if (event.target?.result) { addNoteAt(x, y, true, 'image', { mediaUrl: event.target.result as string }); } }; reader.readAsDataURL(blob); } } else if (items[i].type.indexOf('text/plain') !== -1) { items[i].getAsString((text) => { if (text) addNoteAt(x, y, true, 'text', { text }); }); } } }; window.addEventListener('paste', handleGlobalPaste); return () => window.removeEventListener('paste', handleGlobalPaste); }, [viewport, pageNum]);
    const handleContextMenuAction = (action: string, payload?: any) => { if (!contextMenu) return; const { id, type, connectionType, pointIndex, clickPos } = contextMenu; if (type === 'canvas') { if (action === 'create_note') addNoteAt(contextMenu.x, contextMenu.y, true); if (action === 'snip_text') handleSnipText(); if (action === 'upload_image') { uploadTriggerPos.current = { x: contextMenu.x, y: contextMenu.y }; handleImageUpload(); } if (action === 'create_image_placeholder') addNoteAt(contextMenu.x, contextMenu.y, true, 'image', { isPlaceholder: true }); if (action === 'add_audio') addNoteAt(contextMenu.x, contextMenu.y, true, 'audio'); if (action === 'add_table') addNoteAt(contextMenu.x, contextMenu.y, true, 'table'); if (action === 'add_drawing') addNoteAt(contextMenu.x, contextMenu.y, true, 'drawing'); if (action === 'paste') handlePaste(); if (action === 'reset_view') centerView(); } else if (type === 'annotation' && id) { if (action === 'delete_annotation') { const pageAnns = annotations[pageNum] || []; const newAnns = pageAnns.filter(a => a.id !== id); setAnnotations({ ...annotations, [pageNum]: newAnns }); commitToHistory({ ...annotations, [pageNum]: newAnns }, stickyNotes, noteConnections); setSelectedAnnotationId(null); } else if (action === 'change_color') { const pageAnns = annotations[pageNum] || []; const newAnns = pageAnns.map(a => a.id === id ? { ...a, color: payload } : a); setAnnotations({ ...annotations, [pageNum]: newAnns }); commitToHistory({ ...annotations, [pageNum]: newAnns }, stickyNotes, noteConnections); } else if (action === 'toggle_arrow') { const pageAnns = annotations[pageNum] || []; const newAnns = pageAnns.map(a => { if (a.id === id && a.type === 'arrow') { return { ...a, arrowType: (a.arrowType === 'double' ? 'single' : 'double') as 'single' | 'double' }; } return a; }); setAnnotations({ ...annotations, [pageNum]: newAnns }); commitToHistory({ ...annotations, [pageNum]: newAnns }, stickyNotes, noteConnections); } } else if (type === 'note' && id) { if (action === 'color') commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, color: payload } : n) }, noteConnections); else if (action === 'add_child') addChildNote(id); else if (action === 'add_anchor') startAnchorLinking(id); else if (action === 'delete') deleteNote(id); } else if (type === 'connection' && id) { if (connectionType === 'anchorConnection') { const note = stickyNotes[pageNum]?.find(n => n.id === id); if (note) { if (action === 'connection_color') commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, connectionColor: payload } : n) }, noteConnections); else if (action === 'connection_style') commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, connectionStyle: payload } : n) }, noteConnections); else if (action === 'add_point') { const currentPoints = note.controlPoints || []; const newPoint = clickPos || { x: note.x, y: note.y }; if (contentDimensions && note.anchor) { const contentW = contentDimensions.width; const contentH = contentDimensions.height; const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2; const anchorX = topLeftX + (note.anchor.x / 100) * contentW; const anchorY = topLeftY + (note.anchor.y / 100) * contentH; const start = { x: anchorX, y: anchorY }; const end = getNoteCenter(note); const insertIdx = getInsertionIndex(currentPoints, newPoint, start, end); const newPointsList = [...currentPoints]; newPointsList.splice(insertIdx, 0, newPoint); commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, controlPoints: newPointsList } : n) }, noteConnections); } else { commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, controlPoints: [...currentPoints, newPoint] } : n) }, noteConnections); } } else if (action === 'delete_link') deleteAnchorConnection(id); } } else if (connectionType === 'noteConnection') { const pageConns = noteConnections[pageNum] || []; const conn = pageConns.find(c => c.id === id); if (conn) { if (action === 'connection_color') commitToHistory(annotations, stickyNotes, { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, color: payload } : c) }); else if (action === 'connection_style') commitToHistory(annotations, stickyNotes, { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, style: payload } : c) }); else if (action === 'add_point') { const newPoint = clickPos || { x: 0, y: 0 }; const sourceNote = stickyNotes[pageNum]?.find(n => n.id === conn.sourceId); const targetNote = stickyNotes[pageNum]?.find(n => n.id === conn.targetId); if (sourceNote && targetNote) { const start = getNoteCenter(sourceNote); const end = getNoteCenter(targetNote); const currentPoints = conn.controlPoints || []; const insertIdx = getInsertionIndex(currentPoints, newPoint, start, end); const newPointsList = [...currentPoints]; newPointsList.splice(insertIdx, 0, newPoint); commitToHistory(annotations, stickyNotes, { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, controlPoints: newPointsList } : c) }); } else { commitToHistory(annotations, stickyNotes, { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, controlPoints: [...(c.controlPoints||[]), newPoint] } : c) }); } } else if (action === 'delete_link') deleteConnection(id); } } } else if (type === 'controlPoint' && id && pointIndex !== undefined) { if (action === 'delete_point') { const note = stickyNotes[pageNum]?.find(n => n.id === id); if (note) { const newPoints = [...(note.controlPoints || [])]; newPoints.splice(pointIndex, 1); const newNotes = { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === id ? { ...n, controlPoints: newPoints } : n) }; setStickyNotes(newNotes); commitToHistory(annotations, newNotes, noteConnections); } else { const pageConns = noteConnections[pageNum] || []; const conn = pageConns.find(c => c.id === id); if (conn && conn.controlPoints) { const newPoints = [...conn.controlPoints]; newPoints.splice(pointIndex, 1); const newConns = { ...noteConnections, [pageNum]: pageConns.map(c => c.id === id ? { ...c, controlPoints: newPoints } : c) }; setNoteConnections(newConns); commitToHistory(annotations, stickyNotes, newConns); } } } } setContextMenu(null); };
    const handleCanvasMouseDown = (e: React.MouseEvent) => { setContextMenu(null); setSelectedConnectionId(null); hasRightPanMoved.current = false; if (e.button === 2 || e.button === 1) { setIsRightPanning(true); lastMousePos.current = { x: e.clientX, y: e.clientY }; return; } if (e.button === 0) { if (tool === 'select') { if (e.target === captureContainerRef.current || e.target === canvasContainerRef.current || e.target === contentContainerRef.current || e.target === annotationCanvasRef.current) { if (!e.ctrlKey) { setSelectedNoteIds(new Set()); setSelectedAnnotationId(null); } if (contentContainerRef.current && annotationCanvasRef.current) { const rect = contentContainerRef.current.getBoundingClientRect(); const scaleX = contentDimensions ? contentDimensions.width / rect.width : 1; const scaleY = contentDimensions ? contentDimensions.height / rect.height : 1; const clickX = (e.clientX - rect.left) * scaleX; const clickY = (e.clientY - rect.top) * scaleY; const pageAnns = annotations[pageNum] || []; for (let i = pageAnns.length - 1; i >= 0; i--) { if (isPointNearPath(clickX, clickY, pageAnns[i], 10)) { setSelectedAnnotationId(pageAnns[i].id); return; } } } setSelectionBox({ start: { x: e.clientX, y: e.clientY }, current: { x: e.clientX, y: e.clientY } }); } } else if (tool === 'note') { addNoteAt(e.clientX, e.clientY, true); } } };
    const handleCanvasMouseMove = (e: React.MouseEvent) => { mousePosRef.current = { x: e.clientX, y: e.clientY }; if (tool === 'laser' && e.buttons === 1 && canvasContainerRef.current) { const rect = canvasContainerRef.current.getBoundingClientRect(); const canvasX = ((e.clientX - rect.left) - viewport.x) / viewport.zoom; const canvasY = ((e.clientY - rect.top) - viewport.y) / viewport.zoom; setLaserPath(prev => [...prev, { x: canvasX, y: canvasY, time: Date.now() }]); } if (cursorRef.current && canvasContainerRef.current) { const rect = canvasContainerRef.current.getBoundingClientRect(); if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) { cursorRef.current.style.display = 'block'; cursorRef.current.style.left = `${e.clientX}px`; cursorRef.current.style.top = `${e.clientY}px`; } else { cursorRef.current.style.display = 'none'; } } if (isRightPanning) { const dx = e.clientX - lastMousePos.current.x; const dy = e.clientY - lastMousePos.current.y; if (Math.abs(dx) > 1 || Math.abs(dy) > 1) { hasRightPanMoved.current = true; } setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); lastMousePos.current = { x: e.clientX, y: e.clientY }; return; } if (linkingState && canvasContainerRef.current) { const rect = canvasContainerRef.current.getBoundingClientRect(); setLinkingState({ ...linkingState, currentPos: { x: ((e.clientX - rect.left) - viewport.x) / viewport.zoom, y: ((e.clientY - rect.top) - viewport.y) / viewport.zoom } }); } else if (anchorLinkingState && canvasContainerRef.current) { const rect = canvasContainerRef.current.getBoundingClientRect(); setAnchorLinkingState({ ...anchorLinkingState, currentPos: { x: ((e.clientX - rect.left) - viewport.x) / viewport.zoom, y: ((e.clientY - rect.top) - viewport.y) / viewport.zoom } }); } if (selectionBox) { setSelectionBox(prev => prev ? { ...prev, current: { x: e.clientX, y: e.clientY } } : null); } if (['pen', 'highlighter', 'eraser'].includes(tool) && isDrawing.current) { handleContentMouseMove(e); } if (dragTarget) e.preventDefault(); };
    useEffect(() => { if (!dragTarget) return; let animationFrameId: number; const updateLoop = () => { if (canvasContainerRef.current && contentContainerRef.current) { const rect = cachedCanvasRect.current || canvasContainerRef.current.getBoundingClientRect(); const canvasX = ((mousePosRef.current.x - rect.left) - viewport.x) / viewport.zoom; const canvasY = ((mousePosRef.current.y - rect.top) - viewport.y) / viewport.zoom; const dragOffset = dragStartOffset.current; if (dragTarget.type === 'resizeHandle' && selectedAnnotationId) { const contentRect = contentContainerRef.current.getBoundingClientRect(); const scaleX = contentDimensions ? contentDimensions.width / contentRect.width : 1; const scaleY = contentDimensions ? contentDimensions.height / contentRect.height : 1; const mouseContentX = (mousePosRef.current.x - contentRect.left) * scaleX; const mouseContentY = (mousePosRef.current.y - contentRect.top) * scaleY; setAnnotations(prev => { const pageAnns = prev[pageNum] || []; const idx = pageAnns.findIndex(a => a.id === selectedAnnotationId); if (idx === -1) return prev; const ann = pageAnns[idx]; const points = ann.points; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; points.forEach(p => { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }); let newMinX = minX, newMinY = minY, newMaxX = maxX, newMaxY = maxY; if (dragTarget.handle?.includes('l')) newMinX = mouseContentX; if (dragTarget.handle?.includes('r')) newMaxX = mouseContentX; if (dragTarget.handle?.includes('t')) newMinY = mouseContentY; if (dragTarget.handle?.includes('b')) newMaxY = mouseContentY; if (newMaxX < newMinX + 5) { if(dragTarget.handle?.includes('l')) newMinX = newMaxX - 5; else newMaxX = newMinX + 5; } if (newMaxY < newMinY + 5) { if(dragTarget.handle?.includes('t')) newMinY = newMaxY - 5; else newMaxY = newMinY + 5; } const wOld = maxX - minX; const hOld = maxY - minY; const wNew = newMaxX - newMinX; const hNew = newMaxY - newMinY; if (wOld === 0 || hOld === 0) return prev; const newPoints = points.map(p => ({ x: newMinX + (p.x - minX) * (wNew / wOld), y: newMinY + (p.y - minY) * (hNew / hOld) })); const newPageAnns = [...pageAnns]; newPageAnns[idx] = { ...ann, points: newPoints }; return { ...prev, [pageNum]: newPageAnns }; }); } else if (dragTarget.type === 'note') { setStickyNotes(prevNotes => { const pageNotes = prevNotes[pageNum] || []; const targetNote = pageNotes.find(n => n.id === dragTarget.id); if (!targetNote) return prevNotes; const newTargetX = canvasX - dragOffset.x; const newTargetY = canvasY - dragOffset.y; const dx = newTargetX - targetNote.x; const dy = newTargetY - targetNote.y; const notesToMove = selectedNoteIds.has(dragTarget.id) ? Array.from(selectedNoteIds) : [dragTarget.id]; const newPageNotes = pageNotes.map(n => { if (notesToMove.includes(n.id)) { return { ...n, x: n.x + dx, y: n.y + dy }; } return n; }); return { ...prevNotes, [pageNum]: newPageNotes }; }); } else if (dragTarget.type === 'anchor' && contentDimensions) { setStickyNotes(prevNotes => { const pageNotes = prevNotes[pageNum] || []; const newPageNotes = pageNotes.map(n => { if (n.id !== dragTarget.id) return n; const newX = canvasX - dragOffset.x; const newY = canvasY - dragOffset.y; const contentW = contentDimensions.width; const contentH = contentDimensions.height; const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2; const anchorX = Math.max(0, Math.min(100, ((newX - topLeftX) / contentW) * 100)); const anchorY = Math.max(0, Math.min(100, ((newY - topLeftY) / contentH) * 100)); return { ...n, anchor: { x: anchorX, y: anchorY } }; }); return { ...prevNotes, [pageNum]: newPageNotes }; }); } else if (dragTarget.type === 'controlPoint' && dragTarget.index !== undefined) { setStickyNotes(prevNotes => { const pageNotes = prevNotes[pageNum] || []; const newPageNotes = pageNotes.map(n => { if (n.id !== dragTarget.id) return n; const newX = canvasX - dragOffset.x; const newY = canvasY - dragOffset.y; const newPts = [...n.controlPoints]; newPts[dragTarget.index!] = { x: newX, y: newY }; return { ...n, controlPoints: newPts }; }); return { ...prevNotes, [pageNum]: newPageNotes }; }); } else if (dragTarget.type === 'connPoint' && dragTarget.index !== undefined) { setNoteConnections(prevConns => { const pageConns = prevConns[pageNum] || []; const newPageConns = pageConns.map(c => { if (c.id !== dragTarget.id) return c; const newX = canvasX - dragOffset.x; const newY = canvasY - dragOffset.y; const newPts = [...(c.controlPoints||[])]; newPts[dragTarget.index!] = { x: newX, y: newY }; return { ...c, controlPoints: newPts }; }); return { ...prevConns, [pageNum]: newPageConns }; }); } } animationFrameId = requestAnimationFrame(updateLoop); }; animationFrameId = requestAnimationFrame(updateLoop); return () => cancelAnimationFrame(animationFrameId); }, [dragTarget, viewport, contentDimensions, pageNum, selectedNoteIds, selectedAnnotationId]);
    const handleCanvasMouseUp = (e: React.MouseEvent) => { if (isRightPanning) setIsRightPanning(false); if (selectionBox) { if (canvasContainerRef.current) { const rect = canvasContainerRef.current.getBoundingClientRect(); const x1 = Math.min(selectionBox.start.x, selectionBox.current.x) - rect.left; const y1 = Math.min(selectionBox.start.y, selectionBox.current.y) - rect.top; const x2 = Math.max(selectionBox.start.x, selectionBox.current.x) - rect.left; const y2 = Math.max(selectionBox.start.y, selectionBox.current.y) - rect.top; const cx1 = (x1 - viewport.x) / viewport.zoom; const cy1 = (y1 - viewport.y) / viewport.zoom; const cx2 = (x2 - viewport.x) / viewport.zoom; const cy2 = (y2 - viewport.y) / viewport.zoom; const notes = stickyNotes[pageNum] || []; const newSelection = new Set(e.ctrlKey ? selectedNoteIds : []); notes.forEach(n => { const w = n.minimized ? 40 : 220; const h = n.minimized ? 40 : 150; if (n.x < cx2 && n.x + w > cx1 && n.y < cy2 && n.y + h > cy1) { newSelection.add(n.id); } }); setSelectedNoteIds(newSelection); } setSelectionBox(null); } if (linkingState) { const el = document.elementFromPoint(e.clientX, e.clientY); const noteEl = el?.closest('[id^="sticky-note-"]'); if (noteEl) { const targetId = noteEl.id.replace('sticky-note-', ''); if (targetId !== linkingState.sourceId) { const existingConn = noteConnections[pageNum]?.find(c => (c.sourceId === linkingState.sourceId && c.targetId === targetId) || (c.sourceId === targetId && c.targetId === linkingState.sourceId)); if (!existingConn) { const newConn: NoteConnection = { id: generateConnId(), sourceId: linkingState.sourceId, targetId: targetId, color: '#ff0000', style: 'curved' }; commitToHistory(annotations, stickyNotes, { ...noteConnections, [pageNum]: [...(noteConnections[pageNum] || []), newConn] }); } } } else if (contentDimensions && canvasContainerRef.current) { const rect = canvasContainerRef.current.getBoundingClientRect(); const canvasX = ((e.clientX - rect.left) - viewport.x) / viewport.zoom; const canvasY = ((e.clientY - rect.top) - viewport.y) / viewport.zoom; const contentW = contentDimensions.width; const contentH = contentDimensions.height; const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2; if (canvasX >= topLeftX - 50 && canvasX <= topLeftX + contentW + 50 && canvasY >= topLeftY - 50 && canvasY <= topLeftY + contentH + 50) { const anchorX = Math.max(0, Math.min(100, ((canvasX - topLeftX) / contentW) * 100)); const anchorY = Math.max(0, Math.min(100, ((canvasY - topLeftY) / contentH) * 100)); commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === linkingState.sourceId ? { ...n, anchor: { x: anchorX, y: anchorY } } : n) }, noteConnections); } } setLinkingState(null); } if (anchorLinkingState && contentDimensions && canvasContainerRef.current) { const rect = canvasContainerRef.current.getBoundingClientRect(); const canvasX = ((e.clientX - rect.left) - viewport.x) / viewport.zoom; const canvasY = ((e.clientY - rect.top) - viewport.y) / viewport.zoom; const contentW = contentDimensions.width; const contentH = contentDimensions.height; const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2; if (canvasX >= topLeftX - 50 && canvasX <= topLeftX + contentW + 50 && canvasY >= topLeftY - 50 && canvasY <= topLeftY + contentH + 50) { const anchorX = Math.max(0, Math.min(100, ((canvasX - topLeftX) / contentW) * 100)); const anchorY = Math.max(0, Math.min(100, ((canvasY - topLeftY) / contentH) * 100)); commitToHistory(annotations, { ...stickyNotes, [pageNum]: (stickyNotes[pageNum]||[]).map(n => n.id === anchorLinkingState.noteId ? { ...n, anchor: { x: anchorX, y: anchorY } } : n) }, noteConnections); } setAnchorLinkingState(null); } if (dragTarget) { commitToHistory(annotations, stickyNotes, noteConnections); setDragTarget(null); cachedCanvasRect.current = null; } handleContentMouseUp(); };
    const handleEraser = (x: number, y: number) => { if (eraserMode === 'magic') { setAnnotations(prev => { const pageAnns = prev[pageNum] || []; const threshold = 15 / renderScale; let changed = false; const remaining = pageAnns.filter(path => { for (const pt of path.points) { if (Math.hypot(pt.x - x, pt.y - y) < threshold) { changed = true; return false; } } return true; }); if (changed) return { ...prev, [pageNum]: remaining }; return prev; }); } };
    const handleContentMouseDown = (e: React.MouseEvent) => { if (['pen', 'highlighter', 'eraser'].includes(tool)) { setContextMenu(null); if (e.button !== 0) return; e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); isDrawing.current = true; const container = contentContainerRef.current; if (!container) return; const rect = container.getBoundingClientRect(); const scaleX = contentDimensions ? contentDimensions.width / rect.width : 1; const scaleY = contentDimensions ? contentDimensions.height / rect.height : 1; const ptX = (e.clientX - rect.left) * scaleX; const ptY = (e.clientY - rect.top) * scaleY; if (tool === 'eraser' && eraserMode === 'magic') { handleEraser(ptX, ptY); } else { const isEraser = tool === 'eraser'; let newType: AnnotationType = isEraser ? 'pen' : (tool as AnnotationType); if (!isEraser && activeShape !== 'freehand') { if (tool === 'highlighter' && activeShape === 'rectangle') newType = 'box_highlight'; else newType = activeShape as AnnotationType; } currentPath.current = { id: generatePathId(), type: newType, points: [{ x: ptX, y: ptY }], color: isEraser ? '#ffffff' : color, width: isEraser ? 30 : strokeWidth, opacity: isEraser ? 1 : strokeOpacity, isEraser: isEraser, arrowType: activeArrowType }; lastDrawPoint.current = { x: ptX, y: ptY }; drawStartPoint.current = { x: ptX, y: ptY }; if (newType === 'pen' || newType === 'highlighter') { const ctx = annotationCanvasRef.current?.getContext('2d'); if (ctx) { ctx.beginPath(); ctx.arc(ptX * renderScale, ptY * renderScale, (currentPath.current.width * renderScale) / 2, 0, Math.PI * 2); if (isEraser) { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,1)'; } else if(tool === 'highlighter') { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = strokeOpacity; ctx.fillStyle = color; } else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1.0; ctx.fillStyle = color; } ctx.fill(); ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; } } } } };
    const handleContentMouseMove = (e: React.MouseEvent) => { if (!isDrawing.current) return; e.stopPropagation(); const container = contentContainerRef.current; if (!container) return; const rect = container.getBoundingClientRect(); const scaleX = contentDimensions ? contentDimensions.width / rect.width : 1; const scaleY = contentDimensions ? contentDimensions.height / rect.height : 1; const ptX = (e.clientX - rect.left) * scaleX; const ptY = (e.clientY - rect.top) * scaleY; if (tool === 'eraser' && eraserMode === 'magic') { handleEraser(ptX, ptY); } else if (currentPath.current) { let finalX = ptX, finalY = ptY; if (isShiftPressed.current && currentPath.current.points.length > 0) { const start = currentPath.current.points[0]; Math.abs(ptX - start.x) > Math.abs(ptY - start.y) ? finalY = start.y : finalX = start.x; } const isShape = ['line', 'rectangle', 'circle', 'star', 'emphasis', 'box_highlight', 'arrow'].includes(currentPath.current.type); if (isShape) { currentPath.current.points = [currentPath.current.points[0], { x: finalX, y: finalY }]; redrawAnnotations(); const ctx = annotationCanvasRef.current?.getContext('2d'); if (ctx && currentPath.current) { const path = currentPath.current; const startP = path.points[0]; const endP = path.points[1]; ctx.beginPath(); ctx.lineWidth = path.width * renderScale; ctx.strokeStyle = path.color; ctx.fillStyle = path.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (path.type === 'box_highlight') { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = path.opacity; ctx.fillRect(startP.x * renderScale, startP.y * renderScale, (endP.x - startP.x) * renderScale, (endP.y - startP.y) * renderScale); } else if (path.type === 'line') { ctx.moveTo(startP.x * renderScale, startP.y * renderScale); ctx.lineTo(endP.x * renderScale, endP.y * renderScale); ctx.stroke(); } else if (path.type === 'arrow') { drawArrow(ctx, { x: startP.x * renderScale, y: startP.y * renderScale }, { x: endP.x * renderScale, y: endP.y * renderScale }, path.width * renderScale, path.arrowType); } else if (path.type === 'rectangle') { ctx.strokeRect(startP.x * renderScale, startP.y * renderScale, (endP.x - startP.x) * renderScale, (endP.y - startP.y) * renderScale); } else if (path.type === 'circle') { const radius = Math.sqrt(Math.pow(endP.x - startP.x, 2) + Math.pow(endP.y - startP.y, 2)); ctx.arc(startP.x * renderScale, startP.y * renderScale, radius * renderScale, 0, 2 * Math.PI); ctx.stroke(); } else if (path.type === 'star') { const radius = Math.sqrt(Math.pow(endP.x - startP.x, 2) + Math.pow(endP.y - startP.y, 2)); drawStar(ctx, startP.x * renderScale, startP.y * renderScale, 5, radius * renderScale, (radius / 2) * renderScale); ctx.stroke(); } else if (path.type === 'emphasis') { const midX = (startP.x + endP.x) / 2; const midY = Math.max(startP.y, endP.y) + 10; ctx.moveTo(startP.x * renderScale, startP.y * renderScale); ctx.quadraticCurveTo(midX * renderScale, midY * renderScale, endP.x * renderScale, endP.y * renderScale); ctx.moveTo((startP.x + 2) * renderScale, (startP.y + 4) * renderScale); ctx.quadraticCurveTo(midX * renderScale, (midY + 4) * renderScale, (endP.x - 2) * renderScale, (endP.y + 4) * renderScale); ctx.stroke(); } ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; } } else { currentPath.current.points.push({ x: finalX, y: finalY }); const ctx = annotationCanvasRef.current?.getContext('2d'); if (ctx && lastDrawPoint.current) { ctx.beginPath(); ctx.moveTo(lastDrawPoint.current.x * renderScale, lastDrawPoint.current.y * renderScale); ctx.lineTo(finalX * renderScale, finalY * renderScale); ctx.lineWidth = currentPath.current.width * renderScale; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (currentPath.current.isEraser) { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.globalAlpha = 1.0; } else if (currentPath.current.type === 'highlighter') { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = strokeOpacity; ctx.strokeStyle = color; } else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1.0; ctx.strokeStyle = color; } ctx.stroke(); ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; } lastDrawPoint.current = { x: finalX, y: finalY }; } } };
    const handleContentMouseUp = () => { if (isDrawing.current) { isDrawing.current = false; if (tool === 'eraser' && eraserMode === 'magic') { commitToHistory(annotations, stickyNotes, noteConnections); } else if (currentPath.current && currentPath.current.points.length > 0) { if (['line', 'rectangle', 'circle', 'star', 'emphasis', 'box_highlight', 'arrow'].includes(currentPath.current.type)) { if (currentPath.current.points.length >= 2) { const p1 = currentPath.current.points[0]; const p2 = currentPath.current.points[1]; if (Math.hypot(p1.x - p2.x, p1.y - p2.y) > 5) { const newAnnotations = { ...annotations, [pageNum]: [...(annotations[pageNum] || []), currentPath.current] }; commitToHistory(newAnnotations, stickyNotes, noteConnections); } else { redrawAnnotations(); } } } else { const newAnnotations = { ...annotations, [pageNum]: [...(annotations[pageNum] || []), currentPath.current] }; commitToHistory(newAnnotations, stickyNotes, noteConnections); } currentPath.current = null; } lastDrawPoint.current = null; drawStartPoint.current = null; } };
    const renderToolProperties = () => { if (tool === 'select' || tool === 'note' || tool === 'laser') return null; return ( <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-white/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-200 p-2 flex items-center gap-4 animate-fade-in"> {tool === 'eraser' ? ( <div className="flex bg-gray-100 rounded p-0.5 gap-0.5"> <button onClick={() => setEraserMode('magic')} className={`px-2 py-1 text-xs rounded font-bold ${eraserMode === 'magic' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Magic (Object)</button> <button onClick={() => setEraserMode('rubber')} className={`px-2 py-1 text-xs rounded font-bold ${eraserMode === 'rubber' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>Rubber (Pixel)</button> </div> ) : ( <> <div className="flex items-center gap-2"> <div className="w-1.5 h-1.5 rounded-full bg-gray-400" /> <input type="range" min="1" max={tool === 'highlighter' ? 50 : 20} value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} className="w-24 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /> <div className="w-6 h-6 flex items-center justify-center border border-gray-200 rounded bg-white"> <div className="rounded-full bg-black transition-all" style={{ width: strokeWidth, height: strokeWidth, backgroundColor: color, opacity: tool === 'highlighter' ? strokeOpacity : 1 }} /> </div> </div> <div className="w-px h-6 bg-gray-300" /> <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5"> <button onClick={() => setActiveShape('freehand')} className={`p-1 rounded ${activeShape === 'freehand' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`} title="Freehand"><Icon.Pen size={14} /></button> <button onClick={() => setActiveShape('line')} className={`p-1 rounded ${activeShape === 'line' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`} title="Straight Line"><div className="w-3.5 h-0.5 bg-current rotate-45 transform" /></button> <button onClick={() => setActiveShape('arrow')} className={`p-1 rounded ${activeShape === 'arrow' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`} title="Arrow"><Icon.Arrow size={14} /></button> {tool === 'highlighter' ? ( <button onClick={() => setActiveShape('rectangle')} className={`p-1 rounded ${activeShape === 'rectangle' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`} title="Box Highlight"><Icon.ShapeRect size={14} /></button> ) : ( <> <button onClick={() => setActiveShape('rectangle')} className={`p-1 rounded ${activeShape === 'rectangle' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`} title="Rectangle"><Icon.ShapeRect size={14} /></button> <button onClick={() => setActiveShape('circle')} className={`p-1 rounded ${activeShape === 'circle' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`} title="Circle"><Icon.ShapeCircle size={14} /></button> <button onClick={() => setActiveShape('star')} className={`p-1 rounded ${activeShape === 'star' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`} title="Star"><Icon.Star size={14} /></button> <button onClick={() => setActiveShape('emphasis')} className={`p-1 rounded ${activeShape === 'emphasis' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`} title="Emphasis Curve"><div className="w-3.5 h-1 border-b-2 border-current rounded-full" /></button> </> )} </div> {activeShape === 'arrow' && ( <> <div className="w-px h-6 bg-gray-300" /> <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5"> <button onClick={() => setActiveArrowType('single')} className={`px-2 py-1 text-[10px] font-bold rounded ${activeArrowType === 'single' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Single</button> <button onClick={() => setActiveArrowType('double')} className={`px-2 py-1 text-[10px] font-bold rounded ${activeArrowType === 'double' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Double</button> </div> </> )} <div className="w-px h-6 bg-gray-300" /> {tool === 'highlighter' && ( <> <div className="flex items-center gap-2" title="Opacity"> <Icon.Sun size={14} className="text-gray-400" /> <input type="range" min="0.1" max="1" step="0.1" value={strokeOpacity} onChange={(e) => setStrokeOpacity(parseFloat(e.target.value))} className="w-20 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /> </div> <div className="w-px h-6 bg-gray-300" /> </> )} <div className="flex items-center gap-1.5"> {INK_COLORS.map(c => <button key={c} onClick={() => setColor(c)} className={`w-5 h-5 rounded-full border border-black/5 hover:scale-125 transition-transform ${color === c ? 'ring-2 ring-offset-1 ring-indigo-500' : ''}`} style={{ backgroundColor: c }} />)} <label className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-100 relative overflow-hidden" title="Custom Color"> <input type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" value={color} onChange={(e) => setColor(e.target.value)} /> <div className="w-full h-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500 opacity-50" /> </label> </div> </> )} </div> ); };
    const renderSelectionOverlay = () => { if (!selectedAnnotationId || !contentContainerRef.current) return null; const pageAnns = annotations[pageNum] || []; const ann = pageAnns.find(a => a.id === selectedAnnotationId); if (!ann || ann.points.length < 1) return null; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; ann.points.forEach(p => { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }); minX -= 2; minY -= 2; maxX += 2; maxY += 2; return ( <div className="absolute border-2 border-indigo-500 pointer-events-none" style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY }}> {['tl', 't', 'tr', 'l', 'r', 'bl', 'b', 'br'].map(pos => { let top = '50%', left = '50%'; if (pos.includes('t')) top = '-4px'; if (pos.includes('b')) top = 'calc(100% - 4px)'; if (pos.includes('l')) left = '-4px'; if (pos.includes('r')) left = 'calc(100% - 4px)'; return ( <div key={pos} className="absolute w-2 h-2 bg-white border border-indigo-500 pointer-events-auto cursor-pointer" style={{ top, left, cursor: `${pos.length === 2 ? pos.split('').reverse().join('') : pos}-resize` }} onMouseDown={(e) => handleElementMouseDown(e, { id: ann.id, type: 'resizeHandle', handle: pos }, { x: 0, y: 0 })} /> ); })} </div> ); };
    const handleAddSection = () => { const newId = generateId(); setSections(prev => [...prev, { id: newId, title: 'New Section', content: '' }]); setActiveSectionId(newId); };
    const handleContentContextMenu = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (hasRightPanMoved.current) return; if (contentContainerRef.current && annotationCanvasRef.current) { const rect = contentContainerRef.current.getBoundingClientRect(); const scaleX = contentDimensions ? contentDimensions.width / rect.width : 1; const scaleY = contentDimensions ? contentDimensions.height / rect.height : 1; const clickX = (e.clientX - rect.left) * scaleX; const clickY = (e.clientY - rect.top) * scaleY; const pageAnns = annotations[pageNum] || []; for (let i = pageAnns.length - 1; i >= 0; i--) { if (isPointNearPath(clickX, clickY, pageAnns[i], 10)) { setSelectedAnnotationId(pageAnns[i].id); setContextMenu({ x: e.clientX, y: e.clientY, type: 'annotation', id: pageAnns[i].id }); return; } } } if (tool === 'select') { setContextMenu({ x: e.clientX, y: e.clientY, type: 'canvas' }); } };
    const handleNoteContextMenu = (e: React.MouseEvent, id: string) => { e.preventDefault(); e.stopPropagation(); if (hasRightPanMoved.current) return; setContextMenu({ x: e.clientX, y: e.clientY, type: 'note', id }); };
    const handleNoteMouseDown = (e: React.MouseEvent, note: StickyNote) => { if (e.button === 2) return; e.stopPropagation(); if (tool === 'select') { setSelectedAnnotationId(null); if (e.ctrlKey) { setSelectedNoteIds(prev => { const next = new Set(prev); if (next.has(note.id)) next.delete(note.id); else next.add(note.id); return next; }); } else { if (!selectedNoteIds.has(note.id)) { setSelectedNoteIds(new Set([note.id])); } } handleElementMouseDown(e, { id: note.id, type: 'note' }, { x: note.x, y: note.y }); } };
    const handleNoteTextChange = (id: string, text: string) => { setStickyNotes(prev => ({ ...prev, [pageNum]: (prev[pageNum] || []).map(n => n.id === id ? { ...n, text } : n) })); };
    const changePage = (newPage: number) => { if (newPage === pageNum) return; setPageNum(newPage); if (sourceType === 'PDF' && autoCreateTabs) { const pageTitle = `Page ${newPage}`; setSections(prev => { const exists = prev.some(s => s.title === pageTitle); if (!exists) { const newId = generateId(); return [...prev, { id: newId, title: pageTitle, content: '', pageLink: newPage }]; } return prev; }); setTimeout(() => { setSections(currentSections => { const targetSection = currentSections.find(s => s.title === pageTitle); if (targetSection) setActiveSectionId(targetSection.id); return currentSections; }); }, 0); } };
    const connectionElements = useMemo(() => { const pageConns = noteConnections[pageNum] || []; const pageNotes = stickyNotes[pageNum] || []; return ( <> {pageConns.map(conn => { const source = pageNotes.find(n => n.id === conn.sourceId); const target = pageNotes.find(n => n.id === conn.targetId); if (!source || !target) return null; const srcCenter = getNoteCenter(source); const tgtCenter = getNoteCenter(target); const points = [srcCenter, ...(conn.controlPoints || []), tgtCenter]; return ( <ConnectionRenderer key={conn.id} points={points} style={conn.style || 'curved'} color={conn.color || '#ef4444'} isHovered={hoveredConnectionId === conn.id} isSelected={selectedConnectionId?.id === conn.id} onHover={(h: boolean) => setHoveredConnectionId(h ? conn.id : null)} onClick={(e: any) => handleConnectionClick(e, conn.id, 'noteConnection')} onContextMenu={(e: any) => handleConnectionContextMenu(e, conn.id, 'noteConnection')} controlPoints={conn.controlPoints} onControlPointDrag={(idx: number, e: any, pt: any) => handleElementMouseDown(e, { id: conn.id, type: 'connPoint', index: idx }, pt)} onControlPointContextMenu={(idx: number, e: any) => { e.preventDefault(); e.stopPropagation(); if (hasRightPanMoved.current) return; setContextMenu({ x: e.clientX, y: e.clientY, type: 'controlPoint', id: conn.id, pointIndex: idx }); }} /> ); })} {linkingState && (() => { const source = stickyNotes[pageNum]?.find(n => n.id === linkingState.sourceId); if (!source) return null; const srcCenter = getNoteCenter(source); const end = linkingState.currentPos; return ( <ConnectionRenderer key="temp-link" points={[srcCenter, end]} style="straight" color="#ff0000" isHovered={false} onHover={() => {}} onContextMenu={(e: any) => e.preventDefault()} /> ); })()} {pageNotes.filter(n => n.anchor).map(note => { if (!contentDimensions || !note.anchor) return null; const contentW = contentDimensions.width; const contentH = contentDimensions.height; const topLeftX = CANVAS_CENTER - contentW / 2; const topLeftY = CANVAS_CENTER - contentH / 2; const anchorX = topLeftX + (note.anchor.x / 100) * contentW; const anchorY = topLeftY + (note.anchor.y / 100) * contentH; const start = { x: anchorX, y: anchorY }; const end = getNoteCenter(note); const points = [start, ...(note.controlPoints || []), end]; return ( <ConnectionRenderer key={`anchor-${note.id}`} points={points} style={note.connectionStyle || 'straight'} color={note.connectionColor || '#ef4444'} isHovered={hoveredConnectionId === note.id} isSelected={selectedConnectionId?.id === note.id} onHover={(h: boolean) => setHoveredConnectionId(h ? note.id : null)} onClick={(e: any) => handleConnectionClick(e, note.id, 'anchorConnection', note.id)} onContextMenu={(e: any) => handleConnectionContextMenu(e, note.id, 'anchorConnection')} renderAnchors={true} anchorPos={start} onAnchorDrag={(e: any) => handleElementMouseDown(e, { id: note.id, type: 'anchor' }, start)} controlPoints={note.controlPoints} onControlPointDrag={(idx: number, e: any, pt: any) => handleElementMouseDown(e, { id: note.id, type: 'controlPoint', index: idx }, pt)} onControlPointContextMenu={(idx: number, e: any) => { e.preventDefault(); e.stopPropagation(); if (hasRightPanMoved.current) return; setContextMenu({ x: e.clientX, y: e.clientY, type: 'controlPoint', id: note.id, pointIndex: idx }); }} /> ); })} </> ); }, [noteConnections, stickyNotes, pageNum, hoveredConnectionId, selectedConnectionId, contentDimensions, linkingState, anchorLinkingState, handleElementMouseDown]);
    const activeSection = sections.find(s => s.id === activeSectionId);

    return (
        <div className="flex h-screen bg-[#f0f4f8] overflow-hidden font-sans text-gray-800">
             <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden shrink-0 relative z-40 shadow-xl`}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <h2 className="font-bold text-gray-700 flex items-center gap-2 text-sm uppercase tracking-wider"><Icon.Notebook size={16} className="text-indigo-500"/> Library</h2>
                    <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon.ChevronLeft size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {activeTab === 'PADS' && (
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
                        <div ref={tabsListRef} className="flex overflow-x-auto border-b border-gray-200 custom-scrollbar bg-gray-50 p-1 gap-1">
                            {sections.map(section => (
                                <div key={section.id} id={`tab-btn-${section.id}`} onClick={() => { setActiveSectionId(section.id); if (section.pageLink && sourceType === 'PDF') { changePage(section.pageLink); } }} className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer min-w-[120px] max-w-[200px] border-b-2 transition-all relative pr-8 ${activeSectionId === section.id ? 'bg-white border-indigo-500 text-indigo-600 font-bold shadow-sm' : 'bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200'}`}>
                                    <input value={section.title} onChange={(e) => { const newSecs = sections.map(s => s.id === section.id ? { ...s, title: e.target.value } : s); setSections(newSecs); }} className="bg-transparent outline-none w-full text-xs truncate pr-6" onDoubleClick={(e) => e.currentTarget.select()} onMouseDown={(e) => e.stopPropagation()} />
                                    <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => handleDeleteSection(e, section.id)} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-100 rounded-full transition-colors z-20" title="Close Tab"><Icon.Close size={12} /></button>
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
                                <button onClick={() => changePage(Math.max(1, pageNum - 1))} disabled={pageNum <= 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><Icon.ChevronLeft size={16}/></button>
                                <span className="text-xs font-bold w-12 text-center text-gray-700">{pageNum} / {numPages || '-'}</span>
                                <button onClick={() => changePage(Math.min(numPages, pageNum + 1))} disabled={pageNum >= numPages} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><Icon.ChevronRight size={16}/></button>
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
                                <button onClick={() => setTool('laser')} className={`p-1.5 rounded-md transition-all flex items-center justify-center ${tool === 'laser' ? 'bg-red-50 text-red-600 ring-1 ring-red-200 shadow' : 'text-gray-500 hover:text-gray-800'}`} title="Laser Pointer"><div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm" /></button>
                                <div className="w-px h-5 bg-gray-300 mx-1 my-auto" />
                                <div className="w-6 h-6 rounded my-auto border border-gray-300 shadow-sm relative overflow-hidden" title="Active Ink Color"><div className="w-full h-full" style={{ backgroundColor: color, opacity: tool === 'highlighter' ? strokeOpacity : 1 }} /></div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 transition-colors" title="Undo"><Icon.Undo size={16} /></button>
                                <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 disabled:opacity-30 transition-colors" title="Redo"><Icon.Redo size={16} /></button>
                                <div className="w-px h-4 bg-gray-200 mx-1" />
                                <button onClick={centerView} className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold text-xs rounded-lg border border-gray-200 transition-colors" title="Fit content to screen">Reset View</button>
                                <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 rounded-lg font-bold text-xs flex items-center gap-1 transition-colors"><Icon.FileUp size={14} /> {sourceName ? "Replace" : "Upload PDF/Img"}</button>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} />
                                <input type="file" ref={imageUploadRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                            </div>
                        </div>

                        <div 
                            ref={canvasContainerRef}
                            className={`flex-1 relative overflow-hidden ${isRightPanning ? 'cursor-grabbing' : tool === 'select' ? 'cursor-default' : tool === 'pen' ? 'cursor-pen' : tool === 'highlighter' ? 'cursor-highlighter' : tool === 'eraser' ? 'cursor-eraser' : tool === 'laser' ? 'cursor-crosshair' : 'cursor-crosshair'}`}
                            onMouseDown={handleCanvasMouseDown}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={handleCanvasMouseUp}
                            onContextMenu={handleContentContextMenu}
                        >
                            {selectionBox && canvasContainerRef.current && (
                                <div 
                                    className="absolute bg-blue-500/10 border border-blue-500 pointer-events-none z-[60]"
                                    style={{
                                        left: Math.min(selectionBox.start.x, selectionBox.current.x) - canvasContainerRef.current.getBoundingClientRect().left,
                                        top: Math.min(selectionBox.start.y, selectionBox.current.y) - canvasContainerRef.current.getBoundingClientRect().top,
                                        width: Math.abs(selectionBox.current.x - selectionBox.start.x),
                                        height: Math.abs(selectionBox.current.y - selectionBox.start.y)
                                    }}
                                />
                            )}

                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 p-1.5 bg-white/90 backdrop-blur-xl border border-white/60 rounded-2xl shadow-clay-xl transition-all hover:shadow-clay-2xl select-none">
                                <button onClick={undo} disabled={historyIndex <= 0} className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-600 disabled:opacity-30 transition-colors" title="Undo (Ctrl+Z)"><Icon.Undo size={20} /></button>
                                <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-600 disabled:opacity-30 transition-colors" title="Redo (Ctrl+Y)"><Icon.Redo size={20} /></button>
                                <div className="w-px h-6 bg-gray-300 mx-2" />
                                <button onClick={() => handleZoom(-0.1)} className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"><Icon.Minus size={20} /></button>
                                <div className="w-32 flex items-center px-2">
                                    <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.1" value={viewport.zoom} onChange={(e) => handleZoom(parseFloat(e.target.value) - viewport.zoom)} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                                </div>
                                <span className="w-10 text-center font-bold text-sm text-gray-700 select-none">{Math.round(viewport.zoom * 100)}%</span>
                                <button onClick={() => handleZoom(0.1)} className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"><Icon.Plus size={20} /></button>
                            </div>

                            {sourceType === 'PDF' && numPages > 1 && (
                                <>
                                    <button onClick={() => changePage(Math.max(1, pageNum - 1))} disabled={pageNum <= 1} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/80 backdrop-blur shadow-lg rounded-full hover:bg-white hover:scale-110 transition-all disabled:opacity-0 disabled:pointer-events-none z-40 border border-gray-200 text-gray-600"><Icon.ChevronLeft size={24} /></button>
                                    <button onClick={() => changePage(Math.min(numPages, pageNum + 1))} disabled={pageNum >= numPages} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/80 backdrop-blur shadow-lg rounded-full hover:bg-white hover:scale-110 transition-all disabled:opacity-0 disabled:pointer-events-none z-40 border border-gray-200 text-gray-600"><Icon.ChevronRight size={24} /></button>
                                </>
                            )}

                            <div ref={captureContainerRef} style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: 'top left', width: CANVAS_SIZE, height: CANVAS_SIZE, position: 'absolute', top: 0, left: 0 }} className="bg-transparent">
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-2xl bg-white" style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', padding: '0', width: contentDimensions ? contentDimensions.width : 'auto', height: contentDimensions ? contentDimensions.height : 'auto' }}>
                                    {pdfError ? (
                                        <div className="w-[600px] h-[800px] bg-red-50 flex flex-col items-center justify-center text-red-600 border-2 border-dashed border-red-300 rounded-xl p-6 text-center"><Icon.AlertTriangle size={48} className="mb-4" /><p className="font-bold mb-2">PDF Load Error</p><p className="text-sm">{pdfError}</p></div>
                                    ) : sourceType === 'PDF' ? (
                                        <div ref={contentContainerRef} id="notepad-content-layer" className="relative" style={{ width: '100%', height: '100%' }} onMouseDown={handleContentMouseDown} onMouseMove={handleContentMouseMove} onMouseUp={handleContentMouseUp}>
                                            <canvas ref={pdfCanvasRef} className="block" style={{ width: '100%', height: '100%' }} />
                                            <canvas ref={annotationCanvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%' }} />
                                            <canvas ref={laserCanvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 100 }} />
                                            {renderSelectionOverlay()}
                                        </div>
                                    ) : sourceType === 'IMAGE' ? (
                                        <div ref={contentContainerRef} id="notepad-content-layer" className="relative" style={{ width: '100%', height: '100%' }} onMouseDown={handleContentMouseDown} onMouseMove={handleContentMouseMove} onMouseUp={handleContentMouseUp}>
                                            <img src={sourceData as string} alt="Uploaded" className="block" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            <canvas ref={annotationCanvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%' }} />
                                            <canvas ref={laserCanvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 100 }} />
                                            {renderSelectionOverlay()}
                                        </div>
                                    ) : (
                                        <div className="w-[600px] h-[800px] bg-white flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 rounded-xl"><Icon.FileText size={48} className="mb-4 text-gray-300" /><p className="font-bold text-lg">Empty Canvas</p><p className="text-sm mt-2">Upload a PDF or Image to start annotating</p></div>
                                    )}
                                </div>
                                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none export-exclude-connection" style={{ zIndex: 20 }}>{connectionElements}</svg>
                                
                                {(stickyNotes[pageNum] as StickyNote[] || []).map(note => (
                                    <div key={note.id} id={`sticky-note-${note.id}`} className={`absolute flex flex-col shadow-lg rounded-lg overflow-visible border border-black/10 transition-[box-shadow,transform] duration-200 hover:shadow-2xl group/note export-exclude-note ${selectedNoteIds.has(note.id) ? 'ring-2 ring-indigo-500 shadow-2xl z-50' : 'z-30'}`} style={{ left: note.x, top: note.y, width: note.minimized ? '40px' : (note.contentType === 'image' || note.contentType === 'table' || note.contentType === 'drawing' ? '300px' : '220px'), height: note.minimized ? '40px' : (note.contentType === 'image' || note.contentType === 'table' || note.contentType === 'drawing' ? 'auto' : 'auto'), backgroundColor: note.color, minWidth: note.minimized ? 0 : 200 }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setSelectedNoteIds(new Set([note.id])); }} onContextMenu={(e) => handleNoteContextMenu(e, note.id)}>
                                        {/* Note Header */}
                                        <div className="h-7 w-full bg-black/5 flex items-center justify-between px-1 cursor-move border-b border-black/5" onMouseDown={(e) => handleNoteMouseDown(e, note)} title="Drag to move">
                                            <div className="flex gap-1 pl-1 items-center">
                                                {note.minimized && <div className="w-2 h-2 rounded-full bg-gray-400" />}
                                                {!note.minimized && <div className="flex gap-1 items-center" onMouseDown={e => e.stopPropagation()}>
                                                    {NOTE_COLORS.slice(0, 3).map(c => <button key={c} onClick={(e) => { e.stopPropagation(); updateStickyNote(note.id, { color: c }); }} className="w-3 h-3 rounded-full border border-black/10 hover:scale-125 transition-transform" style={{ backgroundColor: c }} />)}
                                                    <label className="w-3 h-3 rounded-full border border-black/10 hover:scale-125 transition-transform cursor-pointer relative overflow-hidden" title="Custom Color">
                                                        <input type="color" className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" value={note.color} onChange={(e) => updateStickyNote(note.id, { color: e.target.value })} />
                                                        <div className="w-full h-full bg-[conic-gradient(at_center,_red,_yellow,_green,_blue,_purple,_red)]" />
                                                    </label>
                                                </div>}
                                            </div>
                                            <div className="flex gap-1 items-center" onMouseDown={e => e.stopPropagation()}>
                                                {note.minimized ? <button onClick={() => updateStickyNote(note.id, { minimized: false })} className="p-0.5 hover:bg-blue-100 hover:text-blue-600 rounded"><Icon.Plus size={10} /></button> : <button onClick={() => updateStickyNote(note.id, { minimized: true })} className="p-0.5 hover:bg-black/10 rounded"><Icon.Minus size={10} /></button>}
                                                <button onClick={() => deleteNote(note.id)} className="p-0.5 hover:bg-red-100 hover:text-red-600 rounded"><Icon.Close size={12} /></button>
                                            </div>
                                        </div>
                                        {!note.minimized && (
                                            <>
                                                <div className={`absolute -right-8 top-0 flex flex-col gap-1 transition-opacity pointer-events-auto ${selectedNoteIds.has(note.id) ? 'opacity-100' : 'opacity-0 group-hover/note:opacity-100'}`}>
                                                    <button className="w-6 h-6 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-blue-50" title="Add Child Note" onClick={(e) => { e.stopPropagation(); addChildNote(note.id); }}><Icon.Plus size={14} /></button>
                                                    <button className="w-6 h-6 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-green-600 hover:bg-green-50 cursor-crosshair" title="Drag to Link" onMouseDown={(e) => startLinking(e, note.id)}><Icon.Connect size={14} /></button>
                                                </div>
                                                <div className="w-full h-auto min-h-[100px] relative bg-transparent">
                                                    {note.contentType === 'image' && ( note.isPlaceholder ? ( <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg m-2 cursor-pointer hover:bg-black/5" onClick={() => handleImageUpload(note.id)}><Icon.Image size={24} className="text-gray-400"/><span className="text-[10px] text-gray-500 mt-1 font-bold">Upload Image</span></div> ) : ( <img src={note.mediaUrl} className="w-full h-auto max-w-[300px] object-contain rounded-b-lg pointer-events-none" alt="Note Media" /> ) )}
                                                    {note.contentType === 'audio' && ( <div className="flex flex-col items-center justify-center p-4"> {note.mediaUrl ? ( <div className="w-full flex flex-col gap-2"><audio src={note.mediaUrl} controls className="w-full h-8" /><div className="flex justify-between items-center px-1"><span className="text-[10px] font-bold text-gray-500 uppercase">Voice Note</span><button onClick={() => updateStickyNote(note.id, { mediaUrl: undefined })} className="text-[10px] text-red-500 hover:underline">Clear</button></div></div> ) : ( <div className="flex flex-col items-center">{recordingNoteId === note.id ? ( <button onClick={stopRecording} className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center animate-pulse shadow-lg mb-2"><div className="w-4 h-4 bg-white rounded-sm" /></button> ) : ( <button onClick={() => startRecording(note.id)} className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors mb-2"><Icon.Mic size={24} /></button> )}<span className="text-xs font-bold text-gray-600">{recordingNoteId === note.id ? "Recording..." : "Tap to Record"}</span></div> )} </div> )}
                                                    {note.contentType === 'table' && ( <div className="p-2 overflow-x-auto"><div className="inline-block min-w-full border border-gray-300 rounded overflow-hidden">{note.tableData?.map((row, rIdx) => ( <div key={rIdx} className="flex border-b last:border-b-0 border-gray-200">{row.map((cell, cIdx) => ( <input key={cIdx} value={cell} onChange={(e) => updateTableCell(note.id, rIdx, cIdx, e.target.value)} className={`w-24 p-1 text-xs border-r border-gray-200 last:border-r-0 outline-none focus:bg-blue-50 ${rIdx === 0 ? 'bg-gray-100 font-bold text-center' : 'bg-white'}`} placeholder="..." /> ))}</div> ))}</div><div className="flex gap-2 mt-2"><button onClick={() => addTableRow(note.id)} className="text-[10px] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 font-bold">+ Row</button><button onClick={() => addTableCol(note.id)} className="text-[10px] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 font-bold">+ Col</button></div></div> )}
                                                    {note.contentType === 'drawing' && ( <div className="w-full h-48 p-1"><DrawingArea initialImage={note.mediaUrl} strokeColor={color} onSave={(data) => updateStickyNote(note.id, { mediaUrl: data })} /></div> )}
                                                    {(note.contentType === 'text' || !note.contentType) && ( <textarea className="w-full h-full min-h-[120px] p-3 bg-transparent text-sm resize-none outline-none font-medium text-gray-800 custom-scrollbar leading-relaxed" value={note.text} onChange={(e) => { handleNoteTextChange(note.id, e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder="Type note..." onMouseDown={(e) => e.stopPropagation()} spellCheck={false} /> )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <NotepadMinimap viewport={viewport} setViewport={setViewport} contentDimensions={contentDimensions} stickyNotes={stickyNotes[pageNum] || []} containerSize={containerDimensions} />
                </div>
            </div>

            {contextMenu && (
                <div className="fixed z-[100] bg-white border border-gray-200 shadow-2xl rounded-lg p-1 text-sm flex flex-col min-w-[220px] animate-pop origin-top-left overflow-hidden" style={{ top: contextMenu.y, left: contextMenu.x }} onMouseDown={(e) => e.stopPropagation()}>
                    {/* ... Existing context menu content ... */}
                    {contextMenu.type === 'canvas' ? (
                        <>
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Text & Markup</div>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('create_note')}><Icon.StickyNote size={14} className="text-gray-400"/> Add Sticky Note</button>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('snip_text')}><Icon.Cut size={14} className="text-gray-400"/> Snip Selected Text</button>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('add_drawing')}><Icon.Pen size={14} className="text-gray-400"/> Insert Drawing Area</button>
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 border-t text-[10px] font-bold text-gray-400 uppercase tracking-widest">Multimedia</div>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('upload_image')}><Icon.Image size={14} className="text-blue-400"/> Upload Image Note</button>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('create_image_placeholder')}><Icon.ShapeRect size={14} className="text-gray-400"/> Create Image Placeholder</button>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('add_audio')}><Icon.Mic size={14} className="text-red-400"/> Add Audio Note</button>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('add_table')}><Icon.Table size={14} className="text-green-400"/> Add Table Note</button>
                            <div className="h-px bg-gray-100 my-1"/>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('paste')}><Icon.Paste size={14} className="text-gray-400"/> Paste</button>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('reset_view')}><Icon.Maximize size={14} className="text-gray-400"/> Reset View</button>
                        </>
                    ) : contextMenu.type === 'annotation' && contextMenu.id ? (
                        <>
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Shape Properties</div>
                            <div className="p-2 border-b border-gray-100 flex flex-wrap gap-1.5 justify-center">
                                {INK_COLORS.map(c => ( <button key={c} onClick={() => handleContextMenuAction('change_color', c)} className="w-5 h-5 rounded-full border border-black/10 hover:scale-125 transition-transform shadow-sm" style={{ backgroundColor: c }} title="Change Color" /> ))}
                            </div>
                            {annotations[pageNum]?.find(a => a.id === contextMenu.id)?.type === 'arrow' && ( <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium flex items-center gap-3" onClick={() => handleContextMenuAction('toggle_arrow')}><Icon.Arrow size={14} className="text-gray-400 rotate-90"/> Toggle Double/Single</button> )}
                            <div className="h-px bg-gray-100 my-1"/>
                            <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete_annotation')}><Icon.Trash size={14} /> Delete Shape</button>
                        </>
                    ) : contextMenu.type === 'note' && contextMenu.id ? (
                        <>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('add_child')}><Icon.Plus size={14} /> Add Child Note</button>
                            <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('add_anchor')}><Icon.Map size={14} /> Add Anchor Point</button>
                            <div className="p-2 border-b border-t border-gray-100"><div className="text-[10px] font-bold text-gray-400 uppercase mb-2 pl-1">Note Color</div><div className="flex flex-wrap gap-1.5">{NOTE_COLORS.map(c => <button key={c} onClick={() => handleContextMenuAction('color', c)} className="w-5 h-5 rounded-full border border-black/10 hover:scale-125 transition-transform shadow-sm" style={{backgroundColor: c}}/>)}</div></div>
                            <div className="h-px bg-gray-100 my-1"/>
                            <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete')}><Icon.Trash size={14} /> Delete Note</button>
                        </>
                    ) : contextMenu.type === 'controlPoint' && contextMenu.id ? <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete_point')}><Icon.Trash size={14} /> Delete Control Point</button> : (
                        <>
                            <div className="p-2 border-b border-gray-100"><div className="text-[10px] font-bold text-gray-400 uppercase mb-2 pl-1">Link Color</div><div className="flex flex-wrap gap-1.5">{LINK_COLORS.map(c => <button key={c} onClick={() => handleContextMenuAction('connection_color', c)} className="w-5 h-5 rounded-full border border-black/10 hover:scale-125 transition-transform shadow-sm" style={{backgroundColor: c}}/>)}</div></div>
                            <div className="p-2 border-b border-gray-100"><div className="text-[10px] font-bold text-gray-400 uppercase mb-2 pl-1">Link Style</div><div className="flex gap-1"><button onClick={() => handleContextMenuAction('connection_style', 'straight')} className="flex-1 py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-600">STR</button><button onClick={() => handleContextMenuAction('connection_style', 'curved')} className="flex-1 py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-600">CRV</button><button onClick={() => handleContextMenuAction('connection_style', 'orthogonal')} className="flex-1 py-1 bg-gray-50 hover:bg-gray-100 rounded border border-gray-100 text-[10px] font-bold text-gray-600">90°</button></div></div>
                            {(contextMenu.connectionType === 'noteConnection' || contextMenu.connectionType === 'anchorConnection') && <button className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-gray-700 font-medium rounded flex items-center gap-2 mt-1" onClick={() => handleContextMenuAction('add_point')}><Icon.Plus size={14} /> Add Control Point</button>}
                            <div className="h-px bg-gray-100 my-1"/>
                            <button className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 font-medium rounded flex items-center gap-2" onClick={() => handleContextMenuAction('delete_link')}><Icon.Trash size={14} /> Delete Link</button>
                        </>
                    )}
                </div>
            )}

            {/* Export Modal */}
            <NotepadExportModal 
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                elementId={captureContainerRef.current ? "capture-container" : ""} // Need ID on element
                projectName={title}
                stickyNotes={stickyNotes[pageNum] || []}
                annotations={annotations[pageNum] || []}
                contentDimensions={contentDimensions}
                canvasCenter={CANVAS_CENTER}
            />
            {/* Hack to assign ID to the captured container if not present */}
            {captureContainerRef.current && !captureContainerRef.current.id && (captureContainerRef.current.id = "capture-container") && null}
        </div>
    );
};

export default NotepadScreen;
