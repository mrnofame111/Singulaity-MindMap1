
import { SingularityNode, EdgeOptions, ExportConfig } from '../types';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';

// --- MIND MAP HELPERS ---

/**
 * Calculates the bounding box of the entire map content.
 * Adds padding to ensure nothing is cut off.
 */
export const getMapBoundingBox = (nodes: SingularityNode[], padding: number = 100) => {
    if (nodes.length === 0) return { x: 0, y: 0, width: 800, height: 600 };

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach(node => {
        // Approximate visual size if not tracked explicitly (e.g. 200x100 for standard nodes)
        const width = node.type === 'ROOT' ? 300 : 250;
        const height = 200; 
        
        // Check node center + half dimensions
        minX = Math.min(minX, node.position.x - width / 2);
        minY = Math.min(minY, node.position.y - height / 2);
        maxX = Math.max(maxX, node.position.x + width / 2);
        maxY = Math.max(maxY, node.position.y + height / 2);
    });

    return {
        x: minX - padding,
        y: minY - padding,
        width: (maxX - minX) + (padding * 2),
        height: (maxY - minY) + (padding * 2)
    };
};

// --- NOTEPAD HELPERS ---

/**
 * Calculates bounding box for Notepad content (Notes + Annotations + Background)
 */
export const getNotepadBoundingBox = (
    stickyNotes: any[], 
    annotations: any[], 
    contentDimensions: { width: number, height: number } | null,
    canvasCenter: number,
    padding: number = 100
) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // 1. Background Content (PDF/Image)
    if (contentDimensions) {
        const halfW = contentDimensions.width / 2;
        const halfH = contentDimensions.height / 2;
        minX = Math.min(minX, canvasCenter - halfW);
        minY = Math.min(minY, canvasCenter - halfH);
        maxX = Math.max(maxX, canvasCenter + halfW);
        maxY = Math.max(maxY, canvasCenter + halfH);
    }

    // 2. Sticky Notes
    if (stickyNotes && stickyNotes.length > 0) {
        stickyNotes.forEach(note => {
            const width = note.minimized ? 40 : (note.contentType === 'image' || note.contentType === 'table' || note.contentType === 'drawing' ? 300 : 220);
            const height = note.minimized ? 40 : (note.contentType === 'image' || note.contentType === 'drawing' ? 200 : 150);
            
            minX = Math.min(minX, note.x);
            minY = Math.min(minY, note.y);
            maxX = Math.max(maxX, note.x + width);
            maxY = Math.max(maxY, note.y + height);
        });
    }

    // 3. Annotations
    if (annotations && annotations.length > 0) {
        annotations.forEach(ann => {
            if (ann.points) {
                ann.points.forEach((p: any) => {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                });
            }
        });
    }

    // Default if empty or invalid calculation
    if (minX === Infinity || maxX === -Infinity) {
        minX = canvasCenter - 400;
        minY = canvasCenter - 300;
        maxX = canvasCenter + 400;
        maxY = canvasCenter + 300;
    }

    return {
        x: minX - padding,
        y: minY - padding,
        width: (maxX - minX) + (padding * 2),
        height: (maxY - minY) + (padding * 2)
    };
};

/**
 * Generates an image Blob or Data URL from any element with smart bounding box.
 */
export const generateSmartImage = async (
    elementOrId: string | HTMLElement,
    bounds: { x: number, y: number, width: number, height: number },
    exportConfig: ExportConfig,
    format: 'PNG' | 'JPEG' | 'SVG',
    pixelRatio: number = 2,
    excludeClasses: string[] = [] // New parameter to exclude elements by class
): Promise<string | null> => {
    let element: HTMLElement | null = typeof elementOrId === 'string' 
        ? document.getElementById(elementOrId) 
        : elementOrId;

    if (!element) {
        console.error("Export element not found");
        return null;
    }

    // FIX FOR NOTEPAD EXPORT:
    // If targeting the inner content layer of Notepad, automatically switch to the root container (Grandparent).
    // This ensures Sticky Notes (siblings of the content wrapper) are included and coordinates match the 
    // world space (8000x8000) used in getNotepadBoundingBox.
    if (element.id === 'notepad-content-layer') {
        const rootContainer = element.parentElement?.parentElement;
        if (rootContainer) {
            console.log("Redirecting export target to Notepad Root Container for correct bounding box alignment.");
            element = rootContainer as HTMLElement;
        }
    }

    const backgroundStyle = exportConfig.backgroundStyle || '#ffffff';

    const config = {
        width: bounds.width,
        height: bounds.height,
        style: {
            // CRITICAL: Translate the world-space view to the bounding box origin (0,0)
            transform: `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)`,
            transformOrigin: 'top left',
            width: `${bounds.width}px`,
            height: `${bounds.height}px`,
            background: backgroundStyle,
        },
        pixelRatio: pixelRatio,
        backgroundColor: backgroundStyle.startsWith('#') || backgroundStyle.startsWith('rgb') ? backgroundStyle : undefined,
        skipAutoScale: true,
        // CRITICAL FIX: Empty string prevents html-to-image from fetching remote CSS (Google Fonts) which causes CORS errors
        fontEmbedCSS: '', 
        filter: (node: HTMLElement) => {
            // Filter out external stylesheets/scripts that cause CORS issues during cloning
            if (node.tagName === 'LINK') return false; 
            if (node.tagName === 'SCRIPT') return false;
            
            if (node.classList && excludeClasses.some(cls => node.classList.contains(cls))) {
                return false;
            }
            return !node.className?.toString().includes('no-export');
        },
        onClone: (clonedNode: HTMLElement) => {
            // FIX: Expand Scrollable Elements in the clone so full content renders
            const elements = clonedNode.querySelectorAll('*');
            elements.forEach((el: any) => {
                // 1. Textareas: Set height to scrollHeight
                if (el.tagName === 'TEXTAREA') {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                    el.style.overflow = 'hidden'; 
                    el.style.resize = 'none';
                }
                
                // 2. Generic Scrollables: Check for scroll classes or styles
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

            // Append Watermark if requested
            if (exportConfig.showTitle) {
                const watermark = document.createElement('div');
                watermark.style.position = 'absolute';
                watermark.style.bottom = '20px';
                watermark.style.right = '20px';
                watermark.style.padding = '8px 16px';
                watermark.style.background = 'rgba(255,255,255,0.8)';
                watermark.style.borderRadius = '20px';
                watermark.style.backdropFilter = 'blur(4px)';
                watermark.style.fontFamily = 'sans-serif';
                watermark.style.fontSize = '12px';
                watermark.style.fontWeight = 'bold';
                watermark.style.color = '#333';
                watermark.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
                watermark.innerText = exportConfig.projectName || 'Singularity MindMap';
                clonedNode.appendChild(watermark);
            }
        }
    };

    try {
        if (format === 'SVG') return await htmlToImage.toSvg(element, config);
        if (format === 'JPEG') return await htmlToImage.toJpeg(element, config);
        return await htmlToImage.toPng(element, config);
    } catch (err) {
        console.error('Image Gen Failed:', err);
        return null;
    }
};

// Legacy Wrapper for MindMaps
export const generateMapImage = async (
    nodes: SingularityNode[], 
    format: 'PNG' | 'JPEG' | 'SVG', 
    elementId: string,
    exportConfig: ExportConfig,
    pixelRatio: number = 1
): Promise<string | null> => {
    const bounds = getMapBoundingBox(nodes, exportConfig.padding);
    return generateSmartImage(elementId, bounds, exportConfig, format, pixelRatio);
};

// --- UNIVERSAL EXPORTERS ---

export const exportToPDF = async (
    imageDataUrl: string, 
    width: number, 
    height: number, 
    filename: string
) => {
    // Determine orientation based on aspect ratio
    const orientation = width > height ? 'l' : 'p';
    
    // Initialize jsPDF
    // @ts-ignore
    const pdf = new jsPDF({
        orientation: orientation,
        unit: 'px',
        format: [width, height] 
    });

    // Add Image fitting the page
    pdf.addImage(imageDataUrl, 'PNG', 0, 0, width, height);
    pdf.save(`${filename}.pdf`);
};

export const exportSmartImage = async (
    nodes: SingularityNode[], 
    projectName: string, 
    format: 'PNG' | 'JPEG' | 'SVG' | 'PDF', 
    elementId: string,
    exportConfig: ExportConfig
) => {
    const bounds = getMapBoundingBox(nodes, exportConfig.padding);
    
    // For PDF, we generate a high-res PNG first
    const genFormat = format === 'PDF' ? 'PNG' : format;
    const pixelRatio = format === 'SVG' ? 1 : 2;

    const dataUrl = await generateSmartImage(elementId, bounds, exportConfig, genFormat, pixelRatio);

    if (dataUrl) {
        if (format === 'PDF') {
            exportToPDF(dataUrl, bounds.width, bounds.height, projectName.replace(/\s+/g, '_'));
        } else {
            const link = document.createElement('a');
            link.download = `${projectName.replace(/\s+/g, '_')}.${format.toLowerCase()}`;
            link.href = dataUrl;
            link.click();
        }
    } else {
        alert("Export failed.");
    }
};

/**
 * Generates a truly interactive Notepad HTML file.
 * Preserves voice notes as <audio> tags and other notes as DOM elements.
 */
export const generateInteractiveNotepadHTML = (
    stickyNotes: any[],
    backgroundDataUrl: string, // Snapshot of the canvas (PDF+Drawings) WITHOUT notes
    bounds: { x: number, y: number, width: number, height: number },
    projectName: string
) => {
    // We construct the HTML string manually to ensure full interactivity
    
    const notesHtml = stickyNotes.map(note => {
        // Adjust coordinates relative to the export bounds
        const relX = note.x - bounds.x;
        const relY = note.y - bounds.y;
        const width = note.minimized ? 40 : (note.contentType === 'image' || note.contentType === 'table' || note.contentType === 'drawing' ? 300 : 220);
        const height = note.minimized ? 40 : 'auto';
        
        let contentHtml = '';
        
        if (note.minimized) {
            contentHtml = `<div class="minimized-dot"></div>`;
        } else if (note.contentType === 'image') {
            contentHtml = `<img src="${note.mediaUrl}" class="note-image" />`;
        } else if (note.contentType === 'audio') {
            contentHtml = `
                <div class="audio-player">
                    <span class="audio-label">Voice Note</span>
                    <audio controls src="${note.mediaUrl}"></audio>
                </div>
            `;
        } else if (note.contentType === 'drawing') {
             contentHtml = `<img src="${note.mediaUrl}" class="note-drawing" />`;
        } else if (note.contentType === 'table' && note.tableData) {
             const rows = note.tableData.map((row: string[]) => 
                 `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
             ).join('');
             contentHtml = `<table class="note-table">${rows}</table>`;
        } else {
             // Text
             contentHtml = `<div class="note-text">${note.text || ''}</div>`;
        }

        return `
            <div class="sticky-note" style="left: ${relX}px; top: ${relY}px; width: ${width}px; background-color: ${note.color};">
                ${contentHtml}
            </div>
        `;
    }).join('\n');

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName}</title>
    <style>
        body { margin: 0; background-color: #f0f4f8; display: flex; justify-content: center; padding: 40px; font-family: sans-serif; }
        .canvas-container {
            position: relative;
            background-color: white;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            overflow: hidden;
            width: ${bounds.width}px;
            height: ${bounds.height}px;
        }
        .background-layer {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
        }
        .sticky-note {
            position: absolute;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 2px 4px 12px rgba(0,0,0,0.15);
            z-index: 10;
            font-size: 14px;
            color: #333;
            box-sizing: border-box;
            border: 1px solid rgba(0,0,0,0.05);
            transition: transform 0.2s;
        }
        .sticky-note:hover {
            transform: scale(1.02);
            z-index: 20;
            box-shadow: 4px 8px 20px rgba(0,0,0,0.2);
        }
        .note-text {
            white-space: pre-wrap;
            line-height: 1.5;
        }
        .note-image, .note-drawing {
            width: 100%;
            height: auto;
            display: block;
            border-radius: 4px;
        }
        .audio-player {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
        }
        .audio-label {
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            color: #666;
        }
        audio {
            width: 100%;
            height: 30px;
        }
        .note-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        .note-table td {
            border: 1px solid #ccc;
            padding: 4px;
            background: white;
        }
        .minimized-dot {
            width: 20px;
            height: 20px;
            background: rgba(0,0,0,0.2);
            border-radius: 50%;
            margin: auto;
        }
    </style>
</head>
<body>
    <div class="canvas-container">
        <img src="${backgroundDataUrl}" class="background-layer" />
        ${notesHtml}
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${projectName.replace(/\s+/g, '_')}_interactive.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// ... existing helpers ...
export const generateInteractiveHTML = (
    nodes: SingularityNode[], 
    edgeData: Record<string, EdgeOptions>, 
    projectName: string,
    theme: any
) => {
    const safeData = JSON.stringify({ nodes, edgeData, theme }).replace(/<\/script>/g, '<\\/script>');

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName} - Interactive View</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Fredoka:wght@400;600&display=swap" rel="stylesheet">
    <style>
        body { margin: 0; overflow: hidden; background-color: ${theme.bg}; font-family: 'Nunito', sans-serif; }
        #canvas-container { width: 100vw; height: 100vh; cursor: grab; touch-action: none; }
        #canvas-container.grabbing { cursor: grabbing; }
        #canvas-content { transform-origin: 0 0; position: absolute; top: 0; left: 0; will-change: transform; }
        .node { position: absolute; transform: translate(-50%, -50%); transition: all 0.3s ease; box-shadow: 5px 5px 15px rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .node:hover { z-index: 50; transform: translate(-50%, -50%) scale(1.05); }
        .edge-path { fill: none; stroke-linecap: round; stroke-linejoin: round; transition: opacity 0.3s; }
        .toggle-btn { position: absolute; right: -12px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; background: white; border-radius: 50%; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 10px; z-index: 60; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .toggle-btn:hover { background: #eee; }
        .shape-circle { border-radius: 50%; aspect-ratio: 1/1; }
        .shape-rounded { border-radius: 2rem; }
        .shape-rectangle { border-radius: 0.5rem; }
        .shape-diamond { transform: translate(-50%, -50%) rotate(45deg); }
        .shape-diamond > div { transform: rotate(-45deg); }
    </style>
</head>
<body>
    <div id="canvas-container">
        <div id="canvas-content">
            <svg id="edges-layer" style="position: absolute; top: -50000px; left: -50000px; width: 100000px; height: 100000px; overflow: visible; pointer-events: none;"></svg>
            <div id="nodes-layer"></div>
        </div>
    </div>
    
    <div class="fixed bottom-4 right-4 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-gray-200 text-xs font-bold text-gray-600 select-none pointer-events-none">
        Read-Only Viewer • Singularity
    </div>

    <script>
        const DATA = ${safeData};
        const nodes = DATA.nodes;
        const edgeData = DATA.edgeData;
        
        let collapsed = new Set();
        let viewport = { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 };
        let isDragging = false;
        let lastPos = { x: 0, y: 0 };

        const container = document.getElementById('canvas-container');
        const content = document.getElementById('canvas-content');
        const nodesLayer = document.getElementById('nodes-layer');
        const edgesLayer = document.getElementById('edges-layer');

        function render() {
            nodesLayer.innerHTML = '';
            edgesLayer.innerHTML = '';
            
            const visibleIds = new Set();
            const roots = nodes.filter(n => !n.parentId);
            const queue = [...roots.map(n => n.id)];
            
            while(queue.length > 0) {
                const id = queue.shift();
                visibleIds.add(id);
                if (!collapsed.has(id)) {
                    const node = nodes.find(n => n.id === id);
                    if(node && node.childrenIds) {
                        node.childrenIds.forEach(cid => queue.push(cid));
                    }
                }
            }

            const OFFSET = 50000; 

            nodes.forEach(node => {
                if (!visibleIds.has(node.id)) return;
                node.childrenIds.forEach(childId => {
                    if (!visibleIds.has(childId)) return;
                    const child = nodes.find(n => n.id === childId);
                    if (!child) return;

                    const edgeKey = node.id + '-' + child.id;
                    const opts = edgeData[edgeKey] || { color: '#cbd5e1', width: 2 };
                    
                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    const start = { x: node.position.x + OFFSET, y: node.position.y + OFFSET };
                    const end = { x: child.position.x + OFFSET, y: child.position.y + OFFSET };
                    const dx = end.x - start.x;
                    const cp1 = { x: start.x + Math.min(Math.abs(dx)*0.8, 150), y: start.y };
                    const cp2 = { x: end.x - Math.min(Math.abs(dx)*0.8, 150), y: end.y };
                    const d = \`M \${start.x} \${start.y} C \${cp1.x} \${cp1.y}, \${cp2.x} \${cp2.y}, \${end.x} \${end.y}\`;
                    
                    path.setAttribute("d", d);
                    path.setAttribute("stroke", opts.color || '#cbd5e1');
                    path.setAttribute("stroke-width", opts.width || 2);
                    path.setAttribute("fill", "none");
                    path.classList.add("edge-path");
                    edgesLayer.appendChild(path);
                });
            });

            nodes.forEach(node => {
                if (!visibleIds.has(node.id)) return;
                const el = document.createElement('div');
                el.className = \`node shape-\${node.shape || 'rounded'}\`;
                const isRoot = node.type === 'ROOT';
                el.style.left = node.position.x + 'px';
                el.style.top = node.position.y + 'px';
                el.style.backgroundColor = node.color || '#ffffff';
                if (isRoot) { el.style.padding = '20px 40px'; el.style.fontSize = '24px'; el.style.fontWeight = '800'; el.style.color = 'white'; }
                else { el.style.padding = '12px 24px'; el.style.fontSize = '14px'; el.style.fontWeight = 'bold'; }
                const label = document.createElement('div');
                label.innerText = node.label;
                el.appendChild(label);
                if (node.childrenIds.length > 0) {
                    const btn = document.createElement('div');
                    btn.className = 'toggle-btn';
                    btn.innerText = collapsed.has(node.id) ? '+' : '-';
                    btn.onclick = (e) => { e.stopPropagation(); if (collapsed.has(node.id)) collapsed.delete(node.id); else collapsed.add(node.id); render(); };
                    el.appendChild(btn);
                }
                nodesLayer.appendChild(el);
            });
        }

        function updateTransform() { content.style.transform = \`translate(\${viewport.x}px, \${viewport.y}px) scale(\${viewport.zoom})\`; }
        container.addEventListener('mousedown', (e) => { isDragging = true; lastPos = { x: e.clientX, y: e.clientY }; container.classList.add('grabbing'); });
        window.addEventListener('mousemove', (e) => { if (!isDragging) return; const dx = e.clientX - lastPos.x; const dy = e.clientY - lastPos.y; viewport.x += dx; viewport.y += dy; lastPos = { x: e.clientX, y: e.clientY }; updateTransform(); });
        window.addEventListener('mouseup', () => { isDragging = false; container.classList.remove('grabbing'); });
        container.addEventListener('wheel', (e) => { e.preventDefault(); const s = Math.pow(1.001, -e.deltaY); viewport.zoom = Math.max(0.1, Math.min(5, viewport.zoom * s)); updateTransform(); }, { passive: false });
        render(); updateTransform();
    </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${projectName.replace(/\s+/g, '_')}_interactive.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportToCSV = (nodes: SingularityNode[], projectName: string) => {
    const BOM = "\uFEFF"; 
    let csvContent = BOM + "Level 1,Level 2,Level 3,Level 4,Level 5,Type,Status,Notes\n";
    const traverse = (nodeId: string, depth: number, prefixColumns: string[]) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        const safeLabel = `"${node.label.replace(/"/g, '""')}"`;
        const row = [...prefixColumns];
        row.push(safeLabel);
        for(let i = row.length; i < 5; i++) row.push("");
        row.push(node.type);
        row.push(node.checked !== undefined ? (node.checked ? "Done" : "Pending") : "");
        let notes = "";
        if (node.data?.description) notes += `[Desc: ${node.data.description}] `;
        if (node.data?.items) notes += `[Items: ${node.data.items.join(', ')}]`;
        row.push(`"${notes.replace(/"/g, '""')}"`);
        csvContent += row.join(",") + "\n";
        node.childrenIds.forEach(childId => { traverse(childId, depth + 1, new Array(depth + 1).fill("")); });
    };
    const roots = nodes.filter(n => !n.parentId);
    roots.forEach(root => traverse(root.id, 0, []));
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${projectName.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportToOPML = (nodes: SingularityNode[], projectName: string) => {
    const escapeXml = (unsafe: string) => unsafe.replace(/[<>&'"]/g, (c) => { switch (c) { case '<': return '&lt;'; case '>': return '&gt;'; case '&': return '&amp;'; case '\'': return '&apos;'; case '"': return '&quot;'; default: return c; }});
    const traverse = (nodeId: string): string => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return '';
        const text = escapeXml(node.label);
        const note = node.data?.description ? ` _note="${escapeXml(node.data.description)}"` : '';
        let childrenXml = '';
        if (node.childrenIds.length > 0) childrenXml = node.childrenIds.map(cid => traverse(cid)).join('');
        return `<outline text="${text}"${note}>\n${childrenXml}</outline>\n`;
    };
    const roots = nodes.filter(n => !n.parentId);
    const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head>\n<title>${escapeXml(projectName)}</title>\n<dateCreated>${new Date().toUTCString()}</dateCreated>\n</head>\n<body>\n${roots.map(r => traverse(r.id)).join('')}</body>\n</opml>`;
    const blob = new Blob([opmlContent], { type: 'text/xml;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${projectName.replace(/\s+/g, '_')}.opml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const exportToDoc = (nodes: SingularityNode[], projectName: string) => {
    const rootNodes = nodes.filter(n => !n.parentId);
    const generateList = (nodeId: string): string => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return '';
        let html = `<li style="margin-bottom: 10px;"><span style="font-size: ${!node.parentId ? '16pt' : '12pt'}; font-weight: ${!node.parentId ? 'bold' : 'normal'}; font-family: Arial, sans-serif;">${node.label}</span>`;
        if (node.data?.description) html += `<br/><span style="color: #555; font-style: italic; font-size: 10pt;">${node.data.description}</span>`;
        if (node.data?.items && node.data.items.length > 0) html += `<ul style="list-style-type: square; margin-top: 5px; color: #444;">${node.data.items.map(i => `<li>${i}</li>`).join('')}</ul>`;
        if (node.childrenIds.length > 0) html += `<ul>${node.childrenIds.map(cid => generateList(cid)).join('')}</ul>`;
        html += `</li>`;
        return html;
    };
    const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${projectName}</title><style>body { font-family: 'Calibri', 'Arial', sans-serif; line-height: 1.6; } ul { list-style-type: disc; } h1 { color: #4F46E5; font-size: 24pt; border-bottom: 2px solid #eee; padding-bottom: 10px; } .footer { font-size: 9pt; color: #888; margin-top: 50px; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }</style></head><body><h1>${projectName}</h1><ul>${rootNodes.map(r => generateList(r.id)).join('')}</ul><div class="footer">Generated by Singularity ∞ MindMap</div></body></html>`;
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectName.replace(/\s+/g, '_')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const printToPDF = (projectName: string) => {
    const originalTitle = document.title;
    document.title = projectName;
    if (!document.getElementById('print-style-override')) {
        const style = document.createElement('style');
        style.id = 'print-style-override';
        style.innerHTML = `@media print { body * { visibility: hidden; } #root, #root * { visibility: visible; } .no-print, button, .fixed, nav, .sidebar, .toolbar, .minimap, .creation-bar { display: none !important; } canvas { display: block !important; width: 100% !important; height: auto !important; } body { background: white !important; } }`;
        document.head.appendChild(style);
    }
    window.print();
    document.title = originalTitle;
};
