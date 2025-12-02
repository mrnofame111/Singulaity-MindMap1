
import React, { useState, useRef, useEffect } from 'react';
import { SingularityNode, Viewport } from '../types';

interface MinimapProps {
  nodes: SingularityNode[];
  viewport: Viewport;
  windowSize: { w: number, h: number };
  setViewport: (v: Viewport | ((prev: Viewport) => Viewport)) => void;
}

export const Minimap: React.FC<MinimapProps> = ({ nodes, viewport, windowSize: initialWindowSize, setViewport }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Track window size for responsive layout
  const [windowDims, setWindowDims] = useState(initialWindowSize);

  useEffect(() => {
      const handleResize = () => {
          setWindowDims({ w: window.innerWidth, h: window.innerHeight });
      };
      // Ensure state matches current window on mount
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // World Configuration
  const worldSize = 6000;
  
  // Responsive Settings - REDUCED SIZE
  const isMobile = windowDims.w < 768;
  const mapSize = isMobile ? 100 : 180; 
  
  const scale = mapSize / worldSize;
  const offset = worldSize / 2;

  const mapToWorld = (mx: number, my: number) => {
    const wx = (mx / scale) - offset;
    const wy = (my / scale) - offset;
    return { wx, wy };
  };

  const worldToMap = (wx: number, wy: number) => {
    const mx = (wx + offset) * scale;
    const my = (wy + offset) * scale;
    return { mx, my };
  };

  const jumpToWorldPos = (wx: number, wy: number) => {
    const newX = (windowDims.w / 2) - (wx * viewport.zoom);
    const newY = (windowDims.h / 2) - (wy * viewport.zoom);
    setViewport(prev => ({ ...prev, x: newX, y: newY }));
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const { wx, wy } = mapToWorld(clickX, clickY);
    jumpToWorldPos(wx, wy);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { wx, wy } = mapToWorld(mx, my);
      jumpToWorldPos(wx, wy);
    };
    const handleMouseUp = () => { setIsDragging(false); };
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, viewport.zoom, windowDims, scale]); 

  const centerWx = (windowDims.w / 2 - viewport.x) / viewport.zoom;
  const centerWy = (windowDims.h / 2 - viewport.y) / viewport.zoom;
  const { mx: centerMx, my: centerMy } = worldToMap(centerWx, centerWy);
  const viewW = (windowDims.w / viewport.zoom) * scale;
  const viewH = (windowDims.h / viewport.zoom) * scale;

  return (
    <div 
      ref={containerRef}
      className={`fixed z-50 bg-white/95 dark:bg-[#1e2030]/95 backdrop-blur-md rounded-xl shadow-2xl overflow-hidden group transition-all duration-300 cursor-crosshair select-none hover:border-indigo-600 dark:hover:border-indigo-400
        ${isMobile 
            ? 'bottom-24 right-4 border-[2px] border-slate-800/50 dark:border-slate-200/50' 
            : 'bottom-8 right-8 border-[4px] border-slate-800 dark:border-slate-200'
        }
      `}
      style={{ width: mapSize, height: mapSize }}
      onMouseDown={handleContainerClick}
    >
        {/* Background Grid */}
        <div 
            className="absolute inset-0 opacity-10 dark:opacity-20 pointer-events-none"
            style={{
                backgroundImage: 'linear-gradient(#64748b 1px, transparent 1px), linear-gradient(90deg, #64748b 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                backgroundPosition: 'center'
            }}
        />

        {/* Graph Axes */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50">
            <defs>
                <marker id="axis-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-slate-600 dark:text-slate-300" />
                </marker>
            </defs>
            
            {/* Ticks X */}
            {[-33, -16, 16, 33].map(offset => (
                <line 
                    key={`tick-x-${offset}`}
                    x1={`${50 + offset}%`} y1="48%" 
                    x2={`${50 + offset}%`} y2="52%" 
                    stroke="currentColor" strokeWidth="1" 
                    className="text-slate-400 dark:text-slate-500"
                />
            ))}

            {/* Ticks Y */}
            {[-33, -16, 16, 33].map(offset => (
                <line 
                    key={`tick-y-${offset}`}
                    x1="48%" y1={`${50 + offset}%`} 
                    x2="52%" y2={`${50 + offset}%`} 
                    stroke="currentColor" strokeWidth="1" 
                    className="text-slate-400 dark:text-slate-500"
                />
            ))}

            {/* X Axis */}
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" strokeWidth="1.5" className="text-slate-600 dark:text-slate-300" markerEnd="url(#axis-arrow)" />
            {/* Y Axis */}
            <line x1="50%" y1="100%" x2="50%" y2="0" stroke="currentColor" strokeWidth="1.5" className="text-slate-600 dark:text-slate-300" markerEnd="url(#axis-arrow)" />
            
            {/* Labels - Only on Desktop to save space */}
            {!isMobile && (
                <>
                    <text x="94%" y="46%" className="text-[10px] font-black fill-slate-700 dark:fill-slate-200" textAnchor="middle">X</text>
                    <text x="54%" y="8%" className="text-[10px] font-black fill-slate-700 dark:fill-slate-200" textAnchor="middle">Y</text>
                </>
            )}
        </svg>

        {/* Origin */}
        <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-indigo-600 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-sm z-10 ring-2 ring-white" />

        {/* Nodes */}
        {nodes.map(node => {
          const { mx, my } = worldToMap(node.position.x, node.position.y);
          if (mx < 0 || mx > mapSize || my < 0 || my > mapSize) return null;
          return (
            <div 
              key={node.id}
              className={`absolute w-1.5 h-1.5 rounded-full z-20 transition-colors ${node.type === 'ROOT' ? 'bg-red-500 w-2.5 h-2.5 ring-1 ring-white' : 'bg-slate-600 dark:bg-slate-400'}`}
              style={{ left: mx - 1, top: my - 1 }} 
            />
          );
        })}
        
        {/* Viewport Box */}
        <div 
          onMouseDown={handleMouseDown}
          className={`absolute border-2 cursor-move active:cursor-grabbing transition-colors z-30 rounded-sm ${isDragging ? 'border-indigo-600 bg-indigo-500/20' : 'border-indigo-400/70 hover:border-indigo-500 hover:bg-indigo-500/10'}`}
          style={{
            left: centerMx - viewW / 2,
            top: centerMy - viewH / 2,
            width: viewW,
            height: viewH,
          }}
        />
        
        {!isMobile && (
            <div className="absolute bottom-1 right-2 text-[8px] font-black text-slate-400/50 uppercase select-none pointer-events-none tracking-widest">
                NAVIGATOR
            </div>
        )}
    </div>
  );
};
