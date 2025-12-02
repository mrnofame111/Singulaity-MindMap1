
import React, { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { generateMapImage, exportSmartImage } from '../services/exportService';
import { SingularityNode } from '../types';
import { APP_THEMES } from '../constants';

interface ExportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: SingularityNode[];
  projectName: string;
  format: 'PNG' | 'JPEG' | 'SVG';
  elementId: string;
}

const BG_COLORS = ['#ffffff', '#f8f9fa', '#0f172a', '#1e293b', '#000000'];
const GRADIENTS = [
    'linear-gradient(to right, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(to top, #cfd9df 0%, #e2ebf0 100%)',
    'linear-gradient(120deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(to top, #30cfd0 0%, #330867 100%)',
    'radial-gradient(circle at 50% 50%, #1a2a6c, #b21f1f, #fdbb2d)'
];
const PATTERNS = [
    { label: 'Dots Light', style: 'radial-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), #f0f4f8', size: '20px 20px' },
    { label: 'Dots Dark', style: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), #0f172a', size: '20px 20px' },
    { label: 'Grid Light', style: 'linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px), #f8fafc', size: '20px 20px' },
];

export const ExportPreviewModal: React.FC<ExportPreviewModalProps> = ({ 
  isOpen, 
  onClose, 
  nodes, 
  projectName, 
  format,
  elementId 
}) => {
  const [bgType, setBgType] = useState<'SOLID' | 'GRADIENT' | 'PATTERN' | 'THEME'>('SOLID');
  const [selectedBg, setSelectedBg] = useState('#f0f4f8');
  const [showTitle, setShowTitle] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Generate preview when settings change
  useEffect(() => {
    if (isOpen) {
        generatePreview();
    }
  }, [isOpen, selectedBg, format, showTitle]);

  const getBackgroundStyle = () => {
      let backgroundStyle = selectedBg;
      
      // Pattern Handling: patterns need background-size too to look right in html-to-image
      if (bgType === 'PATTERN') {
          const p = PATTERNS.find(pat => pat.style.includes(selectedBg) || pat.style === selectedBg);
          if (p) {
              backgroundStyle = `${selectedBg} 0 0 / ${p.size}`; 
          }
      }
      return backgroundStyle;
  };

  const generatePreview = async () => {
      setIsLoading(true);
      // Wait for UI to render
      setTimeout(async () => {
          const url = await generateMapImage(nodes, format, elementId, {
              backgroundStyle: getBackgroundStyle(),
              padding: 50,
              showTitle: showTitle,
              projectName: projectName
          }, 0.8); // Lower scale for preview speed
          
          setPreviewUrl(url);
          setIsLoading(false);
      }, 100);
  };

  const handleDownload = () => {
      exportSmartImage(nodes, projectName, format, elementId, {
          backgroundStyle: getBackgroundStyle(),
          padding: 100,
          showTitle: showTitle,
          projectName: projectName
      });
      onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-[#1e2030] w-full max-w-4xl h-[80vh] rounded-3xl shadow-2xl border border-white/20 flex overflow-hidden">
        
        {/* Left: Preview Area */}
        <div className="flex-1 bg-gray-100 dark:bg-black/50 relative flex items-center justify-center p-8 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px] opacity-20 w-full h-full" />
            </div>
            
            {isLoading ? (
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500 font-bold animate-pulse">Rendering Preview...</span>
                </div>
            ) : previewUrl ? (
                <img 
                    src={previewUrl} 
                    alt="Map Preview" 
                    className="max-w-full max-h-full object-contain shadow-2xl rounded-lg border border-white/20"
                />
            ) : (
                <div className="text-red-400 font-bold">Preview Failed</div>
            )}
        </div>

        {/* Right: Controls */}
        <div className="w-80 bg-white dark:bg-[#1e2030] border-l border-gray-200 dark:border-white/10 flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-white/10">
                <h2 className="text-xl font-display font-bold text-gray-800 dark:text-white mb-1">Export {format}</h2>
                <p className="text-sm text-gray-500">Customize appearance before downloading.</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                
                {/* Background Type Selector */}
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Background Type</label>
                    <div className="flex bg-gray-100 dark:bg-white/5 p-1 rounded-xl">
                        {['SOLID', 'GRADIENT', 'PATTERN', 'THEME'].map(t => (
                            <button
                                key={t}
                                onClick={() => { setBgType(t as any); if(t==='PATTERN') setSelectedBg(PATTERNS[0].style); else if(t==='GRADIENT') setSelectedBg(GRADIENTS[0]); else if(t==='THEME') setSelectedBg(APP_THEMES['default'].bg); else setSelectedBg('#ffffff'); }}
                                className={`flex-1 py-2 text-[8px] sm:text-[10px] font-bold rounded-lg transition-all ${bgType === t ? 'bg-white dark:bg-indigo-500 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Options Grid */}
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Select Style</label>
                    <div className="grid grid-cols-4 gap-2">
                        {bgType === 'SOLID' && BG_COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setSelectedBg(c)}
                                className={`aspect-square rounded-full border border-gray-200 shadow-sm transition-transform hover:scale-110 ${selectedBg === c ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                        
                        {bgType === 'SOLID' && (
                             <label className="aspect-square rounded-full border border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50">
                                 <Icon.Plus size={16} className="text-gray-400" />
                                 <input type="color" className="hidden" onChange={(e) => setSelectedBg(e.target.value)} />
                             </label>
                        )}

                        {bgType === 'GRADIENT' && GRADIENTS.map(g => (
                            <button
                                key={g}
                                onClick={() => setSelectedBg(g)}
                                className={`aspect-square rounded-full border border-gray-200 shadow-sm transition-transform hover:scale-110 ${selectedBg === g ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                                style={{ background: g }}
                            />
                        ))}

                        {bgType === 'PATTERN' && PATTERNS.map((p, i) => (
                            <button
                                key={i}
                                onClick={() => setSelectedBg(p.style)}
                                className={`aspect-square rounded-lg border border-gray-200 shadow-sm transition-transform hover:scale-110 ${selectedBg === p.style ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                                style={{ background: p.style, backgroundSize: p.size }}
                                title={p.label}
                            />
                        ))}

                        {bgType === 'THEME' && Object.values(APP_THEMES).map((theme: any) => (
                            <button
                                key={theme.id}
                                onClick={() => setSelectedBg(theme.bg)}
                                className={`aspect-square rounded-full border border-gray-200 shadow-sm transition-transform hover:scale-110 ${selectedBg === theme.bg ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                                style={{ backgroundColor: theme.bg }}
                                title={theme.name}
                            />
                        ))}
                    </div>
                </div>

                {/* Overlay Options */}
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Overlay Options</label>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10">
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Include Project Title</span>
                        <div 
                            onClick={() => setShowTitle(!showTitle)}
                            className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${showTitle ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${showTitle ? 'left-5' : 'left-1'}`} />
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                        Watermark logo and metadata will always be included.
                    </p>
                </div>

            </div>

            <div className="p-6 border-t border-gray-200 dark:border-white/10 flex flex-col gap-3">
                <button 
                    onClick={handleDownload}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    <Icon.Download size={18} /> Download High-Res
                </button>
                <button 
                    onClick={onClose}
                    className="w-full py-3 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl font-bold transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};
