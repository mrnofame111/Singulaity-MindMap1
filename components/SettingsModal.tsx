
import React, { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { getProfile, updateProfile, UserProfile } from '../services/profileService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string;
}

const SQL_SCRIPT = `
CREATE TABLE public.profiles (
    id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name text,
    birthdate date,
    use_case text,
    source text,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own profile" ON public.profiles FOR ALL USING (auth.uid() = id);
`;

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, userId, userEmail }) => {
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'BILLING'>('PROFILE');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');

  useEffect(() => {
      if (isOpen && userId) {
          loadProfile();
      }
  }, [isOpen, userId]);

  const loadProfile = async () => {
      setLoading(true);
      setTableMissing(false);
      const p = await getProfile(userId);
      if (p) {
          if (p.is_table_missing) {
              setTableMissing(true);
          }
          setProfile(p);
          setName(p.name || '');
          setBirthdate(p.birthdate || '');
      }
      setLoading(false);
  };

  const handleSave = async () => {
      if (!profile) return;
      setLoading(true);
      try {
          await updateProfile({
              ...profile,
              name,
              birthdate
          });
          
          // Success: Clear any error states
          setTableMissing(false);
          alert("Profile updated successfully!");
          onClose();
      } catch (error: any) {
          console.error("Profile update failed:", error);
          if (error.code === 'PGRST205' || error.code === '42P01') {
              setTableMissing(true);
              alert("CRITICAL ERROR: The 'profiles' table is missing in your database. Please see the instructions in the settings panel.");
          } else {
              alert(`Failed to update profile.\nError: ${error.message || JSON.stringify(error)}`);
          }
      } finally {
          setLoading(false);
      }
  };

  const copySql = () => {
      navigator.clipboard.writeText(SQL_SCRIPT);
      alert("SQL Script copied to clipboard! Run this in your Supabase SQL Editor.");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex overflow-hidden h-[600px]" onClick={e => e.stopPropagation()}>
        
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 p-6 flex flex-col">
            <h2 className="text-xl font-display font-black text-gray-800 mb-6 flex items-center gap-2">
                <Icon.Settings size={24} className="text-gray-400" /> Settings
            </h2>
            
            <div className="space-y-2">
                <button 
                    onClick={() => setActiveTab('PROFILE')}
                    className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-3 transition-colors ${activeTab === 'PROFILE' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`}
                >
                    <Icon.Brain size={18} /> Profile
                </button>
                <button 
                    onClick={() => setActiveTab('BILLING')}
                    className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-3 transition-colors ${activeTab === 'BILLING' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`}
                >
                    <Icon.Database size={18} /> Billing
                </button>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full text-gray-400">
                <Icon.Close size={20} />
            </button>

            {activeTab === 'PROFILE' && (
                <div className="space-y-6">
                    <h3 className="text-2xl font-bold text-gray-800">Your Profile</h3>
                    
                    {tableMissing && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 animate-fade-in">
                            <div className="flex items-center gap-2 text-amber-700 font-bold mb-2">
                                <Icon.AlertTriangle size={18} /> Database Setup Required
                            </div>
                            <p className="text-xs text-amber-600 mb-3 leading-relaxed">
                                The <b>profiles</b> table is missing in your Supabase database. You cannot save profile settings until this is fixed.
                            </p>
                            <button 
                                onClick={copySql} 
                                className="text-xs bg-white border border-amber-200 px-3 py-1.5 rounded-lg font-bold text-amber-600 hover:bg-amber-100 flex items-center gap-2 transition-colors"
                            >
                                <Icon.Copy size={12} /> Copy SQL Script
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                        <input disabled value={userEmail} className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed" />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
                        <input 
                            value={name} onChange={e => setName(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="John Doe"
                            disabled={tableMissing}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date of Birth</label>
                        <input 
                            type="date"
                            value={birthdate} onChange={e => setBirthdate(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                            disabled={tableMissing}
                        />
                    </div>

                    <div className="pt-4">
                        <button 
                            onClick={handleSave} 
                            disabled={loading || tableMissing}
                            className={`px-6 py-3 font-bold rounded-xl shadow-md transition-all flex items-center gap-2 ${tableMissing ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                        >
                            {loading ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'BILLING' && (
                <div className="space-y-6">
                    <h3 className="text-2xl font-bold text-gray-800">Subscription</h3>
                    
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 flex items-center justify-between">
                        <div>
                            <h4 className="text-lg font-bold text-indigo-900">Free Tier</h4>
                            <p className="text-sm text-indigo-600">Basic features. Max 5 maps.</p>
                        </div>
                        <div className="px-4 py-1 bg-indigo-200 text-indigo-800 rounded-full text-xs font-bold uppercase">Active</div>
                    </div>

                    <div className="border-t border-gray-100 pt-6">
                        <p className="text-gray-500 text-sm mb-4">Upgrade to Pro for unlimited maps, AI power, and 8K exports.</p>
                        <button className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5">
                            Upgrade to Pro - $5/mo
                        </button>
                    </div>
                </div>
            )}
        </div>

      </div>
    </div>
  );
};
