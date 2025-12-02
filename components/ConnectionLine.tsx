
import React, { useState, useMemo } from 'react';
import { Icon } from './Icons';
import { EdgeOptions, Position } from '../types';

interface ConnectionLineProps {
  start: Position;
  end: Position;
  onDelete: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onHandleMouseDown?: (index: number, e: React.MouseEvent) => void;
  onLineClick?: (e: React.MouseEvent) => void;
  onPointContextMenu?: (index: number, e: React.MouseEvent) => void;
  options?: EdgeOptions;
  themeColor?: string; // Fallback theme color
  isSelected?: boolean;
  edgeId?: string; // Added for selection identification
}

// Catmull-Rom Spline Helper
const solveCatmullRom = (p0: Position, p1: Position, p2: Position, p3: Position, tension: number = 0.5) => {
    const t0 = {
        x: (p2.x - p0.x) * tension,
        y: (p2.y - p0.y) * tension
    };
    const t1 = {
        x: (p3.x - p1.x) * tension,
        y: (p3.y - p1.y) * tension
    };
    // Convert to Cubic Bezier Control Points
    // B1 = P1 + T0/3
    // B2 = P2 - T1/3
    return {
        cp1: { x: p1.x + t0.x / 3, y: p1.y + t0.y / 3 },
        cp2: { x: p2.x - t1.x / 3, y: p2.y - t1.y / 3 }
    };
};

export const ConnectionLine: React.FC<ConnectionLineProps> = ({ 
    start, 
    end, 
    onDelete, 
    onContextMenu, 
    onHandleMouseDown,
    onLineClick,
    onPointContextMenu,
    options, 
    themeColor,
    isSelected,
    edgeId
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const strokeColor = options?.color || themeColor || "#cbd5e1";
  const strokeWidth = options?.width || 2;
  const endMarker = options?.endMarker ?? 'arrow';
  const routingType = options?.routingType || 'curved';
  const controlPoints = options?.controlPoints || [];

  // Generate Path Logic
  const pathData = useMemo(() => {
      const points = [start, ...controlPoints, end];

      if (routingType === 'straight') {
          return `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`;
      }

      if (routingType === 'orthogonal') {
          let d = `M ${start.x} ${start.y}`;
          for (let i = 0; i < points.length - 1; i++) {
              const curr = points[i];
              const next = points[i+1];
              const midX = (curr.x + next.x) / 2;
              // Simple midpoint step
              d += ` L ${midX} ${curr.y} L ${midX} ${next.y} L ${next.x} ${next.y}`;
          }
          return d;
      }

      // Default: Curved (Smart Bezier or Spline)
      if (controlPoints.length === 0) {
          // Standard Bezier for Mind Map feel
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const curvature = Math.min(Math.abs(dx) * 0.8, 150);
          const cp1x = start.x + curvature;
          const cp1y = start.y;
          const cp2x = end.x - curvature;
          const cp2y = end.y;
          return `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`;
      } else {
          // Catmull-Rom Spline through Control Points
          let d = `M ${start.x} ${start.y}`;
          
          // Add phantom points for spline start/end
          const phantomStart = { x: start.x - (controlPoints[0].x - start.x), y: start.y - (controlPoints[0].y - start.y) };
          const phantomEnd = { x: end.x + (end.x - controlPoints[controlPoints.length-1].x), y: end.y + (end.y - controlPoints[controlPoints.length-1].y) };
          
          const fullPoints = [phantomStart, start, ...controlPoints, end, phantomEnd];

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
  }, [start, end, routingType, controlPoints]);

  // Midpoint for Label
  const labelPos = useMemo(() => {
      if (controlPoints.length > 0) {
          const idx = Math.floor(controlPoints.length / 2);
          return controlPoints[idx];
      }
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      return { x: midX, y: midY };
  }, [start, end, controlPoints]);

  const uniqueId = `edge-${Math.round(start.x)}-${Math.round(start.y)}-${Math.round(end.x)}-${Math.round(end.y)}`;
  const animClass = options?.animated ? 'animate-flow' : '';
  const strokeDash = options?.stroke === 'dashed' ? '5,5' : options?.stroke === 'dotted' ? '2,2' : 'none';

  return (
    <g 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={onContextMenu}
      className="group"
    >
      <defs>
        <marker id={`${uniqueId}-arrow`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill={isHovered || isSelected ? "#ef4444" : strokeColor} />
        </marker>
        <marker id={`${uniqueId}-dot`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <circle cx="3" cy="3" r="2" fill={isHovered || isSelected ? "#ef4444" : strokeColor} />
        </marker>
      </defs>

      {/* Hit Area (Thick invisible path for clicking/adding points/detection) */}
      <path 
        d={pathData} 
        fill="none" 
        stroke="transparent" 
        strokeWidth={Math.max(strokeWidth + 14, 20)}
        className="cursor-pointer"
        onClick={(e) => {
           e.stopPropagation();
           if (onLineClick) onLineClick(e);
        }}
        data-edge-id={edgeId} // Identifier for paint selection
        pointerEvents="auto"
      />

      {/* Selected Halo - Animated if selected */}
      {isSelected && (
         <path 
             d={pathData}
             fill="none"
             stroke="#3b82f6"
             strokeWidth={strokeWidth + 6}
             strokeLinecap="round"
             strokeLinejoin="round"
             opacity={0.5}
             className="animate-pulse"
         />
      )}
      
      {/* Visual Path */}
      <path 
        d={pathData} 
        fill="none" 
        stroke={isHovered || isSelected ? "#ef4444" : strokeColor} 
        strokeWidth={isHovered ? strokeWidth + 1 : strokeWidth} 
        strokeLinecap="round" 
        strokeLinejoin="round"
        strokeDasharray={animClass ? '5' : strokeDash}
        markerEnd={endMarker === 'arrow' ? `url(#${uniqueId}-arrow)` : endMarker === 'dot' ? `url(#${uniqueId}-dot)` : undefined}
        className={`${animClass} pointer-events-none transition-colors duration-200`} 
      />

      {/* Control Point Handles */}
      {(isHovered || controlPoints.length > 0 || isSelected) && controlPoints.map((cp, idx) => (
          <g key={idx} transform={`translate(${cp.x}, ${cp.y})`}>
             <circle 
                r={isSelected ? 6 : 5} 
                fill="white" 
                stroke={isSelected ? "#ef4444" : strokeColor} 
                strokeWidth={2} 
                className="cursor-move hover:scale-125 transition-transform"
                onMouseDown={(e) => {
                    e.stopPropagation();
                    if (onHandleMouseDown) onHandleMouseDown(idx, e);
                }}
                onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (onPointContextMenu) onPointContextMenu(idx, e);
                }}
             />
          </g>
      ))}

      {/* Label */}
      {options?.label && (
        <foreignObject x={labelPos.x - 60} y={labelPos.y - 15} width="120" height="30" className="pointer-events-none">
           <div className="w-full h-full flex items-center justify-center">
             <span 
                className="bg-white/90 backdrop-blur text-[10px] font-bold text-slate-700 px-2 py-0.5 rounded-full border border-slate-200 shadow-sm truncate max-w-full pointer-events-auto cursor-text select-none"
                title={options.label}
             >
               {options.label}
             </span>
           </div>
        </foreignObject>
      )}

    </g>
  );
};
