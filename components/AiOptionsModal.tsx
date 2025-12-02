

import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icons';
import { AIGenerationOptions, AIStyleOptions, NodeShape } from '../types';

interface AiOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (options: AIGenerationOptions) => void;
  nodeLabel: string;
  onLabelChange: (newLabel: string) => void;
}

const PRESET_COLORS = ['#ffffff', '#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7', '#ef4444', '#f59e0b', '#10b981', '#3b82f6'];
const SHAPES: { id: NodeShape, icon: any }[] = [
    { id: 'rectangle', icon: Icon.ShapeRect },
    { id: 'rounded', icon: () => <div className="w-3 h-2 border-2 border-current rounded-md"/> },
    { id: 'circle', icon: Icon.ShapeCircle },
    { id: 'diamond', icon: () => <div className="w-2.5 h-2.5 border-2 border-current rotate-45"/> },
    { id: 'triangle', icon: Icon.ShapeTriangle },
    { id: 'hexagon', icon: Icon.ShapeHexagon },
    { id: 'cloud', icon: Icon.ShapeCloud },
];

export const AiOptionsModal: React.FC<AiOptionsModalProps> = ({ 
  isOpen, 
  onClose, 
  onGenerate, 
  nodeLabel,
  onLabelChange
}) => {
  const [tab, setTab] = useState<'CONTENT' | 'STYLE'>('CONTENT');
  
  // Content State
  const [count, setCount] = useState(3);
  const [isAutoCount, setIsAutoCount] = useState(true);
  const [depth, setDepth] = useState(1);
  const [tone, setTone] = useState<AIGenerationOptions['tone']>('standard');
  const [mode, setMode] = useState<'MINDMAP' | 'FLOWCHART'>('MINDMAP');
  const [motive, setMotive] = useState('');
  const [showDepthWarning, setShowDepthWarning] = useState(false);
  
  // Style State
  const [styleOptions, setStyleOptions] = useState<AIStyleOptions>({
      inheritNodeColor: true,
      customNodeColor: '#ffffff',
      inheritNodeShape: true,
      customNodeShape: 'rounded',
      inheritLinkColor: true,
      customLinkColor: '#cbd5e1',
      inheritLinkStyle: true,
      customLinkStyle: 'curved'
  });

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempLabel, setTempLabel] = useState(nodeLabel);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTempLabel(nodeLabel);
      setMotive('');
      setDepth(1);
      setTab('CONTENT');
      setShowDepthWarning(false);
    }
  }, [isOpen, nodeLabel]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditingTitle]);

  const handleTitleSave = () => {
    if (tempLabel.trim() !== '') {
      onLabelChange(tempLabel);
    } else {
      setTempLabel(nodeLabel); // Revert if empty
    }
    setIsEditingTitle(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') {
      setTempLabel(nodeLabel);
      setIsEditingTitle(false);
    }
  };

  const handleDepthChange = (val: number) => {
      const newDepth = Math.max(1, Math.min(5, val));
      setDepth(newDepth);
      if (newDepth > 3) {
          setShowDepthWarning(true);
      } else {
          setShowDepthWarning(false);
      }
  };

  const ColorPicker = ({ selected, onChange }: { selected: string, onChange: (c: string) => void }) => (
      <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
          {PRESET_COLORS.map(c => (
              <button
                  key={c}
                  onClick={() => onChange(c)}
                  className={`w-6 h-6 rounded-full border border-black/10 transition-transform hover:scale-110 ${selected === c ? 'ring-2 ring-indigo-400 scale-110' : ''}`}
                  style={{ backgroundColor: c }}
              />
          ))}
          <div className="relative w-6 h-6 rounded-full overflow-hidden border border-gray-300">
              <input 
                  type="color" 
                  value={selected}
                  onChange={(e) => onChange(e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
              />
              <div className="w-full h-full" style={{ backgroundColor: selected }} />
          </div>
      </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-[#1e2030] w-full max-w-lg rounded-2xl shadow-clay-xl overflow-hidden border border-white/20 relative flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 pb-2 border-b border-gray-100 dark:border-white/5 relative">
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <Icon.Close size={20} />
            </button>

            <div className="flex items-center gap-2 mb-1 text-indigo-500">
            <Icon.Sparkles size={20} fill="currentColor" />
            <h2 className="text-lg font-display font-bold">Expand Idea</h2>
            </div>

            {/* Editable Node Name */}
            <div>
            <div className="flex items-center gap-2 group">
                {isEditingTitle ? (
                <input
                    ref={titleInputRef}
                    value={tempLabel}
                    onChange={(e) => setTempLabel(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={handleKeyDown}
                    className="text-2xl font-black text-gray-800 dark:text-white bg-transparent border-b-2 border-indigo-500 outline-none w-full py-1"
                />
                ) : (
                <h1 
                    onClick={() => setIsEditingTitle(true)}
                    className="text-2xl font-black text-gray-800 dark:text-white cursor-pointer border-b-2 border-transparent hover:border-gray-200 transition-colors truncate"
                    title="Click to edit node name"
                >
                    {nodeLabel}
                </h1>
                )}
                {!isEditingTitle && (
                <Icon.Edit 
                    size={16} 
                    className="text-gray-400 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity" 
                    onClick={() => setIsEditingTitle(true)}
                />
                )}
            </div>
            </div>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 pb-2 gap-4">
            <button 
                onClick={() => setTab('CONTENT')}
                className={`pb-2 text-sm font-bold border-b-2 transition-colors ${tab === 'CONTENT' ? 'text-indigo-600 border-indigo-600' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
            >
                1. Content & Logic
            </button>
            <button 
                onClick={() => setTab('STYLE')}
                className={`pb-2 text-sm font-bold border-b-2 transition-colors ${tab === 'STYLE' ? 'text-indigo-600 border-indigo-600' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
            >
                2. Visual Style
            </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
            
            {/* --- CONTENT TAB --- */}
            {tab === 'CONTENT' && (
                <>
                    {/* Mode Switcher */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setMode('MINDMAP')}
                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'MINDMAP' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                        >
                            <Icon.Brain size={14} /> Mind Map
                        </button>
                        <button 
                            onClick={() => setMode('FLOWCHART')}
                            className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${mode === 'FLOWCHART' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
                        >
                            <Icon.Flowchart size={14} /> Flowchart
                        </button>
                    </div>

                    {/* Motive Input */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Context / Motive</label>
                        <input 
                        type="text" 
                        value={motive}
                        onChange={(e) => setMotive(e.target.value)}
                        placeholder={mode === 'MINDMAP' ? "e.g. 'Classifications', 'Pros & Cons'" : "e.g. 'User Login Process'"}
                        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-700 dark:text-gray-200 placeholder-gray-400"
                        autoFocus
                        />
                    </div>

                    {mode === 'MINDMAP' && (
                        <>
                            {/* Auto Detect Toggle */}
                            <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-gray-100 dark:border-white/10">
                                <div className="flex items-center gap-2">
                                    <Icon.Zap size={16} className={isAutoCount ? "text-indigo-500" : "text-gray-400"} />
                                    <div>
                                        <div className="text-sm font-bold text-gray-700 dark:text-gray-200">Auto-Detect Quantity</div>
                                        <div className="text-[10px] text-gray-400">Let AI decide how many branches to create</div>
                                    </div>
                                </div>
                                <button 
                                onClick={() => setIsAutoCount(!isAutoCount)}
                                className={`w-10 h-6 rounded-full transition-colors relative ${isAutoCount ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isAutoCount ? 'left-5' : 'left-1'}`} />
                                </button>
                            </div>

                            {/* Node Count Slider */}
                            <div className={`transition-opacity duration-300 ${isAutoCount ? 'opacity-40 pointer-events-none grayscale' : 'opacity-100'}`}>
                                <div className="flex justify-between mb-2">
                                <label className="text-sm font-bold text-gray-600 dark:text-gray-300">Branches (Siblings)</label>
                                <span className="text-sm font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 rounded">{count}</span>
                                </div>
                                <input 
                                type="range" 
                                min="1" 
                                max="10" 
                                value={count}
                                onChange={(e) => setCount(parseInt(e.target.value))}
                                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                            </div>

                            {/* Depth Control with Logic Check */}
                            <div className="pt-4 border-t border-gray-100">
                                <div className="flex justify-between mb-2 items-center">
                                    <label className="text-sm font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
                                        <Icon.Layers size={16} className="text-purple-500" /> Recursion Depth
                                    </label>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max="5" 
                                        value={depth} 
                                        onChange={(e) => handleDepthChange(parseInt(e.target.value))}
                                        className="w-16 text-center border border-gray-200 rounded-lg text-sm font-bold focus:border-purple-500 outline-none p-1" 
                                    />
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="1" 
                                    max="5" 
                                    value={depth}
                                    onChange={(e) => handleDepthChange(parseInt(e.target.value))}
                                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                                    <span>1 (Flat)</span>
                                    <span>2</span>
                                    <span>3 (Recommended)</span>
                                    <span>4</span>
                                    <span>5 (Deep)</span>
                                </div>

                                {showDepthWarning && (
                                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg flex gap-3 animate-fade-in">
                                        <Icon.Help size={20} className="text-orange-500 shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold text-orange-700">Deep Structure Warning</p>
                                            <p className="text-[10px] text-orange-600 leading-tight mt-1">
                                                Generating {depth} levels recursively creates complexity. Are you sure you want to exceed the recommended limit of 3?
                                            </p>
                                            <div className="flex gap-2 mt-2">
                                                <button 
                                                    onClick={() => setDepth(3)} 
                                                    className="px-2 py-1 bg-white border border-orange-200 text-orange-600 text-[10px] font-bold rounded hover:bg-orange-100"
                                                >
                                                    Limit to 3
                                                </button>
                                                <button 
                                                    onClick={() => setShowDepthWarning(false)} 
                                                    className="px-2 py-1 bg-orange-200 text-orange-800 text-[10px] font-bold rounded hover:bg-orange-300"
                                                >
                                                    Proceed Anyway
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* --- STYLE TAB --- */}
            {tab === 'STYLE' && (
                <div className="space-y-6">
                    
                    {/* Node Color Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Icon.Palette size={14}/> Node Color
                            </span>
                            <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                                <span className="text-[10px] font-bold text-gray-500">Inherit Parent</span>
                                <input 
                                    type="checkbox" 
                                    checked={styleOptions.inheritNodeColor} 
                                    onChange={(e) => setStyleOptions({...styleOptions, inheritNodeColor: e.target.checked})}
                                    className="accent-indigo-500 w-4 h-4 cursor-pointer"
                                />
                            </label>
                        </div>
                        {!styleOptions.inheritNodeColor && (
                            <ColorPicker 
                                selected={styleOptions.customNodeColor || '#ffffff'}
                                onChange={(c) => setStyleOptions({...styleOptions, customNodeColor: c})}
                            />
                        )}
                    </div>

                    <div className="h-px bg-gray-100 w-full" />

                    {/* Node Shape Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Icon.ShapeRect size={14}/> Node Shape
                            </span>
                            <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                                <span className="text-[10px] font-bold text-gray-500">Inherit Parent</span>
                                <input 
                                    type="checkbox" 
                                    checked={styleOptions.inheritNodeShape} 
                                    onChange={(e) => setStyleOptions({...styleOptions, inheritNodeShape: e.target.checked})}
                                    className="accent-indigo-500 w-4 h-4 cursor-pointer"
                                />
                            </label>
                        </div>
                        {!styleOptions.inheritNodeShape && (
                            <div className="grid grid-cols-4 gap-2 bg-gray-50 p-2 rounded-xl border border-gray-100">
                                {SHAPES.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setStyleOptions({...styleOptions, customNodeShape: s.id})}
                                        className={`p-2 rounded-lg flex justify-center hover:bg-white transition-colors ${styleOptions.customNodeShape === s.id ? 'bg-white shadow text-indigo-600 ring-1 ring-indigo-100' : 'text-gray-400'}`}
                                    >
                                        <s.icon size={20} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-gray-100 w-full" />

                    {/* Link Style Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Icon.Connect size={14}/> Connection
                            </span>
                            <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                                <span className="text-[10px] font-bold text-gray-500">Inherit Parent</span>
                                <input 
                                    type="checkbox" 
                                    checked={styleOptions.inheritLinkStyle && styleOptions.inheritLinkColor} 
                                    onChange={(e) => {
                                        const val = e.target.checked;
                                        setStyleOptions({
                                            ...styleOptions, 
                                            inheritLinkStyle: val, 
                                            inheritLinkColor: val
                                        });
                                    }}
                                    className="accent-indigo-500 w-4 h-4 cursor-pointer"
                                />
                            </label>
                        </div>
                        
                        {(!styleOptions.inheritLinkStyle || !styleOptions.inheritLinkColor) && (
                            <div className="space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                {!styleOptions.inheritLinkStyle && (
                                    <div className="flex gap-2">
                                        {['straight', 'curved', 'orthogonal'].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setStyleOptions({...styleOptions, customLinkStyle: s as any})}
                                                className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border transition-all ${styleOptions.customLinkStyle === s ? 'bg-white border-indigo-500 text-indigo-700 shadow-sm' : 'bg-gray-100 border-transparent text-gray-500'}`}
                                            >
                                                {s === 'orthogonal' ? '90°' : s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {!styleOptions.inheritLinkColor && (
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-400 mb-2 uppercase">Link Color</div>
                                        <ColorPicker 
                                            selected={styleOptions.customLinkColor || '#cbd5e1'}
                                            onChange={(c) => setStyleOptions({...styleOptions, customLinkColor: c})}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>
            )}

        </div>

        {/* Footer Action */}
        <div className="p-6 pt-2 border-t border-gray-100 dark:border-white/5 bg-gray-50/50">
            <button
                onClick={() => { 
                    onGenerate({ 
                        count: isAutoCount ? 'auto' : count, 
                        tone, 
                        context: motive, 
                        mode, 
                        depth,
                        style: styleOptions 
                    }); 
                    onClose(); 
                }}
                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2"
            >
                <Icon.Zap size={18} />
                {mode === 'FLOWCHART' ? "Construct Flowchart" : `Generate ${isAutoCount ? 'Ideas' : 'Structure'}`}
            </button>
        </div>

      </div>
    </div>
  );
};