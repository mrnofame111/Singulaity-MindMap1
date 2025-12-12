
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { Icon } from './Icons';
import * as htmlToImage from 'html-to-image';

interface ScaleScreenProps {
  onBack: () => void;
}

type MemoryType = 'MOMENT' | 'FILE' | 'MILESTONE' | 'LINK' | 'NOTE';

interface Attachment {
    id: string;
    type: 'image' | 'file' | 'link' | 'video' | 'audio';
    url: string; // Base64 or URL
    name: string;
    mimeType?: string;
    size?: number;
}

interface TimelineMemory {
  id: string;
  timestamp: number; // Unix Timestamp (ms)
  title: string;
  description?: string;
  type: MemoryType;
  color: string;
  yOffset: number;
  attachments: Attachment[];
}

interface TimelineData {
  id: string;
  name: string;
  memories: TimelineMemory[];
  lastModified: number;
}

interface ProjectMeta {
    id: string;
    name: string;
    lastModified: number;
}

interface ExportLayoutItem {
    id: string;
    x: number;
    y: number;
    data: TimelineMemory;
}

const generateId = () => Math.random().toString(36).substr(2, 9);
const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

// Physics Constants
const FRICTION = 0.90;
const STOP_THRESHOLD = 0.001;

// Time Constants (ms)
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const QUARTER = 3 * MONTH;
const YEAR = 365 * DAY;

// Zoom Levels
const ZOOM_LEVELS = {
    YEAR: 150 / YEAR,      
    MONTH: 180 / MONTH,    
    WEEK: 200 / WEEK,      
    DAY: 200 / DAY,        
    HOUR: 250 / HOUR,      
    MINUTE: 300 / MINUTE,  
    SECOND: 400 / SECOND   
};

// Max export width limits (Browser Canvas limits)
const MAX_EXPORT_WIDTH = 32000; 

// Helper for Image Compression
const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (!e.target?.result) return reject("Read failed");
            const img = new Image();
            img.src = e.target.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 1200;
                let w = img.width;
                let h = img.height;
                
                if (w > MAX_SIZE || h > MAX_SIZE) {
                    if (w > h) { h *= MAX_SIZE / w; w = MAX_SIZE; }
                    else { w *= MAX_SIZE / h; h = MAX_SIZE; }
                }
                
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% quality JPEG
            };
            img.onerror = (e) => reject(e);
        };
        reader.readAsDataURL(file);
    });
};

export const ScaleScreen: React.FC<ScaleScreenProps> = ({ onBack }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailInputRef = useRef<HTMLTextAreaElement>(null);
  const exportContainerRef = useRef<HTMLDivElement>(null);
  
  // --- PROJECT STATE ---
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>('default');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [tempProjectName, setTempProjectName] = useState('');
  
  // --- TIMELINE STATE ---
  const [timelineData, setTimelineData] = useState<TimelineData>({
      id: 'default', 
      name: 'My Timeline', 
      memories: [
          { id: '1', timestamp: Date.now(), title: 'Project Started', description: 'Initial Milestone', type: 'MILESTONE', color: '#3b82f6', yOffset: 0, attachments: [] },
      ],
      lastModified: Date.now()
  });

  // History State for Undo/Redo
  const [history, setHistory] = useState<TimelineData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [viewState, setViewState] = useState({ 
      centerTimestamp: Date.now(), 
      zoom: ZOOM_LEVELS.MONTH 
  });
  
  const viewStateRef = useRef(viewState); 
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Project Sidebar
  const [isLogOpen, setIsLogOpen] = useState(false); // Memory Log Sidebar
  
  // Gallery State
  const [galleryMemoryId, setGalleryMemoryId] = useState<string | null>(null);
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string | null } | null>(null);

  // Modal States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportRange, setExportRange] = useState({ start: Date.now() - MONTH, end: Date.now() + MONTH });
  const [isExporting, setIsExporting] = useState(false);
  // Computed layout for export to ensure no overlap
  const [exportLayout, setExportLayout] = useState<{ items: ExportLayoutItem[], width: number } | null>(null);
  
  // Delete Confirmation
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: 'PROJECT' | 'MEMORY', id: string, name: string } | null>(null);
  const [deleteInput, setDeleteInput] = useState('');

  // Controls
  const [zoomSpeed, setZoomSpeed] = useState(1.5);
  const [useInertia, setUseInertia] = useState(true);
  
  // Physics Refs
  const zoomVelocityRef = useRef(0);
  const zoomTargetRef = useRef<{ x: number, y: number } | null>(null);
  const animFrameRef = useRef<number>(0);
  
  // Wave/Cursor Animation Refs
  const mousePosRef = useRef<{x: number, y: number}>({x: -1000, y: -1000});
  const [cursorTimeInfo, setCursorTimeInfo] = useState<{ time: string, date: string, year: string } | null>(null);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  
  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);

  // Computed Sorted Memories
  const sortedMemories = useMemo(() => {
      return [...timelineData.memories].sort((a, b) => a.timestamp - b.timestamp);
  }, [timelineData.memories]);

  // Sync ref
  useEffect(() => { viewStateRef.current = viewState; }, [viewState]);

  // --- INITIAL LOAD ---
  useEffect(() => {
      // Load Project Index
      const projectIndexStr = localStorage.getItem('singularity-timeline-index');
      if (projectIndexStr) {
          const loadedProjects = JSON.parse(projectIndexStr);
          setProjects(loadedProjects);
          if (loadedProjects.length > 0) {
              loadProject(loadedProjects[0].id);
          } else {
              createNewProject();
          }
      } else {
          createNewProject();
      }
  }, []);

  // --- PROJECT MANAGEMENT ---
  const saveProject = (data: TimelineData) => {
      try {
          localStorage.setItem(`singularity-timeline-${data.id}`, JSON.stringify(data));
          // Update Index
          setProjects(prev => {
              const newIndex = prev.filter(p => p.id !== data.id);
              newIndex.unshift({ id: data.id, name: data.name, lastModified: Date.now() });
              localStorage.setItem('singularity-timeline-index', JSON.stringify(newIndex));
              return newIndex;
          });
      } catch (e) {
          console.error("Save Failed (Quota Exceeded?)", e);
          alert("Storage limit reached. Try deleting old timelines or removing large images.");
      }
  };

  const loadProject = (id: string) => {
      const dataStr = localStorage.getItem(`singularity-timeline-${id}`);
      if (dataStr) {
          const data = JSON.parse(dataStr);
          setTimelineData(data);
          setHistory([data]);
          setHistoryIndex(0);
          setCurrentProjectId(id);
      }
  };

  const createNewProject = () => {
      const newId = generateId();
      const newProject: TimelineData = {
          id: newId,
          name: 'New Timeline',
          memories: [],
          lastModified: Date.now()
      };
      setTimelineData(newProject);
      setHistory([newProject]);
      setHistoryIndex(0);
      setCurrentProjectId(newId);
      saveProject(newProject);
  };

  const handleRenameProject = (id: string) => {
      if (!tempProjectName.trim()) return;
      const project = projects.find(p => p.id === id);
      if (project) {
          const updatedMeta = { ...project, name: tempProjectName };
          const newIndex = projects.map(p => p.id === id ? updatedMeta : p);
          setProjects(newIndex);
          localStorage.setItem('singularity-timeline-index', JSON.stringify(newIndex));
          
          if (currentProjectId === id) {
              const updatedData = { ...timelineData, name: tempProjectName };
              setTimelineData(updatedData);
              saveProject(updatedData);
          } else {
              // Update stored data for non-active project
              const dataStr = localStorage.getItem(`singularity-timeline-${id}`);
              if (dataStr) {
                  const data = JSON.parse(dataStr);
                  data.name = tempProjectName;
                  localStorage.setItem(`singularity-timeline-${id}`, JSON.stringify(data));
              }
          }
      }
      setEditingProjectId(null);
  };

  const requestDeleteProject = (e: React.MouseEvent, id: string, name: string) => {
      e.stopPropagation();
      setDeleteConfirmation({ type: 'PROJECT', id, name });
      setDeleteInput('');
  };

  const executeDelete = () => {
      if (!deleteConfirmation) return;
      const { type, id } = deleteConfirmation;

      if (type === 'PROJECT') {
          localStorage.removeItem(`singularity-timeline-${id}`);
          const newProjects = projects.filter(p => p.id !== id);
          setProjects(newProjects);
          localStorage.setItem('singularity-timeline-index', JSON.stringify(newProjects));
          
          if (currentProjectId === id) {
              if (newProjects.length > 0) loadProject(newProjects[0].id);
              else createNewProject();
          }
      } else if (type === 'MEMORY') {
          const newMemories = timelineData.memories.filter(i => i.id !== id);
          commitToHistory({ ...timelineData, memories: newMemories });
          if (expandedMemoryId === id) setExpandedMemoryId(null);
          if (galleryMemoryId === id) setGalleryMemoryId(null);
      }

      setDeleteConfirmation(null);
  };

  // Auto-Save Effect
  useEffect(() => {
      const timer = setTimeout(() => {
          saveProject(timelineData);
      }, 1000);
      return () => clearTimeout(timer);
  }, [timelineData]);

  // --- EXPORT LOGIC ---
  const handleExportClick = () => {
      if (timelineData.memories.length > 0) {
          const timestamps = timelineData.memories.map(m => m.timestamp);
          const min = Math.min(...timestamps);
          const max = Math.max(...timestamps);
          // Default range to include all items with padding
          setExportRange({ 
              start: min - DAY, 
              end: max + DAY
          });
      }
      setIsExportModalOpen(true);
  };

  // Smart Layout Calculation for Export (Updated)
  const calculateSmartExportLayout = (memories: TimelineMemory[], start: number, end: number) => {
      const filtered = memories
          .filter(m => m.timestamp >= start && m.timestamp <= end)
          .sort((a, b) => a.timestamp - b.timestamp);

      if (filtered.length === 0) return { items: [], width: 1000 };

      // Increase spacing for better readability in banner format
      const CARD_WIDTH = 280;
      const GAP = 80;
      const PADDING_X = 150;
      
      let currentX = PADDING_X;
      const items: ExportLayoutItem[] = [];

      filtered.forEach((mem, i) => {
          // Strictly linear layout to prevent any overlap
          // We don't rely on timestamp distance for X position in banner mode,
          // because we want all content to be readable and compact.
          // However, we can add a visual gap if there's a significant time jump.
          
          if (i > 0) {
              const prev = filtered[i-1];
              const diff = mem.timestamp - prev.timestamp;
              // If gap > 1 month, add a separator space
              if (diff > MONTH) currentX += 100;
          }

          items.push({
              id: mem.id,
              x: currentX + CARD_WIDTH / 2, // Center alignment
              y: Math.max(-250, Math.min(250, mem.yOffset)), // Clamp Y to keep inside banner height
              data: mem
          });
          
          currentX += CARD_WIDTH + GAP;
      });

      // Total width
      const totalWidth = currentX + PADDING_X;
      
      // Ensure we don't break browser canvas limits (usually ~32k)
      // If it's too wide, we might need to scale down or warn user, but for now we clamp.
      return { items, width: Math.min(totalWidth, MAX_EXPORT_WIDTH) };
  };

  const performExport = async () => {
      setIsExporting(true);
      
      // 1. Calculate Smart Layout based on selected range
      const layout = calculateSmartExportLayout(timelineData.memories, exportRange.start, exportRange.end);
      setExportLayout(layout);

      // 2. Wait for React to render the hidden container with the new layout and images to load
      await new Promise(resolve => setTimeout(resolve, 2000)); 

      // 3. Capture
      if (!exportContainerRef.current) {
          setIsExporting(false);
          return;
      }

      setTimeout(async () => {
          try {
              const node = exportContainerRef.current!;
              
              // Helper to filter out problematic nodes
              // Also filter out any LINK or STYLE tags to avoid "cssRules" CORS errors
              const filter = (node: HTMLElement) => (node.tagName !== 'LINK' && node.tagName !== 'STYLE' && node.tagName !== 'SCRIPT');

              const dataUrl = await htmlToImage.toPng(node, {
                  pixelRatio: 2, 
                  backgroundColor: '#f3f4f6',
                  width: layout.width,
                  height: 900, // Fixed Banner Height
                  filter: filter,
                  skipAutoScale: true,
                  cacheBust: true,
                  fontEmbedCSS: '', // Disable font embedding to prevent CORS errors with Google Fonts
                  style: {
                      transform: 'none', 
                      visibility: 'visible',
                      display: 'block',
                      // Force visibility and reset position for the clone
                      opacity: '1',
                      position: 'relative',
                      left: '0px',
                      top: '0px',
                      zIndex: 'auto'
                  }
              });
              
              const link = document.createElement('a');
              link.download = `${timelineData.name.replace(/\s+/g, '_')}_Banner.png`;
              link.href = dataUrl;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              setIsExportModalOpen(false);
          } catch (error) {
              console.error("Export failed", error);
              alert("Export failed. Please check console for details. (Remote images/fonts might be blocked)");
          } finally {
              setIsExporting(false);
              setExportLayout(null); // Reset layout to unmount heavy DOM
          }
      }, 500); 
  };

  // --- UNDO / REDO ---
  const commitToHistory = (newData: TimelineData) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newData);
      if (newHistory.length > 50) newHistory.shift(); 
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setTimelineData(newData);
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const prevIndex = historyIndex - 1;
          setTimelineData(history[prevIndex]);
          setHistoryIndex(prevIndex);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1;
          setTimelineData(history[nextIndex]);
          setHistoryIndex(nextIndex);
      }
  };

  // Gallery Navigation
  const handleGalleryNext = useCallback(() => {
      if (!galleryMemoryId) return;
      const currentIndex = sortedMemories.findIndex(m => m.id === galleryMemoryId);
      if (currentIndex !== -1 && currentIndex < sortedMemories.length - 1) {
          setGalleryMemoryId(sortedMemories[currentIndex + 1].id);
      }
  }, [galleryMemoryId, sortedMemories]);

  const handleGalleryPrev = useCallback(() => {
      if (!galleryMemoryId) return;
      const currentIndex = sortedMemories.findIndex(m => m.id === galleryMemoryId);
      if (currentIndex > 0) {
          setGalleryMemoryId(sortedMemories[currentIndex - 1].id);
      }
  }, [galleryMemoryId, sortedMemories]);

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
          if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo(); }
          if (e.key === 'Escape') { 
              if (galleryMemoryId) setGalleryMemoryId(null);
              else { setExpandedMemoryId(null); setContextMenu(null); setDeleteConfirmation(null); }
          }
          if (galleryMemoryId) {
              if (e.key === 'ArrowRight') handleGalleryNext();
              if (e.key === 'ArrowLeft') handleGalleryPrev();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, galleryMemoryId, handleGalleryNext, handleGalleryPrev]);

  // Live Mode
  useEffect(() => {
      let interval: any;
      if (isLiveMode) {
          interval = setInterval(() => {
              setViewState(prev => ({ ...prev, centerTimestamp: Date.now() }));
          }, 50);
      }
      return () => clearInterval(interval);
  }, [isLiveMode]);

  // --- MATH HELPERS ---
  const screenToTime = (screenX: number, width: number, currentView: typeof viewState) => {
      const centerPixel = width / 2;
      const pixelOffset = screenX - centerPixel;
      return currentView.centerTimestamp + (pixelOffset / currentView.zoom);
  };

  const timeToScreen = (time: number, width: number) => {
      const centerPixel = width / 2;
      const timeDelta = time - viewState.centerTimestamp;
      return centerPixel + (timeDelta * viewState.zoom);
  };

  const getTimeStep = (pxPerMs: number) => {
      if (pxPerMs >= ZOOM_LEVELS.SECOND * 0.5) return SECOND;
      if (pxPerMs >= ZOOM_LEVELS.MINUTE * 0.5) return MINUTE;
      if (pxPerMs >= ZOOM_LEVELS.HOUR * 0.5) return HOUR;
      if (pxPerMs >= ZOOM_LEVELS.DAY * 0.8) return DAY; 
      if (pxPerMs >= ZOOM_LEVELS.WEEK * 0.8) return WEEK;
      if (pxPerMs >= ZOOM_LEVELS.MONTH * 0.8) return MONTH;
      if (pxPerMs >= ZOOM_LEVELS.YEAR * 0.8) return YEAR;
      return YEAR * 5;
  };

  const formatTickLabel = (timestamp: number, step: number) => {
      const date = new Date(timestamp);
      if (step <= SECOND) return { main: date.toLocaleTimeString([], { hour12: false, formatMatcher: 'basic' }), sub: '' };
      if (step <= MINUTE) return { main: date.toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' }), sub: '' };
      if (step <= HOUR) return { main: date.toLocaleTimeString([], { hour: 'numeric' }), sub: date.toLocaleDateString([], { weekday: 'short' }) };
      if (step <= DAY) return { main: date.getDate().toString(), sub: date.toLocaleDateString([], { weekday: 'short' }) };
      if (step <= WEEK) return { main: date.getDate().toString(), sub: date.toLocaleDateString([], { month: 'short' }) };
      if (step <= MONTH) return { main: date.toLocaleDateString([], { month: 'short' }), sub: date.getFullYear().toString() };
      return { main: date.getFullYear().toString(), sub: '' };
  };

  // --- PHYSICS & LOOP ---
  const applyPhysics = useCallback(() => {
      if (!useInertia) return;
      const currentVel = zoomVelocityRef.current;
      if (Math.abs(currentVel) > STOP_THRESHOLD) {
          const currentView = viewStateRef.current;
          const container = containerRef.current;
          if (container && zoomTargetRef.current) {
              const rect = container.getBoundingClientRect();
              const factor = 1 + currentVel;
              const newZoom = Math.max(ZOOM_LEVELS.YEAR / 10, Math.min(ZOOM_LEVELS.SECOND * 2, currentView.zoom * factor));
              const mouseX = zoomTargetRef.current.x - rect.left;
              const mouseTimeBefore = screenToTime(mouseX, rect.width, currentView);
              const newCenter = mouseTimeBefore - ((mouseX - rect.width / 2) / newZoom);
              setViewState({ zoom: newZoom, centerTimestamp: newCenter });
          }
          zoomVelocityRef.current *= FRICTION;
          animFrameRef.current = requestAnimationFrame(applyPhysics);
      } else {
          zoomVelocityRef.current = 0;
      }
  }, [useInertia]);

  useEffect(() => { return () => cancelAnimationFrame(animFrameRef.current); }, []);
  const stopLiveMode = () => { if (isLiveMode) setIsLiveMode(false); };

  // --- CANVAS DRAWING ---
  const drawCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const width = container.clientWidth;
      const height = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
          ctx.scale(dpr, dpr);
      }

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#f9fafb');
      gradient.addColorStop(1, '#f3f4f6');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const stepMs = getTimeStep(viewState.zoom);
      const startMs = screenToTime(0, width, viewState);
      const endMs = screenToTime(width, width, viewState);
      const firstTickMs = Math.floor(startMs / stepMs) * stepMs;
      const numTicks = Math.ceil((endMs - firstTickMs) / stepMs) + 2;

      // Wave Animation Physics
      const mouseX = mousePosRef.current.x;
      const waveRadius = 200; 

      const getWaveOffset = (x: number): { yOffset: number, scale: number } => {
          const dist = Math.abs(x - mouseX);
          if (dist < waveRadius) {
              const ratio = dist / waveRadius;
              const intensity = Math.pow(Math.cos(ratio * Math.PI / 2), 2);
              return { yOffset: -intensity * 40, scale: 1 + (intensity * 0.5) };
          }
          return { yOffset: 0, scale: 1 };
      };

      // Draw Horizon Line
      ctx.beginPath();
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.moveTo(0, height/2);
      for (let x = 0; x <= width; x += 5) {
          const { yOffset } = getWaveOffset(x);
          ctx.lineTo(x, height / 2 + yOffset);
      }
      ctx.stroke();

      // Draw Ticks
      for (let i = 0; i <= numTicks; i++) {
          const time = firstTickMs + (i * stepMs);
          const x = timeToScreen(time, width);
          const { yOffset, scale } = getWaveOffset(x);
          
          const isSuperMajor = time % (stepMs * 5) === 0;
          let tickHeight = isSuperMajor ? 25 : 12;
          tickHeight *= scale;

          const baseY = height / 2 + yOffset;

          ctx.beginPath();
          ctx.strokeStyle = isSuperMajor ? '#4b5563' : '#9ca3af';
          ctx.lineWidth = (isSuperMajor ? 2 : 1) * Math.max(1, scale);
          ctx.moveTo(x, baseY - tickHeight);
          ctx.lineTo(x, baseY + tickHeight);
          ctx.stroke();

          // Labels
          const pxPerStep = stepMs * viewState.zoom * scale;
          // Updated: Always show label if zoom is sufficient or hovered, removing restricted condition for smoother UX
          if (pxPerStep > 50 || scale > 1.2) {
              const labelData = formatTickLabel(time, stepMs);
              const isHoveredTick = scale > 1.1;
              
              ctx.textAlign = 'center';
              ctx.fillStyle = isHoveredTick ? '#2563eb' : (isSuperMajor ? '#1f2937' : '#6b7280');
              ctx.font = isSuperMajor || isHoveredTick ? `bold ${12 * scale}px sans-serif` : `${10 * scale}px sans-serif`;
              ctx.fillText(labelData.main, x, baseY - tickHeight - (8 * scale));
              
              if (labelData.sub) {
                  ctx.fillStyle = isHoveredTick ? '#3b82f6' : '#9ca3af';
                  ctx.font = `${9 * scale}px sans-serif`;
                  ctx.fillText(labelData.sub, x, baseY + tickHeight + (15 * scale));
              }
          }
      }

      // Cursor Line & Info HUD
      if (mouseX > 0 && mouseX < width) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.moveTo(mouseX, 0);
          ctx.lineTo(mouseX, height);
          ctx.stroke();
          ctx.setLineDash([]);

          const cursorTime = screenToTime(mouseX, width, viewState);
          const date = new Date(cursorTime);
          
          const timeStr = date.toLocaleTimeString();
          const dateStr = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
          const yearStr = date.getFullYear().toString();
          
          const textWidth = ctx.measureText(dateStr).width;
          const badgeW = Math.max(140, textWidth + 20);
          const badgeH = 50;
          const badgeX = Math.min(Math.max(mouseX - badgeW/2, 10), width - badgeW - 10);
          const badgeY = 20;

          ctx.shadowColor = 'rgba(0,0,0,0.1)';
          ctx.shadowBlur = 10;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#e5e7eb';
          ctx.stroke();

          ctx.textAlign = 'center';
          ctx.fillStyle = '#111827';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(timeStr, badgeX + badgeW/2, badgeY + 18);
          
          ctx.fillStyle = '#6b7280';
          ctx.font = '10px sans-serif';
          ctx.fillText(`${dateStr}, ${yearStr}`, badgeX + badgeW/2, badgeY + 36);
          
          const { yOffset } = getWaveOffset(mouseX);
          ctx.beginPath();
          ctx.fillStyle = '#ef4444';
          ctx.arc(mouseX, height/2 + yOffset, 4, 0, Math.PI*2);
          ctx.fill();
      }

      // NOW Indicator
      const nowX = timeToScreen(Date.now(), width);
      if (nowX >= -20 && nowX <= width + 20) {
          ctx.beginPath();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.moveTo(nowX, 0);
          ctx.lineTo(nowX, height);
          ctx.stroke();
          
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText("NOW", nowX + 4, height - 10);
      }
  };

  useLayoutEffect(() => {
      let animId: number;
      const loop = () => {
          drawCanvas();
          animId = requestAnimationFrame(loop);
      };
      loop();
      return () => cancelAnimationFrame(animId);
  }, [viewState, containerRef.current?.clientWidth, containerRef.current?.clientHeight]);

  // --- EVENT HANDLERS ---
  const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopLiveMode();
      
      if (e.ctrlKey || e.metaKey) {
          const delta = -e.deltaY * (zoomSpeed * 0.001);
          if (useInertia) {
              zoomVelocityRef.current += delta;
              zoomTargetRef.current = { x: e.clientX, y: e.clientY };
              cancelAnimationFrame(animFrameRef.current);
              animFrameRef.current = requestAnimationFrame(applyPhysics);
          } else {
              const currentView = viewStateRef.current;
              const newZoom = Math.max(ZOOM_LEVELS.YEAR / 10, Math.min(ZOOM_LEVELS.SECOND * 2, currentView.zoom * (1 + delta * 5)));
              const rect = containerRef.current!.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const mouseTimeBefore = screenToTime(mouseX, rect.width, currentView);
              const newCenter = mouseTimeBefore - ((mouseX - rect.width / 2) / newZoom);
              setViewState({ zoom: newZoom, centerTimestamp: newCenter });
          }
      } else {
          const currentView = viewStateRef.current;
          const timeDelta = (e.deltaX + e.deltaY) / currentView.zoom;
          setViewState({ ...currentView, centerTimestamp: currentView.centerTimestamp + timeDelta });
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      mousePosRef.current = { x: mouseX, y: e.clientY - rect.top };
      
      const currentTime = screenToTime(mouseX, rect.width, viewState);
      setHoveredTime(currentTime);
      
      const d = new Date(currentTime);
      setCursorTimeInfo({
          time: d.toLocaleTimeString(),
          date: d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
          year: d.getFullYear().toString()
      });

      if (isDragging) {
          const dx = e.clientX - lastMouseRef.current.x;
          const timeDelta = -dx / viewState.zoom; 
          setViewState(prev => ({ ...prev, centerTimestamp: prev.centerTimestamp + timeDelta }));
          lastMouseRef.current = { x: e.clientX, y: e.clientY };
      }
  };

  useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      
      const handleMouseLeave = () => { mousePosRef.current = { x: -1000, y: -1000 }; setCursorTimeInfo(null); setIsDragging(false); };
      
      container.addEventListener('wheel', handleWheel, { passive: false });
      container.addEventListener('mouseleave', handleMouseLeave);
      
      return () => {
          container.removeEventListener('wheel', handleWheel);
          container.removeEventListener('mouseleave', handleMouseLeave);
      };
  }, [zoomSpeed, useInertia, applyPhysics]);

  const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button === 2) return;
      stopLiveMode();
      setIsDragging(true);
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      zoomVelocityRef.current = 0; 
  };

  const handleMouseUp = () => setIsDragging(false);

  // Fixed Double Click Handler
  const handleDoubleClick = (e: React.MouseEvent) => {
      e.preventDefault(); // Prevent standard browser double-click selection
      e.stopPropagation();
      stopLiveMode();
      const rect = containerRef.current!.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const time = screenToTime(clickX, rect.width, viewState);
      createNewMemory(time);
  };

  const jumpToNow = () => {
      zoomVelocityRef.current = 0;
      setIsLiveMode(true);
      setViewState(prev => ({ ...prev, centerTimestamp: Date.now() }));
  };

  const setZoomPreset = (preset: number) => {
      zoomVelocityRef.current = 0;
      setViewState(prev => ({ ...prev, zoom: preset }));
  };

  const createNewMemory = (timestamp: number, type: MemoryType = 'MOMENT', attachments: Attachment[] = []) => {
      const newId = generateId();
      const newMemory: TimelineMemory = {
          id: newId,
          timestamp,
          title: attachments.length > 0 ? (attachments[0].name || 'New File') : 'New Memory',
          description: '',
          type: attachments.length > 0 ? 'FILE' : type,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          yOffset: (Math.random() * 200) - 100,
          attachments: attachments
      };
      const newData = { 
          ...timelineData, 
          memories: [...timelineData.memories, newMemory], 
          lastModified: Date.now() 
      };
      commitToHistory(newData);
      setSelectedMemoryId(newId);
      if(attachments.length === 0) setExpandedMemoryId(newId); // Auto open for edits
  };

  const requestDeleteMemory = (e: React.MouseEvent, id: string, title: string) => {
      e.stopPropagation();
      setDeleteConfirmation({ type: 'MEMORY', id, name: title });
      setDeleteInput('');
  };

  const updateMemory = (id: string, updates: Partial<TimelineMemory>) => {
      const newMemories = timelineData.memories.map(i => i.id === id ? { ...i, ...updates } : i);
      setTimelineData({ ...timelineData, memories: newMemories });
  };

  const handleMemoryBlur = () => { commitToHistory(timelineData); };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const clickX = e.clientX - rect.left;
      const time = screenToTime(clickX, rect.width, viewState);
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const files = Array.from(e.dataTransfer.files);
          processFiles(files).then(attachments => {
              createNewMemory(time, 'FILE', attachments);
          });
      }
  };

  const processFiles = async (files: File[]): Promise<Attachment[]> => {
      const attachments: Attachment[] = [];
      for (const file of files) {
          try {
              if (file.type.startsWith('image/')) {
                  const compressedUrl = await compressImage(file);
                  attachments.push({
                      id: generateId(),
                      type: 'image',
                      url: compressedUrl,
                      name: file.name,
                      size: file.size,
                      mimeType: 'image/jpeg'
                  });
              } else {
                  const reader = new FileReader();
                  const result = await new Promise<string>((resolve) => {
                      reader.onload = (e) => resolve(e.target?.result as string);
                      reader.readAsDataURL(file);
                  });
                  attachments.push({
                      id: generateId(),
                      type: 'file',
                      url: result,
                      name: file.name,
                      size: file.size,
                      mimeType: file.type
                  });
              }
          } catch (e) {
              console.error("File processing failed", e);
          }
      }
      return attachments;
  };

  const handleContextMenu = (e: React.MouseEvent, nodeId: string | null) => {
      e.preventDefault();
      e.stopPropagation(); // Ensure event doesn't bubble up
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
  };

  const handleContextMenuAction = (action: string) => {
      if (!contextMenu) return;
      const { nodeId, x } = contextMenu;
      
      if (nodeId) {
          // Node Context Actions
          if (action === 'delete') {
              const mem = timelineData.memories.find(m => m.id === nodeId);
              if (mem) requestDeleteMemory({ stopPropagation: ()=>{} } as any, nodeId, mem.title);
          } else if (action === 'edit') {
              setExpandedMemoryId(nodeId);
          } else if (action === 'focus') {
              const mem = timelineData.memories.find(m => m.id === nodeId);
              if (mem) setViewState(prev => ({ ...prev, centerTimestamp: mem.timestamp }));
          }
      } else {
          // Canvas Context Actions
          if (action.startsWith('add-')) {
              const typeMap: Record<string, MemoryType> = {
                  'add-moment': 'MOMENT',
                  'add-note': 'NOTE',
                  'add-milestone': 'MILESTONE'
              };
              const rect = containerRef.current!.getBoundingClientRect();
              const clickX = x - rect.left;
              const time = screenToTime(clickX, rect.width, viewState);
              createNewMemory(time, typeMap[action] || 'MOMENT');
          } else if (action === 'today') {
              jumpToNow();
          }
      }
      setContextMenu(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      
      const newAttachments = await processFiles(Array.from(files));
      
      if (newAttachments.length > 0) {
          setTimelineData(prevData => {
              let newData = { ...prevData };
              if (expandedMemoryId) {
                  newData.memories = prevData.memories.map(m => 
                      m.id === expandedMemoryId 
                      ? { ...m, attachments: [...m.attachments, ...newAttachments] } 
                      : m
                  );
              } else {
                  // Create new memory logic is handled by drag/drop or context menu generally
                  // But if triggered via hidden input without modal, we might need logic.
                  // For now assuming modal context if not specified.
              }
              newData.lastModified = Date.now();
              return newData;
          });
          // Update history
          setHistory(prevHist => {
              const newHist = prevHist.slice(0, historyIndex + 1);
              // Optimistic update for history not fully implemented here for brevity, 
              // but state update triggers re-render.
              return newHist;
          });
      }
      
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleModalDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const files = Array.from(e.dataTransfer.files);
          const newAttachments = await processFiles(files);
          if (newAttachments.length > 0 && expandedMemoryId) {
              setTimelineData(prevData => {
                  const newData = { ...prevData };
                  newData.memories = prevData.memories.map(m => 
                      m.id === expandedMemoryId 
                      ? { ...m, attachments: [...m.attachments, ...newAttachments] } 
                      : m
                  );
                  newData.lastModified = Date.now();
                  return newData;
              });
          }
      }
  };

  const renderFileIcon = (attachment: Attachment) => {
      if (attachment.type === 'image') return <Icon.Image size={24} />;
      if (attachment.type === 'video') return <Icon.MonitorPlay size={24} />;
      if (attachment.type === 'audio') return <Icon.Mic size={24} />;
      return <Icon.FileText size={24} />;
  };

  const renderExportContainer = () => {
      // Hidden off-screen render for export
      // FIXED: Use opacity 0 and fixed position to ensure visibility during capture
      // while remaining invisible to the user. 'left: -35000px' causes issues.
      if (!isExportModalOpen || !exportLayout) return null;
      
      const { items, width } = exportLayout;
      const height = 900; // Banner Height
      const centerY = height / 2;

      return (
          <div 
            ref={exportContainerRef}
            style={{ 
                position: 'fixed', 
                top: 0, 
                left: 0, 
                width: width, 
                height: height, 
                background: '#f3f4f6', 
                overflow: 'hidden', 
                zIndex: -5000, 
                visibility: isExporting ? 'visible' : 'hidden',
                opacity: 0, 
                pointerEvents: 'none'
            }} 
          >
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  {/* Timeline Axis */}
                  <div style={{ position: 'absolute', top: centerY, left: 0, right: 0, height: 2, background: '#9ca3af' }} />
                  
                  {items.map(item => {
                      const m = item.data;
                      const hasImage = m.attachments.find(a => a.type === 'image');
                      const x = item.x;
                      // Keep some y-variance but clamp it to stay within banner
                      const yOffset = Math.max(-200, Math.min(200, item.y)); 
                      const y = centerY - 40 + yOffset;

                      return (
                          <div key={m.id} style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -100%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              {/* Node Card */}
                              <div style={{ padding: 8, borderRadius: 12, background: 'white', border: `2px solid ${m.color}`, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: 220, fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {hasImage && (
                                      <div style={{ width: '100%', height: 120, overflow: 'hidden', borderRadius: 6, marginBottom: 4, background: '#f3f4f6' }}>
                                          <img src={hasImage.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      </div>
                                  )}
                                  <div style={{ fontSize: 14, fontWeight: 'bold', color: '#1f2937' }}>{m.title}</div>
                                  {m.description && <div style={{ fontSize: 10, color: '#6b7280', maxHeight: 'none', overflow: 'visible' }}>{m.description}</div>}
                              </div>
                              
                              {/* Connector Line */}
                              <div style={{ width: 2, height: Math.abs(yOffset) + (yOffset < 0 ? 0 : 40), background: m.color, opacity: 0.5 }} />
                              
                              {/* Axis Dot */}
                              <div style={{ width: 14, height: 14, borderRadius: '50%', background: m.color, border: '3px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', position: 'relative' }}>
                                  {/* Date Label on Axis */}
                                  <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 'bold', color: '#6b7280', textAlign: 'center' }}>
                                      {new Date(m.timestamp).toLocaleDateString()}
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>
              
              {/* Branding */}
              <div style={{ position: 'absolute', bottom: 20, right: 20, fontSize: 12, fontWeight: 'bold', color: '#9ca3af', opacity: 0.5 }}>
                  Timeline by Singularity
              </div>
          </div>
      );
  };

  const containerWidth = containerRef.current?.clientWidth || 1000;
  const containerHeight = containerRef.current?.clientHeight || 800;

  const expandedMemory = expandedMemoryId ? timelineData.memories.find(m => m.id === expandedMemoryId) : null;
  const galleryMemory = galleryMemoryId ? timelineData.memories.find(m => m.id === galleryMemoryId) : null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      
      {/* LEFT PROJECT SIDEBAR */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden shrink-0 relative z-30 shadow-xl`}>
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h2 className="font-bold text-gray-700 flex items-center gap-2 text-sm uppercase tracking-wider"><Icon.Scale size={16} className="text-purple-500"/> Timelines</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon.ChevronLeft size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
              <button onClick={createNewProject} className="m-3 w-[calc(100%-24px)] py-2 bg-purple-600 text-white rounded-lg font-bold text-xs shadow-md hover:bg-purple-700 flex items-center justify-center gap-2 transition-all"><Icon.Plus size={14} /> New Timeline</button>
              <div className="space-y-1 p-2">
                  {projects.map(p => (
                      <div key={p.id} onClick={() => loadProject(p.id)} className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${currentProjectId === p.id ? 'bg-purple-50 border border-purple-200' : 'hover:bg-gray-100 border border-transparent'}`}>
                          {editingProjectId === p.id && isSidebarOpen ? ( 
                              <input 
                                autoFocus
                                value={tempProjectName} 
                                onChange={(e) => setTempProjectName(e.target.value)}
                                onBlur={() => handleRenameProject(p.id)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRenameProject(p.id)}
                                className="bg-white border border-purple-300 rounded px-1 py-0.5 text-xs w-full outline-none"
                                onClick={(e) => e.stopPropagation()}
                              />
                          ) : (
                              <div className="flex flex-col min-w-0">
                                  <span className={`text-xs font-bold truncate ${currentProjectId === p.id ? 'text-purple-700' : 'text-gray-700'}`}>{p.name}</span>
                                  <span className="text-[10px] text-gray-400">{new Date(p.lastModified).toLocaleDateString()}</span>
                              </div>
                          )}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => { e.stopPropagation(); setEditingProjectId(p.id); setTempProjectName(p.name); }} className="p-1 hover:bg-white rounded text-gray-400 hover:text-blue-500"><Icon.Edit size={12}/></button>
                              <button onClick={(e) => requestDeleteProject(e, p.id, p.name)} className="p-1 hover:bg-white rounded text-gray-400 hover:text-red-500"><Icon.Trash size={12}/></button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>

      {!isSidebarOpen && (
          <button onClick={() => setIsSidebarOpen(true)} className="absolute top-20 left-4 z-40 p-2 bg-white shadow-md rounded-lg text-gray-500 hover:text-purple-600 border border-gray-200"><Icon.PanelLeft size={20} /></button>
      )}

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col relative h-full">
          
          {/* HEADER */}
          <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-20 shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                  <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><Icon.Arrow size={20} className="rotate-180"/></button>
                  <div className="flex flex-col">
                      <h1 className="font-display font-bold text-sm text-gray-800 flex items-center gap-2">
                          <Icon.Scale className="text-purple-600" size={16} /> {timelineData.name}
                      </h1>
                      {cursorTimeInfo && (
                          <span className="text-[10px] text-purple-600 font-mono font-bold animate-fade-in">
                              {cursorTimeInfo.time} • {cursorTimeInfo.date} • {cursorTimeInfo.year}
                          </span>
                      )}
                  </div>
              </div>
              
              <div className="flex items-center gap-4">
                  <button onClick={handleExportClick} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-colors"><Icon.Download size={14} /> Export</button>
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                      <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-white rounded text-gray-600 disabled:opacity-30 transition-all shadow-sm"><Icon.Undo size={16}/></button>
                      <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 hover:bg-white rounded text-gray-600 disabled:opacity-30 transition-all shadow-sm"><Icon.Redo size={16}/></button>
                  </div>
                  <button onClick={jumpToNow} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${isLiveMode ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'}`}>
                      <div className={`w-2 h-2 rounded-full ${isLiveMode ? 'bg-red-500' : 'bg-gray-300'}`} />
                      {isLiveMode ? 'LIVE' : 'NOW'}
                  </button>
                  <button onClick={() => setIsLogOpen(!isLogOpen)} className={`p-2 rounded-lg transition-colors ${isLogOpen ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}><Icon.AlignLeft size={20} className="rotate-180" /></button>
              </div>
          </div>

          {/* CANVAS AREA */}
          <div className="flex-1 relative overflow-hidden flex">
              <div 
                className="flex-1 relative cursor-crosshair overflow-hidden touch-none" 
                onDragOver={(e) => e.preventDefault()} 
                onDrop={handleDrop}
                onContextMenu={(e) => handleContextMenu(e, null)}
              >
                  {/* ZOOM CONTROLS OVERLAY */}
                  <div className="absolute top-4 left-4 z-40 bg-white/90 backdrop-blur-md p-1.5 rounded-xl border border-gray-200 shadow-lg flex gap-1 select-none">
                      {[{ label: 'Yr', zoom: ZOOM_LEVELS.YEAR }, { label: 'Mo', zoom: ZOOM_LEVELS.MONTH }, { label: 'Wk', zoom: ZOOM_LEVELS.WEEK }, { label: 'Day', zoom: ZOOM_LEVELS.DAY }, { label: 'Hr', zoom: ZOOM_LEVELS.HOUR }, { label: 'Min', zoom: ZOOM_LEVELS.MINUTE }, { label: 'Sec', zoom: ZOOM_LEVELS.SECOND }].map(level => (
                          <button 
                            key={level.label} 
                            onClick={() => setZoomPreset(level.zoom)} 
                            className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors ${Math.abs(viewState.zoom - level.zoom) < level.zoom * 0.1 ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'}`}
                          >
                              {level.label}
                          </button>
                      ))}
                  </div>

                  <div ref={containerRef} className="absolute inset-0 z-0" style={{ touchAction: 'none' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onDoubleClick={handleDoubleClick}>
                      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />
                      
                      {/* MEMORY NODES RENDERER */}
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                          {sortedMemories.map(item => {
                              const x = timeToScreen(item.timestamp, containerWidth);
                              // Optimize rendering: Don't render far off-screen
                              if (x < -300 || x > containerWidth + 300) return null;
                              
                              const y = (containerHeight / 2) - 40 + item.yOffset;
                              const isSelected = selectedMemoryId === item.id;
                              const primaryAttachment = item.attachments.find(a => a.type === 'image') || item.attachments[0];

                              return (
                                  <div 
                                    key={item.id} 
                                    className={`absolute pointer-events-auto flex flex-col items-center group transition-transform duration-200 ${isSelected ? 'z-50 scale-105' : 'z-10 hover:z-40 hover:scale-105'}`} 
                                    style={{ left: x, top: y, transform: 'translate(-50%, -100%)' }} 
                                    onClick={(e) => { e.stopPropagation(); setSelectedMemoryId(item.id); }}
                                    onContextMenu={(e) => handleContextMenu(e, item.id)}
                                  >
                                      <div className={`p-1.5 rounded-xl shadow-lg border-2 bg-white min-w-[220px] max-w-[280px] backdrop-blur-sm bg-white/95 relative flex flex-col gap-2`} style={{ borderColor: item.color }}>
                                          <div className="absolute left-1/2 top-full w-0.5 bg-current opacity-50" style={{ height: Math.abs(item.yOffset) + (item.yOffset < 0 ? 0 : 40), top: '100%', color: item.color }} />
                                          <div className="absolute left-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: item.color, top: `calc(100% + ${Math.abs(item.yOffset) + (item.yOffset < 0 ? 0 : 40)}px)`, transform: 'translate(-50%, -50%)' }} />
                                          
                                          <div className="flex items-center justify-between px-2 pt-1">
                                              <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">{new Date(item.timestamp).toLocaleDateString()}</span>
                                              <button onClick={(e) => requestDeleteMemory(e, item.id, item.title)} className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"><Icon.Close size={12} /></button>
                                          </div>
                                          
                                          {primaryAttachment && (
                                              <div className="w-full h-40 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative group/img cursor-pointer" onClick={(e) => { e.stopPropagation(); setGalleryMemoryId(item.id); }}>
                                                  {primaryAttachment.type === 'image' ? (
                                                      <img src={primaryAttachment.url} className="w-full h-full object-cover" alt="preview" />
                                                  ) : (
                                                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-2">
                                                          {renderFileIcon(primaryAttachment)}
                                                          <span className="text-[10px] mt-1 text-center line-clamp-2">{primaryAttachment.name}</span>
                                                      </div>
                                                  )}
                                                  <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center">
                                                      <Icon.Maximize size={24} className="text-white opacity-0 group-hover/img:opacity-100 drop-shadow-md transform scale-75 group-hover/img:scale-100 transition-all"/>
                                                  </div>
                                              </div>
                                          )}

                                          <div className="px-2 pb-2 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors -mx-1 mt-1" onClick={(e) => { e.stopPropagation(); setExpandedMemoryId(item.id); }}>
                                              <div className="text-sm font-bold text-gray-800 leading-tight line-clamp-2">{item.title}</div>
                                              {item.description && <div className="text-[10px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</div>}
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
                  
                  {/* HELPER TEXT */}
                  <div className="absolute bottom-8 left-8 bg-white/90 backdrop-blur p-4 rounded-xl shadow-lg border border-white/50 max-w-sm pointer-events-none select-none">
                      <h3 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-2"><Icon.Help size={14} /> Fluid Timeline</h3>
                      <ul className="text-xs text-gray-500 space-y-1 list-disc pl-4">
                          <li><b>Scroll/Pinch</b> to Zoom freely.</li>
                          <li><b>Drag</b> to Pan through time.</li>
                          <li><b>Double Click</b> to add a memory at exact time.</li>
                          <li><b>Right Click</b> to add specific types.</li>
                      </ul>
                  </div>
              </div>

              {/* RIGHT LOG SIDEBAR */}
              <div className={`bg-white border-l border-gray-200 flex flex-col transition-all duration-300 shadow-xl z-20 ${isLogOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2"><Icon.AlignLeft size={16} /> Chronological Log</h2>
                      <button onClick={() => setIsLogOpen(false)} className="text-gray-400 hover:text-gray-600"><Icon.ChevronRight size={16}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                      {sortedMemories.map((mem) => (
                          <div key={mem.id} onClick={() => { stopLiveMode(); setViewState(prev => ({ ...prev, centerTimestamp: mem.timestamp })); setSelectedMemoryId(mem.id); }} className={`group p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md flex gap-3 ${selectedMemoryId === mem.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                              <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: mem.color }} />
                                  <div className="w-0.5 h-full bg-gray-100 group-hover:bg-gray-200" />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-center mb-1">
                                      <span className="text-[10px] font-bold text-gray-400">{new Date(mem.timestamp).toLocaleDateString()}</span>
                                      {mem.attachments.length > 0 && <Icon.Paperclip size={10} className="text-gray-400" />}
                                  </div>
                                  <h3 className={`text-sm font-bold truncate ${selectedMemoryId === mem.id ? 'text-blue-700' : 'text-gray-800'}`}>{mem.title}</h3>
                                  {mem.description && <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5">{mem.description}</p>}
                              </div>
                          </div>
                      ))}
                      {sortedMemories.length === 0 && <div className="text-center p-8 text-gray-400 text-xs">Start adding memories to see them here.</div>}
                  </div>
              </div>
          </div>
      </div>

      {/* RENDER THE HIDDEN EXPORT CONTAINER */}
      {renderExportContainer()}

      {/* IMMERSIVE GALLERY (Z-INDEX FIX) */}
      {galleryMemory && (
          <div className="fixed inset-0 z-[100] bg-black animate-fade-in flex flex-col md:flex-row overflow-hidden">
              <div className="flex-1 bg-black relative flex items-center justify-center group/nav" onClick={(e) => { if(e.target === e.currentTarget) setGalleryMemoryId(null); }}>
                  <button onClick={() => setGalleryMemoryId(null)} className="absolute top-4 left-4 z-50 p-2 bg-black/50 text-white rounded-full hover:bg-white/20 transition-colors"><Icon.Close size={24} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleGalleryPrev(); }} className="absolute left-4 z-40 p-4 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover/nav:opacity-100"><Icon.ChevronLeft size={48} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleGalleryNext(); }} className="absolute right-4 z-40 p-4 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover/nav:opacity-100"><Icon.ChevronRight size={48} /></button>
                  {galleryMemory.attachments.length > 0 ? (
                      (() => {
                          const att = galleryMemory.attachments.find(a => a.type === 'image') || galleryMemory.attachments[0];
                          if (att.type === 'image') {
                              return <img src={att.url} className="max-w-full max-h-full object-contain shadow-2xl" alt={att.name} />;
                          } else {
                              return <div className="text-white text-center p-8 border border-white/20 rounded-xl bg-white/10 backdrop-blur-sm"><div className="text-6xl mb-4 opacity-50 flex justify-center">{renderFileIcon(att)}</div><div className="text-xl font-bold">{att.name}</div></div>;
                          }
                      })()
                  ) : <div className="text-white/50 italic">No media attached</div>}
              </div>
              <div className="w-full md:w-[350px] bg-white border-l border-gray-200 flex flex-col shrink-0 h-[40vh] md:h-full">
                  <div className="p-6 border-b border-gray-100 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold"><Icon.Scale size={20} /></div>
                          <div><div className="text-sm font-bold text-gray-900">{timelineData.name}</div><div className="text-xs text-gray-500">{new Date(galleryMemory.timestamp).toLocaleString()}</div></div>
                      </div>
                      <button onClick={() => { setExpandedMemoryId(galleryMemory.id); setGalleryMemoryId(null); }} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Icon.Edit size={18} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                      <h2 className="text-2xl font-display font-black text-gray-800 mb-4 leading-tight">{galleryMemory.title}</h2>
                      {galleryMemory.description && <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{galleryMemory.description}</p>}
                  </div>
              </div>
          </div>
      )}

      {/* FULL DETAILS / EDIT MODAL */}
      {expandedMemory && !galleryMemoryId && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setExpandedMemoryId(null)}>
              <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row" onClick={(e) => e.stopPropagation()}>
                  
                  {/* REDESIGNED LEFT PANEL - ATTACHMENTS */}
                  <div 
                    className="md:w-1/2 bg-gray-100 border-r border-gray-200 relative flex flex-col group/drop"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={async (e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            const files = Array.from(e.dataTransfer.files) as File[];
                            const newAttachments = await Promise.all(files.map(async f => {
                                const url = f.type.startsWith('image/') ? await compressImage(f) : await new Promise<string>(r => { const reader = new FileReader(); reader.onload = e => r(e.target?.result as string); reader.readAsDataURL(f); });
                                return {
                                    id: generateId(),
                                    type: f.type.startsWith('image/') ? 'image' : 'file',
                                    url,
                                    name: f.name,
                                    mimeType: f.type,
                                    size: f.size
                                } as Attachment;
                            }));
                            updateMemory(expandedMemory.id, { attachments: [...expandedMemory.attachments, ...newAttachments] });
                        }
                    }}
                  >
                      {/* Drop Zone Overlay */}
                      <div className="absolute inset-0 bg-blue-500/10 border-4 border-blue-500 border-dashed z-50 pointer-events-none opacity-0 group-hover/drop:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="bg-blue-500 text-white px-6 py-2 rounded-full font-bold shadow-lg">Drop Files Here</div>
                      </div>

                      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                          {expandedMemory.attachments.length > 0 ? (
                              <div className="grid grid-cols-2 gap-4">
                                  {expandedMemory.attachments.map((att) => (
                                      <div key={att.id} className="relative aspect-square bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden group cursor-pointer hover:shadow-md transition-all">
                                          {att.type === 'image' ? (
                                              <img src={att.url} className="w-full h-full object-cover" onClick={() => setGalleryMemoryId(expandedMemory.id)} />
                                          ) : (
                                              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                                                  {renderFileIcon(att)}
                                                  <span className="text-[10px] font-bold mt-2 line-clamp-2">{att.name}</span>
                                              </div>
                                          )}
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); updateMemory(expandedMemory.id, { attachments: expandedMemory.attachments.filter(a => a.id !== att.id) }); }}
                                            className="absolute top-2 right-2 p-1.5 bg-white/90 text-red-500 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all shadow-sm"
                                          >
                                              <Icon.Trash size={14} />
                                          </button>
                                      </div>
                                  ))}
                                  {/* Add Tile */}
                                  <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center text-gray-400 hover:text-indigo-500 gap-2"
                                  >
                                      <Icon.Plus size={24} />
                                      <span className="text-xs font-bold">Add More</span>
                                  </button>
                              </div>
                          ) : (
                              <div 
                                className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 rounded-2xl m-4 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-500 transition-all cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                              >
                                  <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                                      <Icon.Upload size={24} className="opacity-50" />
                                  </div>
                                  <span className="text-sm font-bold">Click to Upload Media</span>
                                  <span className="text-xs opacity-60 mt-1">or Drag & Drop files here</span>
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="md:w-1/2 flex flex-col bg-white">
                      <div className="p-6 border-b border-gray-100 flex items-start justify-between">
                          <div className="w-full mr-4">
                              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                  <Icon.Calendar size={14} /> {new Date(expandedMemory.timestamp).toLocaleString()}
                              </div>
                              <input 
                                value={expandedMemory.title}
                                onChange={(e) => updateMemory(expandedMemory.id, { title: e.target.value })}
                                onBlur={handleMemoryBlur}
                                className="text-2xl font-black text-gray-800 outline-none w-full bg-transparent placeholder-gray-300"
                                placeholder="Memory Title"
                              />
                          </div>
                          <button onClick={() => setExpandedMemoryId(null)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 shrink-0"><Icon.Close size={24} /></button>
                      </div>
                      
                      <div className="px-6 py-2 flex items-center gap-2 border-b border-gray-100 bg-gray-50/50">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type:</span>
                          <select 
                              value={expandedMemory.type}
                              onChange={(e) => updateMemory(expandedMemory.id, { type: e.target.value as MemoryType })}
                              className="text-xs font-bold bg-white border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400"
                          >
                              <option value="MOMENT">Moment</option>
                              <option value="MILESTONE">Milestone</option>
                              <option value="NOTE">Note</option>
                              <option value="FILE">File</option>
                          </select>
                      </div>

                      <div className="flex-1 p-6 overflow-y-auto">
                          <textarea 
                              ref={detailInputRef}
                              value={expandedMemory.description || ''}
                              onChange={(e) => updateMemory(expandedMemory.id, { description: e.target.value })}
                              onBlur={handleMemoryBlur}
                              className="w-full h-full resize-none outline-none text-base leading-relaxed text-gray-600 placeholder-gray-300 custom-scrollbar"
                              placeholder="Write detailed description here..."
                          />
                      </div>

                      <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                          <div className="flex gap-2">
                              {COLORS.map(c => (
                                  <button key={c} onClick={() => updateMemory(expandedMemory.id, { color: c })} className={`w-6 h-6 rounded-full border border-black/10 hover:scale-110 transition-transform ${expandedMemory.color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`} style={{ backgroundColor: c }} />
                              ))}
                          </div>
                          <button onClick={(e) => requestDeleteMemory(e, expandedMemory.id, expandedMemory.title)} className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1">
                              <Icon.Trash size={14} /> Delete
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* EXPORT MODAL */}
      {isExportModalOpen && (
          <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-white/20">
                  <h2 className="text-xl font-black text-gray-800 mb-1 flex items-center gap-2">
                      <Icon.Download size={24} className="text-indigo-600" /> Export Timeline
                  </h2>
                  <p className="text-sm text-gray-500 mb-6">Create a high-resolution panoramic image.</p>
                  <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <span className="text-[10px] font-bold text-gray-500 block mb-1">Start Date</span>
                              <input type="date" value={new Date(exportRange.start).toISOString().split('T')[0]} onChange={(e) => setExportRange({...exportRange, start: new Date(e.target.value).getTime()})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                          <div>
                              <span className="text-[10px] font-bold text-gray-500 block mb-1">End Date</span>
                              <input type="date" value={new Date(exportRange.end).toISOString().split('T')[0]} onChange={(e) => setExportRange({...exportRange, end: new Date(e.target.value).getTime()})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                      </div>
                      <div className="pt-2">
                          <button onClick={performExport} disabled={isExporting} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2">{isExporting ? <Icon.Navigation className="animate-spin" size={18} /> : <Icon.Image size={18} />}{isExporting ? "Rendering..." : "Export 8K Panorama"}</button>
                          <button onClick={() => setIsExportModalOpen(false)} disabled={isExporting} className="w-full mt-2 py-3 text-gray-500 hover:bg-gray-100 rounded-xl font-bold text-sm transition-colors">Cancel</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmation && (
          <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setDeleteConfirmation(null)}>
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 border border-white/20" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3 mb-4 text-red-600">
                      <div className="p-3 bg-red-50 rounded-xl"><Icon.Trash size={24} /></div>
                      <h3 className="text-xl font-bold text-gray-900">Delete {deleteConfirmation.type === 'PROJECT' ? 'Timeline' : 'Memory'}?</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                      You are about to delete <b>{deleteConfirmation.name}</b>.
                  </p>
                  <p className="text-gray-500 mb-6 text-sm">
                      To confirm deletion, please type <b>DELETE</b> below.
                  </p>
                  <input 
                      type="text"
                      value={deleteInput}
                      onChange={(e) => setDeleteInput(e.target.value)}
                      placeholder="Type 'DELETE'"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-red-500 transition-all mb-6 uppercase"
                      autoFocus
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setDeleteConfirmation(null)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors">Cancel</button>
                      <button onClick={executeDelete} disabled={deleteInput !== 'DELETE'} className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all">Delete</button>
                  </div>
              </div>
          </div>
      )}

      {/* CONTEXT MENU */}
      {contextMenu && (
          <div 
              className="fixed z-[120] bg-white border border-gray-200 shadow-xl rounded-xl py-1 min-w-[160px] animate-pop origin-top-left overflow-hidden"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onMouseDown={(e) => e.stopPropagation()}
          >
              {contextMenu.nodeId ? (
                  <>
                      <button onClick={() => handleContextMenuAction('edit')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm font-bold text-gray-700 flex items-center gap-2"><Icon.Edit size={14}/> Edit Details</button>
                      <button onClick={() => handleContextMenuAction('focus')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm font-bold text-gray-700 flex items-center gap-2"><Icon.Zap size={14}/> Focus Here</button>
                      <div className="h-px bg-gray-100 my-1"/>
                      <button onClick={() => handleContextMenuAction('delete')} className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm font-bold text-red-600 flex items-center gap-2"><Icon.Trash size={14}/> Delete</button>
                  </>
              ) : (
                  <>
                      <div className="px-3 py-1 text-[10px] font-black text-gray-400 uppercase tracking-widest">Add Memory</div>
                      <button onClick={() => handleContextMenuAction('add-moment')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm font-bold text-gray-700 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"/> Moment</button>
                      <button onClick={() => handleContextMenuAction('add-milestone')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm font-bold text-gray-700 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-500"/> Milestone</button>
                      <button onClick={() => handleContextMenuAction('add-note')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm font-bold text-gray-700 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-gray-400"/> Note</button>
                      <div className="h-px bg-gray-100 my-1"/>
                      <button onClick={() => handleContextMenuAction('today')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm font-bold text-gray-700 flex items-center gap-2"><Icon.Calendar size={14}/> Jump to Today</button>
                  </>
              )}
          </div>
      )}

      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} multiple />
    </div>
  );
};
