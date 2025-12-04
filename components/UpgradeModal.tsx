
import React from 'react';
import { Icon } from './Icons';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-white/20 p-8 relative overflow-hidden text-center" onClick={e => e.stopPropagation()}>
        {/* Top Decoration */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-400 to-orange-500" />
        
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
            <Icon.Close size={20} />
        </button>

        <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
             <Icon.Lock size={32} strokeWidth={3} />
        </div>

        <h2 className="text-3xl font-display font-black text-gray-900 mb-3">Limit Reached</h2>
        <p className="text-gray-500 mb-8 leading-relaxed text-sm">
            You have used <b>5 out of 5</b> free maps.<br/>
            The Zero-Cost plan is limited to keep Singularity free for everyone.
        </p>

        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-8 text-left space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-600">
                <Icon.Check size={16} className="text-green-500 shrink-0" />
                <span>Unlimited Mind Maps</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
                <Icon.Check size={16} className="text-green-500 shrink-0" />
                <span>Advanced AI Generation</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
                <Icon.Check size={16} className="text-green-500 shrink-0" />
                <span>8K & Vector Exports</span>
            </div>
        </div>

        <button className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 mb-3">
             <Icon.Zap size={20} /> Upgrade to Pro - $5/mo
        </button>
        
        <button onClick={onClose} className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors">
            Maybe Later
        </button>
      </div>
    </div>
  );
};
