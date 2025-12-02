
import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icons';
import { SingularityNode, AIAction } from '../types';
import { chatWithMapContext } from '../services/geminiService';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: SingularityNode[];
  onAction: (actions: AIAction[]) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, nodes, onAction }) => {
  const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    if(isOpen) {
        setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMsg = inputValue;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInputValue('');
    setIsLoading(true);

    try {
        // Construct history for context
        const history = messages.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
        
        const response = await chatWithMapContext(userMsg, history, nodes);
        
        if (response.text) {
            setMessages(prev => [...prev, { role: 'model', text: response.text }]);
        }
        
        if (response.actions && response.actions.length > 0) {
            onAction(response.actions);
            setMessages(prev => [...prev, { role: 'model', text: `⚡ Executed ${response.actions?.length} automated actions.` }]);
        }

    } catch (error) {
        console.error(error);
        setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error connecting to the AI." }]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 bottom-24 z-[150] w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col animate-slide-up overflow-hidden font-sans">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 flex items-center justify-between text-white shrink-0">
            <div className="flex items-center gap-2">
                <div className="relative">
                    <Icon.Sparkles size={20} className="animate-pulse text-yellow-300" />
                </div>
                <span className="font-bold text-lg">AI Co-Pilot</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <Icon.Close size={18} />
            </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
                <div className="text-center text-gray-400 mt-10 text-sm">
                    <Icon.Brain className="mx-auto mb-2 opacity-50" size={32} />
                    <p className="font-bold text-gray-500">Context Aware Mode Active</p>
                    <p className="text-xs mt-1">Try "Link 'Idea' to 'Project'" or "Find duplicate nodes"</p>
                </div>
            )}
            {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-tr-none' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'}`}>
                        {msg.text}
                    </div>
                </div>
            ))}
            {isLoading && (
                <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150" />
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 bg-white border-t border-gray-200 shrink-0">
            <div className="relative flex items-center">
                <textarea 
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask AI to edit map..."
                    className="w-full bg-gray-100 border-0 rounded-xl pl-4 pr-12 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none h-12 max-h-24 custom-scrollbar"
                />
                <button 
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    className="absolute right-2 p-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-lg transition-colors"
                >
                    <Icon.Send size={16} />
                </button>
            </div>
        </div>
    </div>
  );
};
