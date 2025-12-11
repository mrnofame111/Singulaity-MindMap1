import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './Icons';
import { NotepadExportModal } from './NotepadExportModal';
import * as pdfjsLib from 'pdfjs-dist';

// Ensure worker is set
const pdfjsVersion = pdfjsLib.version || '3.11.174';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.js`;

interface StickyNote {
  id: string;
  x: number;
  y: number;
  text?: string;
  color: string;
  minimized: boolean;
  contentType: 'text' | 'image' | 'audio' | 'drawing' | 'table';
  mediaUrl?: string;
  tableData?: string[][];
  anchor?: { x: number, y: number } | null;
  controlPoints?: { x: number, y: number }[];
}

interface Annotation {
  id: string;
  points: { x: number, y: number }[];
  color: string;
  width: number;
  page: number;
}

interface NotepadScreenProps {
  onBack: () => void;
}

export const NotepadScreen: React.FC<NotepadScreenProps> = ({ onBack }) => {
  const [stickyNotes, setStickyNotes] = useState<Record<number, StickyNote[]>>({});
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [noteConnections, setNoteConnections] = useState<any[]>([]); // simplified for now
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isRecordingNoteId, setRecordingNoteId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("My Notes");

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- History Management ---
  const commitToHistory = useCallback((newAnnotations: Annotation[], newNotes: Record<number, StickyNote[]>, newConnections: any[]) => {
      const newState = { annotations: newAnnotations, stickyNotes: newNotes, noteConnections: newConnections };
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newState);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      
      setAnnotations(newAnnotations);
      setStickyNotes(newNotes);
      setNoteConnections(newConnections);
  }, [history, historyIndex]);

  const undo = () => {
      if (historyIndex > 0) {
          const prevState = history[historyIndex - 1];
          setAnnotations(prevState.annotations);
          setStickyNotes(prevState.stickyNotes);
          setNoteConnections(prevState.noteConnections);
          setHistoryIndex(historyIndex - 1);
      }
  };

  const redo = () => {
      if (historyIndex < history.length - 1) {
          const nextState = history[historyIndex + 1];
          setAnnotations(nextState.annotations);
          setStickyNotes(nextState.stickyNotes);
          setNoteConnections(nextState.noteConnections);
          setHistoryIndex(historyIndex + 1);
      }
  };

  // --- Note Actions ---
  const updateStickyNote = useCallback((id: string, updates: Partial<StickyNote>) => {
      const currentNotes = stickyNotes[pageNum] || [];
      const noteIndex = currentNotes.findIndex(n => n.id === id);
      if (noteIndex === -1) return;

      const updatedNote = { ...currentNotes[noteIndex], ...updates };
      const newNotes = [...currentNotes];
      newNotes[noteIndex] = updatedNote;

      const newStickyNotes = { ...stickyNotes, [pageNum]: newNotes };
      // Simplified update without history commit for every keystroke, ideally triggered on blur
      setStickyNotes(newStickyNotes);
  }, [stickyNotes, pageNum]);

  const addNote = (type: 'text' | 'image' | 'audio' = 'text', x = 100, y = 100) => {
      const id = Math.random().toString(36).substr(2, 9);
      const newNote: StickyNote = {
          id,
          x,
          y,
          contentType: type,
          color: '#fef3c7',
          minimized: false,
          text: type === 'text' ? '' : undefined
      };
      const currentNotes = stickyNotes[pageNum] || [];
      const newStickyNotes = { ...stickyNotes, [pageNum]: [...currentNotes, newNote] };
      commitToHistory(annotations, newStickyNotes, noteConnections);
  };

  const deleteAnchorConnection = useCallback((noteId: string) => { 
      const currentNotes = stickyNotes[pageNum] || []; 
      const newNotesMap = { ...stickyNotes }; 
      newNotesMap[pageNum] = currentNotes.map(n => n.id === noteId ? { ...n, anchor: null, controlPoints: [] } : n); 
      commitToHistory(annotations, newNotesMap, noteConnections); 
      setSelectedConnectionId(null); 
  }, [stickyNotes, pageNum, annotations, noteConnections, commitToHistory]);

  const startRecording = async (noteId: string) => { 
      try { 
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); 
          const mediaRecorder = new MediaRecorder(stream); 
          mediaRecorderRef.current = mediaRecorder; 
          audioChunksRef.current = []; 
          mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); }; 
          mediaRecorder.onstop = () => { 
              const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); 
              const reader = new FileReader(); 
              reader.readAsDataURL(audioBlob); 
              reader.onloadend = () => { 
                  const base64data = reader.result as string; 
                  updateStickyNote(noteId, { mediaUrl: base64data, contentType: 'audio' }); 
                  // Commit after recording
                  const currentNotes = stickyNotes[pageNum] || [];
                  const idx = currentNotes.findIndex(n => n.id === noteId);
                  if (idx !== -1) {
                      const newNotes = [...currentNotes];
                      newNotes[idx] = { ...newNotes[idx], mediaUrl: base64data, contentType: 'audio' };
                      commitToHistory(annotations, { ...stickyNotes, [pageNum]: newNotes }, noteConnections);
                  }
              }; 
              stream.getTracks().forEach(track => track.stop()); 
          }; 
          mediaRecorder.start(); 
          setRecordingNoteId(noteId); 
      } catch (err: any) { 
          console.error("Mic access denied", err); 
          alert("Microphone access denied."); 
      } 
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          setRecordingNoteId(null);
      }
  };

  // --- PDF & File Handling ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await loadingTask.promise;
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          setPageNum(1);
          setProjectName(file.name.replace('.pdf', ''));
          renderPage(1, pdf);
      }
  };

  const renderPage = async (num: number, pdf: any = pdfDoc) => {
      if (!pdf || !canvasRef.current) return;
      const page = await pdf.getPage(num);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          const renderContext = {
              canvasContext: context,
              viewport: viewport
          };
          await page.render(renderContext).promise;
      }
  };

  useEffect(() => {
      if (pdfDoc) renderPage(pageNum);
  }, [pageNum, scale, pdfDoc]);

  // --- UI RENDER ---
  return (
    <div className="w-full h-full flex flex-col bg-[#f0f4f8]">
        {/* Header */}
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-20">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"><Icon.Arrow className="rotate-180" size={20}/></button>
                <h1 className="font-bold text-lg text-gray-800">{projectName}</h1>
            </div>
            
            <div className="flex items-center gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold text-gray-700">
                    <Icon.Upload size={16} /> Load PDF
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleFileUpload} />
                
                <div className="h-6 w-px bg-gray-300 mx-2" />
                
                <button onClick={() => addNote('text')} className="p-2 hover:bg-yellow-100 rounded-lg text-yellow-600"><Icon.StickyNote size={20} /></button>
                <button onClick={() => addNote('image')} className="p-2 hover:bg-blue-100 rounded-lg text-blue-600"><Icon.Image size={20} /></button>
                
                <div className="h-6 w-px bg-gray-300 mx-2" />
                
                <button onClick={() => setIsExportModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">
                    <Icon.Download size={16} /> Export
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div ref={containerRef} className="flex-1 overflow-auto relative p-8 flex justify-center">
            <div className="relative shadow-xl bg-white min-h-[800px] min-w-[600px]" style={{ width: pdfDoc ? 'auto' : '800px', height: pdfDoc ? 'auto' : '1000px' }}>
                <canvas ref={canvasRef} className="absolute inset-0 z-0" />
                
                {/* Notes Layer */}
                <div className="absolute inset-0 z-10">
                    {(stickyNotes[pageNum] || []).map((note) => (
                        <div 
                            key={note.id} 
                            className="absolute bg-yellow-100 border border-yellow-300 shadow-md p-2 rounded w-48 text-sm"
                            style={{ left: note.x, top: note.y }}
                        >
                            {/* Simple render for placeholder */}
                            <div className="font-bold mb-1 flex justify-between">
                                <span>Note</span>
                                <button onClick={() => {
                                    const newNotes = (stickyNotes[pageNum] || []).filter(n => n.id !== note.id);
                                    commitToHistory(annotations, { ...stickyNotes, [pageNum]: newNotes }, noteConnections);
                                }}><Icon.Close size={12}/></button>
                            </div>
                            {note.contentType === 'text' && (
                                <textarea 
                                    className="w-full h-20 bg-transparent resize-none outline-none" 
                                    value={note.text || ''}
                                    onChange={(e) => updateStickyNote(note.id, { text: e.target.value })}
                                    placeholder="Type here..."
                                />
                            )}
                            {note.contentType === 'audio' && (
                                <div className="flex flex-col items-center gap-2">
                                    {note.mediaUrl ? (
                                        <audio src={note.mediaUrl} controls className="w-full h-8" />
                                    ) : (
                                        isRecordingNoteId === note.id ? (
                                            <button onClick={stopRecording} className="text-red-500 animate-pulse font-bold">Stop Recording</button>
                                        ) : (
                                            <button onClick={() => startRecording(note.id)} className="text-blue-500 font-bold">Start Mic</button>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Pagination (if PDF) */}
        {numPages > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-gray-200 flex items-center gap-4 z-30">
                <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1} className="disabled:opacity-30"><Icon.ChevronLeft size={20}/></button>
                <span className="font-bold text-gray-700 text-sm">{pageNum} / {numPages}</span>
                <button onClick={() => setPageNum(p => Math.min(numPages, p + 1))} disabled={pageNum >= numPages} className="disabled:opacity-30"><Icon.ChevronRight size={20}/></button>
            </div>
        )}

        <NotepadExportModal 
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            elementId="notepad-canvas" // Placeholder, ideally specific ref ID
            projectName={projectName}
            stickyNotes={stickyNotes[pageNum] || []}
            annotations={annotations.filter(a => a.page === pageNum)}
            contentDimensions={canvasRef.current ? { width: canvasRef.current.width, height: canvasRef.current.height } : null}
            canvasCenter={canvasRef.current ? canvasRef.current.width / 2 : 400}
        />
    </div>
  );
};