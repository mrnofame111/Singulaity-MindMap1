
import React, { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { updateProfile, getProfile } from '../services/profileService';

interface OnboardingModalProps {
  isOpen: boolean;
  userId: string;
  userEmail: string;
  onComplete: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, userId, userEmail, onComplete }) => {
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [useCase, setUseCase] = useState('Study/Exam Prep');
  const [source, setSource] = useState('Friend');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTableMissing, setIsTableMissing] = useState(false);

  // Check table status on mount
  useEffect(() => {
      if (isOpen && userId) {
          checkTableStatus();
      }
  }, [isOpen, userId]);

  const checkTableStatus = async () => {
      const p = await getProfile(userId);
      if (p && p.is_table_missing) {
          setIsTableMissing(true);
          setError("System Notice: Database setup is incomplete. You can skip onboarding for now.");
      }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isTableMissing) {
        onComplete(); // Just skip if we know it will fail
        return;
    }
    
    setLoading(true);
    setError(null);
    try {
        await updateProfile({
            id: userId,
            email: userEmail, 
            name,
            birthdate,
            use_case: useCase,
            source
        });
        setIsTableMissing(false); // Clear flag on success
        onComplete();
    } catch (err: any) {
        console.error("Onboarding error", err);
        if (err.code === 'PGRST205' || err.code === '42P01') {
             setIsTableMissing(true);
             setError("System Notice: Database setup is incomplete. You can skip onboarding for now.");
        } else {
             setError(`Failed to save profile: ${err.message || 'Unknown error'}`);
        }
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-indigo-900/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 relative">
        
        <div className="text-center mb-8">
           <h1 className="text-3xl font-display font-black text-gray-900 mb-2">Welcome to Singularity! 🚀</h1>
           <p className="text-gray-500">Let's set up your profile to get the best experience.</p>
        </div>

        {error && (
            <div className={`border rounded-xl p-4 mb-6 text-sm flex flex-col gap-2 ${isTableMissing ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                <div className="font-bold flex items-center gap-2">
                    {isTableMissing ? <Icon.AlertTriangle size={16} /> : <Icon.Close size={16} />} 
                    {isTableMissing ? "Database Setup Needed" : "Setup Error"}
                </div>
                <p>{error}</p>
                {isTableMissing && (
                    <button 
                        type="button" 
                        onClick={onComplete} 
                        className="text-xs bg-white border border-amber-200 px-3 py-1.5 rounded-lg font-bold text-amber-600 hover:bg-amber-100 w-fit mt-1"
                    >
                        Skip Onboarding &rarr;
                    </button>
                )}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
                <input 
                    type="text" required={!isTableMissing} value={name} onChange={e => setName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    placeholder="John Doe"
                    disabled={isTableMissing}
                />
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Date of Birth</label>
                <input 
                    type="date" required={!isTableMissing} value={birthdate} onChange={e => setBirthdate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    disabled={isTableMissing}
                />
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">How will you use Singularity?</label>
                <select 
                    value={useCase} onChange={e => setUseCase(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    disabled={isTableMissing}
                >
                    <option>Study/Exam Prep</option>
                    <option>Project Management</option>
                    <option>Idea Brainstorming</option>
                    <option>Software Architecture</option>
                    <option>Other</option>
                </select>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">How did you hear about us?</label>
                <select 
                    value={source} onChange={e => setSource(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    disabled={isTableMissing}
                >
                    <option>Friend</option>
                    <option>Google Ad</option>
                    <option>Facebook</option>
                    <option>LinkedIn</option>
                    <option>Other</option>
                </select>
            </div>

            <div className="flex gap-3 pt-4">
                <button 
                    type="button"
                    onClick={onComplete}
                    className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors"
                >
                    Skip Setup
                </button>
                <button 
                    type="submit" 
                    disabled={loading || isTableMissing}
                    className={`flex-[2] py-4 font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 ${isTableMissing ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                >
                    {loading ? <Icon.Navigation className="animate-spin" size={20}/> : "Complete Setup"}
                </button>
            </div>
        </form>

      </div>
    </div>
  );
};
