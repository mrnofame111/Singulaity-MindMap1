
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './Icons';
import * as pdfjsLib from 'pdfjs-dist';
import { saveFile, getFile } from '../services/localDb';

// Set worker source for PDF.js dynamically to prevent version mismatch
// We use a fallback version if the library version isn't available immediately
const pdfjsVersion = pdfjsLib.version || '5.4.449';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

interface NotepadPanelProps {
    isOpen: boolean;
    onClose: () => void;
    currentMapId: string;
}

interface AnnotationPath {
    type: 'pen' | 'highlighter';
    points: { x: number; y: number }[];
    color: string;
    width: number;
}

interface TextSection {
    id: string;
    title: string;
    content: string;
}

const generateId = () => `note_${Math.random().toString(36).substr(2, 9)}`;

export const NotepadPanel: React.FC<NotepadPanelProps> = ({ isOpen, onClose, currentMapId }) => {
    const [activeTab, setActiveTab] = useState<'NOTES' | 'PDF'>('NOTES');
    const [width, setWidth] = useState(450);
    const [isResizing, setIsResizing] = useState(false);

    // --- Data State ---
    const [sections, setSections] = useState<TextSection[]>([{ id: 'default', title: 'General Notes', content: '' }]);
    const [activeSectionId, setActiveSectionId] = useState<string>('default');
    
    // --- PDF State ---
    const [pdfDocument, setPdfDocument] = useState<any>(null);
    const [pageNum, setPageNum] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [scale, setScale] = useState(1.2);
    const [annotations, setAnnotations] = useState<Record<number, AnnotationPath[]>>({});
    
    // --- Tools ---
    const [tool, setTool] = useState<'select' | 'pen' | 'highlighter' | 'eraser'>('select');
    const [color, setColor] = useState('#ef4444');
    
    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDrawing = useRef(false);
    const currentPath = useRef<AnnotationPath | null>(null);
    const lastDrawPoint = useRef<{ x: number, y: number } | null>(null);
    const renderTaskRef = useRef<any>(null);

    // Load Data
    useEffect(() => {
        const load = async () => {
            const savedNotes = localStorage.getItem(`singularity-notepad-panel-${currentMapId}`);
            if (savedNotes) {
                const data = JSON.parse(savedNotes);
                setSections(data.sections || []);
                setAnnotations(data.annotations || {});
                setActiveSectionId(data.activeSectionId || 'default');
            }
            // Try load PDF file associated with this map
            try {
                const fileData = await getFile(`pdf-${currentMapId}`);
                if (fileData) loadPdfData(fileData);
            } catch (e) { console.error("No PDF found for this map"); }
        };
        if (isOpen) load();
    }, [currentMapId, isOpen]);

    // Save Data
    useEffect(() => {
        const save = () => {
            const data = { sections, annotations, activeSectionId };
            localStorage.setItem(`singularity-notepad-panel-${currentMapId}`, JSON.stringify(data));
        };
        const timer = setTimeout(save, 1000);
        return () => clearTimeout(timer);
    }, [sections, annotations, activeSectionId, currentMapId]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || file.type !== 'application/pdf') return;
        
        const buffer = await file.arrayBuffer();
        await saveFile(`pdf-${currentMapId}`, buffer);
        loadPdfData(buffer);
        setActiveTab('PDF');
    };

    const loadPdfData = async (buffer: ArrayBuffer) => {
        try {
            // Convert ArrayBuffer to Uint8Array for PDF.js compatibility
            const data = new Uint8Array(buffer);
            
            const loadingTask = pdfjsLib.getDocument({ 
                data, 
                cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/cmaps/`, 
                cMapPacked: true 
            });
            const pdf = await loadingTask.promise;
            setPdfDocument(pdf);
            setNumPages(pdf.numPages);
            setPageNum(1);
        } catch (e: any) {
            console.error("PDF Load Error:", e);
            alert(`Failed to load PDF: ${e.message || 'Unknown error'}`);
        }
    };

    // PDF Rendering
    useEffect(() => {
        if (!pdfDocument || !pdfCanvasRef.current) return;
        
        const renderPage = async () => {
            if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
            try {
                const page = await pdfDocument.getPage(pageNum);
                const viewport = page.getViewport({ scale });
                
                const canvas = pdfCanvasRef.current!;
                const context = canvas.getContext('2d')!;
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (annotationCanvasRef.current) {
                    annotationCanvasRef.current.height = viewport.height;
                    annotationCanvasRef.current.width = viewport.width;
                    redrawAnnotations();
                }

                const renderContext = { canvasContext: context, viewport };
                const task = page.render(renderContext);
                renderTaskRef.current = task;
                await task.promise;
            } catch (e: any) {
                if (e.name !== 'RenderingCancelledException') console.error(e);
            }
        };
        renderPage();
    }, [pdfDocument, pageNum, scale, activeTab]);

    const redrawAnnotations = () => {
        const canvas = annotationCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pageAnns = annotations[pageNum] || [];
        
        pageAnns.forEach(path => {
            if (path.points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(path.points[0].x * scale, path.points[0].y * scale);
            for (let i = 1; i < path.points.length; i++) {
                ctx.lineTo(path.points[i].x * scale, path.points[i].y * scale);
            }
            ctx.strokeStyle = path.color;
            ctx.lineWidth = path.width * scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = path.type === 'highlighter' ? 0.4 : 1.0;
            ctx.globalCompositeOperation = path.type === 'highlighter' ? 'multiply' : 'source-over';
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
        });
    };

    // Drawing Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (tool === 'select') return;
        isDrawing.current = true;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        if (tool === 'eraser') {
            // Simple erase logic (remove whole path if close)
            setAnnotations(prev => {
                const pageAnns = prev[pageNum] || [];
                const filtered = pageAnns.filter(p => !p.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < 10));
                return { ...prev, [pageNum]: filtered };
            });
            // Re-render immediately
            setTimeout(redrawAnnotations, 0);
        } else {
            currentPath.current = {
                type: tool as 'pen' | 'highlighter',
                points: [{ x, y }],
                color,
                width: tool === 'highlighter' ? 20 : 3
            };
            lastDrawPoint.current = { x, y };
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing.current || tool === 'select' || tool === 'eraser') return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;

        if (currentPath.current) {
            currentPath.current.points.push({ x, y });
            // Draw live
            const ctx = annotationCanvasRef.current?.getContext('2d');
            if (ctx && lastDrawPoint.current) {
                ctx.beginPath();
                ctx.moveTo(lastDrawPoint.current.x * scale, lastDrawPoint.current.y * scale);
                ctx.lineTo(x * scale, y * scale);
                ctx.strokeStyle = color;
                ctx.lineWidth = currentPath.current.width * scale;
                ctx.lineCap = 'round';
                ctx.globalAlpha = tool === 'highlighter' ? 0.4 : 1.0;
                ctx.globalCompositeOperation = tool === 'highlighter' ? 'multiply' : 'source-over';
                ctx.stroke();
            }
            lastDrawPoint.current = { x, y };
        }
    };

    const handleMouseUp = () => {
        if (isDrawing.current && currentPath.current) {
            setAnnotations(prev => ({
                ...prev,
                [pageNum]: [...(prev[pageNum] || []), currentPath.current!]
            }));
            currentPath.current = null;
        }
        isDrawing.current = false;
    };

    // Section Handlers
    const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];
    const updateSection = (content: string) => {
        setSections(prev => prev.map(s => s.id === activeSectionId ? { ...s, content } : s));
    };

    // Drag-to-Canvas Logic for Text
    const handleDragStart = (e: React.DragEvent) => {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) {
            e.dataTransfer.setData('text/plain', selection.toString());
            e.dataTransfer.effectAllowed = 'copy';
        }
    };

    return (
        <div 
            className={`fixed top-[60px] right-0 bottom-0 bg-white/95 backdrop-blur-xl border-l border-white/20 shadow-2xl z-[50] flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            style={{ width }}
        >
            {/* Resizer */}
            <div 
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 z-50 transition-colors"
                onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                    const startX = e.clientX;
                    const startWidth = width;
                    const handleMove = (ev: MouseEvent) => {
                        const newWidth = startWidth + (startX - ev.clientX);
                        setWidth(Math.max(300, Math.min(800, newWidth)));
                    };
                    const handleUp = () => {
                        setIsResizing(false);
                        document.removeEventListener('mousemove', handleMove);
                        document.removeEventListener('mouseup', handleUp);
                    };
                    document.addEventListener('mousemove', handleMove);
                    document.addEventListener('mouseup', handleUp);
                }}
            />

            {/* Header */}
            <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4 bg-gray-50/80">
                <div className="flex gap-2">
                    <button 
                        onClick={() => setActiveTab('NOTES')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeTab === 'NOTES' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        <Icon.FileText size={14} className="inline mr-1" /> Notes
                    </button>
                    <button 
                        onClick={() => setActiveTab('PDF')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeTab === 'PDF' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                    >
                        <Icon.BookOpen size={14} className="inline mr-1" /> Reference
                    </button>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500">
                    <Icon.Close size={16} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'NOTES' && (
                    <div className="h-full flex flex-col">
                        <div className="flex overflow-x-auto border-b border-gray-100 p-2 gap-2 bg-white">
                            {sections.map(s => (
                                <button 
                                    key={s.id} 
                                    onClick={() => setActiveSectionId(s.id)}
                                    className={`px-3 py-1 rounded text-xs font-bold truncate max-w-[120px] ${activeSectionId === s.id ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    {s.title}
                                </button>
                            ))}
                            <button onClick={() => {
                                const newId = generateId();
                                setSections([...sections, { id: newId, title: 'New Note', content: '' }]);
                                setActiveSectionId(newId);
                            }} className="p-1 hover:bg-gray-100 rounded text-gray-400">
                                <Icon.Plus size={14} />
                            </button>
                        </div>
                        <textarea 
                            value={activeSection?.content || ''}
                            onChange={(e) => updateSection(e.target.value)}
                            onDragStart={handleDragStart}
                            draggable
                            className="flex-1 p-6 resize-none outline-none text-sm leading-relaxed text-gray-700 bg-transparent custom-scrollbar font-medium"
                            placeholder="Type your notes here... (Select text and drag to canvas to create nodes)"
                        />
                    </div>
                )}

                {activeTab === 'PDF' && (
                    <div className="h-full flex flex-col bg-gray-100/50">
                        {/* PDF Toolbar */}
                        <div className="h-10 border-b border-gray-200 bg-white flex items-center justify-between px-2 shrink-0">
                            <div className="flex items-center gap-1">
                                <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"><Icon.ChevronLeft size={14}/></button>
                                <span className="text-[10px] font-bold text-gray-600 min-w-[40px] text-center">{pageNum} / {numPages}</span>
                                <button onClick={() => setPageNum(p => Math.min(numPages, p + 1))} disabled={pageNum >= numPages} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"><Icon.ChevronRight size={14}/></button>
                            </div>
                            <div className="flex items-center gap-1 bg-gray-100 rounded p-0.5">
                                {['select', 'pen', 'highlighter', 'eraser'].map(t => (
                                    <button 
                                        key={t}
                                        onClick={() => setTool(t as any)}
                                        className={`p-1 rounded ${tool === t ? 'bg-white shadow text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {t === 'select' && <Icon.Select size={14} />}
                                        {t === 'pen' && <Icon.Pen size={14} />}
                                        {t === 'highlighter' && <Icon.Highlighter size={14} />}
                                        {t === 'eraser' && <Icon.Eraser size={14} />}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100 transition-colors">
                                    {pdfDocument ? 'Replace' : 'Upload PDF'}
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={handleFileUpload} />
                            </div>
                        </div>
                        
                        {/* PDF Canvas */}
                        <div className="flex-1 overflow-auto relative custom-scrollbar flex justify-center p-4">
                            {pdfDocument ? (
                                <div className="relative shadow-lg border border-gray-200 bg-white" style={{ width: 'fit-content', height: 'fit-content' }}>
                                    <canvas ref={pdfCanvasRef} className="block" />
                                    <canvas 
                                        ref={annotationCanvasRef} 
                                        className={`absolute top-0 left-0 ${tool === 'select' ? 'pointer-events-none' : 'cursor-crosshair'}`}
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                        onMouseLeave={handleMouseUp}
                                    />
                                    {/* Drag Overlay for Select Tool */}
                                    {tool === 'select' && (
                                        <div 
                                            className="absolute inset-0 cursor-text"
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('text/plain', `Ref: Page ${pageNum}`);
                                                e.dataTransfer.effectAllowed = 'copy';
                                            }}
                                        />
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-gray-400 h-full">
                                    <Icon.FileText size={48} className="mb-2 opacity-50" />
                                    <p className="text-sm font-medium">No PDF Loaded</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
