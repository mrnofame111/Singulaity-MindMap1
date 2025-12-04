
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Viewport, SingularityNode, NodeType, HistoryStep, ToolMode, NodeShape, CanvasSettings, DrawingPath, EdgeOptions, AIGenerationOptions, AIAction, SnapLine, SmartStylingRules, Position, AIMindMapNode } from '../types';
import { ZOOM_MIN, ZOOM_MAX, generateId, INITIAL_NODES, calculateLayout, recalculateLayout, layoutOrganic, layoutLocalFlower, TEMPLATES, APP_THEMES, LayoutType, pushNodesAside } from '../constants';
import NodeComponent from './NodeComponent';
import { expandNodeWithAI, refineNodeText, summarizeBranch, generateMindMapData, generateFlowchartJson, analyzeNodeContent, generateDreamImage } from '../services/geminiService';
import { exportToCSV, exportToDoc, exportToOPML, printToPDF, exportSmartImage, generateInteractiveHTML } from '../services/exportService';
import { CommandPalette } from './CommandPalette';
import { ShortcutsPanel } from './ShortcutsPanel';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { Minimap } from './Minimap';
import { ConnectionLine } from './ConnectionLine';
import { ContextMenu } from './ContextMenu';
import { ChatPanel } from './ChatPanel';
import { TopBar } from './TopBar';
import { StatusBar } from './StatusBar';
import { AiOptionsModal } from './AiOptionsModal';
import { MediaModal } from './MediaModal';
import { DreamModal } from './DreamModal';
import { ExportPreviewModal } from './ExportPreviewModal';
import { FloatingToolbar } from './FloatingToolbar';
import { ShortcutMonitor } from './ShortcutMonitor';
import { NewMapModal } from './NewMapModal';
import { ShapeDock } from './ShapeDock';
import { OutlinePanel } from './OutlinePanel';
import { CreationBar } from './CreationBar';
import { CustomToolbar, CustomTool } from './CustomToolbar';
import { IntegrationsModal } from './IntegrationsModal';
import { Icon } from './Icons';
import * as htmlToImage from 'html-to-image';

const SNAP_THRESHOLD = 5;
const NODE_SHAPES_CYCLE: NodeShape[] = ['circle', 'rectangle', 'rounded', 'diamond', 'triangle', 'hexagon', 'octagon', 'parallelogram', 'cloud'];

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

const getColorDistance = (hex1: string, hex2: string) => {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 0;
  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
    Math.pow(rgb1.g - rgb2.g, 2) +
    Math.pow(rgb1.b - rgb2.b, 2)
  );
};

const COLOR_MATCH_THRESHOLD = 80;

const isColorSimilar = (nodeColor: string | undefined, filterColor: string) => {
   if (!filterColor || filterColor === 'any') return true;
   const effectiveNodeColor = nodeColor || '#ffffff'; 
   const effectiveFilterColor = filterColor;
   if (effectiveFilterColor === 'transparent') return !nodeColor || nodeColor === 'transparent';
   if (effectiveNodeColor === effectiveFilterColor) return true;
   const dist = getColorDistance(effectiveNodeColor, effectiveFilterColor);
   return dist < COLOR_MATCH_THRESHOLD;
};

const parseEdgeId = (key: string): { sourceId: string, targetId: string } | null => {
    const splitIndex = key.indexOf('-node-', 1);
    if (splitIndex !== -1) {
        return { 
            sourceId: key.substring(0, splitIndex), 
            targetId: key.substring(splitIndex + 1) 
        };
    }
    const parts = key.split('-');
    if (parts.length >= 2) {
        const m = key.match(/(.+)-(.+)/);
        if(m && m[1] && m[2]) return { sourceId: m[1], targetId: m[2] };
        return null; 
    }
    return null;
};

const getVisibleNodeIds = (nodes: SingularityNode[], collapsedIds: Set<string>): Set<string> => {
    const visibleIds = new Set<string>();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const roots = nodes.filter(n => !n.parentId || !nodeMap.has(n.parentId));
    const queue = roots.map(n => n.id);

    while(queue.length > 0) {
        const id = queue.shift()!;
        visibleIds.add(id);

        if (!collapsedIds.has(id)) {
            const node = nodeMap.get(id);
            if (node && node.childrenIds) {
                node.childrenIds.forEach(childId => {
                    if(nodeMap.has(childId)) queue.push(childId);
                });
            }
        }
    }
    return visibleIds;
}

interface CanvasProps {
  mapId: string;
  onBack: () => void;
  isGenerating: boolean;
  setIsGenerating: (isGenerating: boolean) => void;
  triggerAiPrompt: any;
}

const SingularityCanvas: React.FC<CanvasProps> = ({ mapId, onBack, isGenerating, setIsGenerating }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragFrameRef = useRef<number>(0);
  const hasDraggedRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Zoom Inertia Refs
  const zoomVelocityRef = useRef(0);
  const lastZoomMousePosRef = useRef({ x: 0, y: 0 });
  const zoomInertiaFrameRef = useRef<number>(0);

  // Touch & Gesture Refs
  const touchStartDistRef = useRef<number>(0);
  const touchStartCenterRef = useRef<{x: number, y: number} | null>(null);
  const lastTouchPosRef = useRef<{x: number, y: number} | null>(null);
  const touchStartPosRef = useRef<{x: number, y: number} | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPinchingRef = useRef<boolean>(false);
  const touchStartNodeIdRef = useRef<string | null>(null); // Track initial node to avoid re-toggle during paint
  
  // Advanced Gesture Refs
  const lastTouchEndTimeRef = useRef<number>(0);
  const isPotentialAreaSelectionRef = useRef<boolean>(false);
  
  const [projectName, setProjectName] = useState("Untitled Mind Map");
  const [nodes, setNodes] = useState<SingularityNode[]>(INITIAL_NODES);
  const [drawings, setDrawings] = useState<DrawingPath[]>([]);
  const [edgeData, setEdgeData] = useState<Record<string, EdgeOptions>>({}); 
  const [viewport, setViewport] = useState<Viewport>({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 });
  const [mode, setMode] = useState<ToolMode>(ToolMode.SELECT);
  const [appMode, setAppMode] = useState<'MINDMAP' | 'FLOWCHART' | 'WHITEBOARD'>('MINDMAP');
  
  const [defaultEdgeOptions, setDefaultEdgeOptions] = useState<EdgeOptions>({
      stroke: 'solid',
      endMarker: 'arrow',
      color: '#cbd5e1',
      width: 2,
      routingType: 'curved',
      controlPoints: []
  });

  const [defaultNodeShape, setDefaultNodeShape] = useState<NodeShape>('rounded');
  const [defaultNodeColor, setDefaultNodeColor] = useState<string>('#ffffff');

  const [smartRules, setSmartRules] = useState<SmartStylingRules>({
    active: false,
    sibling: { color: true, shape: true, edge: true },
    child: { color: false, shape: false, edge: true }
  });
  
  const [linkSelectionMode, setLinkSelectionMode] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false); 
  const [isPaintingLinks, setIsPaintingLinks] = useState(false);
  const [styleClipboard, setStyleClipboard] = useState<{ color?: string, shape?: NodeShape } | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings>({ 
      theme: 'default', 
      showGrid: true,
      zoomSensitivity: 1.0,
      zoomInertia: false,
      autoEditOnCreate: true
  });
  
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null); 
  const [focusedDescendantIds, setFocusedDescendantIds] = useState<Set<string>>(new Set());

  const [isAiOptionsOpen, setIsAiOptionsOpen] = useState(false);
  const [aiTargetNodeId, setAiTargetNodeId] = useState<string | null>(null);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isNewMapModalOpen, setIsNewMapModalOpen] = useState(false);
  const [isDreamModalOpen, setIsDreamModalOpen] = useState(false);
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'PNG' | 'JPEG' | 'SVG'>('PNG');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  const [drawingSettings, setDrawingSettings] = useState({
     color: '#1e293b',
     width: 4,
     tool: 'pen' as 'pen' | 'highlighter' | 'eraser'
  });
  const [currentPath, setCurrentPath] = useState<DrawingPath | null>(null);
  
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ start: {x: number, y: number}, current: {x: number, y: number} } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragNodeIds, setDragNodeIds] = useState<Set<string>>(new Set());
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 }); 
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]); 
  
  const [edgeControlDrag, setEdgeControlDrag] = useState<{ edgeKey: string, index: number } | null>(null);
  const [isRightPanning, setIsRightPanning] = useState(false);
  const [hasMovedSinceRightClick, setHasMovedSinceRightClick] = useState(false);

  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [isPresentationFullscreen, setIsPresentationFullscreen] = useState(false);

  const [activeContextNodeId, setActiveContextNodeId] = useState<string | null>(null);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [activeControlPoint, setActiveControlPoint] = useState<{ edgeKey: string, index: number } | null>(null);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ left: number, top: number, right: number, bottom: number, width: number, height: number } | null>(null);

  const [customToolDefs, setCustomToolDefs] = useState<{id: string, label: string, iconName: string}[]>([]);
  const [isToolSelectionMode, setIsToolSelectionMode] = useState(false);
  
  // New State for Alt-Click / Connect Mode linking
  const [altLinkSourceId, setAltLinkSourceId] = useState<string | null>(null);
  const [tempLinkEndPos, setTempLinkEndPos] = useState<{x: number, y: number} | null>(null);
  
  // Drag-to-link State from ShapeDock
  const [linkStartScreenPos, setLinkStartScreenPos] = useState<{x: number, y: number} | null>(null);

  // VOICE COMMAND STATE
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const recognitionRef = useRef<any>(null);

  const currentTheme = APP_THEMES[canvasSettings.theme] || APP_THEMES['default'];
  
  useEffect(() => {
    if (isVoiceActive) {
      if (!('webkitSpeechRecognition' in window)) {
        alert("Voice control is not supported in this browser.");
        setIsVoiceActive(false);
        return;
      }
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const command = event.results[last][0].transcript.trim().toLowerCase();
        console.log("Voice Command:", command);
        handleVoiceCommand(command);
      };

      recognition.onerror = (e: any) => {
          console.error("Voice Error", e);
          setIsVoiceActive(false);
      }

      recognition.start();
      recognitionRef.current = recognition;
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    }
    return () => {
        if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [isVoiceActive]);

  const handleVoiceCommand = (cmd: string) => {
      if (cmd.startsWith('create node') || cmd.startsWith('new node') || cmd.startsWith('add node')) {
          const label = cmd.replace(/create node|new node|add node/, '').trim();
          handleAddNode(undefined, false, undefined, undefined, label || 'New Node');
      } 
      else if (cmd.startsWith('child') || cmd.startsWith('add child') || cmd.startsWith('sub node')) {
          const label = cmd.replace(/child|add child|sub node/, '').trim();
          if (selectedNodeIds.size > 0) {
              const parentId = Array.from(selectedNodeIds)[0] as string;
              handleAddNode(parentId, false, undefined, undefined, label || 'New Child');
          }
      }
      else if (cmd.includes('delete') || cmd.includes('remove')) {
          handleSelectionAction('delete');
      }
      else if (cmd.includes('focus')) {
          if (selectedNodeIds.size > 0) {
              const id = Array.from(selectedNodeIds)[0] as string;
              setFocusNodeId(id);
              centerOnNode(id);
          }
      }
      else if (cmd.startsWith('color') || cmd.startsWith('make it')) {
          const colorName = cmd.replace(/color|make it/, '').trim();
          const colors: Record<string, string> = {
              'red': '#ef4444', 'blue': '#3b82f6', 'green': '#10b981', 
              'yellow': '#f59e0b', 'orange': '#f97316', 'purple': '#8b5cf6',
              'pink': '#ec4899', 'black': '#000000', 'white': '#ffffff', 'gray': '#9ca3af'
          };
          if (colors[colorName] && selectedNodeIds.size > 0) {
              handleSelectionAction('color', colors[colorName]);
          }
      }
      else if (cmd === 'undo') undo();
      else if (cmd === 'redo') redo();
  };

  const visibleNodeIds = useMemo(() => {
      return getVisibleNodeIds(nodes, collapsedNodeIds);
  }, [nodes, collapsedNodeIds]);
  
  useEffect(() => {
    if (!focusNodeId) {
        setFocusedDescendantIds(new Set());
        return;
    }
    const childrenMap = new Map<string, string[]>();
    nodes.forEach(n => {
        if (n.parentId) {
            if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
            childrenMap.get(n.parentId)?.push(n.id);
        }
    });
    const ids = new Set<string>();
    const queue = [focusNodeId];
    while(queue.length > 0) {
        const currentId = queue.shift()!;
        ids.add(currentId);
        const children = childrenMap.get(currentId);
        if (children) {
            children.forEach(c => queue.push(c));
        }
    }
    setFocusedDescendantIds(ids);
  }, [focusNodeId, nodes]);

  const isNodeDimmed = (nodeId: string) => {
     if (focusNodeId) return !focusedDescendantIds.has(nodeId);
     if (searchQuery && searchResults.length > 0) return !searchResults.includes(nodeId);
     return false;
  };

  useEffect(() => {
      const savedTools = localStorage.getItem(`singularity-custom-toolbar-${mapId}`);
      if (savedTools) {
          try {
              const parsed = JSON.parse(savedTools);
              setCustomToolDefs(parsed);
          } catch (e) { console.error("Failed to load toolbar", e); }
      }
  }, [mapId]);

  useEffect(() => {
      localStorage.setItem(`singularity-custom-toolbar-${mapId}`, JSON.stringify(customToolDefs));
  }, [customToolDefs, mapId]);
  
  const resolveTool = (def: { id: string, label: string, iconName: string }): CustomTool => {
      const icon = (Icon as any)[def.iconName] || Icon.Help;
      let action = (payload?: any) => {};
      let isActive = false;

      if (def.id === 'toggle:link-paint') {
          action = () => setLinkSelectionMode(!linkSelectionMode);
          isActive = linkSelectionMode;
      } else if (def.id === 'toggle:smart-sibling-color') {
          action = () => setSmartRules(prev => ({...prev, sibling: {...prev.sibling, color: !prev.sibling.color}}));
          isActive = smartRules.sibling.color;
      } else if (def.id === 'toggle:smart-sibling-shape') {
          action = () => setSmartRules(prev => ({...prev, sibling: {...prev.sibling, shape: !prev.sibling.shape}}));
          isActive = smartRules.sibling.shape;
      } else if (def.id.startsWith('tool:')) {
          const modeId = def.id.split(':')[1] as ToolMode;
          action = () => setMode(prev => prev === modeId ? ToolMode.SELECT : modeId);
          isActive = mode === modeId;
      } else if (def.id.startsWith('action:')) {
          const act = def.id.split(':')[1];
          action = () => handleAction(act);
      } else if (def.id.startsWith('create:')) {
          const type = def.id.split(':')[1];
          if (type === 'note') action = () => handleAction('new-sticky-color');
          if (type === 'code') action = () => handleAction('code-node', 'JavaScript');
          if (type === 'table') action = () => handleAction('table-node');
      } else if (def.id.startsWith('shape:')) {
          const shape = def.id.split(':')[1];
          action = () => handleAction('add-node-shape', shape);
      } else if (def.id.startsWith('export:')) {
          const type = def.id.split(':')[1];
          action = () => handleExport(type as any);
      }

      return {
          id: def.id, 
          actionId: def.id,
          label: def.label,
          icon,
          action,
          isActive
      };
  };

  const customTools = customToolDefs.map(resolveTool);

  const handleEnterSelectionMode = () => {
      setIsToolSelectionMode(true);
      setIsSidebarOpen(true);
      setIsRightPanelOpen(true);
  };

  const handleExitSelectionMode = () => {
      setIsToolSelectionMode(false);
      setIsSidebarOpen(false);
      setIsRightPanelOpen(false);
  };

  const handleToolSelect = (toolId: string, label: string, iconName: string) => {
      if (!customToolDefs.find(t => t.id === toolId)) {
          setCustomToolDefs(prev => [...prev, { id: toolId, label, iconName }]);
      }
  };

  const handleRemoveTool = (index: number) => {
      setCustomToolDefs(prev => {
          const next = [...prev];
          next.splice(index, 1);
          return next;
      });
  };

  const handleDropTool = (index: number, toolData: any) => {
      setCustomToolDefs(prev => {
          const next = [...prev];
          next.splice(index, 0, { id: toolData.id, label: toolData.label, iconName: toolData.iconName });
          return next;
      });
  };

  const handleAddToolClick = () => {
    handleEnterSelectionMode();
  };
  
  useEffect(() => {
    const key = `singularity-map-${mapId}`;
    const savedData = localStorage.getItem(key);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.nodes) setNodes(parsed.nodes);
        if (parsed.drawings) setDrawings(parsed.drawings);
        if (parsed.edgeData) setEdgeData(parsed.edgeData);
        if (parsed.viewport) setViewport(parsed.viewport);
        if (parsed.projectName) setProjectName(parsed.projectName);
        if (parsed.canvasSettings) setCanvasSettings(prev => ({...prev, ...parsed.canvasSettings}));
        if (parsed.defaultEdgeOptions) setDefaultEdgeOptions(parsed.defaultEdgeOptions);
        if (parsed.defaultNodeShape) setDefaultNodeShape(parsed.defaultNodeShape);
        if (parsed.defaultNodeColor) setDefaultNodeColor(parsed.defaultNodeColor);
        if (parsed.smartRules) setSmartRules(parsed.smartRules);
        if (parsed.collapsedNodeIds) setCollapsedNodeIds(new Set(parsed.collapsedNodeIds));
      } catch (e) {
        console.error("Failed to load map data", e);
      }
    } else {
        setNodes(INITIAL_NODES);
        setProjectName("Untitled Mind Map");
        setViewport({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 });
        setDrawings([]);
        setEdgeData({});
    }
  }, [mapId]);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const key = `singularity-map-${mapId}`;
      const data = {
        nodes, edgeData, drawings, viewport, projectName, canvasSettings, defaultEdgeOptions, defaultNodeShape, defaultNodeColor, smartRules,
        collapsedNodeIds: Array.from(collapsedNodeIds)
      };
      localStorage.setItem(key, JSON.stringify(data));

      const indexStr = localStorage.getItem('singularity-maps-index');
      let index = indexStr ? JSON.parse(indexStr) : [];
      const existingIndex = index.findIndex((m: any) => m.id === mapId);
      if (existingIndex !== -1) {
          index[existingIndex] = { ...index[existingIndex], name: projectName, lastModified: Date.now() };
      } else {
          index.unshift({ id: mapId, name: projectName, lastModified: Date.now() });
      }
      localStorage.setItem('singularity-maps-index', JSON.stringify(index));

    }, 2000); 
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [nodes, drawings, edgeData, viewport, projectName, canvasSettings, defaultEdgeOptions, defaultNodeShape, defaultNodeColor, smartRules, mapId, collapsedNodeIds]);

  // TOUCH GESTURE LOGIC START
  const handleTouchStart = (e: React.TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input') || target.closest('.no-pan')) return;

      if (e.touches.length === 1) {
          const touch = e.touches[0];
          const now = Date.now();
          lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };
          touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
          
          const isDoubleTapStart = (now - lastTouchEndTimeRef.current) < 300;
          
          const hitEl = document.elementFromPoint(touch.clientX, touch.clientY);
          
          const nodeEl = hitEl?.closest('[data-node-id]');
          const hitNodeId = nodeEl?.getAttribute('data-node-id');
          const hitNode = hitNodeId ? nodes.find(n => n.id === hitNodeId) : null;

          if (isDoubleTapStart && !hitNode) {
              isPotentialAreaSelectionRef.current = true;
              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          } else if (hitNode) {
              // Record initial touch node to prevent re-toggle on drag-paint
              touchStartNodeIdRef.current = hitNode.id;

              // If CONNECT mode is active on mobile, start dragging connection immediately
              if (mode === ToolMode.CONNECT) {
                   setAltLinkSourceId(hitNode.id);
                   setTempLinkEndPos({ x: hitNode.position.x, y: hitNode.position.y });
                   // Don't select or drag node
                   if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                   return; 
              }

              if (isMultiSelectMode) {
                  // Toggle immediately on touch in multi-select mode
                  const newSet = new Set(selectedNodeIds);
                  if (newSet.has(hitNode.id)) newSet.delete(hitNode.id);
                  else newSet.add(hitNode.id);
                  setSelectedNodeIds(newSet);
                  // We don't set dragNodeIds here so panning logic in touchMove is skipped (or treated as paint)
              } else {
                  if (!isMultiSelectMode) {
                      let newSelection = new Set<string>();
                      if (selectedNodeIds.has(hitNode.id)) {
                          newSelection = new Set(selectedNodeIds);
                      } else {
                          newSelection = new Set([hitNode.id]);
                          setSelectedNodeIds(newSelection);
                      }
                      setDragNodeIds(newSelection);
                      hasDraggedRef.current = false;
                  }
              }
              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          } else {
              touchStartNodeIdRef.current = null;
              longPressTimerRef.current = setTimeout(() => {
                  setActiveContextNodeId(null);
                  setContextMenuAnchor({ left: touch.clientX, top: touch.clientY, right: touch.clientX, bottom: touch.clientY, width: 0, height: 0 });
                  if (navigator.vibrate) navigator.vibrate(50);
              }, 600);
          }
          
      } else if (e.touches.length === 2) {
          if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
          isPinchingRef.current = true;
          isPotentialAreaSelectionRef.current = false;
          
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          touchStartDistRef.current = dist;
          touchStartCenterRef.current = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      const target = e.target as HTMLElement;
      // Allow move if we are linking (altLinkSourceId is set) even if target is button
      if ((target.closest('button') || target.closest('input')) && !altLinkSourceId) return;

      if (e.touches.length === 1 && !isPinchingRef.current) {
          const touch = e.touches[0];
          
          // --- Update Connection Line if dragging ---
          if (altLinkSourceId) {
              const x = (touch.clientX - viewport.x) / viewport.zoom;
              const y = (touch.clientY - viewport.y) / viewport.zoom;
              setTempLinkEndPos({ x, y });
              return; // Don't pan or drag nodes while linking
          }
          // ----------------------------------------
          
          // *** MULTI-SELECT PAINT LOGIC ***
          if (isMultiSelectMode) {
              e.preventDefault(); // Prevent scrolling
              const hitEl = document.elementFromPoint(touch.clientX, touch.clientY);
              const nodeEl = hitEl?.closest('[data-node-id]');
              const hitNodeId = nodeEl?.getAttribute('data-node-id');
              
              // If we moved to a NEW node (different from start), select it (paint additive)
              if (hitNodeId && hitNodeId !== touchStartNodeIdRef.current) {
                  if (!selectedNodeIds.has(hitNodeId)) {
                      setSelectedNodeIds(prev => {
                          const next = new Set(prev);
                          next.add(hitNodeId);
                          return next;
                      });
                      if (navigator.vibrate) navigator.vibrate(5);
                  }
              }
              return;
          }
          // ********************************

          const last = lastTouchPosRef.current;
          if (!last) return;

          const dx = touch.clientX - last.x;
          const dy = touch.clientY - last.y;

          if (Math.abs(touch.clientX - (touchStartPosRef.current?.x || 0)) > 10 || Math.abs(touch.clientY - (touchStartPosRef.current?.y || 0)) > 10) {
              if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
          }

          if (isPotentialAreaSelectionRef.current) {
              if (!selectionBox) {
                  setSelectionBox({ start: {x: touchStartPosRef.current!.x, y: touchStartPosRef.current!.y}, current: {x: touch.clientX, y: touch.clientY} });
              } else {
                  setSelectionBox(prev => prev ? { ...prev, current: {x: touch.clientX, y: touch.clientY} } : null);
                  const x1 = Math.min(selectionBox.start.x, touch.clientX);
                  const y1 = Math.min(selectionBox.start.y, touch.clientY);
                  const x2 = Math.max(selectionBox.start.x, touch.clientX);
                  const y2 = Math.max(selectionBox.start.y, touch.clientY);
                  const wx1 = (x1 - viewport.x) / viewport.zoom;
                  const wy1 = (y1 - viewport.y) / viewport.zoom;
                  const wx2 = (x2 - viewport.x) / viewport.zoom;
                  const wy2 = (y2 - viewport.y) / viewport.zoom;
                  
                  const newSel = new Set<string>();
                  nodes.forEach(n => {
                      if(n.position.x >= wx1 && n.position.x <= wx2 && n.position.y >= wy1 && n.position.y <= wy2) {
                          newSel.add(n.id);
                      }
                  });
                  setSelectedNodeIds(newSel);
              }
              return; 
          }

          if (dragNodeIds.size > 0 && !isMultiSelectMode) {
              hasDraggedRef.current = true;
              e.preventDefault(); 
              const deltaX = dx / viewport.zoom;
              const deltaY = dy / viewport.zoom;
              
              setNodes(prev => prev.map(n => {
                  if (dragNodeIds.has(n.id)) {
                      return { ...n, position: { x: n.position.x + deltaX, y: n.position.y + deltaY } };
                  }
                  return n;
              }));
              
              setEdgeData(prev => {
                  let changed = false; const next = { ...prev };
                  dragNodeIds.forEach(sourceId => {
                      const sourceNode = nodes.find(n => n.id === sourceId);
                      if(sourceNode) {
                          sourceNode.childrenIds.forEach(targetId => {
                              if(dragNodeIds.has(targetId)) {
                                  const key = `${sourceId}-${targetId}`;
                                  const edge = next[key];
                                  if(edge && edge.controlPoints && edge.controlPoints.length > 0) {
                                      changed = true;
                                      next[key] = { ...edge, controlPoints: edge.controlPoints.map(p => ({ x: p.x + deltaX, y: p.y + deltaY })) };
                                  }
                              }
                          });
                      }
                  });
                  return changed ? next : prev;
              });
              lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };

          } else {
              if (Math.abs(touch.clientX - (touchStartPosRef.current?.x || 0)) > 10 || Math.abs(touch.clientY - (touchStartPosRef.current?.y || 0)) > 10) {
                  setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
                  lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };
              }
          }

      } else if (e.touches.length === 2) {
          if (e.cancelable) e.preventDefault(); 
          if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }

          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          
          if (touchStartDistRef.current > 0) {
              const scale = dist / touchStartDistRef.current;
              const effectiveScale = 1 + (scale - 1) * 0.8; 
              setViewport(prev => {
                  let newZoom = prev.zoom * effectiveScale;
                  newZoom = Math.min(Math.max(newZoom, ZOOM_MIN), ZOOM_MAX);
                  const center = touchStartCenterRef.current || { x: window.innerWidth/2, y: window.innerHeight/2 };
                  const wx = (center.x - prev.x) / prev.zoom;
                  const wy = (center.y - prev.y) / prev.zoom;
                  const newX = center.x - (wx * newZoom);
                  const newY = center.y - (wy * newZoom);
                  return { x: newX, y: newY, zoom: newZoom };
              });
              touchStartDistRef.current = dist; 
          }
      }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      lastTouchEndTimeRef.current = Date.now();
      isPotentialAreaSelectionRef.current = false;
      touchStartNodeIdRef.current = null; // Reset start node

      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }

      // --- Handle Connection Drop ---
      if (altLinkSourceId) {
          const touch = e.changedTouches[0];

          // Sticky mode check for touch interaction (tap to link)
          if (linkStartScreenPos) {
             const dist = Math.hypot(touch.clientX - linkStartScreenPos.x, touch.clientY - linkStartScreenPos.y);
             if (dist < 5) {
                 setLinkStartScreenPos(null);
                 return; // Stay in linking mode (Sticky)
             }
          }

          const hitEl = document.elementFromPoint(touch.clientX, touch.clientY);
          const nodeEl = hitEl?.closest('[data-node-id]');
          const hitNodeId = nodeEl?.getAttribute('data-node-id');
          
          if (hitNodeId && hitNodeId !== altLinkSourceId) {
               const source = getNodeById(altLinkSourceId);
               if (source && !source.childrenIds.includes(hitNodeId)) {
                  const newNodes = nodes.map(n => n.id === altLinkSourceId ? { ...n, childrenIds: [...n.childrenIds, hitNodeId] } : n);
                  const edgeKey = `${altLinkSourceId}-${hitNodeId}`;
                  const newEdgeData = { ...edgeData, [edgeKey]: { ...defaultEdgeOptions } };
                  updateState(newNodes, drawings, newEdgeData);
               }
          }
          setAltLinkSourceId(null);
          setTempLinkEndPos(null);
          setLinkStartScreenPos(null);
          return;
      }
      // ------------------------------
      
      if (selectionBox) {
          setSelectionBox(null);
          return;
      }

      if (dragNodeIds.size > 0 && hasDraggedRef.current) {
          commitHistory(nodes, drawings, edgeData);
          setDragNodeIds(new Set());
          hasDraggedRef.current = false;
          return;
      }
      setDragNodeIds(new Set());

      if (e.touches.length === 0 && !isPinchingRef.current && lastTouchPosRef.current && touchStartPosRef.current) {
          const dx = Math.abs(lastTouchPosRef.current.x - touchStartPosRef.current.x);
          const dy = Math.abs(lastTouchPosRef.current.y - touchStartPosRef.current.y);
          
          // Increased tolerance for taps to 15px
          if (dx < 15 && dy < 15) {
              const hitEl = document.elementFromPoint(lastTouchPosRef.current.x, lastTouchPosRef.current.y);
              const nodeEl = hitEl?.closest('[data-node-id]');
              const hitNodeId = nodeEl?.getAttribute('data-node-id');
              const hitNode = hitNodeId ? nodes.find(n => n.id === hitNodeId) : null;
              
              if (hitNode) {
                  if (isMultiSelectMode) {
                      // Do nothing here as selection was handled in handleTouchStart for responsiveness
                      return;
                  } else {
                      // In regular mode, simulate click for selection
                      // Note: if mode was CONNECT, we handled it in TouchStart, so this won't trigger unless mode changed
                      handleNodeClick({ stopPropagation: () => {}, preventDefault: () => {}, shiftKey: false, ctrlKey: false, altKey: false, clientX: lastTouchPosRef.current.x, clientY: lastTouchPosRef.current.y } as any, hitNode.id);
                  }
              } else {
                  if (!isMultiSelectMode) {
                      setSelectedNodeIds(new Set());
                      setSelectedEdgeIds(new Set());
                      setActiveContextNodeId(null);
                      setContextMenuAnchor(null);
                  }
              }
          }
      }

      if (e.touches.length < 2) isPinchingRef.current = false;
      if (e.touches.length === 0) lastTouchPosRef.current = null;
  };
  // --- TOUCH GESTURE LOGIC END ---

  const handleToggleNodeExpansion = (nodeId: string) => {
      setCollapsedNodeIds(prev => {
          const next = new Set(prev);
          if (next.has(nodeId)) { next.delete(nodeId); } else { next.add(nodeId); const traverse = (id: string) => { const node = nodes.find(n => n.id === id); if (node) { node.childrenIds.forEach(childId => { next.add(childId); traverse(childId); }); } }; traverse(nodeId); }
          return next;
      });
  };
  const handleExpandAll = () => { setCollapsedNodeIds(new Set()); };
  const handleCollapseAll = () => { const allParents = new Set<string>(); nodes.forEach(n => { if (n.childrenIds.length > 0) allParents.add(n.id); }); setCollapsedNodeIds(allParents); };
  const centerOnNode = (nodeId: string, targetZoom?: number) => { const node = nodes.find(n => n.id === nodeId); if (node) { const z = targetZoom || viewport.zoom; const newX = (window.innerWidth / 2) - (node.position.x * z); const newY = (window.innerHeight / 2) - (node.position.y * z); setViewport({ x: newX, y: newY, zoom: z }); } };

  // ... (Rest of logic: handleCreateNewMap, handleSummarizeBranch, etc. keep as is)
  const handleCreateNewMap = async (goal: string) => { setIsNewMapModalOpen(false); setIsGenerating(true); if (!goal.trim()) { updateState(INITIAL_NODES, [], {}); setViewport({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 }); setIsGenerating(false); return; } const aiData = await generateMindMapData(goal); if (aiData) { const center = { x: 0, y: 0 }; const layoutNodes = calculateLayout(aiData, center.x, center.y); const organicNodes = layoutOrganic(layoutNodes); updateState(organicNodes, [], {}); setViewport({ x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 }); setProjectName(goal); } else { alert("AI could not generate the map. Starting blank."); updateState(INITIAL_NODES, [], {}); } setIsGenerating(false); };
  const handleSummarizeBranch = async (nodeId: string) => { const rootNode = getNodeById(nodeId); if (!rootNode) return; setIsGenerating(true); let structureText = ""; const traverse = (id: string, depth: number) => { const node = getNodeById(id); if (node) { structureText += `${'  '.repeat(depth)}- ${node.label}\n`; node.childrenIds.forEach(cid => traverse(cid, depth + 1)); } }; traverse(nodeId, 0); const summary = await summarizeBranch(rootNode.label, structureText); const noteId = generateId(); const newNote: SingularityNode = { id: noteId, type: NodeType.NOTE, label: `📝 Summary of ${rootNode.label}:\n\n${summary}`, position: { x: rootNode.position.x + 350, y: rootNode.position.y }, childrenIds: [], shape: 'rectangle', color: '#fff740' }; const newNodes = nodes.map(n => n.id === nodeId ? { ...n, childrenIds: [...n.childrenIds, noteId] } : n); const edgeKey = `${nodeId}-${noteId}`; const newEdgeData = { ...edgeData, [edgeKey]: { stroke: 'dashed' as const, color: '#fbbf24' } }; updateState([...newNodes, newNote], drawings, newEdgeData); setIsGenerating(false); };
  const handleDreamNode = async (style: string) => { const targetId = aiTargetNodeId; const node = nodes.find(n => n.id === targetId); if (!node) return; const parent = nodes.find(n => n.id === node.parentId); const context = parent ? parent.label : 'Main Concept'; updateState(nodes.map(n => n.id === targetId ? { ...n, data: { ...n.data, isDreaming: true } } : n)); const imageUrl = await generateDreamImage(node.label, context, style); if (imageUrl) { updateState(nodes.map(n => n.id === targetId ? { ...n, type: NodeType.MEDIA, data: { ...n.data, imageUrl, isDreaming: false } } : n)); } else { updateState(nodes.map(n => n.id === targetId ? { ...n, data: { ...n.data, isDreaming: false } } : n)); alert("Could not dream up an image. Try again."); } };
  useEffect(() => { const handlePaste = (e: ClipboardEvent) => { if (editingNodeId) return; const items = e.clipboardData?.items; if (!items) return; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { e.preventDefault(); const blob = items[i].getAsFile(); if (blob) { const reader = new FileReader(); reader.onload = (event) => { if (event.target?.result) { const centerPos = { x: (window.innerWidth / 2 - viewport.x) / viewport.zoom, y: (window.innerHeight / 2 - viewport.y) / viewport.zoom }; handleAddNode(undefined, false, NodeType.MEDIA, undefined, 'Pasted Image', undefined, { imageUrl: event.target.result }, centerPos); } }; reader.readAsDataURL(blob); } } } }; window.addEventListener('paste', handlePaste); return () => window.removeEventListener('paste', handlePaste); }, [editingNodeId, viewport, nodes]);
  const commitHistory = useCallback((currentNodes: SingularityNode[], currentDrawings: DrawingPath[], currentEdgeData: Record<string, EdgeOptions>) => { let currentIndex = historyIndex; if (!Array.isArray(history)) { setHistory([]); currentIndex = -1; } if (currentIndex < -1) currentIndex = -1; if (currentIndex >= history.length) currentIndex = history.length - 1; const newStep: HistoryStep = { nodes: JSON.parse(JSON.stringify(currentNodes)), drawings: JSON.parse(JSON.stringify(currentDrawings)), edgeData: JSON.parse(JSON.stringify(currentEdgeData)) }; const newHistory = history.slice(0, currentIndex + 1); newHistory.push(newStep); if (newHistory.length > 50) newHistory.shift(); setHistory(newHistory); setHistoryIndex(newHistory.length - 1); }, [history, historyIndex]);
  const updateState = (newNodes: SingularityNode[], newDrawings: DrawingPath[] = drawings, newEdgeData: Record<string, EdgeOptions> = edgeData) => { setNodes(newNodes); setDrawings(newDrawings); setEdgeData(newEdgeData); commitHistory(newNodes, newDrawings, newEdgeData); };
  const undo = () => { if (historyIndex > 0) { const prevStep = history[historyIndex - 1]; setNodes(JSON.parse(JSON.stringify(prevStep.nodes))); setDrawings(JSON.parse(JSON.stringify(prevStep.drawings))); setEdgeData(JSON.parse(JSON.stringify(prevStep.edgeData))); setHistoryIndex(historyIndex - 1); } };
  const redo = () => { if (historyIndex < history.length - 1) { const nextStep = history[historyIndex + 1]; setNodes(JSON.parse(JSON.stringify(nextStep.nodes))); setDrawings(JSON.parse(JSON.stringify(nextStep.drawings))); setEdgeData(JSON.parse(JSON.stringify(nextStep.edgeData))); setHistoryIndex(historyIndex + 1); } };
  useEffect(() => { if (!searchQuery) { setSearchResults([]); return; } const matches = nodes.filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase())).map(n => n.id); setSearchResults(matches); setCurrentResultIndex(0); if (matches.length > 0) centerOnNode(matches[0]); }, [searchQuery, nodes]);
  const handleNextResult = () => { if (searchResults.length === 0) return; const nextIndex = (currentResultIndex + 1) % searchResults.length; setCurrentResultIndex(nextIndex); centerOnNode(searchResults[nextIndex]); };
  const handlePrevResult = () => { if (searchResults.length === 0) return; const prevIndex = (currentResultIndex - 1 + searchResults.length) % searchResults.length; setCurrentResultIndex(prevIndex); centerOnNode(searchResults[prevIndex]); };
  const handleVideoExport = async () => { try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false }); const mimeType = 'video/webm;codecs=vp9'; const mediaRecorder = new MediaRecorder(stream, { mimeType }); const chunks: Blob[] = []; mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); }; mediaRecorder.onstop = () => { const blob = new Blob(chunks, { type: mimeType }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${projectName.replace(/\s+/g, '_')}_recording.webm`; a.click(); URL.revokeObjectURL(url); stream.getTracks().forEach(track => track.stop()); }; mediaRecorder.start(); stream.getVideoTracks()[0].onended = () => { if (mediaRecorder.state !== 'inactive') { mediaRecorder.stop(); } }; } catch (err) { console.error("Error starting screen recording:", err); alert("Screen recording cancelled or failed."); } };
  const handleExport = async (type: 'JSON' | 'MD' | 'PNG' | 'JPEG' | 'TXT' | 'SVG' | 'PDF' | 'DOC' | 'EXCEL' | 'OPML' | 'VIDEO' | 'HTML') => { if (type === 'JSON') { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ nodes, edgeData, drawings, viewport, projectName }, null, 2)); const downloadAnchorNode = document.createElement('a'); downloadAnchorNode.setAttribute("href", dataStr); downloadAnchorNode.setAttribute("download", `${projectName.replace(/\s+/g, '_')}_backup.json`); document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); downloadAnchorNode.remove(); } else if (type === 'MD') { exportToDoc(nodes, projectName); } else if (type === 'TXT') { exportToOPML(nodes, projectName); } else if (type === 'PNG' || type === 'JPEG' || type === 'SVG') { setExportFormat(type); setIsExportModalOpen(true); } else if (type === 'HTML') { generateInteractiveHTML(nodes, edgeData, projectName, currentTheme); } else if (type === 'DOC') { exportToDoc(nodes, projectName); } else if (type === 'PDF') { printToPDF(projectName); } else if (type === 'EXCEL') { exportToCSV(nodes, projectName); } else if (type === 'OPML') { exportToOPML(nodes, projectName); } else if (type === 'VIDEO') { handleVideoExport(); } };
  const handleMagicStyle = async (nodeId: string) => { const node = getNodeById(nodeId); if (!node) return; setIsGenerating(true); const result = await analyzeNodeContent(node.label); if (result) { let newNodeType = node.type; if (result.type === 'TASK') newNodeType = NodeType.TASK; if (result.type === 'CODE') newNodeType = NodeType.CODE; updateState(nodes.map(n => n.id === nodeId ? { ...n, type: newNodeType, color: result.color, shape: result.shape as NodeShape } : n)); } setIsGenerating(false); };
  const handleLayoutAction = (type: LayoutType) => { let processedNodes = [...nodes]; if (type === 'FLOWCHART') { processedNodes = processedNodes.map(n => ({ ...n, originalShape: n.originalShape || n.shape, shape: n.label.includes('?') || n.type === NodeType.MAIN ? 'diamond' : 'rectangle' })); } else { processedNodes = processedNodes.map(n => ({ ...n, shape: n.originalShape || n.shape, originalShape: undefined })); } let layoutTargetNodes = processedNodes; let isPartialLayout = selectedNodeIds.size > 0; if (isPartialLayout) { const selected = processedNodes.filter(n => selectedNodeIds.has(n.id)); if (selected.length > 0) layoutTargetNodes = selected; else isPartialLayout = false; } const laidOutNodes = recalculateLayout(layoutTargetNodes, type); if (isPartialLayout) { const centroidX = layoutTargetNodes.reduce((sum, n) => sum + n.position.x, 0) / layoutTargetNodes.length; const centroidY = layoutTargetNodes.reduce((sum, n) => sum + n.position.y, 0) / layoutTargetNodes.length; const newCentroidX = laidOutNodes.reduce((sum, n) => sum + n.position.x, 0) / laidOutNodes.length; const newCentroidY = laidOutNodes.reduce((sum, n) => sum + n.position.y, 0) / laidOutNodes.length; const offsetX = centroidX - newCentroidX; const offsetY = centroidY - newCentroidY; const mergedNodes = processedNodes.map(n => { const updated = laidOutNodes.find(sub => sub.id === n.id); if (updated) { return { ...updated, position: { x: updated.position.x + offsetX, y: updated.position.y + offsetY } }; } return n; }); updateState(mergedNodes); } else { updateState(laidOutNodes); } };

  const handleAction = (actionId: string, payload?: any) => { switch(actionId) { case 'undo': undo(); break; case 'redo': redo(); break; case 'center': setViewport(prev => ({ ...prev, x: window.innerWidth/2 - (nodes[0]?.position.x * prev.zoom || 0), y: window.innerHeight/2 - (nodes[0]?.position.y * prev.zoom || 0) })); break; case 'fit': handleLayoutAction('MINDMAP_LR'); setViewport(prev => ({ ...prev, zoom: 0.8 })); break; case 'zoom-in': setViewport(prev => ({ ...prev, zoom: Math.min(5, prev.zoom + 0.1) })); break; case 'zoom-out': setViewport(prev => ({ ...prev, zoom: Math.max(0.1, prev.zoom - 0.1) })); break; case 'new-map': setIsNewMapModalOpen(true); break; case 'export-image': handleExport('PNG'); break; case 'export-jpeg': handleExport('JPEG'); break; case 'export-text': handleExport('TXT'); break; case 'export-json': handleExport('JSON'); break; case 'shortcuts': setIsShortcutsOpen(true); break; case 'select-all': setSelectedNodeIds(new Set(nodes.map(n => n.id))); break; case 'template-swot': handleLoadTemplate('SWOT'); break; case 'template-roadmap': handleLoadTemplate('ROADMAP'); break; case 'template-plan': handleLoadTemplate('PROJECT_PLAN'); break; case 'layout': handleLayoutAction(payload as LayoutType); break; case 'add-node-shape': { const p = payload as any; const shape = typeof p === 'string' ? p : p?.shape; const pos = typeof p === 'object' ? p?.position : undefined; handleAddNode(undefined, false, NodeType.SUB, shape as NodeShape, undefined, undefined, undefined, pos); break; } case 'new-sticky-color': handleAddNote(true, payload as any); break; case 'code-node': handleAddNode(undefined, false, NodeType.CODE, 'rectangle', 'Code Snippet', undefined, payload); break; case 'table-node': handleAddNode(undefined, false, NodeType.TABLE, 'rectangle', 'Data Table', undefined, payload); break; case 'open-media-modal': setIsMediaModalOpen(true); break; case 'search': setIsFindOpen(true); break; case 'ai-expand': { const s = getSelectedNode(); if(s) { setAiTargetNodeId(s.id); setIsAiOptionsOpen(true); } else alert("Select a node to expand."); break; } case 'ai-chat': setIsChatOpen(true); break; case 'present': if (!document.fullscreenElement) { containerRef.current?.requestFullscreen(); setIsPresentationFullscreen(true); } else { document.exitFullscreen(); setIsPresentationFullscreen(false); } break; case 'copy-style': { const node = getSelectedNode(); if (node) setStyleClipboard({ color: node.color, shape: node.shape }); break; } case 'paste-style': { if (styleClipboard && selectedNodeIds.size > 0) { const newNodes = nodes.map(n => selectedNodeIds.has(n.id) ? { ...n, color: styleClipboard.color || n.color, shape: styleClipboard.shape || n.shape } : n); updateState(newNodes); } break; } case 'replace-global-style': { const { find, replace } = payload || {}; if (!replace) return; const matchedNodeIds = new Set<string>(); const newNodes = nodes.map(n => { const matchesShape = !find.shape || find.shape === 'any' || n.shape === find.shape; const matchesColor = isColorSimilar(n.color, find.color); if (matchesShape && matchesColor) { matchedNodeIds.add(n.id); return { ...n, shape: replace.shape && replace.shape !== 'any' ? replace.shape : n.shape, color: replace.color && replace.color !== 'any' ? replace.color : n.color }; } return n; }); let newEdgeData = edgeData; const replacingLinkColor = replace.linkColor && replace.linkColor !== 'any'; const findingLinkColor = find.linkColor && find.linkColor !== 'any'; if (replacingLinkColor || findingLinkColor) { newEdgeData = { ...edgeData }; Object.keys(newEdgeData).forEach(key => { const edge = newEdgeData[key]; const [source, target] = key.split('-'); const matchesFindColor = !findingLinkColor || isColorSimilar(edge.color, find.linkColor); let shouldReplace = false; if (findingLinkColor) { if (matchesFindColor) shouldReplace = true; } else { if (matchedNodeIds.has(source)) shouldReplace = true; } if (shouldReplace && replacingLinkColor) { newEdgeData[key] = { ...edge, color: replace.linkColor }; } }); } if (JSON.stringify(newNodes) !== JSON.stringify(nodes) || JSON.stringify(newEdgeData) !== JSON.stringify(edgeData)) { updateState(newNodes, drawings, newEdgeData); } break; } case 'edge-bulk-update': { const { color, stroke, routingType, endMarker } = payload || {}; if (selectedEdgeIds.size === 0 && !linkSelectionMode) return; if (selectedEdgeIds.size === 0) return; let newEdgeData = { ...edgeData }; selectedEdgeIds.forEach(edgeKey => { if (!newEdgeData[edgeKey]) return; const current = newEdgeData[edgeKey]; newEdgeData[edgeKey] = { ...current, color: color !== undefined ? color : current.color, stroke: stroke !== undefined ? stroke : current.stroke, routingType: routingType !== undefined ? routingType : current.routingType, endMarker: endMarker !== undefined ? endMarker : current.endMarker, controlPoints: routingType !== undefined && routingType !== current.routingType ? [] : current.controlPoints }; }); updateState(nodes, drawings, newEdgeData); break; } case 'edge-align-horizontal': { if (selectedEdgeIds.size === 0) return; let totalY = 0; let count = 0; selectedEdgeIds.forEach(key => { if(edgeData[key]?.controlPoints?.[0]) { totalY += edgeData[key].controlPoints![0].y; count++; } }); if (count === 0) return; const avgY = totalY / count; let newEdgeData = { ...edgeData }; selectedEdgeIds.forEach(key => { if(newEdgeData[key]?.controlPoints?.[0]) { const newPoints = [...newEdgeData[key].controlPoints!]; newPoints[0] = { ...newPoints[0], y: avgY }; newEdgeData[key] = { ...newEdgeData[key], controlPoints: newPoints }; } }); updateState(nodes, drawings, newEdgeData); break; } case 'edge-align-vertical': { if (selectedEdgeIds.size === 0) return; let totalX = 0; let count = 0; selectedEdgeIds.forEach(key => { if(edgeData[key]?.controlPoints?.[0]) { totalX += edgeData[key].controlPoints![0].x; count++; } }); if (count === 0) return; const avgX = totalX / count; let newEdgeData = { ...edgeData }; selectedEdgeIds.forEach(key => { if(newEdgeData[key]?.controlPoints?.[0]) { const newPoints = [...newEdgeData[key].controlPoints!]; newPoints[0] = { ...newPoints[0], x: avgX }; newEdgeData[key] = { ...newEdgeData[key], controlPoints: newPoints }; } }); updateState(nodes, drawings, newEdgeData); break; } case 'edge-delete-selected': { if (selectedEdgeIds.size === 0) return; let newNodes = [...nodes]; selectedEdgeIds.forEach(key => { const parsed = parseEdgeId(key); if (parsed) { const { sourceId, targetId } = parsed; newNodes = newNodes.map(n => n.id === sourceId ? { ...n, childrenIds: n.childrenIds.filter(childId => childId !== targetId) } : n); } }); let newEdgeData = { ...edgeData }; selectedEdgeIds.forEach(key => delete newEdgeData[key]); updateState(newNodes, drawings, newEdgeData); setSelectedEdgeIds(new Set()); break; } case 'focus': { if (selectedNodeIds.size > 0) { const id = Array.from(selectedNodeIds)[0] as string; setFocusNodeId(id); centerOnNode(id); } break; } case 'dream-node': { if (selectedNodeIds.size > 0) { setAiTargetNodeId(Array.from(selectedNodeIds)[0] as string); setIsDreamModalOpen(true); } break; } case 'update-node-data': { const { id, data } = payload; if (id && data) handleDataChange(id, data); break; } } };
  const handleSelectionAction = (action: string, payload?: any) => { if (selectedNodeIds.size === 0) return; const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id)); let newNodes = [...nodes]; switch(action) { case 'color': newNodes = newNodes.map(n => selectedNodeIds.has(n.id) ? { ...n, color: payload as string } : n); break; case 'shape': newNodes = newNodes.map(n => selectedNodeIds.has(n.id) ? { ...n, shape: payload as NodeShape } : n); break; case 'delete': newNodes = newNodes.filter(n => !selectedNodeIds.has(n.id)); newNodes = newNodes.map(n => ({ ...n, childrenIds: n.childrenIds.filter(cid => !selectedNodeIds.has(cid)) })); setSelectedNodeIds(new Set()); break; case 'duplicate': const clones: SingularityNode[] = []; const newSelection = new Set<string>(); selectedNodes.forEach(node => { const id = generateId(); clones.push({ ...node, id, position: { x: node.position.x + 20, y: node.position.y + 20 }, childrenIds: [], label: node.label + ' (Copy)' }); newSelection.add(id); }); newNodes = [...newNodes, ...clones]; setSelectedNodeIds(newSelection); break; case 'lock': newNodes = newNodes.map(n => selectedNodeIds.has(n.id) ? { ...n, locked: !n.locked } : n); break; case 'align-left': { const minX = Math.min(...selectedNodes.map(n => n.position.x)); newNodes = newNodes.map(n => selectedNodeIds.has(n.id) ? { ...n, position: { ...n.position, x: minX } } : n); break; } case 'align-center': { const avgX = selectedNodes.reduce((sum, n) => sum + n.position.x, 0) / selectedNodes.length; newNodes = newNodes.map(n => selectedNodeIds.has(n.id) ? { ...n, position: { ...n.position, x: avgX } } : n); break; } } updateState(newNodes); };
  const getNodeById = (id: string) => nodes.find(n => n.id === id);
  const getSelectedNode = () => { const ids = Array.from(selectedNodeIds); return ids.length === 1 ? getNodeById(ids[0] as string) : null; };
  const handleAddNode = (parentId?: string, sibling?: boolean, specificType?: NodeType, specificShape?: NodeShape, customLabel?: string, customColor?: string, data?: any, position?: { x: number, y: number }) => { let shapeToUse: NodeShape = specificShape || defaultNodeShape; let colorToUse: string = customColor || defaultNodeColor; if (appMode === 'FLOWCHART' && !specificShape) shapeToUse = 'rectangle'; const baseNode = parentId ? getNodeById(parentId) : (getSelectedNode() || nodes[0]); let edgeStyleToCopy: EdgeOptions | undefined = undefined; if (!specificShape && !customColor && smartRules.active && baseNode) { const isSibling = sibling; const rules = isSibling ? smartRules.sibling : smartRules.child; const referenceNode = baseNode; if (rules.color && referenceNode.color) colorToUse = referenceNode.color; if (rules.shape && referenceNode.shape) shapeToUse = referenceNode.shape; if (rules.edge) { const edgeKey = Object.keys(edgeData).find(k => k.endsWith(`-${referenceNode.id}`)); if (edgeKey) edgeStyleToCopy = edgeData[edgeKey]; } } const typeToUse = specificType || (appMode === 'MINDMAP' ? (parentId ? NodeType.SUB : NodeType.ROOT) : NodeType.MAIN); if ((!parentId && !sibling) || typeToUse === NodeType.MEDIA || typeToUse === NodeType.CODE || typeToUse === NodeType.TABLE || typeToUse === NodeType.NOTE) { const id = generateId(); const centerPos = position || { x: (window.innerWidth / 2 - viewport.x) / viewport.zoom, y: (window.innerHeight / 2 - viewport.y) / viewport.zoom }; if (!position) { centerPos.x += (Math.random() * 50 - 25); centerPos.y += (Math.random() * 50 - 25); } let newData = data; if (typeToUse === NodeType.CODE && !newData) { newData = { codeLanguage: 'JavaScript', codeSnippet: '// Write some code' }; } else if (typeToUse === NodeType.TABLE && !newData) { newData = { tableRows: [['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']] }; } const newNode: SingularityNode = { id, type: typeToUse, label: customLabel || (typeToUse === NodeType.NOTE ? 'New Note' : typeToUse === NodeType.CODE ? 'Code Snippet' : typeToUse === NodeType.TABLE ? 'Data Table' : 'New Node'), position: centerPos, childrenIds: [], shape: shapeToUse, color: colorToUse, data: newData }; let newNodes = [...nodes, newNode]; newNodes = pushNodesAside(newNode, newNodes); updateState(newNodes); setSelectedNodeIds(new Set([id])); if (typeToUse !== NodeType.MEDIA && canvasSettings.autoEditOnCreate !== false) setEditingNodeId(id); return; } if (!baseNode) { handleAddNode(undefined, false, specificType, specificShape, customLabel, customColor, data, position); return; } const parent = sibling && baseNode.parentId ? getNodeById(baseNode.parentId) : baseNode; if (!parent) return; const newId = generateId(); const newNode: SingularityNode = { id: newId, type: specificType || (parent.type === NodeType.ROOT ? NodeType.MAIN : NodeType.SUB), label: customLabel || 'New Node', position: { x: parent.position.x, y: parent.position.y }, parentId: parent.id, childrenIds: [], shape: shapeToUse, color: colorToUse }; const updatedNodes = nodes.map(n => n.id === parent.id ? { ...n, childrenIds: [...n.childrenIds, newId] } : n); const edgeKey = `${parent.id}-${newId}`; let edgeOpts = { ...defaultEdgeOptions }; if (smartRules.active && edgeStyleToCopy) { edgeOpts = { ...edgeStyleToCopy, label: undefined }; } else { edgeOpts = { ...defaultEdgeOptions }; } const newEdgeData = { ...edgeData, [edgeKey]: edgeOpts }; let finalNodes = [...updatedNodes, newNode]; if (appMode === 'MINDMAP') { const parentNode = finalNodes.find(n => n.id === parent.id); if (parentNode) { const children = parentNode.childrenIds.map(cid => finalNodes.find(n => n.id === cid)).filter(Boolean) as SingularityNode[]; const grandParent = parentNode.parentId ? finalNodes.find(n => n.id === parentNode.parentId) : undefined; const laidOutChildren = layoutLocalFlower(parentNode, children, grandParent); finalNodes = finalNodes.map(n => { const found = laidOutChildren.find(c => c.id === n.id); return found || n; }); } } const createdNode = finalNodes.find(n => n.id === newId); if (createdNode) { finalNodes = pushNodesAside(createdNode, finalNodes); } updateState(finalNodes, drawings, newEdgeData); setSelectedNodeIds(new Set([newId])); if(canvasSettings.autoEditOnCreate !== false) setEditingNodeId(newId); if(collapsedNodeIds.has(parent.id)) { setCollapsedNodeIds(prev => { const next = new Set(prev); next.delete(parent.id); return next; }); } };
  const handleToggleTask = (nodeId: string) => { const node = getNodeById(nodeId); if (node) updateState(nodes.map(n => n.id === nodeId ? { ...n, checked: !n.checked } : n)); };
  const handleListChange = (nodeId: string, items: string[]) => { const node = getNodeById(nodeId); if (node) { const newData = { ...node.data, items }; updateState(nodes.map(n => n.id === nodeId ? { ...n, data: newData } : n)); } };
  const handleDataChange = (nodeId: string, data: any) => { const node = getNodeById(nodeId); if (node) { const newData = { ...node.data, ...data }; updateState(nodes.map(n => n.id === nodeId ? { ...n, data: newData } : n)); } };
  const handleLoadTemplate = (type: 'SWOT' | 'ROADMAP' | 'PROJECT_PLAN') => { if (confirm("This will replace your current map content. Continue?")) { const center = { x: (window.innerWidth / 2 - viewport.x) / viewport.zoom, y: (window.innerHeight / 2 - viewport.y) / viewport.zoom }; let newNodes: SingularityNode[] = []; if (TEMPLATES[type]) { newNodes = TEMPLATES[type](center.x, center.y); } updateState(newNodes, [], {}); setViewport(prev => ({ ...prev, x: window.innerWidth/2 - center.x * prev.zoom, y: window.innerHeight/2 - center.y * prev.zoom })); } };
  const handleAddNote = (isSticky: boolean, color?: string) => { const id = generateId(); const centerPos = { x: (window.innerWidth / 2 - viewport.x) / viewport.zoom, y: (window.innerHeight / 2 - viewport.y) / viewport.zoom }; const newNode: SingularityNode = { id, type: NodeType.NOTE, label: isSticky ? 'Sticky Note' : 'Type here...', position: centerPos, childrenIds: [], shape: isSticky ? undefined : 'rectangle', color: color || (isSticky ? '#fef3c7' : 'transparent'), }; updateState([...nodes, newNode]); setSelectedNodeIds(new Set([id])); if(canvasSettings.autoEditOnCreate !== false) setEditingNodeId(id); };
  const handleAutoLayout = () => { handleLayoutAction('MINDMAP_LR'); };

  const handleStartLinkDrag = (e: React.MouseEvent | React.TouchEvent, nodeId: string) => {
      e.stopPropagation();
      // For touch, we don't want to call preventDefault on touchstart if it's passive, but we want to stop propagation.
      // Drag logic relies on subsequent moves.
      
      let clientX, clientY;
      if ('touches' in e) {
          // Touch Event
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
      } else {
          // Mouse Event
          e.preventDefault();
          clientX = (e as React.MouseEvent).clientX;
          clientY = (e as React.MouseEvent).clientY;
      }

      const node = nodes.find(n => n.id === nodeId);
      if(node) {
          setAltLinkSourceId(nodeId);
          const x = (clientX - viewport.x) / viewport.zoom;
          const y = (clientY - viewport.y) / viewport.zoom;
          setTempLinkEndPos({ x, y });
          setLinkStartScreenPos({ x: clientX, y: clientY }); // Track start pos
      }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return; if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedEdgeIds.size > 0 && selectedNodeIds.size === 0) handleAction('edge-delete-selected'); else handleSelectionAction('delete'); } if (e.key === 'Tab') { e.preventDefault(); if (selectedNodeIds.size === 1) handleAddNode(Array.from(selectedNodeIds)[0] as string, false); } if (e.key === 'Enter') { e.preventDefault(); if (selectedNodeIds.size === 1) handleAddNode(Array.from(selectedNodeIds)[0] as string, true); } if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !isPresentationFullscreen) { e.preventDefault(); setMode(prev => prev === ToolMode.SELECT ? ToolMode.HAND : prev === ToolMode.HAND ? ToolMode.CONNECT : ToolMode.SELECT); } if (e.key.toLowerCase() === 'v') setMode(ToolMode.SELECT); if (e.key.toLowerCase() === 'h') setMode(ToolMode.HAND); if (e.key.toLowerCase() === 'd') setMode(ToolMode.DRAW); if (e.key.toLowerCase() === 'l') handleAutoLayout(); if (e.key.toLowerCase() === 'c') handleAction('center'); if (e.key === 'Escape') { setSelectedNodeIds(new Set()); setSelectedEdgeIds(new Set()); setConnectSourceId(null); setAltLinkSourceId(null); setTempLinkEndPos(null); setMode(ToolMode.SELECT); setIsFindOpen(false); setIsAiOptionsOpen(false); setIsMediaModalOpen(false); setIsShortcutsOpen(false); setIsCmdPaletteOpen(false); setIsDreamModalOpen(false); setIsExportModalOpen(false); setActiveContextNodeId(null); setActiveEdgeId(null); setActiveControlPoint(null); setContextMenuAnchor(null); setFocusNodeId(null); if(isPresentationFullscreen) { document.exitFullscreen(); setIsPresentationFullscreen(false); } setIsToolSelectionMode(false); setIsSidebarOpen(false); setIsRightPanelOpen(false); } if (e.ctrlKey || e.metaKey) { if (e.key === 'z') { e.preventDefault(); undo(); } if (e.key === 'y') { e.preventDefault(); redo(); } if (e.key === 'a') { e.preventDefault(); handleAction('select-all'); } if (e.key === 'f') { e.preventDefault(); handleAction('search'); } if (e.key === 'k') { e.preventDefault(); setIsCmdPaletteOpen(prev => !prev); } } if (e.ctrlKey && e.altKey) { if (e.key.toLowerCase() === 'c') { e.preventDefault(); handleAction('copy-style'); } if (e.key.toLowerCase() === 'v') { e.preventDefault(); handleAction('paste-style'); } } if (e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); handleAction('present'); } };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, selectedEdgeIds, mode, nodes, edgeData, historyIndex, isPresentationFullscreen, styleClipboard, smartRules, defaultEdgeOptions, defaultNodeShape, defaultNodeColor, appMode]);

  // Physics loop for Inertia
  const applyZoomInertia = useCallback(() => {
      if (!canvasSettings.zoomInertia) return;
      if (Math.abs(zoomVelocityRef.current) < 0.001) { zoomVelocityRef.current = 0; cancelAnimationFrame(zoomInertiaFrameRef.current); return; }
      setViewport(prev => {
          const factor = Math.pow(1.002, -zoomVelocityRef.current);
          let newZoom = prev.zoom * factor;
          if (newZoom < ZOOM_MIN) newZoom = ZOOM_MIN; if (newZoom > ZOOM_MAX) newZoom = ZOOM_MAX;
          const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return prev;
          const mouseX = lastZoomMousePosRef.current.x - rect.left; const mouseY = lastZoomMousePosRef.current.y - rect.top;
          const wx = (mouseX - prev.x) / prev.zoom; const wy = (mouseY - prev.y) / prev.zoom;
          const newX = mouseX - (wx * newZoom); const newY = mouseY - (wy * newZoom);
          return { x: newX, y: newY, zoom: newZoom };
      });
      zoomVelocityRef.current *= 0.92; zoomInertiaFrameRef.current = requestAnimationFrame(applyZoomInertia);
  }, [canvasSettings.zoomInertia]);

  const handleWheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); const delta = e.deltaY; lastZoomMousePosRef.current = { x: e.clientX, y: e.clientY }; if (canvasSettings.zoomInertia) { zoomVelocityRef.current += delta * 0.5 * (canvasSettings.zoomSensitivity || 1); cancelAnimationFrame(zoomInertiaFrameRef.current); zoomInertiaFrameRef.current = requestAnimationFrame(applyZoomInertia); } else { const sensitivity = canvasSettings.zoomSensitivity || 1.0; const effectiveDelta = delta * sensitivity; const factor = Math.pow(1.002, -effectiveDelta); setViewport(prev => { let newZoom = prev.zoom * factor; if (newZoom < ZOOM_MIN) newZoom = ZOOM_MIN; if (newZoom > ZOOM_MAX) newZoom = ZOOM_MAX; const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return prev; const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top; const wx = (mouseX - prev.x) / prev.zoom; const wy = (mouseY - prev.y) / prev.zoom; const newX = mouseX - (wx * newZoom); const newY = mouseY - (wy * newZoom); return { x: newX, y: newY, zoom: newZoom }; }); } } else if (mode === ToolMode.HAND) { e.preventDefault(); setViewport(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY })); } };
  useEffect(() => { const container = containerRef.current; if (!container) return; container.addEventListener('wheel', handleWheel, { passive: false }); return () => container.removeEventListener('wheel', handleWheel); }, [mode, canvasSettings.zoomSensitivity, canvasSettings.zoomInertia]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || e.button === 1) { setIsRightPanning(true); setHasMovedSinceRightClick(false); setLastMousePos({ x: e.clientX, y: e.clientY }); return; }
    setActiveContextNodeId(null); setActiveEdgeId(null); setActiveControlPoint(null); setContextMenuAnchor(null);
    const isLinkPaintShortcut = e.shiftKey && (mode === ToolMode.SELECT || mode === ToolMode.CONNECT);
    if (linkSelectionMode || isLinkPaintShortcut) { if (e.button !== 0) return; setIsPaintingLinks(true); if (linkSelectionMode && !e.shiftKey) { setSelectedEdgeIds(new Set()); setSelectedNodeIds(new Set()); } return; }
    if (mode === ToolMode.DRAW) { const x = (e.clientX - viewport.x) / viewport.zoom; const y = (e.clientY - viewport.y) / viewport.zoom; setCurrentPath({ id: generateId(), points: [{x,y}], color: drawingSettings.color, width: drawingSettings.width, type: drawingSettings.tool === 'pen' || drawingSettings.tool === 'eraser' ? 'pen' : 'highlighter', isEraser: drawingSettings.tool === 'eraser' }); return; }
    setDragStartPos({ x: e.clientX, y: e.clientY }); hasDraggedRef.current = false; 
    if (mode === ToolMode.HAND) { setIsDragging(true); setLastMousePos({ x: e.clientX, y: e.clientY }); return; }

    // Handle clearing Alt-Link state if clicking on canvas (not on node)
    if (altLinkSourceId) {
        setAltLinkSourceId(null);
        setTempLinkEndPos(null);
        setLinkStartScreenPos(null);
        return;
    }
    
    if (mode === ToolMode.SELECT || mode === ToolMode.CONNECT) { 
       if (!e.ctrlKey && !e.shiftKey) { 
          setSelectionBox({ start: {x: e.clientX, y: e.clientY}, current: {x: e.clientX, y: e.clientY} }); 
          setSelectedNodeIds(new Set()); 
          setSelectedEdgeIds(new Set()); 
       } 
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const clientX = e.clientX; const clientY = e.clientY;
    
    // --- Alt Link Tracking ---
    if (altLinkSourceId) {
        const x = (clientX - viewport.x) / viewport.zoom;
        const y = (clientY - viewport.y) / viewport.zoom;
        setTempLinkEndPos({ x, y });
    }
    // -------------------------

    if (isRightPanning) { const dx = clientX - lastMousePos.x; const dy = clientY - lastMousePos.y; if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { setHasMovedSinceRightClick(true); setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); } setLastMousePos({ x: clientX, y: clientY }); return; }
    if (isPaintingLinks) { const el = document.elementFromPoint(clientX, clientY); const edgeId = el?.getAttribute('data-edge-id'); if (edgeId && !selectedEdgeIds.has(edgeId)) { const parsed = parseEdgeId(edgeId); if (parsed) { const { sourceId, targetId } = parsed; const sRestricted = focusNodeId && !focusedDescendantIds.has(sourceId); const tRestricted = focusNodeId && !focusedDescendantIds.has(targetId); if (!sRestricted && !tRestricted) { setSelectedEdgeIds(prev => { const newSet = new Set(prev); newSet.add(edgeId); return newSet; }); } } } return; }
    if (mode === ToolMode.DRAW && currentPath) { const x = (clientX - viewport.x) / viewport.zoom; const y = (clientY - viewport.y) / viewport.zoom; setCurrentPath(prev => prev ? { ...prev, points: [...prev.points, {x,y}] } : null); return; }
    if (edgeControlDrag) { const x = (clientX - viewport.x) / viewport.zoom; const y = (clientY - viewport.y) / viewport.zoom; let finalX = x; let finalY = y; if (!e.altKey && canvasSettings.showGrid) { finalX = Math.round(x / 20) * 20; finalY = Math.round(y / 20) * 20; } const currentEdgeOptions = edgeData[edgeControlDrag.edgeKey]; if (!currentEdgeOptions || !currentEdgeOptions.controlPoints) { setEdgeControlDrag(null); return; } const prevPoint = currentEdgeOptions.controlPoints[edgeControlDrag.index]; if (!prevPoint) return; const dx = finalX - prevPoint.x; const dy = finalY - prevPoint.y; setEdgeData(prev => { const next = { ...prev }; const updateEdge = (key: string, idx: number, deltaX: number, deltaY: number) => { const options = next[key]; if (!options || !options.controlPoints) return; const newPoints = [...options.controlPoints]; if (newPoints[idx]) { newPoints[idx] = { x: newPoints[idx].x + deltaX, y: newPoints[idx].y + deltaY }; next[key] = { ...options, controlPoints: newPoints }; } }; const options = next[edgeControlDrag.edgeKey]; if (options && options.controlPoints) { const newPoints = [...options.controlPoints]; if (newPoints[edgeControlDrag.index]) { newPoints[edgeControlDrag.index] = { x: finalX, y: finalY }; next[edgeControlDrag.edgeKey] = { ...options, controlPoints: newPoints }; } } selectedEdgeIds.forEach(key => { if (key !== edgeControlDrag.edgeKey) { const otherOpts = next[key]; if (otherOpts && otherOpts.controlPoints && otherOpts.controlPoints[edgeControlDrag.index]) { updateEdge(key, edgeControlDrag.index, dx, dy); } } }); return next; }); return; }
    if (isDragging || dragNodeIds.size > 0 || selectionBox) { const dx = clientX - lastMousePos.x; const dy = clientY - lastMousePos.y; setLastMousePos({ x: clientX, y: clientY }); cancelAnimationFrame(dragFrameRef.current); dragFrameRef.current = requestAnimationFrame(() => { if (isDragging) { setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); } else if (selectionBox) { setSelectionBox(prev => prev ? { ...prev, current: {x: clientX, y: clientY} } : null); } else if (dragNodeIds.size > 0) { hasDraggedRef.current = true; const deltaX = dx / viewport.zoom; const deltaY = dy / viewport.zoom; let snapX: number | undefined; let snapY: number | undefined; if (!e.altKey && dragNodeIds.size === 1) { const movedNodeId = Array.from(dragNodeIds)[0]; const movedNode = nodes.find(n => n.id === movedNodeId); if (movedNode) { const proposedX = movedNode.position.x + deltaX; const proposedY = movedNode.position.y + deltaY; nodes.forEach(other => { if (dragNodeIds.has(other.id)) return; if (Math.abs(other.position.x - proposedX) < SNAP_THRESHOLD) snapX = other.position.x; if (Math.abs(other.position.y - proposedY) < SNAP_THRESHOLD) snapY = other.position.y; }); } } setSnapLines(snapX !== undefined || snapY !== undefined ? [{ x: snapX, y: snapY }] : []); setNodes(prev => prev.map(n => { if (dragNodeIds.has(n.id)) { return { ...n, position: { x: snapX !== undefined ? snapX : n.position.x + deltaX, y: snapY !== undefined ? snapY : n.position.y + deltaY } }; } return n; })); setEdgeData(prev => { const next = { ...prev }; let changed = false; dragNodeIds.forEach(sourceId => { const sourceNode = nodes.find(n => n.id === sourceId); if (sourceNode) { sourceNode.childrenIds.forEach(targetId => { if (dragNodeIds.has(targetId)) { const key = `${sourceId}-${targetId}`; const edge = next[key]; if (edge && edge.controlPoints && edge.controlPoints.length > 0) { changed = true; next[key] = { ...edge, controlPoints: edge.controlPoints.map(p => ({ x: p.x + deltaX, y: p.y + deltaY })) }; } } }); } }); return changed ? next : prev; }); } }); } else { setLastMousePos({ x: clientX, y: clientY }); }
  };

  const handleMouseUp = (e: React.MouseEvent) => { 
      cancelAnimationFrame(dragFrameRef.current); 
      setSnapLines([]); 

      if (altLinkSourceId) {
          // Dragged distance check for "Click vs Drag" logic if initiated via Drag from ShapeDock
          if (linkStartScreenPos) {
             const dist = Math.hypot(e.clientX - linkStartScreenPos.x, e.clientY - linkStartScreenPos.y);
             // If drag distance is small, treat as a click -> enter "Sticky Mode" (do nothing here, just clear start pos)
             if (dist < 5) {
                 setLinkStartScreenPos(null);
                 return; 
             }
          }

          // Check if mouse up over a node to complete link
          const hitEl = document.elementFromPoint(e.clientX, e.clientY);
          const nodeEl = hitEl?.closest('[data-node-id]');
          const hitNodeId = nodeEl?.getAttribute('data-node-id');

          if (hitNodeId && hitNodeId !== altLinkSourceId) {
              const source = getNodeById(altLinkSourceId);
              if (source && !source.childrenIds.includes(hitNodeId)) {
                  const newNodes = nodes.map(n => n.id === altLinkSourceId ? { ...n, childrenIds: [...n.childrenIds, hitNodeId] } : n);
                  const edgeKey = `${altLinkSourceId}-${hitNodeId}`;
                  const newEdgeData = { ...edgeData, [edgeKey]: { ...defaultEdgeOptions } };
                  updateState(newNodes, drawings, newEdgeData);
              }
              setAltLinkSourceId(null);
              setTempLinkEndPos(null);
              setLinkStartScreenPos(null);
          } else {
              // Released in empty space (and wasn't a click) -> Cancel Link
               setAltLinkSourceId(null);
               setTempLinkEndPos(null);
               setLinkStartScreenPos(null);
          }
          return;
      }

      if (isRightPanning) { setIsRightPanning(false); return; } if (isPaintingLinks) { setIsPaintingLinks(false); return; } if (mode === ToolMode.DRAW && currentPath) { updateState(nodes, [...drawings, currentPath], edgeData); setCurrentPath(null); return; } if (edgeControlDrag) { setEdgeControlDrag(null); commitHistory(nodes, drawings, edgeData); return; } if (selectionBox) { const x1 = Math.min(selectionBox.start.x, selectionBox.current.x); const y1 = Math.min(selectionBox.start.y, selectionBox.current.y); const x2 = Math.max(selectionBox.start.x, selectionBox.current.x); const y2 = Math.max(selectionBox.start.y, selectionBox.current.y); const wx1 = (x1 - viewport.x) / viewport.zoom; const wy1 = (y1 - viewport.y) / viewport.zoom; const wx2 = (x2 - viewport.x) / viewport.zoom; const wy2 = (y2 - viewport.y) / viewport.zoom; const newSelection = new Set<string>(e.shiftKey ? selectedNodeIds : []); const newEdgeSelection = new Set<string>(e.shiftKey ? selectedEdgeIds : []); nodes.forEach(node => { const isFocusRestricted = focusNodeId && !focusedDescendantIds.has(node.id); if (!isFocusRestricted && node.position.x >= wx1 && node.position.x <= wx2 && node.position.y >= wy1 && node.position.y <= wy2) { newSelection.add(node.id); } }); Object.keys(edgeData).forEach(key => { const parsed = parseEdgeId(key); if (parsed) { const { sourceId: sId, targetId: tId } = parsed; const sNode = nodes.find(n => n.id === sId); const tNode = nodes.find(n => n.id === tId); if (sNode && tNode) { const sRestricted = focusNodeId && !focusedDescendantIds.has(sId); const tRestricted = focusNodeId && !focusedDescendantIds.has(tId); if (!sRestricted && !tRestricted) { const sIn = sNode.position.x >= wx1 && sNode.position.x <= wx2 && sNode.position.y >= wy1 && sNode.position.y <= wy2; const tIn = tNode.position.x >= wx1 && tNode.position.x <= wx2 && tNode.position.y >= wy1 && tNode.position.y <= wy2; if (sIn && tIn) newEdgeSelection.add(key); else { const midX = (sNode.position.x + tNode.position.x) / 2; const midY = (sNode.position.y + tNode.position.y) / 2; if (midX >= wx1 && midX <= wx2 && midY >= wy1 && midY <= wy2) newEdgeSelection.add(key); const cps = edgeData[key].controlPoints || []; for(const cp of cps) { if (cp.x >= wx1 && cp.x <= wx2 && cp.y >= wy1 && cp.y <= wy2) { newEdgeSelection.add(key); break; } } } } } } }); setSelectedNodeIds(newSelection); setSelectedEdgeIds(newEdgeSelection); setSelectionBox(null); return; } setIsDragging(false); if (dragNodeIds.size > 0) { if (hasDraggedRef.current) commitHistory(nodes, drawings, edgeData); hasDraggedRef.current = false; } setDragNodeIds(new Set()); };

  const handleEdgeHandleMouseDown = (edgeKey: string, index: number, e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); setEdgeControlDrag({ edgeKey, index }); };
  const handleEdgeClick = (edgeKey: string, e: React.MouseEvent) => { e.stopPropagation(); if (mode === ToolMode.CONNECT) return; if (e.shiftKey) { const newSet = new Set(selectedEdgeIds); if (newSet.has(edgeKey)) newSet.delete(edgeKey); else newSet.add(edgeKey); setSelectedEdgeIds(newSet); } else { setSelectedEdgeIds(new Set([edgeKey])); setSelectedNodeIds(new Set()); } };
  
  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation(); 
    if (activeContextNodeId && activeContextNodeId !== nodeId) setActiveContextNodeId(null); 
    if (activeEdgeId || activeControlPoint || contextMenuAnchor) { setActiveEdgeId(null); setActiveControlPoint(null); setContextMenuAnchor(null); }
    
    // --- Alt Click for Linking (Overriding previous branch select) ---
    if (e.altKey || mode === ToolMode.CONNECT) {
        if (!altLinkSourceId) {
            // Start linking
            setAltLinkSourceId(nodeId);
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                setTempLinkEndPos({ x: node.position.x, y: node.position.y });
            }
            // Clear existing selection to avoid confusion
            setSelectedNodeIds(new Set([nodeId])); 
        } else {
            // Complete linking
            if (altLinkSourceId !== nodeId) {
                 const source = getNodeById(altLinkSourceId);
                 if (source && !source.childrenIds.includes(nodeId)) {
                    const newNodes = nodes.map(n => n.id === altLinkSourceId ? { ...n, childrenIds: [...n.childrenIds, nodeId] } : n);
                    const edgeKey = `${altLinkSourceId}-${nodeId}`;
                    const newEdgeData = { ...edgeData, [edgeKey]: { ...defaultEdgeOptions } };
                    updateState(newNodes, drawings, newEdgeData);
                 }
            }
            // Reset link state
            setAltLinkSourceId(null);
            setTempLinkEndPos(null);
        }
        return;
    }
    
    // Sticky Link Completion (if clicked while link mode active)
    if (altLinkSourceId) {
        if (altLinkSourceId !== nodeId) {
             const source = getNodeById(altLinkSourceId);
             if (source && !source.childrenIds.includes(nodeId)) {
                const newNodes = nodes.map(n => n.id === altLinkSourceId ? { ...n, childrenIds: [...n.childrenIds, nodeId] } : n);
                const edgeKey = `${altLinkSourceId}-${nodeId}`;
                const newEdgeData = { ...edgeData, [edgeKey]: { ...defaultEdgeOptions } };
                updateState(newNodes, drawings, newEdgeData);
             }
        }
        setAltLinkSourceId(null);
        setTempLinkEndPos(null);
        return;
    }

    if (linkSelectionMode) return;
    if (e.shiftKey) { const node = nodes.find(n => n.id === nodeId); if (node) { const currentShape = node.shape || defaultNodeShape; const currentIndex = NODE_SHAPES_CYCLE.indexOf(currentShape); const nextIndex = (currentIndex === -1 ? 0 : currentIndex + 1) % NODE_SHAPES_CYCLE.length; const nextShape = NODE_SHAPES_CYCLE[nextIndex]; const newNodes = nodes.map(n => n.id === nodeId ? { ...n, shape: nextShape } : n); updateState(newNodes); if (!selectedNodeIds.has(nodeId)) setSelectedNodeIds(new Set([nodeId])); } return; }
    
    const isMultiSelect = e.ctrlKey || e.metaKey || isMultiSelectMode;
    let newSelection = new Set<string>(selectedNodeIds); if (isMultiSelect) { if (newSelection.has(nodeId)) newSelection.delete(nodeId); else newSelection.add(nodeId); } else { if (!newSelection.has(nodeId)) newSelection = new Set<string>([nodeId]); }
    setSelectedNodeIds(newSelection); if (!isMultiSelect) setSelectedEdgeIds(new Set());
    let dragSet = new Set(newSelection); setDragNodeIds(dragSet); setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => { e.preventDefault(); if (hasMovedSinceRightClick) return; setActiveContextNodeId(null); setActiveEdgeId(null); setActiveControlPoint(null); setContextMenuAnchor({ left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY, width: 0, height: 0 }); };
  const handleContextMenu = (e: React.MouseEvent, nodeId: string) => { e.preventDefault(); e.stopPropagation(); if (hasMovedSinceRightClick) return; setActiveEdgeId(null); setActiveControlPoint(null); setContextMenuAnchor(null); setActiveContextNodeId(nodeId); setSelectedNodeIds(new Set([nodeId])); setSelectedEdgeIds(new Set()); };
  const handleEdgeContextMenu = (e: React.MouseEvent, edgeKey: string) => { e.preventDefault(); e.stopPropagation(); if (hasMovedSinceRightClick) return; setActiveContextNodeId(null); setActiveControlPoint(null); setActiveEdgeId(edgeKey); setContextMenuAnchor({ left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY, width: 0, height: 0 }); if (!selectedEdgeIds.has(edgeKey)) { setSelectedEdgeIds(new Set([edgeKey])); setSelectedNodeIds(new Set()); } };
  const handlePointContextMenu = (edgeKey: string, index: number, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setActiveContextNodeId(null); setActiveEdgeId(null); setActiveControlPoint({ edgeKey, index }); setContextMenuAnchor({ left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY, width: 0, height: 0 }); };
  
  const handleContextMenuAction = async (action: string, payload?: any) => {
    const worldPos = contextMenuAnchor ? { x: (contextMenuAnchor.left - viewport.x) / viewport.zoom, y: (contextMenuAnchor.top - viewport.y) / viewport.zoom } : undefined;
    const targetId = activeContextNodeId || getSelectedNode()?.id;
    if (activeEdgeId) { if (action === 'edge-color') { setEdgeData(prev => ({ ...prev, [activeEdgeId]: { ...prev[activeEdgeId], color: payload } })); } if (action === 'edge-style') { setEdgeData(prev => ({ ...prev, [activeEdgeId]: { ...prev[activeEdgeId], stroke: payload } })); } if (action === 'edge-routing-straight') { setEdgeData(prev => ({ ...prev, [activeEdgeId]: { ...prev[activeEdgeId], routingType: 'straight', controlPoints: [] } })); } if (action === 'edge-routing-curved') { setEdgeData(prev => ({ ...prev, [activeEdgeId]: { ...prev[activeEdgeId], routingType: 'curved', controlPoints: [] } })); } if (action === 'edge-routing-orthogonal') { setEdgeData(prev => ({ ...prev, [activeEdgeId]: { ...prev[activeEdgeId], routingType: 'orthogonal', controlPoints: [] } })); } if (action === 'edge-delete') { const parsed = parseEdgeId(activeEdgeId); if (parsed) { const { sourceId, targetId } = parsed; const newNodes = nodes.map(n => n.id === sourceId ? { ...n, childrenIds: n.childrenIds.filter(cid => cid !== targetId) } : n); const newEdgeData = { ...edgeData }; delete newEdgeData[activeEdgeId]; updateState(newNodes, drawings, newEdgeData); } } if (action === 'edge-add-point') { const edge = edgeData[activeEdgeId]; if (edge) { const parsed = parseEdgeId(activeEdgeId); if (parsed) { const sNode = nodes.find(n => n.id === parsed.sourceId); const tNode = nodes.find(n => n.id === parsed.targetId); if (sNode && tNode) { const midX = (sNode.position.x + tNode.position.x) / 2; const midY = (sNode.position.y + tNode.position.y) / 2; const newPoints = [...(edge.controlPoints || []), { x: midX, y: midY }]; setEdgeData(prev => ({ ...prev, [activeEdgeId]: { ...prev[activeEdgeId], controlPoints: newPoints } })); } } } } if (action === 'delete-control-point' && activeControlPoint) { const { edgeKey, index } = activeControlPoint; const edge = edgeData[edgeKey]; if (edge && edge.controlPoints) { const newPoints = [...edge.controlPoints]; newPoints.splice(index, 1); setEdgeData(prev => ({ ...prev, [edgeKey]: { ...prev[edgeKey], controlPoints: newPoints } })); } } if (action === 'edge-label') { const label = prompt("Enter label for this connection:", edgeData[activeEdgeId]?.label || ""); if (label !== null) { setEdgeData(prev => ({ ...prev, [activeEdgeId]: { ...prev[activeEdgeId], label } })); } } if (action === 'edge-animate') { setEdgeData(prev => ({ ...prev, [activeEdgeId]: { ...prev[activeEdgeId], animated: !prev[activeEdgeId]?.animated } })); } setActiveEdgeId(null); setActiveControlPoint(null); setContextMenuAnchor(null); return; }
    if (action === 'add-child') { if (targetId) handleAddNode(targetId, false); } if (action === 'delete') { handleSelectionAction('delete'); } if (action === 'duplicate') { handleSelectionAction('duplicate'); } if (action === 'lock') { handleSelectionAction('lock'); } if (action === 'magic-style') { if (targetId) handleMagicStyle(targetId); } if (action === 'convert-task') { if(targetId) updateState(nodes.map(n => n.id === targetId ? {...n, type: NodeType.TASK} : n)); } if (action === 'convert-normal') { if(targetId) updateState(nodes.map(n => n.id === targetId ? {...n, type: NodeType.SUB} : n)); } if (action === 'convert-code') { if(targetId) updateState(nodes.map(n => n.id === targetId ? {...n, type: NodeType.CODE, data: {...n.data, codeLanguage: 'JavaScript', codeSnippet: '// Code'}} : n)); } if (action === 'convert-table') { if(targetId) updateState(nodes.map(n => n.id === targetId ? {...n, type: NodeType.TABLE, data: {...n.data, tableRows: [['A', 'B'], ['1', '2']]}} : n)); } if (action === 'convert-list') { if(targetId) updateState(nodes.map(n => n.id === targetId ? {...n, data: {...n.data, items: ['Item 1']}} : n)); } if (action === 'add-link') { if(targetId) { setConnectSourceId(targetId); setMode(ToolMode.CONNECT); } } if (action === 'focus') { handleAction('focus'); } if (action === 'ai-expand') { if(targetId) { setAiTargetNodeId(targetId); setIsAiOptionsOpen(true); } } if (action === 'dream-node') { if (targetId) { setAiTargetNodeId(targetId); setIsDreamModalOpen(true); } } if (action === 'ai-summarize') { if(targetId) handleSummarizeBranch(targetId); } if (action === 'ai-rewrite') { if (targetId) { const node = getNodeById(targetId); if (node) { setIsGenerating(true); const newText = await refineNodeText(node.label); handleLabelChange(targetId, newText); setIsGenerating(false); } } } if (action === 'shape') { if (targetId) updateState(nodes.map(n => n.id === targetId ? { ...n, shape: payload as NodeShape } : n)); } if (action === 'color' || action === 'color-hex') { if (targetId) updateState(nodes.map(n => n.id === targetId ? { ...n, color: payload as string } : n)); } if (action === 'color-preview') { if (targetId) { setNodes(prevNodes => prevNodes.map(n => n.id === targetId ? { ...n, color: payload as string } : n)); } } if (action === 'add-node-shape') { handleAction('add-node-shape', { shape: payload as string, position: worldPos }); } if (action === 'add-node') { handleAddNode(undefined, false, undefined, undefined, undefined, undefined, undefined, worldPos); } if (action === 'new-sticky-color') { handleAddNote(true, undefined); } if (action === 'insert-code') { handleAction('code-node', undefined); } if (action === 'insert-table') { handleAction('table-node', undefined); } if (action === 'start-link') { if(targetId) { setAltLinkSourceId(targetId); const node = nodes.find(n => n.id === targetId); if(node) setTempLinkEndPos({x: node.position.x, y: node.position.y}); } } if (action !== 'color-preview') { setActiveContextNodeId(null); setContextMenuAnchor(null); }
  };

  const handleLabelChange = (nodeId: string, newLabel: string) => { const newNodes = nodes.map(n => n.id === nodeId ? { ...n, label: newLabel } : n); updateState(newNodes); };
  const handleExpandNode = async (options: AIGenerationOptions) => { if (!aiTargetNodeId) return; const targetNode = nodes.find(n => n.id === aiTargetNodeId); if(!targetNode) return; setIsGenerating(true); const expandedNodes = await expandNodeWithAI(targetNode.label, options.context || '', nodes, options); if (expandedNodes.length > 0) { const newChildrenIds: string[] = []; const newNodesList: SingularityNode[] = []; const newEdges: Record<string, EdgeOptions> = {}; const buildHierarchy = (aiNodeList: AIMindMapNode[], parentId: string, depth: number) => { aiNodeList.forEach((aiNode) => { const id = generateId(); let nodeColor = targetNode.color; let nodeShape = targetNode.shape; let edgeStyle = defaultEdgeOptions; if (options.style) { nodeColor = options.style.inheritNodeColor ? targetNode.color : options.style.customNodeColor; nodeShape = options.style.inheritNodeShape ? targetNode.shape : options.style.customNodeShape; if (options.style.inheritLinkStyle) { const parentLinkKey = Object.keys(edgeData).find(k => k.endsWith(`-${parentId}`)); if (parentLinkKey) edgeStyle = { ...edgeData[parentLinkKey] }; } else { edgeStyle = { ...defaultEdgeOptions, routingType: options.style.customLinkStyle }; } if (!options.style.inheritLinkColor && options.style.customLinkColor) { edgeStyle.color = options.style.customLinkColor; } else if (options.style.inheritLinkColor) { const parentLinkKey = Object.keys(edgeData).find(k => k.endsWith(`-${parentId}`)); if (parentLinkKey) edgeStyle.color = edgeData[parentLinkKey].color; } } const newNode: SingularityNode = { id, type: depth === 0 ? (targetNode.type === NodeType.ROOT ? NodeType.MAIN : NodeType.SUB) : NodeType.SUB, label: aiNode.label, position: { x: targetNode.position.x, y: targetNode.position.y }, parentId: parentId, childrenIds: [], isAiGenerated: true, shape: nodeShape, color: nodeColor }; newNodesList.push(newNode); newEdges[`${parentId}-${id}`] = { ...edgeStyle }; if (parentId === targetNode.id) { newChildrenIds.push(id); } else { const parentNodeInList = newNodesList.find(n => n.id === parentId); if (parentNodeInList) parentNodeInList.childrenIds.push(id); } if (aiNode.children && aiNode.children.length > 0) { buildHierarchy(aiNode.children, id, depth + 1); } }); }; buildHierarchy(expandedNodes, targetNode.id, 0); const updatedParent = { ...targetNode, childrenIds: [...targetNode.childrenIds, ...newChildrenIds] }; let mergedNodes = nodes.map(n => n.id === targetNode.id ? updatedParent : n).concat(newNodesList); if (appMode === 'MINDMAP') { const layoutRecursive = (pid: string, grandPid?: string) => { const parent = mergedNodes.find(n => n.id === pid); if (!parent) return; const children = parent.childrenIds.map(cid => mergedNodes.find(n => n.id === cid)).filter(Boolean) as SingularityNode[]; if (children.length === 0) return; const grandParent = grandPid ? mergedNodes.find(n => n.id === grandPid) : undefined; const laidOut = layoutLocalFlower(parent, children, grandParent); mergedNodes = mergedNodes.map(n => { const found = laidOut.find(l => l.id === n.id); return found || n; }); children.forEach(c => layoutRecursive(c.id, pid)); }; layoutRecursive(targetNode.id, targetNode.parentId); } else { mergedNodes = layoutOrganic(mergedNodes); } newNodesList.forEach(nn => { const placedNode = mergedNodes.find(m => m.id === nn.id); if (placedNode) { mergedNodes = pushNodesAside(placedNode, mergedNodes); } }); updateState(mergedNodes, drawings, { ...edgeData, ...newEdges }); if(collapsedNodeIds.has(targetNode.id)) { setCollapsedNodeIds(prev => { const next = new Set(prev); next.delete(targetNode.id); return next; }); } } setIsGenerating(false); };
  const handleAiActions = (actions: AIAction[]) => { let currentNodes = [...nodes]; let currentEdges = { ...edgeData }; actions.forEach(action => { if (action.type === 'CREATE_NODE') { const { label, parentId } = action.payload; const id = generateId(); const newNode: SingularityNode = { id, type: NodeType.MAIN, label: label || 'AI Node', position: { x: viewport.x, y: viewport.y }, childrenIds: [] }; if (parentId) { const parent = currentNodes.find(n => n.id === parentId); if (parent) { newNode.parentId = parentId; newNode.position = { x: parent.position.x + 200, y: parent.position.y + 50 }; parent.childrenIds.push(id); currentEdges[`${parentId}-${id}`] = { ...defaultEdgeOptions }; } } currentNodes.push(newNode); } }); if (appMode === 'MINDMAP') currentNodes = layoutOrganic(currentNodes); updateState(currentNodes, drawings, currentEdges); };

  const activeNode = activeContextNodeId ? nodes.find(n => n.id === activeContextNodeId) : null;
  const showShapeDock = !!activeContextNodeId && !!activeNode;
  const shapeDockTarget = activeNode;
  const activeNodeScreenPosition = shapeDockTarget ? { x: shapeDockTarget.position.x * viewport.zoom + viewport.x, y: shapeDockTarget.position.y * viewport.zoom + viewport.y } : { x: 0, y: 0 };
  
  const bgPatternClass = currentTheme.pattern === 'dots' ? 'bg-[radial-gradient(circle,rgba(0,0,0,0.1)_1px,transparent_1px)] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.1)_1px,transparent_1px)]' : currentTheme.pattern === 'grid' ? 'bg-[linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)]' : '';
  const scaledBgSize = 20 * viewport.zoom;
  const getCursor = () => { if (isPaintingLinks) return 'cursor-crosshair'; if (mode === ToolMode.HAND) return isDragging ? 'cursor-grabbing' : 'cursor-grab'; if (mode === ToolMode.DRAW) return 'cursor-crosshair'; if (mode === ToolMode.CONNECT) return 'cursor-crosshair'; return 'cursor-default'; };

  const commands = [
     { id: 'new-node', label: 'Create New Node', icon: <Icon.Plus size={18} />, action: () => handleAddNode(undefined, false), shortcut: 'Tab' },
     { id: 'magic-style', label: 'Magic Auto-Style Selected', icon: <Icon.Magic size={18} />, action: () => { if(selectedNodeIds.size > 0) handleMagicStyle(Array.from(selectedNodeIds)[0] as string) }, shortcut: 'Alt+M' },
     { id: 'dream-node', label: 'Dream Node (AI Image)', icon: <Icon.Image size={18} />, action: () => { if(selectedNodeIds.size > 0) { setAiTargetNodeId(Array.from(selectedNodeIds)[0] as string); setIsDreamModalOpen(true); } } },
     { id: 'find', label: 'Find Node', icon: <Icon.Search size={18} />, action: () => setIsFindOpen(true), shortcut: 'Ctrl+F' },
     { id: 'undo', label: 'Undo Action', icon: <Icon.Undo size={18} />, action: undo, shortcut: 'Ctrl+Z' },
     { id: 'redo', label: 'Redo Action', icon: <Icon.Redo size={18} />, action: redo, shortcut: 'Ctrl+Y' },
  ];
  
  // Helper to get temp line start position
  const getTempLinkStartPos = () => {
      if (!altLinkSourceId) return { x: 0, y: 0 };
      const node = nodes.find(n => n.id === altLinkSourceId);
      return node ? node.position : { x: 0, y: 0 };
  };

  // Get selected node for drag handle rendering - DEPRECATED: Moving logic to NodeComponent side controls
  // Leaving variable for potential legacy support or cleanup
  const singleSelectedNode = selectedNodeIds.size === 1 ? nodes.find(n => n.id === Array.from(selectedNodeIds)[0]) : null;

  return (
    <div className={`w-full h-full relative overflow-hidden transition-colors duration-500 font-sans`} style={{ backgroundColor: currentTheme.bg }}>
      <svg width="0" height="0" className="absolute pointer-events-none"><defs><clipPath id="shape-cloud" clipPathUnits="objectBoundingBox"><path d="M0.25,0.55 Q0.25,0.25 0.5,0.25 Q0.6,0.1 0.75,0.25 Q0.9,0.25 0.9,0.5 Q1,0.5 1,0.7 Q1,0.9 0.85,0.95 Q0.7,1 0.5,1 Q0.3,1 0.15,0.95 Q0,0.85 0,0.7 Q0,0.55 0.25,0.55 Z" /></clipPath></defs></svg>

      <TopBar 
        projectName={projectName} 
        setProjectName={setProjectName} 
        activeToolName={mode} 
        onShare={() => alert("Share link copied to clipboard!")} 
        onSettings={() => setIsRightPanelOpen(!isRightPanelOpen)} 
        onAction={handleAction} 
        isSettingsOpen={isRightPanelOpen} 
        isDarkMode={currentTheme.isDark} 
        onBack={onBack} 
        isVoiceActive={isVoiceActive}
        onToggleVoice={() => setIsVoiceActive(!isVoiceActive)}
      />

      {/* SELECTION MODE TOP BAR */}
      {isToolSelectionMode && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] animate-slide-up bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4">
              <span className="text-sm font-bold">Select tools from sidebars</span>
              <button 
                  onClick={handleExitSelectionMode}
                  className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-black hover:bg-gray-200 transition-colors"
              >
                  Done
              </button>
          </div>
      )}

      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} activeMode={mode} setMode={setMode} onAction={handleAction} appMode={appMode} setAppMode={setAppMode} drawingSettings={drawingSettings} setDrawingSettings={setDrawingSettings} defaultEdgeOptions={defaultEdgeOptions} setDefaultEdgeOptions={setDefaultEdgeOptions} isSelectionMode={isToolSelectionMode} onToolSelect={handleToolSelect} />
      
      <OutlinePanel isOpen={isOutlineOpen} setIsOpen={setIsOutlineOpen} nodes={nodes} onSelectNode={(id) => { const node = getNodeById(id); if (node) { setFocusNodeId(id); centerOnNode(id); } }} isSidebarOpen={isSidebarOpen} />

      {/* MULTI SELECT TOGGLE (MOBILE) - MOVED TO TOP-48 */}
      <button 
         onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
         className={`fixed top-48 z-[60] p-2.5 rounded-lg shadow-clay-md border transition-all duration-300 ease-in-out
            ${isMultiSelectMode ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-400'}
         `}
         style={{ left: isSidebarOpen ? '280px' : '16px' }}
         title="Toggle Multi-Select"
      >
          {isMultiSelectMode ? <Icon.Task size={20} /> : <Icon.Select size={20} />}
      </button>

      {/* CONNECT MODE TOGGLE (MOBILE) - MOVED TO TOP-[15.5rem] */}
      <button 
         onClick={() => setMode(mode === ToolMode.CONNECT ? ToolMode.SELECT : ToolMode.CONNECT)}
         className={`fixed top-[15.5rem] z-[60] p-2.5 rounded-lg shadow-clay-md border transition-all duration-300 ease-in-out
            ${mode === ToolMode.CONNECT ? 'bg-green-50 border-green-500 text-green-600' : 'bg-white border-gray-200 text-gray-500 hover:text-green-600 hover:border-green-400'}
         `}
         style={{ left: isSidebarOpen ? '280px' : '16px' }}
         title="Toggle Connect Mode"
      >
          {mode === ToolMode.CONNECT ? <Icon.Connect size={20} /> : <Icon.Connect size={20} className="opacity-50" />}
      </button>

      {/* TOOLBAR STACK - BOTTOM LEFT */}
      <div className={`fixed bottom-6 z-50 flex flex-col gap-2 pointer-events-none items-start
            left-4
      `}>
           {/* 3rd Layer: Custom Tools */}
           <div className="pointer-events-auto flex justify-start">
               <CustomToolbar 
                  tools={customTools} 
                  onAddClick={handleAddToolClick} 
                  onRemoveTool={handleRemoveTool} 
                  onDropTool={handleDropTool}
                  isSelectionMode={isToolSelectionMode}
               />
           </div>

           {/* 2nd Layer: Creation Bar */}
           <CreationBar 
              defaultEdgeOptions={defaultEdgeOptions}
              setDefaultEdgeOptions={setDefaultEdgeOptions}
              defaultNodeShape={defaultNodeShape}
              setDefaultNodeShape={setDefaultNodeShape}
              defaultNodeColor={defaultNodeColor}
              setDefaultNodeColor={setDefaultNodeColor}
              className="pointer-events-auto relative flex flex-col items-start" 
           />

           {/* 1st Layer: Status Bar (Undo/Redo/Zoom) */}
           <StatusBar 
              zoom={viewport.zoom} 
              onZoomIn={() => handleAction('zoom-in')} 
              onZoomOut={() => handleAction('zoom-out')} 
              onZoomChange={(val) => setViewport(prev => ({ ...prev, zoom: val }))} 
              onFitView={() => handleAction('fit')} 
              onUndo={undo} 
              onRedo={redo} 
              canUndo={historyIndex > 0} 
              canRedo={historyIndex < history.length - 1}
              onExpandAll={handleExpandAll}
              onCollapseAll={handleCollapseAll}
              className="pointer-events-auto flex items-center gap-2 select-none origin-bottom-left scale-90 md:scale-100 relative"
           />
      </div>
      
      <RightPanel isOpen={isRightPanelOpen} setIsOpen={setIsRightPanelOpen} canvasSettings={canvasSettings} setCanvasSettings={setCanvasSettings} isDarkMode={currentTheme.isDark} toggleTheme={() => setCanvasSettings(p => ({ ...p, theme: p.theme === 'default' ? 'dark' : 'default' }))} onShowShortcuts={() => setIsShortcutsOpen(true)} onExport={handleExport} smartRules={smartRules} setSmartRules={setSmartRules} onAction={handleAction} selectedEdgeIds={selectedEdgeIds} linkSelectionMode={linkSelectionMode} setLinkSelectionMode={setLinkSelectionMode} defaultEdgeOptions={defaultEdgeOptions} setDefaultEdgeOptions={setDefaultEdgeOptions} defaultNodeShape={defaultNodeShape} setDefaultNodeShape={setDefaultNodeShape} defaultNodeColor={defaultNodeColor} setDefaultNodeColor={setDefaultNodeColor} isSelectionMode={isToolSelectionMode} onToolSelect={handleToolSelect} selectedNode={getSelectedNode()} />

      <Minimap nodes={nodes} viewport={viewport} windowSize={{ w: window.innerWidth, h: window.innerHeight }} setViewport={setViewport} />
      
      {/* FOCUS MODE BUTTON (TOP RIGHT) - Replaces old button/indicator */}
      {(selectedNodeIds.size > 0 || focusNodeId) && (
          <div className="fixed top-20 right-6 z-[60] animate-fade-in flex flex-col items-end gap-2">
              <button 
                onClick={() => {
                    if(focusNodeId) setFocusNodeId(null);
                    else handleAction('focus');
                }}
                className={`
                    flex items-center gap-2 px-4 py-2 rounded-full shadow-clay-md border transition-all hover:scale-105
                    ${focusNodeId 
                        ? 'bg-indigo-600 text-white border-indigo-500' 
                        : 'bg-white/90 hover:bg-indigo-50 text-indigo-600 border-indigo-100'
                    }
                `}
              >
                  <Icon.Zap size={16} fill={focusNodeId ? "currentColor" : "none"} /> 
                  <span className="text-xs font-bold">{focusNodeId ? "Exit Focus" : "Focus Branch"}</span>
              </button>
              {focusNodeId && (
                  <div className="bg-black/80 text-white text-[10px] px-3 py-1 rounded-full backdrop-blur-sm font-medium shadow-sm">
                      Filtering non-branch nodes
                  </div>
              )}
          </div>
      )}

      <ShortcutMonitor />

      {isFindOpen && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[60] bg-white p-2 rounded-lg shadow-xl border border-gray-200 flex items-center gap-2 w-96">
             <Icon.Search className="text-gray-400 ml-2" size={18} />
             <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Find in map..." className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-gray-700 h-8" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) handlePrevResult(); else handleNextResult(); } }} />
             <span className="text-xs text-gray-400 font-mono border-r border-gray-200 pr-2">{searchResults.length > 0 ? `${currentResultIndex + 1}/${searchResults.length}` : '0/0'}</span>
             <button onClick={handlePrevResult} className="p-1 hover:bg-gray-100 rounded text-gray-600"><Icon.Arrow size={16} className="rotate-180" /></button>
             <button onClick={handleNextResult} className="p-1 hover:bg-gray-100 rounded text-gray-600"><Icon.Arrow size={16} /></button>
             <button onClick={() => setIsFindOpen(false)} className="p-1 hover:bg-red-50 rounded text-red-500"><Icon.Close size={16} /></button>
          </div>
      )}

      {linkSelectionMode && (<div className="fixed top-32 right-6 z-[60] bg-green-600/90 backdrop-blur-md text-white px-3 py-1.5 rounded-full shadow-clay-md flex items-center gap-3 animate-fade-in border border-green-400/50"><div className="flex items-center gap-2"><Icon.Connect size={14} className="animate-pulse text-green-100"/><span className="text-xs font-bold uppercase tracking-wider">Paint Mode</span></div><div className="w-px h-3 bg-white/20 hidden sm:block"></div><span className="text-[10px] font-medium text-green-50 hidden sm:inline">Drag to select</span><button onClick={() => setLinkSelectionMode(false)} className="ml-1 p-0.5 hover:bg-black/20 rounded-full transition-colors" title="Exit Mode"><Icon.Close size={12}/></button></div>)}
      
      {isPresentationFullscreen && (
         <>
         <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-full flex items-center gap-4 shadow-2xl border border-white/10 animate-slide-up">
            <div className="flex items-center gap-2 mr-4"><Icon.Present size={20} className="text-green-400 animate-pulse" /><span className="font-bold text-sm">Interactive Narrative</span></div>
            <div className="text-xs text-gray-400 border-l border-gray-600 pl-4">
                Click <Icon.ChevronRight size={12} className="inline"/> to expand, <Icon.ChevronLeft size={12} className="inline"/> to collapse.
            </div>
            <div className="w-px h-6 bg-white/20 mx-2" />
            <button onClick={() => { document.exitFullscreen(); setIsPresentationFullscreen(false); }} className="p-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-full transition-colors" title="Exit Presentation"><Icon.Stop size={20} /></button>
         </div>
         </>
      )}

      <div 
        ref={containerRef} 
        className={`absolute inset-0 outline-none overflow-hidden ${getCursor()}`}
        style={{ overscrollBehavior: 'none', touchAction: 'none' }}
        onMouseDown={handleMouseDown} 
        onMouseMove={handleMouseMove} 
        onMouseUp={handleMouseUp} 
        onContextMenu={handleCanvasContextMenu}
        // Mobile Touch Handlers
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {canvasSettings.showGrid && (<div className={`absolute inset-0 pointer-events-none ${bgPatternClass}`} style={{ backgroundPosition: `${viewport.x}px ${viewport.y}px`, backgroundSize: `${scaledBgSize}px ${scaledBgSize}px`, opacity: currentTheme.isDark ? 0.1 : 0.4, filter: currentTheme.isDark ? 'invert(1)' : 'none', }} />)}
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />
        {selectionBox && (<div className="absolute bg-blue-500/10 border border-blue-500 z-50 pointer-events-none" style={{ left: Math.min(selectionBox.start.x, selectionBox.current.x), top: Math.min(selectionBox.start.y, selectionBox.current.y), width: Math.abs(selectionBox.current.x - selectionBox.start.x), height: Math.abs(selectionBox.current.y - selectionBox.start.y), }} />)}
        
        {snapLines.map((line, i) => (
            <React.Fragment key={i}>
                {line.x !== undefined && (
                    <div 
                        className="absolute top-0 bottom-0 border-l-2 border-blue-500 border-dashed z-50 pointer-events-none" 
                        style={{ left: line.x * viewport.zoom + viewport.x }} 
                    />
                )}
                {line.y !== undefined && (
                    <div 
                        className="absolute left-0 right-0 border-t-2 border-blue-500 border-dashed z-50 pointer-events-none" 
                        style={{ top: line.y * viewport.zoom + viewport.y }} 
                    />
                )}
            </React.Fragment>
        ))}

        <div className="absolute origin-top-left z-10" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
          <div id="canvas-content" style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}>
              <svg className="absolute overflow-visible" style={{ top: 0, left: 0, pointerEvents: 'none' }}>
                {nodes.map(node => node.childrenIds.map(childId => { 
                    const child = nodes.find(n => n.id === childId); 
                    if (!child) return null; 
                    
                    const isVisible = visibleNodeIds.has(node.id) && visibleNodeIds.has(child.id);
                    if (!isVisible) return null;

                    const edgeKey = `${node.id}-${childId}`; 
                    const isDim = isNodeDimmed(node.id) || isNodeDimmed(child.id); 
                    
                    return (
                        <g key={edgeKey} style={{ pointerEvents: isDim ? 'none' : 'auto', opacity: isDim ? 0.2 : 1, transition: 'opacity 0.3s' }}>
                            <ConnectionLine 
                                start={node.position} 
                                end={child.position}
                                isSelected={selectedEdgeIds.has(edgeKey)} 
                                onDelete={() => { const newNodes = nodes.map(n => n.id === node.id ? { ...n, childrenIds: n.childrenIds.filter(id => id !== childId) } : n); updateState(newNodes); }} 
                                onContextMenu={(e) => handleEdgeContextMenu(e, edgeKey)} 
                                onHandleMouseDown={(index, e) => handleEdgeHandleMouseDown(edgeKey, index, e)} 
                                onLineClick={(e) => handleEdgeClick(edgeKey, e)} 
                                onPointContextMenu={(idx, e) => handlePointContextMenu(edgeKey, idx, e)} 
                                options={edgeData[edgeKey]} 
                                themeColor={currentTheme.lineColor} 
                                edgeId={edgeKey} 
                            />
                        </g>
                    ); 
                }))}

                {/* TEMPORARY ALT LINK LINE */}
                {altLinkSourceId && tempLinkEndPos && (
                    <ConnectionLine
                        start={getTempLinkStartPos()}
                        end={tempLinkEndPos}
                        onDelete={() => {}}
                        options={{ ...defaultEdgeOptions, stroke: 'dashed', animated: true }}
                        themeColor={currentTheme.lineColor}
                    />
                )}
              </svg>
              {nodes.map((node, index) => {
                  if (!visibleNodeIds.has(node.id)) return null;

                  return (
                    <NodeComponent 
                        key={node.id} 
                        node={node} 
                        isSelected={selectedNodeIds.has(node.id) || connectSourceId === node.id || activeContextNodeId === node.id || altLinkSourceId === node.id} 
                        isHighlighted={searchResults.includes(node.id)} 
                        isDimmed={isNodeDimmed(node.id)} 
                        isEditing={editingNodeId === node.id} 
                        themeClasses={{ root: currentTheme.nodeRoot, main: currentTheme.nodeMain, sub: currentTheme.nodeSub }} 
                        onMouseDown={handleNodeClick} 
                        onContextMenu={handleContextMenu} 
                        onAddChild={(id) => handleAddNode(id, false)} 
                        onDelete={(id) => { const n = nodes.filter(x => x.id !== id); updateState(n); }} 
                        onExpandAI={(id) => { setAiTargetNodeId(id); setIsAiOptionsOpen(true); }} 
                        onLabelChange={handleLabelChange} 
                        onToggleTask={handleToggleTask} 
                        onEditStart={setEditingNodeId} 
                        onEditEnd={() => setEditingNodeId(null)} 
                        connectMode={mode === ToolMode.CONNECT} 
                        onListChange={handleListChange} 
                        onDataChange={handleDataChange}
                        isExpanded={!collapsedNodeIds.has(node.id)}
                        onToggleExpand={handleToggleNodeExpansion}
                        onStartLink={handleStartLinkDrag}
                    />
                  );
              })}
              
          </div>
        </div>
      </div>

      {selectedNodeIds.size > 1 && <FloatingToolbar selectedCount={selectedNodeIds.size} onAction={handleSelectionAction} />}
      {selectedEdgeIds.size > 0 && selectedNodeIds.size <= 1 && <FloatingToolbar selectedCount={selectedEdgeIds.size} onAction={handleAction} isEdgeMode={true} />}

      <CommandPalette isOpen={isCmdPaletteOpen} onClose={() => setIsCmdPaletteOpen(false)} commands={commands} /> 
      <ShortcutsPanel isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} nodes={nodes} onAction={handleAiActions} />
      <MediaModal isOpen={isMediaModalOpen} onClose={() => setIsMediaModalOpen(false)} onImageAdd={(url, label) => { const centerPos = { x: (window.innerWidth / 2 - viewport.x) / viewport.zoom, y: (window.innerHeight / 2 - viewport.y) / viewport.zoom }; handleAddNode(undefined, false, NodeType.MEDIA, undefined, label, undefined, { imageUrl: url }, centerPos); }} />
      <NewMapModal isOpen={isNewMapModalOpen} onClose={() => setIsNewMapModalOpen(false)} onCreate={handleCreateNewMap} />
      <AiOptionsModal isOpen={isAiOptionsOpen} onClose={() => setIsAiOptionsOpen(false)} onGenerate={handleExpandNode} nodeLabel={aiTargetNodeId ? nodes.find(n => n.id === aiTargetNodeId)?.label || '' : ''} onLabelChange={(newLabel) => { if (aiTargetNodeId) handleLabelChange(aiTargetNodeId, newLabel); }} />
      {aiTargetNodeId && (<DreamModal isOpen={isDreamModalOpen} onClose={() => setIsDreamModalOpen(false)} nodeLabel={nodes.find(n => n.id === aiTargetNodeId)?.label || ''} onConfirm={handleDreamNode} />)}
      {showShapeDock && shapeDockTarget && (<ShapeDock nodePosition={activeNodeScreenPosition} zoom={viewport.zoom} nodeType={shapeDockTarget.type} onAction={handleContextMenuAction} initialColor={shapeDockTarget.color} />)}
      {(activeEdgeId || activeControlPoint || (!activeContextNodeId && contextMenuAnchor)) && (<ContextMenu anchorRect={contextMenuAnchor ? { left: contextMenuAnchor.left, top: contextMenuAnchor.top, right: contextMenuAnchor.right, bottom: contextMenuAnchor.bottom, width: 0, height: 0 } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }} nodeId={null} activeNodeType={undefined} isEdge={!!activeEdgeId} isControlPoint={!!activeControlPoint} onClose={() => { setActiveContextNodeId(null); setActiveEdgeId(null); setActiveControlPoint(null); setContextMenuAnchor(null); }} onAction={handleContextMenuAction} />)}
      
      <ExportPreviewModal 
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          nodes={nodes}
          projectName={projectName}
          format={exportFormat}
          elementId="canvas-content"
      />
      <IntegrationsModal isOpen={false} onClose={() => {}} /> 
    </div>
  );
};

export default SingularityCanvas;
