
import React, { useState } from 'react';
import { Icon } from './Icons';

interface DreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (style: string) => void;
  nodeLabel: string;
}

const STYLES = [
  { id: 'cyberpunk', label: 'Cyberpunk', desc: 'Neon, futuristic, high contrast' },
  { id: 'watercolor', label: 'Watercolor', desc: 'Soft, artistic, fluid' },
  { id: 'sketch', label: 'Sketch', desc: 'Hand-drawn, pencil, technical' },
  { id: 'minimalist', label: 'Minimalist', desc: 'Clean, simple shapes, flat' },
  { id: '3d-render', label: '3D Render', desc: 'Polished, glossy, realistic lighting' },
  { id: 'isometric', label: 'Isometric', desc: 'Geometric, architectural view' },
  { id: 'oil-painting', label: 'Oil Painting', desc: 'Rich textures, classic art' },
  { id: 'pixel-art', label: 'Pixel Art', desc: 'Retro, blocky, 8-bit' },
];

export const DreamModal: React.FC<DreamModalProps> = ({ isOpen, onClose, onConfirm, nodeLabel }) => {
  const [selectedStyle, setSelectedStyle] = useState('cyberpunk');
  const [customStyle, setCustomStyle] = useState('');

  if (!isOpen) return null;

  const handleGenerate = () => {
    const finalStyle = customStyle.trim() ? customStyle : STYLES.find(s => s.id === selectedStyle)?.label || 'Illustration';
    onConfirm(finalStyle);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-[#1e2030] w-full max-w-lg rounded-2xl shadow-clay-xl overflow-hidden border border-white/20 p-6 relative">
        
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <Icon.Close size={20} />
        </button>

        <div className="flex items-center gap-2 mb-2 text-purple-500">
           <Icon.Sparkles size={24} fill="currentColor" />
           <h2 className="text-xl font-display font-bold text-gray-800 dark:text-white">Dream Node</h2>
        </div>
        
        <p className="text-sm text-gray-500 mb-6">
          Generate visual representation for <b>"{nodeLabel}"</b> using Gemini Image Generation.
        </p>

        <div className="space-y-4">
           <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Choose Style</h3>
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {STYLES.map(style => (
                 <button
                    key={style.id}
                    onClick={() => { setSelectedStyle(style.id); setCustomStyle(''); }}
                    className={`
                       p-3 rounded-xl border text-left transition-all relative overflow-hidden group
                       ${selectedStyle === style.id && !customStyle 
                          ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200' 
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-purple-300'
                       }
                    `}
                 >
                    <div className="font-bold text-xs mb-1">{style.label}</div>
                    <div className="text-[10px] opacity-70 leading-tight">{style.desc}</div>
                 </button>
              ))}
           </div>
           
           <div className="pt-2">
              <input 
                 type="text"
                 placeholder="Or type custom style (e.g. 'Origami', 'Noir')..."
                 value={customStyle}
                 onChange={(e) => setCustomStyle(e.target.value)}
                 className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${customStyle ? 'border-purple-500 ring-1 ring-purple-200' : 'border-gray-200'}`}
              />
           </div>

           <button
             onClick={handleGenerate}
             className="w-full py-3 mt-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2"
           >
             <Icon.Image size={18} />
             Dream It
           </button>
        </div>

      </div>
    </div>
  );
};
