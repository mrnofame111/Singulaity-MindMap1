
export enum NodeType {
  ROOT = 'ROOT',
  MAIN = 'MAIN',
  SUB = 'SUB',
  NOTE = 'NOTE',
  MEDIA = 'MEDIA',
  TASK = 'TASK',
  CODE = 'CODE',
  TABLE = 'TABLE',
}

export enum ToolMode {
  SELECT = 'SELECT',
  HAND = 'HAND',
  CONNECT = 'CONNECT',
  NOTE = 'NOTE',
  DRAW = 'DRAW',
}

export type NodeShape = 'rounded' | 'rectangle' | 'circle' | 'diamond' | 'triangle' | 'hexagon' | 'octagon' | 'parallelogram' | 'cloud' | 'custom';

export interface Position {
  x: number;
  y: number;
}

export interface Comment {
  id: string;
  text: string;
  userName: string;
  timestamp: number;
}

export interface NodeHistory {
  timestamp: number;
  label: string;
  data?: any;
}

export interface PresentationItem {
  id: string;
  type: 'text' | 'image';
  content: string; // Text content or Image URL
}

export interface SingularityNode {
  id: string;
  type: NodeType;
  label: string;
  position: Position;
  parentId?: string;
  childrenIds: string[];
  isAiGenerated?: boolean;
  color?: string;
  shape?: NodeShape;
  originalShape?: NodeShape; // For reverting after Flowchart mode
  locked?: boolean;
  checked?: boolean; // For Task Nodes
  comments?: Comment[];
  history?: NodeHistory[];
  data?: {
    imageUrl?: string;
    customShapeUrl?: string;
    description?: string; 
    items?: string[]; // For Class/List Nodes
    presentationItems?: PresentationItem[]; // For Dynamic Narrative Mode (Max 9)
    codeLanguage?: string; // For Code Nodes
    codeSnippet?: string; // For Code Nodes
    codeOutput?: string; // For Code Nodes (Console Output)
    tableRows?: string[][]; // For Table Nodes
    url?: string; // External Link
    [key: string]: any;
  };
}

export interface EdgeOptions {
  label?: string;
  animated?: boolean;
  endMarker?: 'arrow' | 'dot' | 'none';
  stroke?: 'solid' | 'dashed' | 'dotted';
  color?: string;
  width?: number;
  routingType?: 'straight' | 'curved' | 'orthogonal';
  controlPoints?: Position[];
}

export interface DrawingPath {
  id: string;
  points: Position[];
  color: string;
  width: number;
  isEraser?: boolean;
  type: 'pen' | 'highlighter';
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface AIMindMapNode {
  label: string;
  children?: AIMindMapNode[];
}

// Graph structure for flat generation (Flowcharts)
export interface AIGraphNode {
  id: string;
  label: string;
  shape: NodeShape;
  type: NodeType;
}

export interface AIGraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface AIGraphResult {
  nodes: AIGraphNode[];
  edges: AIGraphEdge[];
}

export interface HistoryStep {
  nodes: SingularityNode[];
  drawings: DrawingPath[];
  edgeData: Record<string, EdgeOptions>;
}

export interface AppTheme {
  id: string;
  name: string;
  bg: string;
  pattern: 'dots' | 'grid' | 'none';
  nodeRoot: string;
  nodeMain: string;
  nodeSub: string;
  textMain: string;
  lineColor: string;
  isDark: boolean;
}

export interface CanvasSettings {
  theme: string; // References AppTheme.id
  showGrid: boolean;
  zoomSensitivity: number; // 0.1 to 3.0
  zoomInertia: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AIStyleOptions {
  inheritNodeColor: boolean;
  customNodeColor?: string;
  inheritNodeShape: boolean;
  customNodeShape?: NodeShape;
  inheritLinkColor: boolean;
  customLinkColor?: string;
  inheritLinkStyle: boolean;
  customLinkStyle?: 'straight' | 'curved' | 'orthogonal';
}

export interface AIGenerationOptions {
  count: number | 'auto';
  depth: number; 
  tone: 'standard' | 'creative' | 'professional' | 'humorous' | 'concise';
  model?: string;
  context?: string; 
  mode?: 'MINDMAP' | 'FLOWCHART';
  style?: AIStyleOptions;
}

export interface AIAction {
  type: 'CREATE_NODE' | 'CONNECT_NODES' | 'DELETE_NODE' | 'UPDATE_NODE' | 'FIND_NODE';
  payload: any;
}

export interface SnapLine {
  x?: number;
  y?: number;
}

export interface SmartStylingRules {
  active: boolean;
  sibling: {
    color: boolean;
    shape: boolean;
    edge: boolean;
  };
  child: {
    color: boolean;
    shape: boolean;
    edge: boolean;
  };
}

export interface ExportConfig {
  backgroundStyle: string; // CSS value (hex, gradient, or url)
  themeId?: string;
  padding: number;
  showTitle?: boolean;
  projectName?: string;
}
