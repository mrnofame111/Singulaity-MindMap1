
import React, { useState } from 'react';
import { Icon } from './Icons';

interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SERVICES = [
    { id: 'trello', name: 'Trello', icon: Icon.Layout, color: 'text-blue-600', bg: 'bg-blue-50', desc: 'Sync nodes as Trello cards. Two-way status updates.' },
    { id: 'jira', name: 'Jira', icon: Icon.Task, color: 'text-blue-500', bg: 'bg-blue-100', desc: 'Map tasks to Jira issues. Visualize dependencies.' },
    { id: 'sheets', name: 'Google Sheets', icon: Icon.Table, color: 'text-green-600', bg: 'bg-green-50', desc: 'Live data sync. Map columns to node properties.' },
    { id: 'notion', name: 'Notion', icon: Icon.FileText, color: 'text-gray-700', bg: 'bg-gray-100', desc: 'Embed maps in Notion pages or sync databases.' },
    { id: 'slack', name: 'Slack', icon: Icon.MessageCircle, color: 'text-purple-600', bg: 'bg-purple-50', desc: 'Receive notifications for map changes and comments.' },
];

export const IntegrationsModal: React.FC<IntegrationsModalProps> = ({ isOpen, onClose }) => {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
      if (connected[id]) {
          // Disconnect
          if (confirm(`Disconnect ${SERVICES.find(s => s.id === id)?.name}?`)) {
              setConnected(prev => ({ ...prev, [id]: false }));
          }
      } else {
          // Simulate Auth Flow
          setSyncing(prev => ({ ...prev, [id]: true }));
          setTimeout(() => {
              setSyncing(prev => ({ ...prev, [id]: false }));
              setConnected(prev => ({ ...prev, [id]: true }));
          }, 1500);
      }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-white/20 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                    <Icon.Globe size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-display font-bold text-gray-800">Integrations</h2>
                    <p className="text-sm text-gray-500">Connect your ecosystem. Sync data in real-time.</p>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                <Icon.Close size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {SERVICES.map(service => (
                <div key={service.id} className="flex flex-col p-4 rounded-xl border border-gray-100 hover:border-gray-200 transition-all hover:shadow-sm bg-white">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${service.bg} ${service.color} shrink-0`}>
                            <service.icon size={24} />
                        </div>
                        
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="font-bold text-gray-800 text-lg">{service.name}</h3>
                                {syncing[service.id] ? (
                                    <span className="text-xs font-bold text-indigo-500 animate-pulse flex items-center gap-1">
                                        <Icon.Navigation size={12} className="animate-spin" /> Connecting...
                                    </span>
                                ) : (
                                    <button 
                                        onClick={() => handleToggle(service.id)}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                                            connected[service.id] 
                                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200' 
                                            : 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800'
                                        }`}
                                    >
                                        {connected[service.id] ? 'Connected' : 'Connect'}
                                    </button>
                                )}
                            </div>
                            <p className="text-sm text-gray-500 leading-relaxed mb-3">{service.desc}</p>
                        </div>
                    </div>

                    {/* Data Mapper UI for Sheets */}
                    {connected[service.id] && service.id === 'sheets' && (
                        <div className="mt-4 bg-gray-50 rounded-lg p-4 text-xs space-y-3 animate-fade-in border border-gray-200">
                            <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-2">
                                <span className="font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                                    <Icon.Table size={14} className="text-green-600"/> Data Visualization Bridge
                                </span>
                                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Active</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Sheet Column</label>
                                    <select className="w-full p-2 bg-white border border-gray-200 rounded font-medium text-gray-600">
                                        <option>A: Task Name</option>
                                        <option>B: Description</option>
                                        <option>C: Status</option>
                                        <option>D: Priority</option>
                                    </select>
                                </div>
                                <div className="flex items-center justify-center">
                                    <Icon.Arrow size={16} className="text-gray-400 rotate-90 sm:rotate-0" />
                                </div>
                                <div className="space-y-1 -mt-6 sm:mt-0">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Node Property</label>
                                    <select className="w-full p-2 bg-white border border-gray-200 rounded font-medium text-gray-600">
                                        <option>Label</option>
                                        <option>Note / Description</option>
                                        <option>Checkbox State</option>
                                        <option>Color (Conditional)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 text-gray-500">
                                <input type="checkbox" checked readOnly className="accent-green-600" />
                                <span>Two-way sync (Canvas ⇋ Sheet)</span>
                            </div>
                        </div>
                    )}
                    
                    {connected[service.id] && service.id !== 'sheets' && (
                        <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs space-y-2 animate-fade-in border border-gray-100">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-gray-600">Auto-Sync</span>
                                <div className="w-8 h-4 bg-green-500 rounded-full relative"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow-sm"/></div>
                            </div>
                            <div className="pt-2 border-t border-gray-200 flex gap-2">
                                <button className="flex-1 py-1.5 bg-white border border-gray-200 rounded text-gray-600 hover:text-blue-600 font-bold">Configure Mapping</button>
                                <button className="flex-1 py-1.5 bg-white border border-gray-200 rounded text-gray-600 hover:text-blue-600 font-bold">Force Sync Now</button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
                🔒 Secure Connection via OAuth 2.0. Your data is encrypted in transit.
            </p>
        </div>

      </div>
    </div>
  );
};
