import React, { useState } from 'react';
import { Icon } from './Icons';

interface ShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutDetail {
  id: string;
  keys: string[];
  label: string;
  category: 'ESSENTIAL' | 'CREATION' | 'NAVIGATION' | 'STYLING' | 'SELECTION' | 'TOOLS' | 'PRESENTATION';
  details: {
    how: string;
    when: string;
    why: string;
  };
}

const SHORTCUT_DB: ShortcutDetail[] = [
  // ESSENTIALS
  {
    id: 'cmd_palette',
    keys: ['Ctrl', 'K'],
    label: 'Command Palette',
    category: 'ESSENTIAL',
    details: {
      how: "Press Ctrl + K to open the global search bar.",
      when: "When you need to find a tool but don't know where it is in the UI.",
      why: "The fastest way to access ANY feature (Themes, Layouts, Export) without clicking through menus."
    }
  },
  {
    id: 'escape',
    keys: ['Esc'],
    label: 'Cancel / Deselect',
    category: 'ESSENTIAL',
    details: {
      how: "Press Esc.",
      when: "To close modals, stop drawing, exit presentation, or clear selection.",
      why: "The universal 'Get me out of here' button."
    }
  },
  {
    id: 'delete',
    keys: ['Del', 'Backspace'],
    label: 'Delete Selection',
    category: 'ESSENTIAL',
    details: {
      how: "Select one or more nodes/links and press Delete.",
      when: "Removing unwanted ideas or connections.",
      why: "Works for bulk selection too—clean up your map instantly."
    }
  },

  // CREATION
  {
    id: 'add_child',
    keys: ['Tab'],
    label: 'Add Child Node',
    category: 'CREATION',
    details: {
      how: "Select a node and press Tab.",
      when: "When you want to expand a thought deeper (create a sub-branch).",
      why: "Allows for rapid-fire brainstorming without moving your mouse. Just type, Tab, type."
    }
  },
  {
    id: 'add_sibling',
    keys: ['Enter'],
    label: 'Add Sibling Node',
    category: 'CREATION',
    details: {
      how: "Select a node and press Enter.",
      when: "When listing multiple items at the same level (e.g., a list of pros/cons).",
      why: "Keeps you in the 'flow' of listing ideas horizontally or vertically without interruption."
    }
  },

  // NAVIGATION
  {
    id: 'pan_tool_toggle',
    keys: ['Space'],
    label: 'Toggle Tools',
    category: 'NAVIGATION',
    details: {
      how: "Press Space to cycle between Select, Hand (Pan), and Link tools.",
      when: "Switching quickly between editing and moving.",
      why: "Faster than clicking sidebar icons."
    }
  },
  {
    id: 'pan_right_click',
    keys: ['Right-Click', 'Drag'],
    label: 'Quick Pan',
    category: 'NAVIGATION',
    details: {
      how: "Hold Right Mouse Button and drag on the canvas.",
      when: "Moving around large maps without switching tools.",
      why: "Standard navigation for power users."
    }
  },
  {
    id: 'zoom',
    keys: ['Ctrl', 'Scroll'],
    label: 'Zoom In/Out',
    category: 'NAVIGATION',
    details: {
      how: "Hold Ctrl and scroll your mouse wheel.",
      when: "Navigating between the 'Big Picture' and specific details.",
      why: "Fluid zooming focuses exactly where your mouse pointer is."
    }
  },
  {
    id: 'center_view',
    keys: ['C'],
    label: 'Center View',
    category: 'NAVIGATION',
    details: {
      how: "Press C.",
      when: "You've lost track of where your map is.",
      why: "Instantly brings the content back to the center of your screen."
    }
  },
  {
    id: 'fit_view',
    keys: ['L'],
    label: 'Auto Layout',
    category: 'NAVIGATION',
    details: {
      how: "Press L.",
      when: "When your map gets messy or nodes overlap.",
      why: "Instantly organizes the entire chaos into a structured Mind Map layout."
    }
  },
  {
    id: 'find',
    keys: ['Ctrl', 'F'],
    label: 'Find Node',
    category: 'NAVIGATION',
    details: {
      how: "Press Ctrl + F to open the search bar.",
      when: "Locating a specific idea in a massive diagram.",
      why: "Jumps directly to the node and highlights it."
    }
  },

  // TOOLS
  {
    id: 'tool_select',
    keys: ['V'],
    label: 'Select Tool',
    category: 'TOOLS',
    details: {
      how: "Press V.",
      when: "To switch back to default selection mode after drawing or panning.",
      why: "Standard shortcut across all design apps (Figma, Photoshop, etc)."
    }
  },
  {
    id: 'tool_hand',
    keys: ['H'],
    label: 'Hand Tool',
    category: 'TOOLS',
    details: {
      how: "Press H.",
      when: "You want to pan around without accidentally moving nodes.",
      why: "Locks interaction to movement only."
    }
  },
  {
    id: 'tool_draw',
    keys: ['D'],
    label: 'Draw Tool',
    category: 'TOOLS',
    details: {
      how: "Press D.",
      when: "You want to annotate or sketch freely on the canvas.",
      why: "Quick access to the pen for circling ideas or drawing arrows."
    }
  },

  // SELECTION
  {
    id: 'multi_select',
    keys: ['Ctrl', 'Click'],
    label: 'Multi-Select',
    category: 'SELECTION',
    details: {
      how: "Hold Ctrl (or Cmd) and click multiple nodes or links.",
      when: "Applying the same color/shape to a group, or moving a cluster together.",
      why: "Batch editing saves minutes of repetitive clicking."
    }
  },
  {
    id: 'branch_select',
    keys: ['Alt', 'Click'],
    label: 'Select Entire Branch',
    category: 'SELECTION',
    details: {
      how: "Hold Alt and click a parent node.",
      when: "You want to move or style a topic AND all its sub-points.",
      why: "Extremely powerful for rearranging large sections of your map at once."
    }
  },
  {
    id: 'select_all',
    keys: ['Ctrl', 'A'],
    label: 'Select All',
    category: 'SELECTION',
    details: {
      how: "Press Ctrl + A.",
      when: "Global changes like changing font or clearing the canvas.",
      why: "The nuclear option for selection."
    }
  },

  // STYLING
  {
    id: 'cycle_shape',
    keys: ['Shift', 'Click'],
    label: 'Cycle Shape',
    category: 'STYLING',
    details: {
      how: "Hold Shift and click a node.",
      when: "Quickly changing a node's shape without opening menus.",
      why: "Cycles through: Rectangle -> Rounded -> Circle -> Diamond -> etc."
    }
  },
  {
    id: 'copy_style',
    keys: ['Ctrl', 'Alt', 'C'],
    label: 'Copy Style',
    category: 'STYLING',
    details: {
      how: "Select a styled node, press Ctrl+Alt+C.",
      when: "You created a perfect look (color + shape) and want to reuse it.",
      why: "Style Clipboard works independently of text content."
    }
  },
  {
    id: 'paste_style',
    keys: ['Ctrl', 'Alt', 'V'],
    label: 'Paste Style',
    category: 'STYLING',
    details: {
      how: "Select target nodes, press Ctrl+Alt+V.",
      when: "Applying your copied look to other nodes.",
      why: "Combine with Multi-Select to theme dozens of nodes in seconds."
    }
  },
  {
    id: 'magic_style',
    keys: ['Alt', 'M'],
    label: 'Magic Auto-Style',
    category: 'STYLING',
    details: {
      how: "Select a node and press Alt+M.",
      when: "You want AI to guess the best color/shape based on the text content.",
      why: "Automatically turns 'ToDo' into checkboxes or 'Warning' into red diamonds."
    }
  },

  // PRESENTATION
  {
    id: 'present_mode',
    keys: ['Shift', 'F'],
    label: 'Start Presentation',
    category: 'PRESENTATION',
    details: {
      how: "Click the Present button or use the Action Menu.",
      when: "You want to showcase your map step-by-step.",
      why: "Automatically creates a walkthrough path from root to leaves."
    }
  },
  {
    id: 'present_nav',
    keys: ['Arrows'],
    label: 'Next/Prev Slide',
    category: 'PRESENTATION',
    details: {
      how: "Use Left/Right arrow keys or Spacebar.",
      when: "Navigating through nodes in Presentation Mode.",
      why: "Smoothly flies the camera to the next logical point."
    }
  }
];

const CATEGORIES = {
  'ESSENTIAL': { label: 'Essentials', icon: Icon.Zap },
  'CREATION': { label: 'Create', icon: Icon.Plus },
  'TOOLS': { label: 'Tools', icon: Icon.Pen },
  'NAVIGATION': { label: 'Navigate', icon: Icon.Navigation },
  'SELECTION': { label: 'Select', icon: Icon.Select },
  'STYLING': { label: 'Style', icon: Icon.Palette },
  'PRESENTATION': { label: 'Present', icon: Icon.Present },
};

// Visual Components for Guide
const VisNode = ({ label, color="bg-white", border="border-gray-300", active, scale=1, dashed }: any) => (
    <div 
      className={`px-4 py-2 rounded-xl border-2 ${color} ${border} shadow-sm text-xs font-bold text-gray-700 flex items-center justify-center min-w-[80px] transition-all duration-500 ${active ? 'ring-2 ring-blue-400 scale-105' : ''} ${dashed ? 'border-dashed opacity-70' : ''}`}
      style={{ transform: `scale(${scale})` }}
    >
        {label}
    </div>
);

const VisArrow = ({ label }: { label?: string }) => (
    <div className="w-12 h-0.5 bg-gray-300 relative flex items-center justify-center">
        <div className="absolute right-0 -top-1 w-2 h-2 border-r-2 border-t-2 border-gray-300 rotate-45" />
        {label && <span className="absolute -top-4 text-[9px] text-gray-400 font-bold bg-white px-1">{label}</span>}
    </div>
);

const VisCursor = ({ x, y, label }: any) => (
    <div className="absolute z-20 flex items-start" style={{ left: x, top: y }}>
        <Icon.Select className="text-black fill-black stroke-white stroke-2 drop-shadow-md" size={24} />
        {label && <div className="ml-2 bg-black text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">{label}</div>}
    </div>
);

const InfoCard = ({ icon: IconC, label, text, color }: { icon: any, label: string, text: string, color: string }) => (
  <div className={`p-4 rounded-xl border border-transparent flex gap-4 ${color}`}>
    <div className="p-2 bg-white/20 rounded-lg h-fit">
      <IconC size={20} />
    </div>
    <div>
      <h4 className="font-bold text-sm uppercase tracking-wide opacity-80 mb-1">{label}</h4>
      <p className="text-sm sm:text-base font-medium leading-relaxed">{text}</p>
    </div>
  </div>
);

const KeyTip = ({ k, desc, sub }: { k: string, desc: string, sub: string }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100 dark:bg-black/20 dark:border-white/10">
      <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono font-bold text-gray-700 dark:text-gray-300 shadow-sm shrink-0 h-fit mt-0.5">
          {k}
      </kbd>
      <div>
          <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{desc}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{sub}</div>
      </div>
  </div>
);

const GuideSection = ({ title, icon: IconC, description, visual, content }: { title: string, icon: any, description: string, visual: React.ReactNode, content: React.ReactNode }) => (
  <div className="space-y-6 scroll-mt-20">
      <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-500/20 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0">
              <IconC size={24} />
          </div>
          <div>
              <h3 className="text-xl font-display font-bold text-gray-900 dark:text-white">{title}</h3>
              <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-2xl text-sm leading-relaxed">{description}</p>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="order-2 lg:order-1">
              {content}
          </div>
          <div className="order-1 lg:order-2">
              {visual}
          </div>
      </div>
  </div>
);

export const ShortcutsPanel: React.FC<ShortcutsPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'SHORTCUTS' | 'GUIDE'>('SHORTCUTS');
  const [activeId, setActiveId] = useState<string>(SHORTCUT_DB[0].id);
  const activeShortcut = SHORTCUT_DB.find(s => s.id === activeId) || SHORTCUT_DB[0];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in font-sans" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#1e2030] rounded-3xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden border border-white/10 relative"
        onClick={e => e.stopPropagation()}
      >
        <button 
             onClick={onClose} 
             className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full text-gray-400 transition-colors z-50"
        >
             <Icon.Close size={24} />
        </button>

        {/* Header Tabs */}
        <div className="flex px-8 py-6 border-b border-gray-200 dark:border-gray-700 items-center justify-between bg-gray-50 dark:bg-[#161722]">
           <h2 className="text-2xl font-display font-black text-gray-800 dark:text-white flex items-center gap-3">
              <Icon.Help size={28} className="text-indigo-500" />
              Help Center
           </h2>
           <div className="flex bg-gray-200 dark:bg-black/20 p-1 rounded-xl">
               <button 
                  onClick={() => setActiveTab('SHORTCUTS')}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'SHORTCUTS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
               >
                  Keyboard Shortcuts
               </button>
               <button 
                  onClick={() => setActiveTab('GUIDE')}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'GUIDE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
               >
                  Interactive Guide
               </button>
           </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex">
            {activeTab === 'SHORTCUTS' ? (
                <>
                {/* LEFT SIDE: LIST */}
                <div className="w-1/3 min-w-[300px] bg-gray-50 dark:bg-[#161722] border-r border-gray-200 dark:border-gray-700 flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                        {(Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>).map(catKey => {
                            const items = SHORTCUT_DB.filter(s => s.category === catKey);
                            if (items.length === 0) return null;
                            const CatIcon = CATEGORIES[catKey].icon;
                            
                            return (
                                <div key={catKey}>
                                    <div className="flex items-center gap-2 px-3 mb-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                                        <CatIcon size={12} /> {CATEGORIES[catKey].label}
                                    </div>
                                    <div className="space-y-1">
                                        {items.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => setActiveId(item.id)}
                                                onMouseEnter={() => setActiveId(item.id)}
                                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                                                    activeId === item.id 
                                                    ? 'bg-white dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 shadow-sm ring-1 ring-black/5 dark:ring-white/10' 
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-white/5'
                                                }`}
                                            >
                                                <span>{item.label}</span>
                                                <div className="flex gap-1">
                                                    {item.keys.map((k, i) => (
                                                        <span key={i} className="bg-gray-200 dark:bg-black/40 px-1.5 py-0.5 rounded text-[10px] min-w-[20px] text-center border border-gray-300 dark:border-white/10">
                                                            {k}
                                                        </span>
                                                    ))}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* RIGHT SIDE: DETAIL CARD */}
                <div className="flex-1 bg-white dark:bg-[#1e2030] p-8 sm:p-12 flex flex-col relative overflow-y-auto">
                    <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full animate-slide-up">
                        <div className="mb-8">
                            <span className="inline-block py-1 px-3 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-xs font-black uppercase tracking-widest mb-4 border border-indigo-100 dark:border-indigo-500/30">
                                {CATEGORIES[activeShortcut.category].label} Action
                            </span>
                            <h1 className="text-4xl sm:text-5xl font-display font-black text-gray-900 dark:text-white mb-6">
                                {activeShortcut.label}
                            </h1>
                            <div className="flex gap-2 mb-8">
                                {activeShortcut.keys.map((k, i) => (
                                    <kbd key={i} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b-4 border-gray-300 dark:border-black rounded-lg text-xl font-mono font-bold text-gray-700 dark:text-gray-200 shadow-sm">
                                        {k}
                                    </kbd>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-6">
                            <InfoCard 
                                icon={Icon.Zap} 
                                label="How to use" 
                                text={activeShortcut.details.how} 
                                color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                            />
                            <InfoCard 
                                icon={Icon.Navigation} 
                                label="When to use" 
                                text={activeShortcut.details.when} 
                                color="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                            />
                            <InfoCard 
                                icon={Icon.Sparkles} 
                                label="Pro Tip (Why)" 
                                text={activeShortcut.details.why} 
                                color="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
                            />
                        </div>
                    </div>
                </div>
                </>
            ) : (
                <div className="w-full h-full overflow-y-auto custom-scrollbar p-8 bg-white dark:bg-[#1e2030]">
                    <div className="max-w-5xl mx-auto space-y-16 pb-12">
                         
                         {/* SECTION 1: CREATION */}
                         <GuideSection 
                            title="1. Rapid Flow Creation"
                            icon={Icon.Brain}
                            description="Singularity is designed for speed. Keep your hands on the keyboard to create structures instantly without drag-and-drop."
                            visual={
                                <div className="flex items-center gap-4 p-8 bg-gray-50 rounded-2xl justify-center h-48 border border-dashed border-gray-200">
                                     <div className="flex flex-col items-center gap-2">
                                         <VisNode label="Main Idea" active />
                                         <div className="text-[10px] text-gray-400 font-mono mt-2">Selected</div>
                                     </div>
                                     <div className="flex flex-col items-center gap-1 animate-pulse">
                                         <span className="text-xs font-bold text-blue-500">Press TAB</span>
                                         <VisArrow />
                                     </div>
                                     <VisNode label="New Child" color="bg-blue-50" border="border-blue-200" />
                                </div>
                            }
                            content={
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <KeyTip k="TAB" desc="Create Child Branch" sub="Expands deeper into detail. Use this to break down a complex topic." />
                                    <KeyTip k="ENTER" desc="Create Sibling Node" sub="Adds another item at same level. Perfect for lists or features." />
                                </div>
                            }
                         />

                         {/* SECTION 2: SMART STYLING */}
                         <GuideSection 
                            title="2. Smart Styling & Inheritance"
                            icon={Icon.Palette}
                            description="Don't manually style every node. Enable 'Smart Styling' in the Right Panel to have children inherit properties."
                            visual={
                                <div className="flex items-center gap-6 p-8 bg-gray-50 rounded-2xl justify-center h-48 border border-gray-200 relative overflow-hidden">
                                     <div className="absolute top-2 right-2 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full">Smart Style: ON</div>
                                     <div className="flex flex-col items-center gap-1">
                                         <VisNode label="Parent" color="bg-red-500" border="border-red-600 text-white" />
                                         <span className="text-[10px] text-gray-400">Red Diamond</span>
                                     </div>
                                     <VisArrow label="Inherits" />
                                     <div className="flex flex-col items-center gap-1">
                                         <VisNode label="Child" color="bg-red-500" border="border-red-600 text-white" />
                                         <span className="text-[10px] text-green-600 font-bold">Auto-Red</span>
                                     </div>
                                </div>
                            }
                            content={
                                <div className="space-y-4">
                                    <div className="text-sm text-gray-600">
                                        Go to <b>Preferences &gt; Actions &gt; Smart Styling</b> to toggle.
                                    </div>
                                    <ul className="space-y-2 text-sm text-gray-600 list-disc pl-4">
                                        <li><b>Sibling Inheritance:</b> New nodes copy the style of the previous sibling (great for consistent lists).</li>
                                        <li><b>Child Inheritance:</b> New children copy the parent's color/shape (great for color-coded branches).</li>
                                        <li><b>Edge Inheritance:</b> Connections copy the style of the parent connection.</li>
                                    </ul>
                                </div>
                            }
                         />

                         {/* SECTION 3: ADVANCED SELECTION */}
                         <GuideSection 
                            title="3. Advanced Selection"
                            icon={Icon.Select}
                            description="Managing large maps requires powerful selection tools. Use modifiers to select entire logic trees."
                            visual={
                                <div className="relative flex flex-col items-center justify-center p-8 bg-gray-900 rounded-2xl h-56 overflow-hidden">
                                     <div className="flex flex-col items-center gap-4 scale-90">
                                         <div className="relative">
                                             <VisCursor x={20} y={20} label="Alt + Click" />
                                             <VisNode label="Root Topic" active color="bg-blue-500" border="border-blue-400 text-white" />
                                         </div>
                                         <div className="flex gap-8">
                                             <div className="flex flex-col items-center">
                                                 <div className="w-0.5 h-4 bg-blue-400 mb-2" />
                                                 <VisNode label="Sub A" active color="bg-blue-500" border="border-blue-400 text-white" />
                                             </div>
                                             <div className="flex flex-col items-center">
                                                 <div className="w-0.5 h-4 bg-blue-400 mb-2" />
                                                 <VisNode label="Sub B" active color="bg-blue-500" border="border-blue-400 text-white" />
                                                 <div className="w-0.5 h-4 bg-blue-400 my-2" />
                                                 <VisNode label="Leaf" active color="bg-blue-500" border="border-blue-400 text-white" />
                                             </div>
                                         </div>
                                     </div>
                                </div>
                            }
                            content={
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <KeyTip k="Alt + Click" desc="Branch Select" sub="Selects the clicked node AND all its descendants instantly." />
                                    <KeyTip k="Shift + Drag" desc="Link Paint" sub="Drag across connection lines to select them." />
                                </div>
                            }
                         />

                         {/* SECTION 4: FOCUS MODE */}
                         <GuideSection 
                            title="4. Focus Mode"
                            icon={Icon.Zap}
                            description="Isolate complex branches to work without distraction. Everything else fades away."
                            visual={
                                <div className="relative flex items-center justify-center p-8 bg-gray-900 rounded-2xl h-48 overflow-hidden">
                                     {/* Background Dimmed Nodes */}
                                     <div className="absolute top-4 left-4 opacity-20 grayscale"><VisNode label="Distraction" /></div>
                                     <div className="absolute bottom-4 right-4 opacity-20 grayscale"><VisNode label="Noise" /></div>
                                     
                                     {/* Focused Branch */}
                                     <div className="flex gap-4 items-center relative z-10">
                                         <VisNode label="Focused Topic" color="bg-indigo-500" border="border-indigo-400 text-white" />
                                         <VisArrow />
                                         <div className="flex flex-col gap-2">
                                            <VisNode label="Detail A" />
                                            <VisNode label="Detail B" />
                                         </div>
                                     </div>
                                     
                                     <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg">Focus Active</div>
                                </div>
                            }
                            content={
                                <ul className="space-y-2 text-sm text-gray-600">
                                    <li>• <b>Right-click</b> a node and select <b>Focus Branch</b>.</li>
                                    <li>• Only the focused branch remains fully visible and selectable.</li>
                                    <li>• Click <b>Exit Focus</b> at the top or press <b>ESC</b> to return.</li>
                                </ul>
                            }
                         />

                         {/* SECTION 5: LINK PAINT MODE */}
                         <GuideSection 
                            title="5. Link Selection (Paint Mode)"
                            icon={Icon.Connect}
                            description="Select multiple connections easily without accidentally moving nodes."
                            visual={
                                <div className="flex items-center justify-center p-8 bg-gray-50 rounded-2xl h-48 border border-gray-200 relative overflow-hidden">
                                     <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]" />
                                     
                                     {/* Nodes (Ghosted) */}
                                     <div className="absolute left-10 top-10 opacity-50"><VisNode label="A" /></div>
                                     <div className="absolute right-10 bottom-10 opacity-50"><VisNode label="B" /></div>
                                     
                                     {/* Link being painted */}
                                     <svg className="absolute inset-0 w-full h-full pointer-events-none">
                                         <path d="M 80 55 C 150 55, 200 130, 270 130" fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray="5,5" className="animate-pulse" />
                                     </svg>
                                     
                                     {/* Cursor Trace */}
                                     <div className="absolute inset-0 flex items-center justify-center">
                                         <div className="w-32 h-32 border-2 border-green-400 bg-green-400/10 rounded-full flex items-center justify-center">
                                             <div className="bg-white px-2 py-1 rounded text-xs font-bold shadow text-green-600">Drag to Select Links</div>
                                         </div>
                                     </div>
                                </div>
                            }
                            content={
                                <div className="space-y-4">
                                    <div className="bg-green-50 border border-green-100 p-4 rounded-xl text-green-800 text-sm">
                                        <strong>How to Enable:</strong> Hold <b>Shift + Drag</b> anywhere on the canvas or toggle <b>Link Paint Mode</b> in Actions.
                                    </div>
                                    <ul className="space-y-2 text-sm text-gray-600">
                                        <li>• <b>Click & Drag</b> over connections to select them.</li>
                                        <li>• Nodes are ignored in this mode, preventing accidental moves.</li>
                                        <li>• Selected links will pulse. Use the toolbar to style them in bulk.</li>
                                    </ul>
                                </div>
                            }
                         />

                         {/* SECTION 6: AI WORKFLOW */}
                         <GuideSection 
                            title="6. AI Power Tools"
                            icon={Icon.Sparkles}
                            description="Don't start from scratch. Let AI structure your thoughts."
                            visual={
                                <div className="grid grid-cols-3 gap-4 h-32">
                                     <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex flex-col items-center justify-center text-center gap-2">
                                         <Icon.Brain className="text-purple-500" />
                                         <span className="text-xs font-bold text-purple-700">Expand Idea</span>
                                     </div>
                                     <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex flex-col items-center justify-center text-center gap-2">
                                         <Icon.Magic className="text-blue-500" />
                                         <span className="text-xs font-bold text-blue-700">Magic Style</span>
                                     </div>
                                     <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex flex-col items-center justify-center text-center gap-2">
                                         <Icon.Flowchart className="text-orange-500" />
                                         <span className="text-xs font-bold text-orange-700">Flowchart</span>
                                     </div>
                                </div>
                            }
                            content={
                                <div className="space-y-2 text-sm text-gray-600">
                                     <p>Select any node and click the <b>AI Sparkle</b> icon to:</p>
                                     <ul className="list-disc pl-5">
                                         <li><b>Expand:</b> Generate 3-5 sub-concepts automatically.</li>
                                         <li><b>Flowchart:</b> Convert a concept into a step-by-step process.</li>
                                         <li><b>Chat:</b> Ask the AI Co-Pilot to "Organize this map" or "Find duplicates".</li>
                                     </ul>
                                </div>
                            }
                         />

                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};