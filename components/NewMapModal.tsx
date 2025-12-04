
import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icons';
import { parseFile } from '../services/fileParsingService';
import { generateMindMapData, generateMindMapFromContent } from '../services/geminiService';
import { calculateLayout, layoutOrganic, INITIAL_NODES } from '../constants';
import { SingularityNode, NodeType } from '../types';

interface NewMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: any) => void;
  onAiLimitReached?: () => void;
}

export const NewMapModal: React.FC<NewMapModalProps> = ({ isOpen, onClose, onCreate, onAiLimitReached }) => {
  const [activeTab, setActiveTab] = useState<'TOPIC' | 'DOCUMENT'>('TOPIC');
  
  // Topic State
  const [goal, setGoal] = useState('');
  
  // Document State
  const [file, setFile] = useState<File | null>(null);
  const [docText, setDocText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Usage State
  const [aiUsageCount, setAiUsageCount] = useState(0);

  useEffect(() => {
      if (isOpen) {
          const usage = parseInt(localStorage.getItem('singularity_ai_usage') || '0');
          setAiUsageCount(usage);
      }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateFromTopic = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (goal.trim()) {
       setIsProcessing(true);
       try {
           const aiData = await generateMindMapData(goal);
           if (aiData) {
                const center = { x: 0, y: 0 };
                const layoutNodes = calculateLayout(aiData, center.x, center.y);
                const organicNodes = layoutOrganic(layoutNodes);
                
                onCreate({
                    nodes: organicNodes,
                    projectName: goal,
                    edgeData: {}
                });
           } else {
               // Fallback blank
               onCreate({ projectName: goal });
           }
       } catch (e) {
           console.error(e);
           onCreate({ projectName: goal });
       }
       setIsProcessing(false);
    } else {
      onCreate({ projectName: "Untitled Mind Map" });
    }
  };

  const handleCreateFromDocument = async () => {
      if (!file && !docText.trim()) return;

      // CHECK USAGE LIMIT (Strict 3)
      if (aiUsageCount >= 3) {
          if (onAiLimitReached) {
              onAiLimitReached();
          } else {
              alert("Free Plan Limit Reached (3/3 AI Generations). Please upgrade.");
          }
          return;
      }
      
      setIsProcessing(true);
      try {
          let contentToProcess = docText;
          
          if (file) {
              const parsedText = await parseFile(file);
              contentToProcess = parsedText + "\n\n" + docText;
          }

          if (!contentToProcess.trim()) {
              alert("No text could be extracted from the file.");
              setIsProcessing(false);
              return;
          }

          const aiData = await generateMindMapFromContent(contentToProcess);
          if (aiData) {
              const center = { x: 0, y: 0 };
              const layoutNodes = calculateLayout(aiData, center.x, center.y);
              const organicNodes = layoutOrganic(layoutNodes);
              
              // INCREMENT USAGE ONLY ON SUCCESS
              const newCount = aiUsageCount + 1;
              localStorage.setItem('singularity_ai_usage', newCount.toString());
              setAiUsageCount(newCount);

              onCreate({
                  nodes: organicNodes,
                  projectName: file ? file.name.split('.')[0] : "Document Analysis",
                  edgeData: {}
              });
          } else {
              alert("AI could not structure the document. Starting blank.");
              onCreate({ projectName: "Document Analysis (Failed)" });
          }

      } catch (e: any) {
          console.error("Doc Processing Error", e);
          alert(`Error processing document: ${e.message}`);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setFile(e.target.files[0]);
      }
  };

  const examples = ["Project Launch Plan", "Study Guide for Biology", "Startup Business Model", "Novel Plot Outline"];

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-white/20 p-0 relative overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-gray-50 relative">
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
            <Icon.Close size={20} />
            </button>

            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                    <Icon.Brain size={24} strokeWidth={2} />
                </div>
                <div>
                    <h2 className="text-xl font-display font-bold text-gray-800">New Mind Map</h2>
                    <p className="text-xs text-gray-500">AI-Powered Creation Suite</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-white p-1 rounded-lg border border-gray-200 mt-4">
                <button 
                    onClick={() => setActiveTab('TOPIC')}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${activeTab === 'TOPIC' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Start with Topic
                </button>
                <button 
                    onClick={() => setActiveTab('DOCUMENT')}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${activeTab === 'DOCUMENT' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Start with Document
                </button>
            </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
            {activeTab === 'TOPIC' ? (
                <form onSubmit={handleCreateFromTopic} className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                            What are you working on?
                        </label>
                        <input 
                            type="text"
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                            placeholder="e.g. 'Marketing Strategy for Q4'"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-medium outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                            autoFocus
                        />
                    </div>
                    
                    <div>
                        <p className="text-xs font-bold text-gray-400 mb-2">Suggestions:</p>
                        <div className="flex flex-wrap gap-2">
                            {examples.map((ex, i) => (
                                <button 
                                    key={i} 
                                    type="button"
                                    onClick={() => setGoal(ex)}
                                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-xs font-bold transition-colors"
                                >
                                    {ex}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button 
                            type="button" 
                            onClick={() => onCreate({ projectName: "Untitled" })} 
                            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors"
                        >
                            Blank Canvas
                        </button>
                        <button 
                            type="submit" 
                            disabled={isProcessing}
                            className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                        >
                            {isProcessing ? <Icon.Sparkles className="animate-spin" size={18} /> : <Icon.Sparkles size={18} />}
                            {isProcessing ? "Dreaming..." : "Generate Map"}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="space-y-6">
                    {/* Usage Badge */}
                    <div className="flex items-center justify-between bg-purple-50 p-3 rounded-xl border border-purple-100">
                         <div className="flex items-center gap-2">
                             <Icon.Zap size={16} className="text-purple-600" />
                             <span className="text-xs font-bold text-purple-800">Free AI Credits</span>
                         </div>
                         <span className={`text-xs font-bold px-2 py-1 rounded bg-white border ${aiUsageCount >= 3 ? 'text-red-500 border-red-200' : 'text-purple-600 border-purple-200'}`}>
                             {3 - aiUsageCount} / 3 Left
                         </span>
                    </div>

                    {/* File Upload */}
                    <div 
                        className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors group"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".pdf,.txt,.md,.csv,.json" 
                            onChange={handleFileChange}
                        />
                        <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                            <Icon.FileText size={24} />
                        </div>
                        {file ? (
                            <div>
                                <p className="text-sm font-bold text-indigo-600">{file.name}</p>
                                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-sm font-bold text-gray-600">Click to Upload Document</p>
                                <p className="text-xs text-gray-400 mt-1">PDF, TXT, MD, CSV (Max 5MB)</p>
                            </div>
                        )}
                    </div>

                    {/* Text Area */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                            Or Paste Text / Context
                        </label>
                        <textarea 
                            value={docText}
                            onChange={(e) => setDocText(e.target.value)}
                            placeholder="Paste article text, notes, or a summary here..."
                            className="w-full h-32 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none custom-scrollbar"
                        />
                    </div>

                    <button 
                        onClick={handleCreateFromDocument}
                        disabled={isProcessing || (!file && !docText.trim())}
                        className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? <Icon.Sparkles className="animate-spin" size={18} /> : <Icon.FileText size={18} />}
                        {isProcessing ? "Analyzing..." : "Visualize Document"}
                    </button>
                </div>
            )}
        </div>

      </div>
    </div>
  );
};
