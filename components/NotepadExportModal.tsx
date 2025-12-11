
import React, { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { generateSmartImage, getNotepadBoundingBox, exportToPDF, generateInteractiveNotepadHTML } from '../services/exportService';

interface NotepadExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  elementId: string;
  projectName: string;
  stickyNotes: any[];
  annotations: any[];
  contentDimensions: { width: number, height: number } | null;
  canvasCenter: number;
}

export const NotepadExportModal: React.FC<NotepadExportModalProps> = ({ 
  isOpen, 
  onClose, 
  elementId,
  projectName,
  stickyNotes,
  annotations,
  contentDimensions,
  canvasCenter
}) => {
  const [format, setFormat] = useState<'PNG' | 'PDF' | 'HTML' | 'DOC'>('PNG');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [bounds, setBounds] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Generate preview when opening or changing relevant settings
  useEffect(() => {
    if (isOpen) {
        generatePreview();
    }
  }, [isOpen, showTitle]);

  const generatePreview = async () => {
      setIsLoading(true);
      const computedBounds = getNotepadBoundingBox(stickyNotes, annotations, contentDimensions, canvasCenter, 50);
      setBounds(computedBounds);

      // Small delay to allow UI to render
      setTimeout(async () => {
          const url = await generateSmartImage(elementId, computedBounds, {
              showTitle,
              projectName,
              backgroundStyle: '#ffffff', // Default white for notepad
              padding: 50
          }, 'PNG', 0.8); // Fast preview quality
          
          setPreviewUrl(url);
          setIsLoading(false);
      }, 100);
  };

  const handleDownload = async () => {
      setIsLoading(true);
      
      const computedBounds = getNotepadBoundingBox(stickyNotes, annotations, contentDimensions, canvasCenter, 50);
      const pixelRatio = format === 'PNG' ? 2 : 1.5; // High res for PNG, moderate for PDF insertion

      if (format === 'PNG') {
          const url = await generateSmartImage(elementId, computedBounds, { showTitle, projectName, backgroundStyle: '#ffffff', padding: 50 }, 'PNG', pixelRatio);
          if (url) triggerDownload(url, 'png');
      } 
      else if (format === 'PDF') {
          const url = await generateSmartImage(elementId, computedBounds, { showTitle, projectName, backgroundStyle: '#ffffff', padding: 50 }, 'PNG', pixelRatio);
          if (url) {
              await exportToPDF(url, computedBounds.width, computedBounds.height, projectName);
          }
      }
      else if (format === 'HTML') {
          // CAPTURE BACKGROUND ONLY (Notes excluded by filter)
          // We exclude the notes from the snapshot so we can layer them as real DOM elements in the HTML file
          const bgUrl = await generateSmartImage(
              elementId, 
              computedBounds, 
              { showTitle: false, projectName, backgroundStyle: '#ffffff', padding: 50 }, 
              'PNG', 
              1.5,
              ['export-exclude-note'] // Exclude notes from background image
          );

          if (bgUrl) {
              generateInteractiveNotepadHTML(stickyNotes, bgUrl, computedBounds, projectName);
          }
      }
      else if (format === 'DOC') {
          // Text-Extraction Export for Doc
          let docContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><title>${projectName}</title></head><body><h1>${projectName}</h1>`;
          docContent += `<h2>Notes</h2><ul>`;
          stickyNotes.forEach(note => {
              if (note.text) docContent += `<li>${note.text}</li>`;
              if (note.contentType === 'table' && note.tableData) {
                  docContent += `<table border="1" style="border-collapse:collapse;width:100%;margin:10px 0;">`;
                  note.tableData.forEach((row: string[]) => {
                      docContent += `<tr>${row.map(c => `<td style="padding:5px;">${c}</td>`).join('')}</tr>`;
                  });
                  docContent += `</table>`;
              }
          });
          docContent += `</ul></body></html>`;
          const blob = new Blob(['\ufeff', docContent], { type: 'application/msword' });
          const url = URL.createObjectURL(blob);
          triggerDownload(url, 'doc');
      }

      setIsLoading(false);
      onClose();
  };

  const triggerDownload = (url: string, ext: string) => {
      const link = document.createElement('a');
      link.download = `${projectName.replace(/\s+/g, '_')}.${ext}`;
      link.href = url;
      link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl border border-white/20 flex overflow-hidden">
        
        {/* Preview Area */}
        <div className="flex-1 bg-gray-100 relative flex items-center justify-center p-8 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10" style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
            
            {isLoading ? (
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500 font-bold animate-pulse">Rendering Preview...</span>
                </div>
            ) : previewUrl ? (
                <div className="relative shadow-2xl border border-gray-200 bg-white max-w-full max-h-full overflow-auto custom-scrollbar">
                    <img src={previewUrl} alt="Preview" style={{ maxWidth: 'none', maxHeight: 'none' }} />
                </div>
            ) : (
                <div className="text-red-400 font-bold">Preview Unavailable</div>
            )}
        </div>

        {/* Controls */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
            <div className="p-6 border-b border-gray-200">
                <h2 className="text-2xl font-display font-bold text-gray-800 mb-1">Export Note</h2>
                <p className="text-sm text-gray-500">Capture your infinite canvas.</p>
            </div>

            <div className="flex-1 p-6 space-y-8 overflow-y-auto">
                {/* Format Selection */}
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Export Format</label>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { id: 'PNG', icon: Icon.Image, label: 'Image' },
                            { id: 'PDF', icon: Icon.FileText, label: 'PDF' },
                            { id: 'HTML', icon: Icon.Globe, label: 'HTML (Interactive)' },
                            { id: 'DOC', icon: Icon.AlignLeft, label: 'Doc' },
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => setFormat(type.id as any)}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${format === type.id ? 'bg-indigo-50 border-indigo-500 text-indigo-600 shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                            >
                                <type.icon size={20} className="mb-2" />
                                <span className="text-xs font-bold text-center">{type.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Settings */}
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Settings</label>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                        <span className="text-sm font-bold text-gray-700">Include Title</span>
                        <div onClick={() => setShowTitle(!showTitle)} className={`w-10 h-6 rounded-full relative cursor-pointer transition-colors ${showTitle ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${showTitle ? 'left-5' : 'left-1'}`} />
                        </div>
                    </div>
                    
                    {format === 'PNG' && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                            <strong>Full Canvas:</strong> The image will automatically resize to fit all your notes and drawings without cutting anything off.
                        </div>
                    )}
                    
                    {format === 'HTML' && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-xl text-xs text-green-700">
                            <strong>Interactive:</strong> Audio notes will be playable. Notes will be real text elements.
                        </div>
                    )}
                </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
                <button 
                    onClick={handleDownload}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    <Icon.Download size={20} /> Download {format}
                </button>
                <button 
                    onClick={onClose}
                    className="w-full mt-3 py-3 text-gray-500 hover:bg-gray-200 rounded-xl font-bold transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};
