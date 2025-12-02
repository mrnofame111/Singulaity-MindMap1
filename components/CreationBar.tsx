
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icons';
import { EdgeOptions, NodeShape } from '../types';

interface CreationBarProps {
  defaultEdgeOptions: EdgeOptions;
  setDefaultEdgeOptions: (opts: EdgeOptions) => void;
  defaultNodeShape: NodeShape;
  setDefaultNodeShape: (s: NodeShape) => void;
  defaultNodeColor: string;
  setDefaultNodeColor: (c: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const SHAPES: { id: NodeShape, icon: any }[] = [
  { id: 'rectangle', icon: Icon.ShapeRect },
  { id: 'rounded', icon: () => <div className="w-3 h-2 border-2 border-current rounded-md"/> },
  { id: 'circle', icon: Icon.ShapeCircle },
  { id: 'diamond', icon: () => <div className="w-2.5 h-2.5 border-2 border-current rotate-45"/> },
  { id: 'triangle', icon: Icon.ShapeTriangle },
  { id: 'hexagon', icon: Icon.ShapeHexagon },
  { id: 'cloud', icon: Icon.ShapeCloud },
];

const ColorPickerButton = ({ color, onChange, label }: { color: string, onChange: (c: string) => void, label: string }) => (
    <div className="relative w-7 h-7 group rounded-full overflow-hidden shrink-0 shadow-sm border border-gray-200 transition-transform hover:scale-110 cursor-pointer">
        <div 
          className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none z-10"
          style={{ backgroundColor: color }}
        >
           {color === 'transparent' && <div className="w-full h-px bg-red-400 -rotate-45 absolute" />}
        </div>
        <input 
            type="color" 
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-20 p-0 border-0"
            value={color === 'transparent' ? '#ffffff' : color}
            onInput={(e) => { e.stopPropagation(); onChange((e.target as HTMLInputElement).value); }}
            onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }} 
            title={`Change ${label} Color`}
        />
    </div>
);

export const CreationBar: React.FC<CreationBarProps> = ({
  defaultEdgeOptions,
  setDefaultEdgeOptions,
  defaultNodeShape,
  setDefaultNodeShape,
  defaultNodeColor,
  setDefaultNodeColor,
  className,
  style
}) => {
  const [isShapeMenuOpen, setIsShapeMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsShapeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const CurrentShapeIcon = SHAPES.find(s => s.id === defaultNodeShape)?.icon || Icon.ShapeRect;

  // Ensure className fallback if not provided, positioning above bottom controls
  const containerClass = className || "fixed bottom-24 left-1/2 -translate-x-1/2 z-40 animate-slide-up origin-bottom pointer-events-none flex flex-col items-center";

  return (
    <div className={containerClass} style={style}>
      
      {/* Mini Bar Container */}
      <div className="pointer-events-auto bg-white/90 backdrop-blur-xl border border-white/60 rounded-2xl shadow-clay-lg p-1.5 flex items-center gap-2 transition-all hover:shadow-clay-xl select-none">
        
        {/* --- LINKS SECTION --- */}
        <div className="flex items-center gap-2 px-1">
            <span className="text-[9px] font-bold text-gray-300 uppercase mr-1 hidden sm:block">STR</span>
            <div className="flex bg-gray-100/80 rounded-lg p-0.5 border border-gray-200/50">
                {[
                    { id: 'straight', label: 'STR' },
                    { id: 'curved', label: 'CRV' },
                    { id: 'orthogonal', label: '90°' }
                ].map((type) => (
                    <button
                        key={type.id}
                        onClick={() => setDefaultEdgeOptions({ ...defaultEdgeOptions, routingType: type.id as any })}
                        className={`px-2 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all min-w-[36px] ${
                            defaultEdgeOptions.routingType === type.id 
                            ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                        }`}
                        title={`Routing: ${type.label}`}
                    >
                        {type.label}
                    </button>
                ))}
            </div>

            <div className="w-px h-5 bg-gray-200 mx-1"></div>

            <ColorPickerButton
                color={defaultEdgeOptions.color || '#cbd5e1'} 
                onChange={(c) => setDefaultEdgeOptions({ ...defaultEdgeOptions, color: c })} 
                label="Link"
            />
        </div>

        {/* DIVIDER */}
        <div className="w-px h-5 bg-gray-300/50"></div>

        {/* --- NODES SECTION --- */}
        <div className="flex items-center gap-2 px-1">
            <div className="relative -translate-y-2" ref={menuRef}>
                <button 
                    onClick={() => setIsShapeMenuOpen(!isShapeMenuOpen)}
                    className="flex items-center justify-center w-9 h-9 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-600 border border-gray-200 hover:border-gray-300 transition-all shadow-sm"
                    title="Change Default Shape"
                >
                    <CurrentShapeIcon size={18} />
                </button>

                {isShapeMenuOpen && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-white border border-gray-200 rounded-xl shadow-xl p-2 grid grid-cols-4 gap-1 z-50 min-w-[160px] animate-pop origin-bottom">
                        {SHAPES.map(s => (
                            <button
                                key={s.id}
                                onClick={(e) => { e.stopPropagation(); setDefaultNodeShape(s.id); setIsShapeMenuOpen(false); }}
                                className={`p-2 rounded-lg hover:bg-blue-50 text-gray-500 hover:text-blue-600 flex justify-center transition-colors ${defaultNodeShape === s.id ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-100' : ''}`}
                                title={s.id}
                            >
                                <s.icon size={18} />
                            </button>
                        ))}
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-gray-200 rotate-45"></div>
                    </div>
                )}
            </div>

            <ColorPickerButton
                color={defaultNodeColor} 
                onChange={setDefaultNodeColor} 
                label="Node"
            />
        </div>
      </div>
    </div>
  );
};
