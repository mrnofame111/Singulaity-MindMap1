
import React, { useEffect, useState, useRef } from 'react';
import { SingularityNode, NodeType, EdgeOptions } from '../types';
import NodeComponent from './NodeComponent';
import { ConnectionLine } from './ConnectionLine';
import { Icon } from './Icons';

interface DemoCanvasProps {
  activeStep: number; // 0: Hero, 1: IHPE/Layout, 2: Styles, 3: Vector Links
}

const INITIAL_DEMO_NODES: SingularityNode[] = [
  {
    id: 'root',
    type: NodeType.ROOT,
    label: 'Core Idea',
    position: { x: 0, y: 0 },
    childrenIds: [],
    shape: 'circle',
    color: '#6366f1' // Indigo-500
  }
];

export const DemoCanvas: React.FC<DemoCanvasProps> = ({ activeStep }) => {
  const [nodes, setNodes] = useState<SingularityNode[]>(INITIAL_DEMO_NODES);
  const [edgeData, setEdgeData] = useState<Record<string, EdgeOptions>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  // Center the view initially
  useEffect(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      setViewport({ x: width / 2, y: height / 2, zoom: 0.8 });
    }
  }, []);

  // SCRIPTED ANIMATIONS BASED ON SCROLL STEP
  useEffect(() => {
    if (activeStep === 0) {
        // Reset to Hero State
        setNodes(INITIAL_DEMO_NODES);
        setEdgeData({});
    }

    if (activeStep === 1) {
        // Step 1: IHPE (Intelligent Hybrid Placement)
        const root = INITIAL_DEMO_NODES[0];
        const n1Id = 'n1'; const n2Id = 'n2'; const n3Id = 'n3';
        
        const newNodes: SingularityNode[] = [
            { ...root, childrenIds: [n1Id, n2Id, n3Id] },
            { id: n1Id, type: NodeType.MAIN, label: 'Structure', position: { x: 250, y: -120 }, childrenIds: [], parentId: 'root', shape: 'rounded', color: '#1e293b' },
            { id: n2Id, type: NodeType.MAIN, label: 'Logic', position: { x: 250, y: 0 }, childrenIds: [], parentId: 'root', shape: 'rounded', color: '#1e293b' },
            { id: n3Id, type: NodeType.MAIN, label: 'Design', position: { x: 250, y: 120 }, childrenIds: [], parentId: 'root', shape: 'rounded', color: '#1e293b' }
        ];
        
        setNodes(newNodes);
        setEdgeData({
            'root-n1': { color: '#475569', stroke: 'solid' },
            'root-n2': { color: '#475569', stroke: 'solid' },
            'root-n3': { color: '#475569', stroke: 'solid' }
        });
    }

    if (activeStep === 2) {
        // Step 2: Smart Styling (Inheritance/Swap)
        const root = INITIAL_DEMO_NODES[0];
        const n1Id = 'n1'; const n2Id = 'n2'; const n3Id = 'n3';
        const newNodes: SingularityNode[] = [
            { ...root, childrenIds: [n1Id, n2Id, n3Id], color: '#6366f1' },
            { id: n1Id, type: NodeType.MAIN, label: 'Structure', position: { x: 250, y: -120 }, childrenIds: [], parentId: 'root', shape: 'diamond', color: '#ec4899' }, // Pink
            { id: n2Id, type: NodeType.MAIN, label: 'Logic', position: { x: 250, y: 0 }, childrenIds: [], parentId: 'root', shape: 'hexagon', color: '#10b981' }, // Green
            { id: n3Id, type: NodeType.MAIN, label: 'Design', position: { x: 250, y: 120 }, childrenIds: [], parentId: 'root', shape: 'triangle', color: '#f59e0b' } // Amber
        ];
        setNodes(newNodes);
        setEdgeData({
            'root-n1': { color: '#ec4899', stroke: 'solid' },
            'root-n2': { color: '#10b981', stroke: 'solid' },
            'root-n3': { color: '#f59e0b', stroke: 'solid' }
        });
    }

    if (activeStep === 3) {
        // Step 3: Vector Links (Curves)
        const root = INITIAL_DEMO_NODES[0];
        const n1Id = 'n1'; const n2Id = 'n2'; const n3Id = 'n3';
        const newNodes: SingularityNode[] = [
            { ...root, childrenIds: [n1Id, n2Id, n3Id] },
            { id: n1Id, type: NodeType.MAIN, label: 'Structure', position: { x: 250, y: -120 }, childrenIds: [], parentId: 'root', shape: 'diamond', color: '#ec4899' },
            { id: n2Id, type: NodeType.MAIN, label: 'Logic', position: { x: 250, y: 0 }, childrenIds: [], parentId: 'root', shape: 'hexagon', color: '#10b981' },
            { id: n3Id, type: NodeType.MAIN, label: 'Design', position: { x: 250, y: 120 }, childrenIds: [], parentId: 'root', shape: 'triangle', color: '#f59e0b' }
        ];
        setNodes(newNodes);
        setEdgeData({
            'root-n1': { color: '#ec4899', stroke: 'dashed', routingType: 'curved', controlPoints: [{ x: 120, y: -200 }] },
            'root-n2': { color: '#10b981', stroke: 'solid', routingType: 'curved', controlPoints: [{ x: 120, y: 50 }] },
            'root-n3': { color: '#f59e0b', stroke: 'dotted', routingType: 'curved', controlPoints: [{ x: 120, y: 200 }] }
        });
    }

  }, [activeStep]);

  return (
    <div 
        ref={containerRef} 
        className="w-full h-full relative overflow-hidden"
        style={{ background: 'transparent' }}
    >
      {/* Background Grid */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{ 
            backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            backgroundPosition: `${viewport.x}px ${viewport.y}px`
        }}
      />

      {/* Canvas Content */}
      <div 
        className="absolute inset-0 origin-top-left transition-transform duration-500 ease-out"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
      >
          {/* Edges */}
          <svg className="absolute overflow-visible" style={{ top: 0, left: 0, pointerEvents: 'none' }}>
            {nodes.map(node => node.childrenIds.map(childId => {
               const child = nodes.find(n => n.id === childId);
               if (!child) return null;
               const edgeKey = `${node.id}-${childId}`;
               const edge = edgeData[edgeKey];

               return (
                 <g key={edgeKey} className="transition-all duration-700">
                   <ConnectionLine 
                     start={node.position} 
                     end={child.position} 
                     options={edge} 
                     onDelete={() => {}}
                   />
                 </g>
               );
            }))}
          </svg>

          {/* Nodes */}
          {nodes.map(node => (
              <div key={node.id} className="transition-all duration-500 ease-out">
                <NodeComponent 
                    node={node}
                    isSelected={false}
                    isEditing={false}
                    themeClasses={{ 
                        root: 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-900/50',
                        main: 'bg-slate-800 text-white border-slate-600 shadow-md', 
                        sub: 'bg-slate-800 text-white border-slate-600' 
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onContextMenu={() => {}}
                    onAddChild={() => {}}
                    onDelete={() => {}}
                    onExpandAI={() => {}}
                    onLabelChange={() => {}}
                    onToggleTask={() => {}}
                    onEditStart={() => {}}
                    onEditEnd={() => {}}
                />
              </div>
          ))}
      </div>

      {/* Floating UI Mimic */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-white/10 flex gap-4 text-gray-400 scale-90 z-20">
          <Icon.Plus size={18} className={activeStep === 1 ? "text-blue-400 animate-pulse" : ""} />
          <Icon.Trash size={18} />
          <Icon.Palette size={18} className={activeStep === 2 ? "text-pink-400 animate-pulse" : ""} />
          <Icon.Connect size={18} className={activeStep === 3 ? "text-green-400 animate-pulse" : ""} />
      </div>
      
      <div className="absolute top-4 left-4 bg-white/5 text-white/30 text-[10px] font-bold px-2 py-1 rounded uppercase z-20 font-mono">
          System: Online
      </div>
    </div>
  );
};
