
import { NodeType, SingularityNode, AppTheme, NodeShape } from './types';

export const INITIAL_VIEWPORT = { x: 0, y: 0, zoom: 1 };

export const INITIAL_NODES: SingularityNode[] = [
  {
    id: 'root-1',
    type: NodeType.ROOT,
    label: 'Start Here',
    position: { x: 0, y: 0 },
    childrenIds: [],
  },
];

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
export const ZOOM_SENSITIVITY = 0.001;

export const generateId = () => `node-${Math.random().toString(36).substr(2, 9)}`;

export const APP_THEMES: Record<string, AppTheme> = {
  'default': {
    id: 'default',
    name: 'Singularity Light',
    bg: '#f0f4f8',
    pattern: 'dots',
    nodeRoot: 'bg-slate-900 text-white border-slate-700',
    nodeMain: 'bg-white text-slate-900 border-gray-300',
    nodeSub: 'bg-white text-slate-900 border-gray-300',
    textMain: '#1e293b',
    lineColor: '#cbd5e1',
    isDark: false,
  },
  'dark': {
    id: 'dark',
    name: 'Deep Space',
    bg: '#0f172a',
    pattern: 'grid',
    nodeRoot: 'bg-blue-600 text-white border-blue-400',
    nodeMain: 'bg-slate-800 text-white border-slate-600',
    nodeSub: 'bg-slate-900 text-gray-300 border-slate-700',
    textMain: '#f8fafc',
    lineColor: '#334155',
    isDark: true,
  },
  'midnight': {
    id: 'midnight',
    name: 'Cyberpunk',
    bg: '#000000',
    pattern: 'grid',
    nodeRoot: 'bg-yellow-400 text-black border-yellow-600',
    nodeMain: 'bg-black text-pink-500 border-pink-500',
    nodeSub: 'bg-black text-cyan-400 border-cyan-400',
    textMain: '#ffffff',
    lineColor: '#333333',
    isDark: true,
  },
  'nature': {
    id: 'nature',
    name: 'Forest Focus',
    bg: '#ecfdf5',
    pattern: 'dots',
    nodeRoot: 'bg-emerald-800 text-white border-emerald-900',
    nodeMain: 'bg-white text-emerald-900 border-emerald-200',
    nodeSub: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    textMain: '#064e3b',
    lineColor: '#a7f3d0',
    isDark: false,
  }
};

// --- TEMPLATES ---

export const TEMPLATES = {
  SWOT: (centerX: number, centerY: number): SingularityNode[] => {
    const rootId = generateId();
    const sId = generateId();
    const wId = generateId();
    const oId = generateId();
    const tId = generateId();

    return [
      { id: rootId, type: NodeType.ROOT, label: 'SWOT Analysis', position: { x: centerX, y: centerY }, childrenIds: [sId, wId, oId, tId], shape: 'circle' },
      { id: sId, type: NodeType.MAIN, label: 'Strengths', position: { x: centerX - 300, y: centerY - 150 }, childrenIds: [], color: '#dcfce7', shape: 'rounded' },
      { id: wId, type: NodeType.MAIN, label: 'Weaknesses', position: { x: centerX + 300, y: centerY - 150 }, childrenIds: [], color: '#fee2e2', shape: 'rounded' },
      { id: oId, type: NodeType.MAIN, label: 'Opportunities', position: { x: centerX - 300, y: centerY + 150 }, childrenIds: [], color: '#dbeafe', shape: 'rounded' },
      { id: tId, type: NodeType.MAIN, label: 'Threats', position: { x: centerX + 300, y: centerY + 150 }, childrenIds: [], color: '#fef9c3', shape: 'rounded' },
    ];
  },
  ROADMAP: (centerX: number, centerY: number): SingularityNode[] => {
    const rootId = generateId();
    const q1 = generateId(); const q2 = generateId(); const q3 = generateId(); const q4 = generateId();
    
    return [
      { id: rootId, type: NodeType.ROOT, label: 'Product Roadmap', position: { x: centerX, y: centerY }, childrenIds: [q1, q2, q3, q4], shape: 'cloud' },
      { id: q1, type: NodeType.MAIN, label: 'Q1: Research', position: { x: centerX - 400, y: centerY + 150 }, childrenIds: [], color: '#e0e7ff', shape: 'parallelogram' },
      { id: q2, type: NodeType.MAIN, label: 'Q2: Design', position: { x: centerX - 150, y: centerY + 150 }, childrenIds: [], color: '#e0e7ff', shape: 'parallelogram' },
      { id: q3, type: NodeType.MAIN, label: 'Q3: Develop', position: { x: centerX + 150, y: centerY + 150 }, childrenIds: [], color: '#e0e7ff', shape: 'parallelogram' },
      { id: q4, type: NodeType.MAIN, label: 'Q4: Launch', position: { x: centerX + 400, y: centerY + 150 }, childrenIds: [], color: '#dcfce7', shape: 'parallelogram' },
    ];
  },
  PROJECT_PLAN: (centerX: number, centerY: number): SingularityNode[] => {
     const rootId = generateId();
     return [
        { id: rootId, type: NodeType.ROOT, label: 'Project X', position: { x: centerX, y: centerY }, childrenIds: [], shape: 'rectangle' }
     ];
  }
};

// --- COLLISION RESOLUTION ---
export const pushNodesAside = (centerNode: SingularityNode, nodes: SingularityNode[], radius: number = 200): SingularityNode[] => {
    return nodes.map(node => {
        if (node.id === centerNode.id) return node; // Don't move the center node
        
        const dx = node.position.x - centerNode.position.x;
        const dy = node.position.y - centerNode.position.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < radius) {
            // Collision detected
            let angle = Math.atan2(dy, dx);
            if (dist === 0) angle = Math.random() * Math.PI * 2; // Handle exact overlap
            
            const pushDist = radius - dist + 20; // Move it just outside radius + buffer
            
            return {
                ...node,
                position: {
                    x: node.position.x + Math.cos(angle) * pushDist,
                    y: node.position.y + Math.sin(angle) * pushDist
                }
            };
        }
        return node;
    });
};

// --- LOCAL FLOWER LAYOUT (FOR AI EXPANSION) ---
// Places children around the parent, fanning away from grandparent.
export const layoutLocalFlower = (
    parentNode: SingularityNode, 
    children: SingularityNode[], 
    grandParentNode?: SingularityNode
): SingularityNode[] => {
    if (children.length === 0) return children;

    const radius = 200 + (children.length * 10);
    let startAngle = 0;
    let totalArc = Math.PI * 2;

    if (grandParentNode) {
        // Calculate angle from grandparent to parent
        const dx = parentNode.position.x - grandParentNode.position.x;
        const dy = parentNode.position.y - grandParentNode.position.y;
        const incomingAngle = Math.atan2(dy, dx);
        
        // Fan out in the direction continuing from grandparent -> parent
        // We want a spread of about 120-180 degrees depending on count
        totalArc = Math.min(Math.PI, (children.length * Math.PI) / 6); // 30 degrees per child, max 180
        startAngle = incomingAngle - (totalArc / 2);
    } else {
        // No grandparent (Root), circle around
        totalArc = Math.PI * 2;
        startAngle = 0;
    }
    
    return children.map((child, index) => {
        // Distribute evenly
        const angle = children.length === 1 
            ? startAngle + (totalArc / 2) // Center single child
            : startAngle + (index / (grandParentNode ? children.length - 1 : children.length)) * totalArc;

        return {
            ...child,
            position: {
                x: parentNode.position.x + Math.cos(angle) * radius,
                y: parentNode.position.y + Math.sin(angle) * radius
            }
        };
    });
};

// --- ORGANIC LAYOUT (GLOBAL) ---
export const layoutOrganic = (nodes: SingularityNode[]): SingularityNode[] => {
    const newNodes = nodes.map(n => ({...n}));
    const nodeMap = new Map(newNodes.map(n => [n.id, n]));
    const root = newNodes.find(n => n.type === 'ROOT') || newNodes[0];
    if (!root) return nodes;

    const weights = new Map<string, number>();
    const calculateWeight = (nodeId: string): number => {
        const node = nodeMap.get(nodeId);
        if (!node) return 0;
        if (node.childrenIds.length === 0) {
            weights.set(nodeId, 1);
            return 1;
        }
        const childrenWeight = node.childrenIds.reduce((sum, childId) => sum + calculateWeight(childId), 0);
        const w = Math.max(1, childrenWeight);
        weights.set(nodeId, w);
        return w;
    };
    calculateWeight(root.id);

    const layoutRecursive = (nodeId: string, sectorStart: number, sectorEnd: number, level: number) => {
        const node = nodeMap.get(nodeId);
        if (!node || node.childrenIds.length === 0) return;

        const availableAngle = sectorEnd - sectorStart;
        let immediateChildrenWeight = 0;
        node.childrenIds.forEach(cid => { immediateChildrenWeight += weights.get(cid) || 1; });

        let currentAngle = sectorStart;
        const radius = level === 0 ? 250 : 300; 

        node.childrenIds.forEach(childId => {
            const child = nodeMap.get(childId);
            if (!child) return;
            const childWeight = weights.get(childId) || 1;
            const share = childWeight / immediateChildrenWeight;
            const childSectorSize = availableAngle * share;
            const midAngle = currentAngle + (childSectorSize / 2);
            
            // Only update position if it hasn't been manually set or locked (simple heuristic)
            // For now, we overwrite to enforce organic layout
            child.position = {
                x: node.position.x + Math.cos(midAngle) * radius,
                y: node.position.y + Math.sin(midAngle) * radius
            };
            
            layoutRecursive(childId, currentAngle, currentAngle + childSectorSize, level + 1);
            currentAngle += childSectorSize;
        });
    };

    layoutRecursive(root.id, 0, Math.PI * 2, 0);
    return newNodes;
};

export const calculateLayout = (rootData: any, centerX: number, centerY: number): SingularityNode[] => {
    const nodes: SingularityNode[] = [];
    const traverse = (data: any, parentId: string | undefined, depth: number): string => {
        const id = generateId();
        const node: SingularityNode = {
            id,
            type: depth === 0 ? NodeType.ROOT : depth === 1 ? NodeType.MAIN : NodeType.SUB,
            label: data.label,
            position: { x: centerX, y: centerY }, 
            parentId,
            childrenIds: [],
            isAiGenerated: true,
        };
        nodes.push(node);
        if (data.children) {
            data.children.forEach((c: any) => {
                const cid = traverse(c, id, depth + 1);
                node.childrenIds.push(cid);
            });
        }
        return id;
    };
    traverse(rootData, undefined, 0);
    return nodes;
};

export type LayoutType = 'MINDMAP_LR' | 'MINDMAP_RL' | 'TREE' | 'RADIAL' | 'FLOWCHART' | 'FLOWER';

export const recalculateLayout = (
    currentNodes: SingularityNode[], 
    type: LayoutType
): SingularityNode[] => {
    const nodesMap = new Map(currentNodes.map(n => [n.id, { ...n }])); 
    const root = Array.from(nodesMap.values()).find(n => n.type === NodeType.ROOT) || Array.from(nodesMap.values())[0];
    if (!root) return currentNodes;

    if (type === 'RADIAL' || type === 'FLOWER') {
         return layoutOrganic(currentNodes);
    }
    
    // Standard Horizontal Mind Map
    if (type === 'MINDMAP_LR' || type === 'MINDMAP_RL') {
        const levelWidth = 250;
        const nodeHeight = 100; 
        const direction = type === 'MINDMAP_RL' ? -1 : 1;

        const getHeight = (id: string): number => {
             const n = nodesMap.get(id);
             if (!n || n.childrenIds.length === 0) return nodeHeight;
             return n.childrenIds.reduce((sum, c) => sum + getHeight(c), 0);
        };

        const layoutH = (id: string, x: number, y: number) => {
             const n = nodesMap.get(id);
             if(!n) return;
             n.position = { x, y };
             let startY = y - getHeight(id) / 2;
             n.childrenIds.forEach(cid => {
                 const h = getHeight(cid);
                 layoutH(cid, x + (levelWidth * direction), startY + h/2);
                 startY += h;
             });
        };
        layoutH(root.id, root.position.x, root.position.y);
        return Array.from(nodesMap.values());
    }

    if (type === 'FLOWCHART') {
        // Simple vertical spacing
        const levelSpacing = 150;
        const siblingSpacing = 220;
        const visited = new Set<string>();
        const layoutNode = (nodeId: string, level: number, offset: number) => {
            if (visited.has(nodeId)) return offset;
            visited.add(nodeId);
            const node = nodesMap.get(nodeId);
            if(!node) return offset;

            // NOTE: Shape logic removed from here to avoid state conflicts.
            // Handled in SingularityCanvas.handleLayoutAction instead.

            node.position = { x: offset, y: level * levelSpacing };

            let childOffset = offset;
            if (node.childrenIds.length > 0) {
                 const totalWidth = (node.childrenIds.length - 1) * siblingSpacing;
                 let startX = offset - totalWidth / 2;
                 node.childrenIds.forEach((childId, idx) => {
                      layoutNode(childId, level + 1, startX + (idx * siblingSpacing));
                 });
            }
            return offset;
        };
        layoutNode(root.id, 0, root.position.x);
        return Array.from(nodesMap.values());
    }

    if (type === 'TREE') {
         const levelHeight = 150;
         const nodeWidth = 180;
         const getWidth = (id: string): number => {
             const n = nodesMap.get(id);
             if (!n || n.childrenIds.length === 0) return nodeWidth;
             return n.childrenIds.reduce((sum, c) => sum + getWidth(c), 0) + (n.childrenIds.length - 1) * 20;
         };
         const layoutTree = (id: string, x: number, y: number) => {
             const n = nodesMap.get(id);
             if(!n) return;
             n.position = { x, y };
             let currentX = x - getWidth(id)/2;
             n.childrenIds.forEach(cid => {
                 const childW = getWidth(cid);
                 layoutTree(cid, currentX + childW/2, y + levelHeight);
                 currentX += childW + 20;
             });
         };
         layoutTree(root.id, root.position.x, root.position.y);
         return Array.from(nodesMap.values());
    }

    return currentNodes;
};
