
import React, { useState } from 'react';
import { Icon } from './Icons';

interface NewMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (goal: string) => void;
}

export const NewMapModal: React.FC<NewMapModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [goal, setGoal] = useState('');

  if (!isOpen) return null;

  const handleCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (goal.trim()) {
      onCreate(goal);
    } else {
      // Fallback to blank
      onCreate("Generic Brainstorm");
    }
  };

  const examples = ["Project Launch Plan", "Study Guide for Biology", "Startup Business Model", "Novel Plot Outline"];

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-white/20 p-6 relative overflow-hidden">
        
        {/* Decorative header gradient */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <Icon.Close size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
           <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
               <Icon.Brain size={28} strokeWidth={1.5} />
           </div>
           <div>
               <h2 className="text-xl font-display font-bold text-gray-800">New Mind Map</h2>
               <p className="text-sm text-gray-500">Start fresh or let AI structure it for you.</p>
           </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-6">
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    What are you working on?
                </label>
                <input 
                    type="text"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="e.g. 'Marketing Strategy for Q4'"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base font-medium outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
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

            <div className="flex gap-3">
                <button 
                    type="button" 
                    onClick={() => onCreate("")} 
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors"
                >
                    Blank Canvas
                </button>
                <button 
                    type="submit" 
                    className="flex-[2] py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2"
                >
                    <Icon.Sparkles size={18} />
                    AI Structure
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};
