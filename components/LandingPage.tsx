
import React from 'react';
import { Icon } from './Icons';

interface LandingPageProps {
  onLaunch: () => void;
}

const BentoItem = ({ title, desc, icon: IconC, color, className, visual }: any) => (
    <div className={`bg-white/5 border border-white/10 backdrop-blur-sm rounded-3xl p-6 flex flex-col justify-between hover:bg-white/10 transition-colors group overflow-hidden relative ${className}`}>
        <div className="relative z-10">
            <div className={`p-3 rounded-2xl w-fit mb-4 ${color} bg-white/5`}>
                <IconC size={24} />
            </div>
            <h3 className="text-xl font-display font-bold text-white mb-2">{title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
        </div>
        {visual && <div className="absolute right-0 bottom-0 opacity-20 group-hover:opacity-40 transition-opacity duration-500">{visual}</div>}
    </div>
);

export const LandingPage: React.FC<LandingPageProps> = ({ onLaunch }) => {
  return (
    <div className="w-full h-screen overflow-y-auto bg-[#0B0F19] text-white selection:bg-indigo-500/30 font-sans custom-scrollbar scroll-smooth relative">
      
      {/* Background Atmosphere - Simplified for Lite */}
      <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[80px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[80px]" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }} />
      </div>

      {/* Navbar */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-2xl">
              <div className="flex items-center gap-3">
                  <Icon.Brain className="text-indigo-400" size={24} />
                  <span className="font-display font-bold text-lg tracking-wide">Singularity Lite</span>
              </div>
              <div className="flex items-center gap-4">
                  <button onClick={onLaunch} className="text-sm font-bold text-gray-300 hover:text-white transition-colors">Login</button>
                  <button onClick={onLaunch} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-full text-sm font-bold transition-all shadow-[0_0_15px_rgba(79,70,229,0.4)]">
                      Get Started
                  </button>
              </div>
          </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-[80vh] flex flex-col items-center justify-center relative z-10 px-4 pt-20">
          <div className="text-center max-w-5xl mx-auto">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold mb-8 animate-fade-in">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  FAST & LIGHTWEIGHT
              </div>
              
              <h1 className="text-6xl md:text-8xl font-display font-black tracking-tight leading-[1.1] mb-8 text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/40 animate-slide-up">
                  Think at the speed <br/> of <span className="text-indigo-400">light.</span>
              </h1>
              
              <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
                  A hyper-optimized visual workspace. Create mind maps, flowcharts, and diagrams powered by Gemini AI.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                  <button 
                    onClick={onLaunch}
                    className="px-8 py-4 bg-white text-black text-lg font-bold rounded-2xl hover:scale-105 transition-transform flex items-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                  >
                      <Icon.Zap size={20} /> Launch Lite App
                  </button>
              </div>
          </div>
      </section>

      {/* Bento Grid Features */}
      <section className="max-w-7xl mx-auto px-4 py-24 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[200px]">
              {/* Large Item */}
              <BentoItem 
                  title="AI Co-Pilot" 
                  desc="Generate entire branches, summarize complex topics, or chat with your map context." 
                  icon={Icon.Sparkles} 
                  color="text-yellow-400"
                  className="md:col-span-2 md:row-span-2"
                  visual={<Icon.Brain size={200} className="text-white" />}
              />
              
              {/* Tall Item */}
              <BentoItem 
                  title="Infinite Canvas" 
                  desc="No boundaries. Auto-layout engine keeps your thoughts organized." 
                  icon={Icon.Infinity} 
                  color="text-blue-400"
                  className="md:row-span-2"
                  visual={<Icon.Layout size={150} className="text-white rotate-12 translate-x-10 translate-y-10" />}
              />
              
              {/* Small Items */}
              <BentoItem 
                  title="Universal Export" 
                  desc="PDF, PNG, JSON, Markdown, Word." 
                  icon={Icon.Download} 
                  color="text-green-400"
              />
              <BentoItem 
                  title="Dark Mode" 
                  desc="Easy on the eyes. Deep space theme included." 
                  icon={Icon.Moon} 
                  color="text-purple-400"
              />
              <BentoItem 
                  title="Offline Ready" 
                  desc="Works without internet. Syncs when back online." 
                  icon={Icon.Wifi} 
                  color="text-pink-400"
              />
          </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/10 bg-[#05070a] relative z-20 text-center">
          <h2 className="text-3xl font-display font-bold mb-8">Optimized for Performance.</h2>
          <button 
            onClick={onLaunch}
            className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full transition-all shadow-lg shadow-indigo-900/50"
          >
              Enter Workspace
          </button>
          <p className="text-gray-600 mt-12 text-sm">© 2024 Singularity Lite.</p>
      </footer>

    </div>
  );
};
