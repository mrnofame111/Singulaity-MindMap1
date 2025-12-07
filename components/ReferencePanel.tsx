
import React, { useState, useRef } from 'react';
import { Icon } from './Icons';
import { renderPdfToImages, PdfPageImage } from '../services/pdfRenderService';
import { extractConceptsFromImage } from '../services/geminiService';

interface ReferencePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNodes: (nodes: any[]) => void;
}

export const ReferencePanel: React.FC<ReferencePanelProps> = ({ isOpen, onClose, onAddNodes }) => {
  const [pages, setPages] = useState<PdfPageImage[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPageId, setScanPageId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.type !== 'application/pdf') {
          alert("Please select a PDF file.");
          return;
      }

      setIsRendering(true);
      try {
          const renderedPages = await renderPdfToImages(file);
          setPages(renderedPages);
      } catch (err) {
          console.error(err);
          alert("Failed to render PDF.");
      } finally {
          setIsRendering(false);
      }
  };

  const handleScanPage = async (page: PdfPageImage) => {
      setScanPageId(page.pageNumber);
      setIsScanning(true);
      try {
          const result = await extractConceptsFromImage(page.imageUrl);
          if (result && result.concepts && result.concepts.length > 0) {
              onAddNodes(result.concepts);
          } else {
              alert("No concepts found on this page.");
          }
      } catch (e) {
          console.error(e);
          alert("Analysis failed.");
      } finally {
          setIsScanning(false);
          setScanPageId(null);
      }
  };

  return (
    <div 
        className={`fixed top-[60px] right-0 bottom-0 w-[350px] bg-white/95 backdrop-blur-xl border-l border-white/20 shadow-2xl z-[55] flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 bg-gray-50/80">
            <div className="flex items-center gap-2 text-indigo-600">
                <Icon.BookOpen size={20} />
                <span className="font-bold text-sm uppercase tracking-wider">Reference Dock</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors">
                <Icon.Close size={18} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-100/50">
            {pages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-300 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50/50 transition-all group">
                     <div className="w-16 h-16 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                         <Icon.BookOpen size={32} />
                     </div>
                     <h3 className="font-bold text-gray-700 mb-2">No Document Loaded</h3>
                     <p className="text-xs text-gray-500 mb-6">Upload a PDF to view while you map. Use AI to scan pages for concepts.</p>
                     
                     <input 
                        type="file" 
                        accept="application/pdf" 
                        ref={fileInputRef} 
                        className="hidden"
                        onChange={handleFileUpload} 
                     />
                     <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isRendering}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm shadow-md flex items-center gap-2"
                     >
                        {isRendering ? <Icon.Navigation className="animate-spin" size={16} /> : <Icon.Download size={16} />}
                        {isRendering ? "Rendering..." : "Upload PDF"}
                     </button>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase">{pages.length} Pages</span>
                        <button onClick={() => setPages([])} className="text-xs text-red-500 font-bold hover:underline">Clear</button>
                    </div>
                    
                    {pages.map((page) => (
                        <div key={page.pageNumber} className="relative group rounded-xl overflow-hidden shadow-md border border-gray-200 bg-white">
                            <img src={page.imageUrl} alt={`Page ${page.pageNumber}`} className="w-full h-auto" />
                            
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                                <div className="pointer-events-auto transform translate-y-4 group-hover:translate-y-0 transition-transform duration-200">
                                     <button 
                                        onClick={() => handleScanPage(page)}
                                        disabled={isScanning}
                                        className="bg-white text-indigo-600 px-4 py-2 rounded-full font-bold text-sm shadow-lg flex items-center gap-2 hover:scale-105 transition-transform active:scale-95"
                                     >
                                         {isScanning && scanPageId === page.pageNumber ? (
                                             <Icon.Sparkles size={16} className="animate-spin" />
                                         ) : (
                                             <Icon.ScanEye size={16} />
                                         )}
                                         Magic Scan
                                     </button>
                                </div>
                            </div>
                            
                            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm">
                                {page.pageNumber}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};
