import React, { useState } from 'react';
import { Icon } from './Icons';

interface ToolbarProps {
  scale: number;
  setScale: (s: number) => void;
  onFitView: () => void;
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ scale, setScale, onFitView, onGenerate, isGenerating }) => {
  const [prompt, setPrompt] = useState('');
  const [isAiOpen, setIsAiOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onGenerate(prompt);
      setPrompt('');
      setIsAiOpen(false);
    }
  };

  return (
    <>
      {/* Top Bar */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-full px-4 pointer-events-none">
        <div className="bg-clay-card/90 backdrop-blur-xl border-2 border-white/10 rounded-full px-6 py-3 flex items-center gap-6 shadow-clay-lg pointer-events-auto">
          <div className="flex items-center gap-3 border-r border-white/10 pr-6">
            <div className="bg-gradient-to-br from-pink-500 to-purple-500 p-2 rounded-xl shadow-clay-sm">
               <Icon.Brain className="text-white" size={20} strokeWidth={3} />
            </div>
            <span className="font-display font-bold tracking-wide text-lg text-white">SINGULARITY</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsAiOpen(!isAiOpen)}
              className={`
                flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-all border-2 border-white/10
                ${isGenerating 
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed shadow-inner' 
                  : 'bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white shadow-clay-md hover:scale-105 hover:-translate-y-0.5 active:scale-95 active:shadow-clay-inner'
                }
              `}
            >
              <Icon.Sparkles size={18} className={isGenerating ? "animate-spin" : ""} strokeWidth={2.5} />
              {isGenerating ? "Dreaming..." : "AI Generator"}
            </button>
          </div>
        </div>
      </div>

      {/* AI Modal / Popover */}
      {isAiOpen && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 animate-pop">
          <form onSubmit={handleSubmit} className="bg-[#353956] border-4 border-white/10 rounded-[2rem] p-6 shadow-clay-xl relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500" />
             
             <h3 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
               <Icon.Sparkles className="text-yellow-400" fill="currentColor" />
               Generate Mind Map
             </h3>
             
             <div className="relative">
               <input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What's on your mind? (e.g. 'Space Travel')"
                className="w-full bg-[#23263c] border-2 border-transparent focus:border-purple-400 rounded-2xl px-5 py-4 pr-14 text-white placeholder-gray-500 focus:outline-none shadow-clay-inner transition-all font-bold"
                autoFocus
               />
               <button 
                type="submit"
                disabled={isGenerating}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-br from-green-400 to-green-600 hover:scale-110 text-white rounded-xl transition-all shadow-clay-sm"
               >
                 <Icon.Zap size={20} strokeWidth={3} />
               </button>
             </div>
             <p className="text-sm text-gray-400 mt-4 font-medium">
               ✨ Powered by Gemini 2.5 Flash. Creates instant structures.
             </p>
          </form>
        </div>
      )}

      {/* Bottom Toolbar (Zoom/Nav) */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <div className="bg-clay-card/90 backdrop-blur-xl border-2 border-white/10 rounded-full p-2 flex items-center gap-2 shadow-clay-lg pointer-events-auto">
          <button 
            onClick={() => setScale(Math.max(0.1, scale - 0.1))} 
            className="w-10 h-10 flex items-center justify-center bg-[#2f3640] hover:bg-[#3d4652] rounded-full text-gray-300 shadow-clay-sm active:shadow-clay-inner transition-all"
          >
            <Icon.Minus size={20} strokeWidth={3} />
          </button>
          
          <span className="w-16 text-center font-display font-bold text-white text-sm">{Math.round(scale * 100)}%</span>
          
          <button 
            onClick={() => setScale(Math.min(5, scale + 0.1))} 
            className="w-10 h-10 flex items-center justify-center bg-[#2f3640] hover:bg-[#3d4652] rounded-full text-gray-300 shadow-clay-sm active:shadow-clay-inner transition-all"
          >
            <Icon.Plus size={20} strokeWidth={3} />
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-1" />
          
          <button 
            onClick={onFitView} 
            className="w-10 h-10 flex items-center justify-center bg-[#2f3640] hover:bg-[#3d4652] rounded-full text-gray-300 shadow-clay-sm active:shadow-clay-inner transition-all"
            title="Reset View"
          >
             <Icon.Maximize size={20} strokeWidth={3} />
          </button>
        </div>
      </div>

      {/* Help Text */}
      <div className="fixed bottom-8 right-8 text-sm text-white/30 font-display font-bold pointer-events-none select-none hidden md:block">
        SPACE + DRAG to Pan • SCROLL to Zoom
      </div>
    </>
  );
};