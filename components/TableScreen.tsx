
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';

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
  imagePos?: { x: number, y: number, scale: number }; // Image adjustment
  drawingData?: string;  // Base64 for drawing
  todoItems?: { id: string, text: string, done: boolean }[];
  color?: string;        
  codeOutput?: string;   // Capture console output
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

// Recursive helper to find a node by ID
const findNode = (node: Block, id: string): Block | null => {
    if (node.id === id) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findNode(child, id);
            if (found) return found;
        }
    }
    return null;
};

// --- Export Logic (Interactive HTML) ---

const generateHtmlContent = (root: Block, title: string) => {
    
    // Recursive renderer for the structure
    const renderBlock = (block: Block): string => {
        if (block.type === 'container') {
            const flexDir = block.direction === 'row' ? 'row' : 'column';
            const childrenHtml = block.children?.map(renderBlock).join('') || '';
            return `<div class="block-container" style="flex-direction: ${flexDir}; flex: ${block.weight};">${childrenHtml}</div>`;
        } else {
            let inner = '';
            
            if (block.contentType === 'text') {
                inner = `<textarea readonly class="content-text">${block.content || ''}</textarea>`;
            } 
            else if (block.contentType === 'image' && block.imageUrl) {
                inner = `
                    <div class="content-image-wrapper">
                        <img src="${block.imageUrl}" style="transform: translate(${block.imagePos?.x||0}px, ${block.imagePos?.y||0}px) scale(${block.imagePos?.scale||1})" />
                    </div>`;
            } 
            else if (block.contentType === 'todo') {
                const items = block.todoItems?.map(i => `
                    <div class="todo-item" onclick="toggleTodo(this)">
                        <input type="checkbox" ${i.done ? 'checked' : ''} pointer-events="none">
                        <span class="${i.done ? 'done' : ''}">${i.text}</span>
                    </div>
                `).join('') || '';
                inner = `<div class="content-todo"><h3>Task List</h3>${items}</div>`;
            } 
            else if (block.contentType === 'code') {
                // We inject the code into a data attribute so the JS can read it easily
                const safeCode = (block.content || '').replace(/"/g, '&quot;');
                inner = `
                    <div class="content-code">
                        <div class="code-header">
                            <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
                            <button onclick="runCode(this)">Run ▶</button>
                        </div>
                        <textarea class="code-editor" spellcheck="false">${block.content || ''}</textarea>
                        <div class="code-output"></div>
                    </div>`;
            } 
            else if (block.contentType === 'draw') {
                // Initialize canvas with base64 data
                inner = `
                    <div class="content-draw">
                        <canvas id="canvas-${block.id}" data-initial="${block.drawingData || ''}"></canvas>
                        <div class="draw-tools">
                            <button onclick="clearCanvas('canvas-${block.id}')">Clear</button>
                        </div>
                    </div>`;
            }
            
            return `<div class="block-leaf" style="flex: ${block.weight}; background-color: ${block.color || '#fff'};">${inner}</div>`;
        }
    };

    // The giant interactive HTML template
    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f0f4f8; }
  #root { display: flex; flex-direction: column; height: 100vh; padding: 20px; box-sizing: border-box; }
  .header { padding: 10px 0; font-weight: 800; font-size: 24px; color: #1e293b; }
  
  .block-container { display: flex; min-width: 0; min-height: 0; overflow: hidden; border: 1px solid rgba(0,0,0,0.05); }
  .block-leaf { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; position: relative; border: 1px solid rgba(0,0,0,0.05); }
  
  /* Text */
  .content-text { width: 100%; height: 100%; border: none; resize: none; outline: none; background: transparent; padding: 20px; font-size: 16px; line-height: 1.6; color: #334155; }
  
  /* Image */
  .content-image-wrapper { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; background: rgba(0,0,0,0.02); }
  .content-image-wrapper img { max-width: 100%; max-height: 100%; object-fit: contain; }

  /* Todo */
  .content-todo { padding: 20px; overflow-y: auto; height: 100%; }
  .content-todo h3 { margin-top: 0; font-size: 12px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; }
  .todo-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
  .todo-item span.done { text-decoration: line-through; color: #cbd5e1; }
  .todo-item input { pointer-events: none; }

  /* Code */
  .content-code { display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #fff; font-family: monospace; }
  .code-header { display: flex; align-items: center; padding: 10px; background: #2d2d2d; border-bottom: 1px solid #333; }
  .dot { width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
  .red { background: #ff5f56; } .yellow { background: #ffbd2e; } .green { background: #27c93f; }
  .code-header button { margin-left: auto; background: #27c93f; border: none; border-radius: 4px; color: #fff; font-weight: bold; cursor: pointer; padding: 4px 10px; font-size: 10px; }
  .code-editor { flex: 1; background: transparent; color: #e2e8f0; border: none; resize: none; padding: 15px; outline: none; font-family: inherit; font-size: 13px; line-height: 1.5; }
  .code-output { min-height: 40px; max-height: 150px; overflow-y: auto; background: #000; border-top: 1px solid #333; padding: 10px; color: #4ade80; font-size: 12px; white-space: pre-wrap; }

  /* Draw */
  .content-draw { position: relative; width: 100%; height: 100%; cursor: crosshair; background: white; }
  canvas { display: block; width: 100%; height: 100%; }
  .draw-tools { position: absolute; top: 10px; left: 10px; }
  .draw-tools button { background: white; border: 1px solid #ccc; padding: 5px 10px; border-radius: 6px; font-size: 10px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
</style>
</head>
<body>
  <div id="root">
    <div class="header">${title}</div>
    <div style="flex: 1; display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
       ${renderBlock(root)}
    </div>
  </div>

  <script>
    // --- Interactive Scripts ---

    // 1. Task Toggling
    function toggleTodo(el) {
        const checkbox = el.querySelector('input');
        const span = el.querySelector('span');
        checkbox.checked = !checkbox.checked;
        if(checkbox.checked) span.classList.add('done');
        else span.classList.remove('done');
    }

    // 2. Code Execution
    function runCode(btn) {
        const container = btn.closest('.content-code');
        const editor = container.querySelector('.code-editor');
        const outputDiv = container.querySelector('.code-output');
        const code = editor.value;
        
        outputDiv.innerText = "Running...";
        
        const logs = [];
        const mockConsole = {
            log: (...args) => logs.push(args.join(' ')),
            warn: (...args) => logs.push('WARN: ' + args.join(' ')),
            error: (...args) => logs.push('ERROR: ' + args.join(' '))
        };

        try {
            // We use a Function constructor to create a scope with our mock console
            const fn = new Function('console', code);
            const result = fn(mockConsole);
            
            let output = logs.join('\\n');
            if (result !== undefined) output += (output ? '\\n' : '') + 'Return: ' + result;
            if (!output) output = "Executed successfully.";
            
            outputDiv.innerText = output;
        } catch (e) {
            outputDiv.innerText = 'Error: ' + e.message;
        }
    }

    // 3. Drawing Canvas
    window.onload = function() {
        const canvases = document.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            const container = canvas.parentElement;
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            const ctx = canvas.getContext('2d');
            
            // Load initial data
            const data = canvas.getAttribute('data-initial');
            if(data && data !== 'undefined') {
                const img = new Image();
                img.onload = () => ctx.drawImage(img, 0, 0);
                img.src = data;
            }

            // Simple drawing logic
            let isDrawing = false;
            
            function getPos(e) {
                const rect = canvas.getBoundingClientRect();
                return { x: e.clientX - rect.left, y: e.clientY - rect.top };
            }

            canvas.addEventListener('mousedown', (e) => {
                isDrawing = true;
                ctx.beginPath();
                const pos = getPos(e);
                ctx.moveTo(pos.x, pos.y);
            });

            canvas.addEventListener('mousemove', (e) => {
                if(!isDrawing) return;
                const pos = getPos(e);
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.strokeStyle = '#000';
                ctx.lineTo(pos.x, pos.y);
                ctx.stroke();
            });

            const stop = () => { isDrawing = false; ctx.closePath(); };
            canvas.addEventListener('mouseup', stop);
            canvas.addEventListener('mouseleave', stop);
        });
    };

    function clearCanvas(id) {
        const canvas = document.getElementById(id);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  </script>
</body>
</html>`;
};

// --- Components ---

const TableExportModal = ({ isOpen, onClose, elementRef, rootBlock, projectName }: { isOpen: boolean, onClose: () => void, elementRef: React.RefObject<HTMLElement>, rootBlock: Block, projectName: string }) => {
    const [format, setFormat] = useState<'PNG' | 'PDF' | 'HTML' | 'DOC'>('PNG');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            generatePreview();
        }
    }, [isOpen]);

    const generatePreview = async () => {
        if (!elementRef.current) return;
        setIsLoading(true);
        try {
            // Generate a quick low-res preview, filtering out troublesome tags for preview
            const dataUrl = await htmlToImage.toPng(elementRef.current, { 
                pixelRatio: 0.5, 
                backgroundColor: '#ffffff',
                fontEmbedCSS: '', // Stop fetching external CSS (Fixes CORS Error 1 & 2)
                filter: (node) => {
                    // Filter out external stylesheets that cause CORS errors
                    if (node.tagName === 'LINK' || node.tagName === 'STYLE') return false;
                    return true;
                },
                onClone: (clonedNode: HTMLElement) => {
                    // FIX SCROLLABLE CONTENT: Expand elements to full height
                    const elements = clonedNode.querySelectorAll('*');
                    elements.forEach((el: any) => {
                        // Expand Textareas
                        if (el.tagName === 'TEXTAREA') {
                            el.style.height = 'auto';
                            el.style.height = el.scrollHeight + 'px';
                            el.style.overflow = 'hidden';
                            el.style.resize = 'none';
                        }
                        // Expand specific scroll containers
                        if (
                            el.classList.contains('custom-scrollbar') || 
                            el.classList.contains('overflow-y-auto') ||
                            el.style.overflowY === 'auto' ||
                            el.style.overflow === 'auto'
                        ) {
                            el.style.height = 'auto';
                            el.style.maxHeight = 'none';
                            el.style.overflow = 'visible';
                        }
                    });
                }
            } as any);
            setPreviewUrl(dataUrl);
        } catch (e) {
            console.error("Preview generation failed", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async () => {
        if (!elementRef.current) return;
        setIsLoading(true);
        const fileName = projectName.replace(/\s+/g, '_') || 'Singularity_Block';

        const configOptions = {
            pixelRatio: format === 'PNG' ? 3 : 2,
            backgroundColor: '#ffffff',
            fontEmbedCSS: '', // Stop fetching external CSS
            filter: (node: HTMLElement) => {
                // Filter out external stylesheets/scripts that cause CORS issues
                if (node.tagName === 'LINK') return false; 
                return true;
            },
            onClone: (clonedNode: HTMLElement) => {
                // FIX SCROLLABLE CONTENT: Expand elements to full height
                const elements = clonedNode.querySelectorAll('*');
                elements.forEach((el: any) => {
                    if (el.tagName === 'TEXTAREA') {
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                        el.style.overflow = 'hidden';
                        el.style.resize = 'none';
                    }
                    if (
                        el.classList.contains('custom-scrollbar') || 
                        el.classList.contains('overflow-y-auto') ||
                        el.style.overflowY === 'auto' ||
                        el.style.overflow === 'auto'
                    ) {
                        el.style.height = 'auto';
                        el.style.maxHeight = 'none';
                        el.style.overflow = 'visible';
                    }
                });
            }
        };

        try {
            if (format === 'PNG') {
                const dataUrl = await htmlToImage.toPng(elementRef.current, configOptions as any);
                const link = document.createElement('a');
                link.download = `${fileName}.png`;
                link.href = dataUrl;
                link.click();
            } else if (format === 'PDF') {
                const dataUrl = await htmlToImage.toPng(elementRef.current, configOptions as any);
                const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [elementRef.current.scrollWidth, elementRef.current.scrollHeight] });
                pdf.addImage(dataUrl, 'PNG', 0, 0, elementRef.current.scrollWidth, elementRef.current.scrollHeight);
                pdf.save(`${fileName}.pdf`);
            } else if (format === 'HTML') {
                const html = generateHtmlContent(rootBlock, projectName);
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `${fileName}.html`;
                link.href = url;
                link.click();
            } else if (format === 'DOC') {
                const html = generateHtmlContent(rootBlock, projectName);
                const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `${fileName}.doc`;
                link.href = url;
                link.click();
            }
            onClose();
        } catch (e) {
            console.error("Export failed", e);
            alert("Export failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl border border-white/20 flex overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Left Preview */}
                <div className="flex-1 bg-gray-100 relative flex items-center justify-center p-8 overflow-hidden">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#9ca3af 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    {isLoading && !previewUrl ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-gray-500 font-bold">Rendering Preview...</span>
                        </div>
                    ) : (
                        <div className="relative shadow-xl border border-gray-200 bg-white max-w-full max-h-full overflow-auto custom-scrollbar rounded-lg">
                            <img src={previewUrl || ''} alt="Preview" className="block" />
                        </div>
                    )}
                </div>

                {/* Right Controls */}
                <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
                    <div className="p-6 border-b border-gray-100">
                        <h2 className="text-xl font-display font-black text-gray-800 mb-1">Export Project</h2>
                        <p className="text-sm text-gray-500">Choose your preferred format.</p>
                    </div>
                    
                    <div className="flex-1 p-6 space-y-4">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Format</label>
                        <div className="grid grid-cols-1 gap-3">
                            <button onClick={() => setFormat('PNG')} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${format === 'PNG' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                                <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100"><Icon.Image size={20} /></div>
                                <div className="text-left"><div className="font-bold text-sm">Image (8K)</div><div className="text-[10px] opacity-70">High resolution PNG</div></div>
                            </button>
                            <button onClick={() => setFormat('PDF')} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${format === 'PDF' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                                <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100"><Icon.FileText size={20} /></div>
                                <div className="text-left"><div className="font-bold text-sm">PDF Document</div><div className="text-[10px] opacity-70">Print-ready format</div></div>
                            </button>
                            <button onClick={() => setFormat('HTML')} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${format === 'HTML' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                                <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100"><Icon.Globe size={20} /></div>
                                <div className="text-left"><div className="font-bold text-sm">HTML Webpage</div><div className="text-[10px] opacity-70">Interactive (Play Code, Draw)</div></div>
                            </button>
                            <button onClick={() => setFormat('DOC')} className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${format === 'DOC' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                                <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100"><Icon.AlignLeft size={20} /></div>
                                <div className="text-left"><div className="font-bold text-sm">Word Document</div><div className="text-[10px] opacity-70">Editable text format</div></div>
                            </button>
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-100 bg-gray-50">
                        <button 
                            onClick={handleDownload}
                            disabled={isLoading}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Icon.Navigation className="animate-spin" size={20} /> : <Icon.Download size={20} />}
                            Download {format}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ImageModal = ({ src, onClose }: { src: string, onClose: () => void }) => {
    if (!src) return null;
    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in" onClick={onClose}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2 transition-colors rounded-full hover:bg-white/10" onClick={onClose}>
                <Icon.Close size={32} />
            </button>
            <img src={src} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl pointer-events-auto" onClick={e => e.stopPropagation()} alt="Fullscreen Preview" />
        </div>
    );
};

const DrawingBlock: React.FC<{ 
    initialData?: string, 
    onSave: (data: string) => void,
    blockColor: string,
    isHovered: boolean
}> = ({ initialData, onSave, blockColor, isHovered }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    
    // Local History for Drawing
    const [history, setHistory] = useState<string[]>([]);
    const [historyStep, setHistoryStep] = useState(-1);

    // Tools State
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
    const [color, setColor] = useState('#000000');
    const [lineWidth, setLineWidth] = useState(3);

    // Initialize & Resize
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        
        const handleResize = () => {
             const temp = canvas.toDataURL();
             canvas.width = container.clientWidth;
             canvas.height = container.clientHeight;
             const ctx = canvas.getContext('2d');
             if (ctx) {
                 ctxRef.current = ctx;
                 ctx.lineCap = "round";
                 ctx.lineJoin = "round";
                 ctx.lineWidth = lineWidth;
                 if (tool === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                 } else {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = color;
                 }
                 const img = new Image();
                 img.onload = () => ctx.drawImage(img, 0, 0);
                 img.src = temp;
             }
        };

        // Initial Setup
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctxRef.current = ctx;
            
            // Only load initial data if history is empty (first mount)
            if (initialData && history.length === 0) {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0);
                    const data = canvas.toDataURL();
                    setHistory([data]);
                    setHistoryStep(0);
                };
                img.src = initialData;
            } else if (history.length === 0) {
                const data = canvas.toDataURL();
                setHistory([data]);
                setHistoryStep(0);
            }
        }
        
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Sync with external updates (e.g., Global Undo)
    useEffect(() => {
        // If initialData changes and it DOES NOT match our current history tip, 
        // it means an external change (like global undo) happened.
        if (initialData && history[historyStep] !== initialData && canvasRef.current) {
             const ctx = canvasRef.current.getContext('2d');
             if (ctx) {
                 const img = new Image();
                 img.onload = () => {
                     ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
                     ctx.drawImage(img, 0, 0);
                     // Reset local history to match the new truth from parent
                     const newData = canvasRef.current!.toDataURL();
                     setHistory([newData]);
                     setHistoryStep(0);
                 };
                 img.src = initialData;
             }
        }
    }, [initialData]);

    // Update Context settings
    useEffect(() => {
        if(ctxRef.current) {
            ctxRef.current.lineWidth = lineWidth;
            if (tool === 'eraser') {
                ctxRef.current.globalCompositeOperation = 'destination-out';
            } else {
                ctxRef.current.globalCompositeOperation = 'source-over';
                ctxRef.current.strokeStyle = color;
            }
        }
    }, [tool, color, lineWidth]);

    const getCoords = (e: React.MouseEvent | TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        let clientX = 0;
        let clientY = 0;
        
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDrawing = (e: React.MouseEvent) => {
        const { x, y } = getCoords(e);
        ctxRef.current?.beginPath();
        ctxRef.current?.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent) => {
        if (!isDrawing) return;
        const { x, y } = getCoords(e);
        ctxRef.current?.lineTo(x, y);
        ctxRef.current?.stroke();
    };

    const stopDrawing = () => {
        if (isDrawing) {
            ctxRef.current?.closePath();
            setIsDrawing(false);
            if (canvasRef.current) {
                const data = canvasRef.current.toDataURL();
                const newHistory = history.slice(0, historyStep + 1);
                newHistory.push(data);
                setHistory(newHistory);
                setHistoryStep(newHistory.length - 1);
                onSave(data);
            }
        }
    };

    const handleUndo = () => {
        if (historyStep > 0) {
            const prevStep = historyStep - 1;
            const prevData = history[prevStep];
            setHistoryStep(prevStep);
            loadCanvas(prevData);
            onSave(prevData);
        }
    };

    const handleRedo = () => {
        if (historyStep < history.length - 1) {
            const nextStep = historyStep + 1;
            const nextData = history[nextStep];
            setHistoryStep(nextStep);
            loadCanvas(nextData);
            onSave(nextData);
        }
    };

    const loadCanvas = (dataUrl: string) => {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0);
            img.src = dataUrl;
        }
    };

    const clearCanvas = () => {
        if (canvasRef.current && ctxRef.current) {
            ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            const data = canvasRef.current.toDataURL();
            const newHistory = [...history, data];
            setHistory(newHistory);
            setHistoryStep(newHistory.length - 1);
            onSave(data);
        }
    };

    return (
        <div ref={containerRef} className="w-full h-full relative group">
            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="w-full h-full block cursor-crosshair touch-none"
            />
            
            {/* Drawing Toolbar - Only visible on hover */}
            <div 
                className={`absolute top-4 left-4 flex flex-col gap-2 bg-white/95 backdrop-blur-sm shadow-clay-md border border-gray-200/80 p-2 rounded-xl transition-all duration-300 origin-top-left z-10 ${isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`} 
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="flex gap-1">
                    <button onClick={() => setTool('pen')} className={`p-1.5 rounded-lg transition-colors ${tool === 'pen' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`} title="Pen"><Icon.Pen size={16} /></button>
                    <button onClick={() => setTool('eraser')} className={`p-1.5 rounded-lg transition-colors ${tool === 'eraser' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`} title="Eraser"><Icon.Eraser size={16} /></button>
                </div>
                
                <div className="h-px bg-gray-200 my-1" />
                
                <div className="relative w-6 h-6 rounded-full overflow-hidden border border-gray-300 cursor-pointer shadow-sm hover:scale-110 transition-transform mx-auto">
                    <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setTool('pen'); }} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                    <div className="w-full h-full" style={{ backgroundColor: color }} />
                </div>
                
                <div className="h-px bg-gray-200 my-1" />
                
                <input type="range" min="1" max="20" value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className="w-6 h-20 writing-vertical appearance-none bg-gray-200 rounded-full outline-none cursor-pointer mx-auto" style={{ writingMode: 'vertical-lr', direction: 'rtl' }} title="Brush Size" />
                
                <div className="h-px bg-gray-200 my-1" />
                
                <div className="flex gap-1 justify-center">
                    <button onClick={handleUndo} disabled={historyStep <= 0} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30" title="Undo Draw"><Icon.Undo size={16}/></button>
                    <button onClick={handleRedo} disabled={historyStep >= history.length - 1} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30" title="Redo Draw"><Icon.Redo size={16}/></button>
                </div>
                <button onClick={clearCanvas} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors mt-1" title="Clear Canvas"><Icon.Trash size={16} /></button>
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
  activeDividerId: string | null;
  onBlockClick: (id: string) => void;
  onBlockHover: (id: string | null) => void;
  onDividerClick: (id: string) => void;
  onSplit: (id: string, dir: Direction) => void;
  onUpdate: (id: string, updates: Partial<Block>) => void;
  onResizeStart: (e: React.MouseEvent, parentId: string, index: number, direction: Direction) => void;
  onDelete: (id: string, parentId: string) => void;
  onSwap: (parentId: string, index1: number, index2: number) => void;
  onRotate: (parentId: string) => void;
  onPreviewImage: (src: string) => void;
}> = ({ block, parentId, parentDirection, index, totalSiblings, activeBlockId, activeDividerId, onBlockClick, onBlockHover, onDividerClick, onSplit, onUpdate, onResizeStart, onDelete, onSwap, onRotate, onPreviewImage }) => {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{top: number, left: number} | null>(null);
  
  // Image Dragging State
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const imgDragStartRef = useRef({ x: 0, y: 0 });
  const imgStartPosRef = useRef({ x: 0, y: 0, scale: 1 });
  
  // Hover State specifically for this block instance
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
      const updatePosition = () => {
          if (cellRef.current) {
              const rect = cellRef.current.getBoundingClientRect();
              setToolbarPos({ top: rect.top, left: rect.left + rect.width / 2 });
          }
      };
      if (activeBlockId === block.id || showTypeMenu) {
          updatePosition();
          window.addEventListener('scroll', updatePosition, true);
          window.addEventListener('resize', updatePosition);
      }
      return () => {
          window.removeEventListener('scroll', updatePosition, true);
          window.removeEventListener('resize', updatePosition);
      };
  }, [activeBlockId, block.id, showTypeMenu]);

  const handleImageUpload = (file: File) => {
      if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
              if (e.target?.result) {
                  onUpdate(block.id, { 
                      imageUrl: e.target.result as string,
                      imagePos: { x: 0, y: 0, scale: 1 } 
                  });
              }
          };
          reader.readAsDataURL(file);
      }
  };

  const handleImgMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation(); e.preventDefault();
      if (!block.imageUrl) return;
      setIsDraggingImage(true);
      imgDragStartRef.current = { x: e.clientX, y: e.clientY };
      imgStartPosRef.current = block.imagePos || { x: 0, y: 0, scale: 1 };
  };

  const handleImgMouseMove = (e: React.MouseEvent) => {
      if (!isDraggingImage) return;
      const dx = e.clientX - imgDragStartRef.current.x;
      const dy = e.clientY - imgDragStartRef.current.y;
      onUpdate(block.id, { imagePos: { ...imgStartPosRef.current, x: imgStartPosRef.current.x + dx, y: imgStartPosRef.current.y + dy } });
  };

  const handleImgMouseUp = () => setIsDraggingImage(false);

  // Ref-based non-passive listener for image zoom isolation to prevent browser zoom
  const imgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
      const el = imgRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
          if (!block.imageUrl) return;
          e.preventDefault();
          e.stopPropagation();
          const scaleDelta = -e.deltaY * 0.001;
          const currentScale = block.imagePos?.scale || 1;
          const newScale = Math.max(0.1, Math.min(10, currentScale + scaleDelta));
          onUpdate(block.id, { imagePos: { ...(block.imagePos || { x: 0, y: 0, scale: 1 }), scale: newScale } });
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
  }, [block.imageUrl, block.imagePos, block.id]);


  const handlePaste = (e: React.ClipboardEvent) => {
      if (block.contentType === 'image' || activeBlockId === block.id) {
          const items = e.clipboardData.items;
          for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                  const blob = items[i].getAsFile();
                  if (blob) {
                      onUpdate(block.id, { contentType: 'image' });
                      handleImageUpload(blob);
                  }
              }
          }
      }
  };

  const runCode = () => {
      const code = block.content || '';
      if (!code) return;
      
      let logs: string[] = [];
      const mockConsole = {
          log: (...args: any[]) => logs.push(args.join(' ')),
          warn: (...args: any[]) => logs.push('WARN: ' + args.join(' ')),
          error: (...args: any[]) => logs.push('ERROR: ' + args.join(' '))
      };

      try {
          const fn = new Function('console', code);
          const result = fn(mockConsole);
          
          let output = logs.join('\n');
          if (result !== undefined) output += (output ? '\n' : '') + 'Return: ' + result;
          if (!output) output = "Executed successfully.";
          
          onUpdate(block.id, { codeOutput: output });
      } catch (e: any) {
          onUpdate(block.id, { codeOutput: 'Error: ' + e.message });
      }
  };

  // --- LEAF NODE ---
  if (block.type === 'leaf') {
    const isActive = activeBlockId === block.id;
    const showToolbar = isActive || showTypeMenu;

    return (
      <div 
        ref={cellRef}
        className={`relative flex-1 min-w-0 min-h-0 border-r border-b border-gray-200/80 group transition-all duration-300 ease-out ${isActive ? 'z-30 shadow-lg ring-1 ring-blue-400/50' : 'z-0 hover:bg-gray-50/50'}`}
        style={{ flexGrow: block.weight, backgroundColor: block.color || '#ffffff' }}
        onClick={(e) => { e.stopPropagation(); onBlockClick(block.id); }}
        onMouseEnter={() => { setIsHovered(true); onBlockHover(block.id); }}
        onMouseLeave={() => { setIsHovered(false); onBlockHover(null); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { 
            e.preventDefault(); e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                onUpdate(block.id, { contentType: 'image' });
                handleImageUpload(e.dataTransfer.files[0]);
            }
        }}
        onPaste={handlePaste}
        tabIndex={0} 
      >
        <div className="w-full h-full p-0 relative z-10 outline-none">
            {block.contentType === 'text' && (
                <textarea
                    className="w-full h-full p-4 resize-none outline-none bg-transparent font-medium text-gray-700 leading-relaxed custom-scrollbar placeholder-gray-300"
                    value={block.content || ''}
                    onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                    placeholder="Type notes here..."
                />
            )}

            {block.contentType === 'code' && (
                <div className="w-full h-full p-4 flex flex-col gap-2">
                    <div className="flex-1 font-mono text-sm bg-[#1e1e1e] text-green-400 p-4 rounded-xl overflow-hidden flex flex-col shadow-inner border border-gray-800 relative group/code">
                        <div className="flex items-center justify-between mb-3 opacity-60">
                            <div className="flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); runCode(); }}
                                className="bg-green-600 hover:bg-green-500 text-white text-[10px] px-2 py-1 rounded font-bold transition-colors flex items-center gap-1"
                            >
                                <Icon.Play size={10} fill="currentColor" /> Run
                            </button>
                        </div>
                        <textarea
                            className="w-full h-full resize-none outline-none bg-transparent text-inherit custom-scrollbar"
                            value={block.content || ''}
                            onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                            placeholder="// Enter code..."
                            spellCheck={false}
                        />
                    </div>
                    {block.codeOutput && (
                        <div className="h-24 bg-black text-gray-300 font-mono text-xs p-3 rounded-xl overflow-y-auto border border-gray-800 shadow-sm relative group/output">
                            <button onClick={(e) => {e.stopPropagation(); onUpdate(block.id, { codeOutput: '' })}} className="absolute top-2 right-2 text-gray-500 hover:text-gray-300"><Icon.Close size={12}/></button>
                            <pre className="whitespace-pre-wrap">{block.codeOutput}</pre>
                        </div>
                    )}
                </div>
            )}

            {block.contentType === 'image' && (
                <div ref={imgRef} className="w-full h-full flex flex-col items-center justify-center overflow-hidden relative bg-gray-50/30">
                    {block.imageUrl ? (
                        <div 
                            className="relative w-full h-full group/img overflow-hidden cursor-move"
                            onMouseDown={handleImgMouseDown}
                            onMouseMove={handleImgMouseMove}
                            onMouseUp={handleImgMouseUp}
                            onMouseLeave={handleImgMouseUp}
                        >
                            <img 
                                src={block.imageUrl} 
                                className="absolute top-0 left-0 w-full h-full transition-transform duration-75 ease-linear pointer-events-none select-none shadow-sm" 
                                style={{ 
                                    objectFit: 'contain',
                                    transform: `translate(${block.imagePos?.x || 0}px, ${block.imagePos?.y || 0}px) scale(${block.imagePos?.scale || 1})`,
                                    maxWidth: '100%',
                                    maxHeight: '100%'
                                }}
                                alt="Content" 
                            />
                            
                            {/* Image Controls Overlay */}
                            <div className={`absolute top-2 right-2 flex gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onUpdate(block.id, { imagePos: { x: 0, y: 0, scale: 1 } }); }}
                                    className="bg-black/60 text-white p-1.5 rounded-lg hover:bg-black/80 backdrop-blur-md shadow-sm"
                                    title="Reset Fit"
                                >
                                    <Icon.Minus size={14} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onPreviewImage(block.imageUrl!); }}
                                    className="bg-black/60 text-white p-1.5 rounded-lg hover:bg-black/80 backdrop-blur-md shadow-sm"
                                    title="Fullscreen"
                                >
                                    <Icon.Maximize size={14} />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onUpdate(block.id, { imageUrl: undefined }); }}
                                    className="bg-black/60 text-white p-1.5 rounded-lg hover:bg-red-500/80 backdrop-blur-md shadow-sm"
                                    title="Clear Image"
                                >
                                    <Icon.Close size={14} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4 text-gray-300 transition-all hover:text-gray-400 p-4">
                            <Icon.Image size={48} strokeWidth={1.5} />
                            <div className="flex flex-col items-center gap-2 w-full max-w-[200px]">
                                <label className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg font-bold text-xs cursor-pointer hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm flex items-center gap-2 w-full justify-center">
                                    <Icon.Upload size={14} /> Choose Image
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/*"
                                        onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])}
                                    />
                                </label>
                                <div className="text-[10px] font-medium text-gray-400">or</div>
                                <input 
                                    type="text" 
                                    placeholder="Paste URL..."
                                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-400 text-center text-gray-700"
                                    onKeyDown={(e) => {
                                        if(e.key === 'Enter') {
                                            onUpdate(block.id, { imageUrl: (e.target as HTMLInputElement).value, imagePos: {x:0, y:0, scale:1} });
                                        }
                                    }}
                                    onClick={e => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {block.contentType === 'draw' && (
                <div className="w-full h-full relative overflow-hidden">
                    <DrawingBlock 
                        initialData={block.drawingData} 
                        onSave={(data) => onUpdate(block.id, { drawingData: data })}
                        blockColor={block.color || '#ffffff'}
                        isHovered={isHovered}
                    />
                </div>
            )}

            {block.contentType === 'todo' && (
                <div className="w-full h-full p-6 overflow-y-auto custom-scrollbar">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Icon.Task size={12} /> Task List
                    </h3>
                    <div className="space-y-1">
                        {block.todoItems?.map((item, idx) => (
                            <div key={item.id} className="flex items-center gap-3 group/item py-1">
                                <input 
                                    type="checkbox" 
                                    checked={item.done}
                                    onChange={() => {
                                        const newItems = [...(block.todoItems || [])];
                                        newItems[idx].done = !newItems[idx].done;
                                        onUpdate(block.id, { todoItems: newItems });
                                    }}
                                    className="accent-blue-500 w-4 h-4 cursor-pointer rounded-md"
                                />
                                <input 
                                    type="text"
                                    value={item.text}
                                    onChange={(e) => {
                                        const newItems = [...(block.todoItems || [])];
                                        newItems[idx].text = e.target.value;
                                        onUpdate(block.id, { todoItems: newItems });
                                    }}
                                    className={`flex-1 bg-transparent outline-none text-sm border-b border-transparent focus:border-gray-200 transition-colors ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}
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
                    </div>
                    <button 
                        onClick={() => {
                            const newItems = [...(block.todoItems || []), { id: generateId(), text: '', done: false }];
                            onUpdate(block.id, { todoItems: newItems });
                        }}
                        className="text-xs text-blue-600 font-bold flex items-center gap-1 hover:bg-blue-50 px-2 py-1.5 rounded-lg mt-3 transition-colors"
                    >
                        <Icon.Plus size={12} /> New Task
                    </button>
                </div>
            )}
        </div>
        
        {/* --- FLOATING TOOLBAR (PORTAL) --- */}
        {showToolbar && toolbarPos && createPortal(
            <>
            {/* Backdrop for 2-step dismissal when menu is open */}
            {showTypeMenu && (
                <div 
                    className="fixed inset-0 z-[100]" 
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        setShowTypeMenu(false); // Step 1: Close Menu, Keep Block Active
                    }}
                />
            )}
            
            <div 
                className="fixed z-[101] flex flex-col items-center animate-pop origin-bottom"
                style={{ top: toolbarPos.top - 12, left: toolbarPos.left, transform: 'translate(-50%, -100%)' }}
                onMouseDown={(e) => e.stopPropagation()} 
            >
               <div className="flex items-center gap-1 bg-white/95 backdrop-blur-xl shadow-clay-lg border border-gray-200/80 rounded-2xl p-1.5 select-none transition-all">
                   <div className="relative">
                       <button onClick={() => setShowTypeMenu(!showTypeMenu)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 hover:text-gray-900 transition-colors" title="Change Content Type">
                           {block.contentType === 'text' && <Icon.AlignLeft size={18} />}
                           {block.contentType === 'image' && <Icon.Image size={18} />}
                           {block.contentType === 'todo' && <Icon.Task size={18} />}
                           {block.contentType === 'code' && <Icon.Code size={18} />}
                           {block.contentType === 'draw' && <Icon.Pen size={18} />}
                       </button>
                       {showTypeMenu && (
                           <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 shadow-xl rounded-xl overflow-hidden flex flex-col min-w-[160px] z-[110] animate-pop p-1">
                               {['text', 'todo', 'image', 'code', 'draw'].map((t) => (
                                   <button key={t} onClick={() => { onUpdate(block.id, { contentType: t as ContentType }); setShowTypeMenu(false); }} className={`px-3 py-2.5 text-xs font-bold text-left hover:bg-gray-50 rounded-lg capitalize flex items-center gap-3 transition-colors ${block.contentType === t ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}>
                                       {t === 'text' && <Icon.AlignLeft size={16} />}
                                       {t === 'todo' && <Icon.Task size={16} />}
                                       {t === 'image' && <Icon.Image size={16} />}
                                       {t === 'code' && <Icon.Code size={16} />}
                                       {t === 'draw' && <Icon.Pen size={16} />}
                                       {t}
                                   </button>
                               ))}
                           </div>
                       )}
                   </div>
                   <div className="w-px h-5 bg-gray-200 mx-1" />
                   <div className="flex items-center gap-1.5 px-1">
                       {COLORS.slice(0, 4).map(c => (
                           <button key={c} onClick={() => onUpdate(block.id, { color: c })} className={`w-5 h-5 rounded-full border border-black/5 hover:scale-110 transition-transform ${block.color === c ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`} style={{ backgroundColor: c }} />
                       ))}
                       <div className="relative w-5 h-5 rounded-full overflow-hidden border border-gray-200 hover:scale-110 transition-transform cursor-pointer bg-gradient-to-br from-pink-100 to-blue-100">
                           <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={block.color || '#ffffff'} onChange={(e) => onUpdate(block.id, { color: e.target.value })} />
                       </div>
                   </div>
                   <div className="w-px h-5 bg-gray-200 mx-1" />
                   <button onClick={() => onSplit(block.id, 'col')} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-blue-600 transition-colors" title="Split Vertical"><Icon.Layout size={18} className="rotate-90"/></button>
                   <button onClick={() => onSplit(block.id, 'row')} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-blue-600 transition-colors" title="Split Horizontal"><Icon.Layout size={18}/></button>
                   <div className="w-px h-5 bg-gray-200 mx-1" />
                   <button onClick={() => parentId && onDelete(block.id, parentId)} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-xl transition-colors" title="Delete Block"><Icon.Trash size={18}/></button>
               </div>
               <div className="w-3 h-3 bg-white border-r border-b border-gray-200/80 transform rotate-45 -mt-1.5 z-0"></div>
            </div>
            </>,
            document.body
        )}
      </div>
    );
  }

  // --- CONTAINER NODE ---
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
                relative z-40 flex-shrink-0 bg-gray-200/80 hover:bg-blue-500 transition-colors group/divider select-none
                ${isRow ? 'w-1 cursor-col-resize h-auto' : 'h-1 cursor-row-resize w-auto'}
                flex items-center justify-center
              `}
              onMouseDown={(e) => onResizeStart(e, block.id, i - 1, block.direction!)}
              onClick={(e) => { e.stopPropagation(); onDividerClick(`${block.id}-${i}`); }}
            >
               <div className={`absolute ${isRow ? '-left-3 -right-3 h-full' : '-top-3 -bottom-3 w-full'} z-40`} />
               <div 
                  className={`
                    absolute z-50 flex items-center gap-1 p-1 bg-white border border-gray-200 shadow-lg rounded-full
                    transition-all duration-200
                    ${activeDividerId === `${block.id}-${i}` ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover/divider:opacity-100 group-hover/divider:scale-100'}
                    ${isRow ? 'flex-col top-1/2 -translate-y-1/2' : 'flex-row left-1/2 -translate-x-1/2'}
                  `}
                  onMouseDown={(e) => e.stopPropagation()} 
               >
                  <button onClick={(e) => { e.stopPropagation(); onSwap(block.id, i - 1, i); }} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 hover:text-blue-600 transition-colors" title="Swap"><Icon.Move size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); onRotate(block.id); }} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 hover:text-purple-600 transition-colors" title="Rotate Axis"><Icon.Redo size={14} /></button>
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
            activeDividerId={activeDividerId}
            onBlockClick={onBlockClick}
            onBlockHover={onBlockHover}
            onDividerClick={onDividerClick}
            onSplit={onSplit} 
            onUpdate={onUpdate} 
            onResizeStart={onResizeStart}
            onDelete={onDelete}
            onSwap={onSwap}
            onRotate={onRotate}
            onPreviewImage={onPreviewImage}
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
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [activeDividerId, setActiveDividerId] = useState<string | null>(null);
  
  // Fullscreen Image Preview State
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Undo/Redo History
  const [history, setHistory] = useState<Block[]>([]); // Global Layout History
  const [future, setFuture] = useState<Block[]>([]);   // Global Layout Redo
  
  // Per-Block History (Content Changes)
  // Maps blockId -> { past: BlockState[], future: BlockState[] }
  const blockHistories = useRef<Record<string, { past: Partial<Block>[], future: Partial<Block>[] }>>({});

  // UI State
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string, name: string} | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [tempProjectName, setTempProjectName] = useState('');
  
  // Export Modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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

  // Save State Function
  const saveState = (newRoot: Block) => {
      setRoot(newRoot);
      if (currentProjectId) {
          localStorage.setItem(`singularity-block-${currentProjectId}`, JSON.stringify(newRoot));
          setProjects(prev => {
              const next = prev.map(p => p.id === currentProjectId ? { ...p, lastModified: Date.now() } : p);
              localStorage.setItem('singularity-block-projects', JSON.stringify(next));
              return next;
          });
      }
  };

  const pushGlobalState = (newRoot: Block) => {
      setHistory(prev => [...prev.slice(-49), root]); 
      setFuture([]); 
      saveState(newRoot);
  };

  const handleGlobalUndo = () => {
      if (history.length === 0) return;
      const previous = history[history.length - 1];
      const newHistory = history.slice(0, -1);
      setFuture(prev => [root, ...prev]);
      setHistory(newHistory);
      saveState(previous);
  };

  const handleGlobalRedo = () => {
      if (future.length === 0) return;
      const next = future[0];
      const newFuture = future.slice(1);
      setHistory(prev => [...prev, root]);
      setFuture(newFuture);
      saveState(next);
  };

  // --- Scoped Undo Logic ---
  const handleScopedUndo = () => {
      if (hoveredBlockId && blockHistories.current[hoveredBlockId]?.past.length > 0) {
          const historyStack = blockHistories.current[hoveredBlockId];
          const prevEntry = historyStack.past.pop();
          if (prevEntry) {
              // Push current state to future for Redo
              const currentNode = findNode(root, hoveredBlockId);
              if (currentNode) {
                  const futureEntry: Partial<Block> = {};
                  (Object.keys(prevEntry) as Array<keyof Block>).forEach(key => {
                      (futureEntry as any)[key] = currentNode[key];
                  });
                  historyStack.future.push(futureEntry);
                  
                  // Apply Undo
                  const clone = JSON.parse(JSON.stringify(root));
                  const applyUndoRecursive = (node: Block) => {
                      if (node.id === hoveredBlockId) { Object.assign(node, prevEntry); return; }
                      node.children?.forEach(applyUndoRecursive);
                  };
                  applyUndoRecursive(clone);
                  saveState(clone); // Persist without pushing to global stack
              }
          }
      } else {
          // If not hovering a block with history, fallback to Global Undo
          handleGlobalUndo();
      }
  };

  const handleScopedRedo = () => {
      if (hoveredBlockId && blockHistories.current[hoveredBlockId]?.future.length > 0) {
          const historyStack = blockHistories.current[hoveredBlockId];
          const nextEntry = historyStack.future.pop();
          if (nextEntry) {
              // Push current back to past
              const currentNode = findNode(root, hoveredBlockId);
              if (currentNode) {
                  const pastEntry: Partial<Block> = {};
                  (Object.keys(nextEntry) as Array<keyof Block>).forEach(key => {
                      (pastEntry as any)[key] = currentNode[key];
                  });
                  historyStack.past.push(pastEntry);

                  // Apply Redo
                  const clone = JSON.parse(JSON.stringify(root));
                  const applyRedoRecursive = (node: Block) => {
                      if (node.id === hoveredBlockId) { Object.assign(node, nextEntry); return; }
                      node.children?.forEach(applyRedoRecursive);
                  };
                  applyRedoRecursive(clone);
                  saveState(clone);
              }
          }
      } else {
          handleGlobalRedo();
      }
  };

  // --- Project Actions ---
  const createProject = () => {
      const id = generateId();
      const newProject: ProjectMetadata = { id, name: 'Untitled Project', lastModified: Date.now() };
      const newRoot: Block = { ...DEFAULT_BLOCK, id: generateId() };
      const newProjects = [newProject, ...projects];
      setProjects(newProjects);
      localStorage.setItem('singularity-block-projects', JSON.stringify(newProjects));
      localStorage.setItem(`singularity-block-${id}`, JSON.stringify(newRoot));
      setCurrentProjectId(id);
      setRoot(newRoot);
      setHistory([]);
      setFuture([]);
      blockHistories.current = {};
  };

  const loadProject = (id: string) => {
      const stored = localStorage.getItem(`singularity-block-${id}`);
      if (stored) {
          setCurrentProjectId(id);
          setRoot(JSON.parse(stored));
          setHistory([]);
          setFuture([]);
          blockHistories.current = {};
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
    pushGlobalState(clone); // Structure Change -> Global History
  };

  const handleUpdate = (id: string, updates: Partial<Block>) => {
    // 1. Capture State for Local History BEFORE update
    const currentNode = findNode(root, id);
    if (currentNode) {
        if (!blockHistories.current[id]) blockHistories.current[id] = { past: [], future: [] };
        
        // Store only the fields being updated
        const historyEntry: Partial<Block> = {};
        (Object.keys(updates) as Array<keyof Block>).forEach(key => {
            (historyEntry as any)[key] = currentNode[key];
        });
        
        blockHistories.current[id].past.push(historyEntry);
        blockHistories.current[id].future = []; // Clear redo stack on new action
    }

    // 2. Apply Update
    const clone = JSON.parse(JSON.stringify(root));
    const updateRecursive = (node: Block) => {
      if (node.id === id) { Object.assign(node, updates); return; }
      node.children?.forEach(updateRecursive);
    };
    updateRecursive(clone);
    saveState(clone); // Content Change -> Local History + Save (No Global Push)
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
                      Object.assign(node, survivor);
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
      pushGlobalState(clone); // Structure Change
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
      pushGlobalState(clone); // Structure Change
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
      pushGlobalState(clone); // Structure Change
  };

  const handleResizeStart = (e: React.MouseEvent, parentId: string, index: number, direction: Direction) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDividerId(null);
    const resizerEl = e.currentTarget;
    const containerEl = resizerEl.parentElement; 
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const size = direction === 'row' ? rect.width : rect.height;
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
    dragInfo.current = { parentId, index, direction, startPos: direction === 'row' ? e.clientX : e.clientY, startWeights: weights, containerSize: size };
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
    const sumWeights = startWeights[0] + startWeights[1]; 
    const deltaWeight = (deltaPixels / containerSize) * sumWeights;
    const newW1 = Math.max(0.05, startWeights[0] + deltaWeight);
    const newW2 = Math.max(0.05, startWeights[1] - deltaWeight);
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
        pushGlobalState(rootRef.current);
    }
    dragInfo.current = null;
    document.body.style.cursor = ''; 
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, []);

  const handleCanvasClick = () => {
      setActiveBlockId(null);
      setActiveDividerId(null);
  };

  // Keyboard Shortcuts (Undo/Redo)
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // If focusing text input, let browser handle it
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) {
              return;
          }

          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              e.preventDefault();
              handleScopedUndo(); // Call scoped undo logic
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
              e.preventDefault();
              handleScopedRedo(); // Call scoped redo logic
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, future, root, hoveredBlockId]); // Depend on hoveredBlockId

  return (
    <div className="flex h-screen w-full bg-[#f0f4f8] font-sans overflow-hidden">
      
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-white border-r border-gray-200 transition-all duration-300 flex flex-col shrink-0 overflow-hidden relative z-20 shadow-xl`}>
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="font-bold text-gray-700 flex items-center gap-2 text-sm uppercase tracking-wider"><Icon.Grid size={16} className="text-teal-500"/> Projects</h2>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon.ChevronsLeft size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
              <button onClick={createProject} className="m-3 w-[calc(100%-24px)] py-2 bg-teal-600 text-white rounded-lg font-bold text-xs shadow-md hover:bg-teal-700 flex items-center justify-center gap-2 transition-all"><Icon.Plus size={14} /> New Block Project</button>
              <div className="space-y-1 p-2">
                  {projects.map(p => (
                      <div key={p.id} className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${currentProjectId === p.id ? 'bg-teal-50 border border-teal-200' : 'hover:bg-gray-100 border border-transparent'}`} onClick={() => loadProject(p.id)}>
                          {editingProjectId === p.id ? (
                              <input autoFocus value={tempProjectName} onChange={(e) => setTempProjectName(e.target.value)} onBlur={saveProjectName} onKeyDown={(e) => e.key === 'Enter' && saveProjectName()} className="bg-white border border-teal-300 rounded px-1 py-0.5 text-xs w-full" onClick={(e) => e.stopPropagation()} />
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

      <div className="flex-1 flex flex-col min-w-0">
          <div className="h-14 bg-white/90 backdrop-blur-sm border-b border-gray-200 flex items-center justify-between px-4 shrink-0 shadow-sm z-30">
            <div className="flex items-center gap-4">
                {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><Icon.PanelLeft size={20} /></button>}
                <div className="flex items-center gap-2 text-gray-400">
                    <button onClick={onBack} className="hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Icon.Arrow size={20} className="rotate-180"/></button>
                    <span className="w-px h-4 bg-gray-300 mx-1"></span>
                    <h1 className="font-display font-bold text-lg text-gray-800 truncate">{projects.find(p => p.id === currentProjectId)?.name}</h1>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={handleGlobalUndo} disabled={history.length === 0} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 disabled:opacity-30 transition-colors" title="Global Undo (Ctrl+Z)"><Icon.Undo size={18} /></button>
                <button onClick={handleGlobalRedo} disabled={future.length === 0} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 disabled:opacity-30 transition-colors" title="Global Redo (Ctrl+Y)"><Icon.Redo size={18} /></button>
                <div className="w-px h-6 bg-gray-200 mx-2"></div>
                <button onClick={() => { if(confirm("Clear everything?")) { const fresh = {...DEFAULT_BLOCK, id: generateId()}; setRoot(fresh); pushGlobalState(fresh); }}} className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100">Reset Canvas</button>
                <button 
                    onClick={() => setIsExportModalOpen(true)}
                    className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg font-bold text-xs px-4 flex items-center gap-2 border border-indigo-200 shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                    <Icon.Download size={14}/> Export
                </button>
            </div>
          </div>

          <div className="flex-1 p-8 overflow-hidden flex flex-col relative bg-[#f8f9fa]" onClick={handleCanvasClick}>
             <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} />
             <div ref={containerRef} className="flex-1 bg-white border border-gray-300/80 shadow-2xl rounded-2xl overflow-visible flex flex-col relative ring-1 ring-black/5 mt-4 mb-4 mx-4 transition-all duration-500 ease-in-out" onClick={(e) => e.stopPropagation()}>
                <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-gray-50 to-white border-b border-gray-100 flex items-center px-4 rounded-t-2xl" onClick={handleCanvasClick}>
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400/80 border border-red-500/20" />
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80 border border-amber-500/20" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400/80 border border-green-500/20" />
                    </div>
                </div>
                <div className="flex-1 mt-8 flex flex-col">
                    <BlockRenderer 
                        block={root} 
                        parentId={null} 
                        parentDirection={null}
                        index={0} 
                        totalSiblings={0}
                        activeBlockId={activeBlockId}
                        activeDividerId={activeDividerId}
                        onBlockClick={setActiveBlockId}
                        onBlockHover={setHoveredBlockId}
                        onDividerClick={setActiveDividerId}
                        onSplit={handleSplit}
                        onUpdate={handleUpdate}
                        onResizeStart={handleResizeStart}
                        onDelete={handleDelete}
                        onSwap={handleSwap}
                        onRotate={handleRotate}
                        onPreviewImage={setFullscreenImage}
                    />
                </div>
             </div>
          </div>
      </div>

      <ImageModal src={fullscreenImage || ''} onClose={() => setFullscreenImage(null)} />
      
      <TableExportModal 
          isOpen={isExportModalOpen} 
          onClose={() => setIsExportModalOpen(false)} 
          elementRef={containerRef}
          rootBlock={root}
          projectName={projects.find(p => p.id === currentProjectId)?.name || 'Project'}
      />

      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-white/20" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4 text-red-600">
                    <div className="p-3 bg-red-50 rounded-xl"><Icon.Trash size={24} /></div>
                    <h3 className="text-xl font-bold text-gray-900">Delete Project?</h3>
                </div>
                <p className="text-sm text-gray-600 mb-6 leading-relaxed">This action cannot be undone. To confirm, type <b>DELETE</b> below.</p>
                <input className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-red-500 mb-6 transition-all" placeholder="Type DELETE" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} autoFocus />
                <div className="flex gap-3">
                    <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors">Cancel</button>
                    <button onClick={deleteProject} disabled={deleteInput !== 'DELETE'} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">Delete</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
