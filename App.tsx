
import React, { useState, useEffect } from 'react';
import SingularityCanvas from './components/SingularityCanvas';
import { LandingPage } from './components/LandingPage';
import { HomeScreen } from './components/HomeScreen';
import { generateId } from './constants';

type ViewState = 'LANDING' | 'HOME' | 'CANVAS';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('LANDING');
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Check for existing user or first time load
  useEffect(() => {
    const hasVisited = localStorage.getItem('singularity-visited');
    const indexData = localStorage.getItem('singularity-maps-index');

    if (hasVisited && indexData) {
       setCurrentView('HOME');
    } else {
       // Migration: Check if v2 data exists and migrate it to a map slot
       const oldData = localStorage.getItem('singularity-data-v2');
       if (oldData) {
           const migrationId = generateId();
           const parsed = JSON.parse(oldData);
           const name = parsed.projectName || "Legacy Map";
           
           // Save to new slot
           localStorage.setItem(`singularity-map-${migrationId}`, oldData);
           
           // Create index
           const newIndex = [{ id: migrationId, name, lastModified: Date.now() }];
           localStorage.setItem('singularity-maps-index', JSON.stringify(newIndex));
           localStorage.setItem('singularity-visited', 'true');
           
           // Go to home
           setCurrentView('HOME');
       }
    }
  }, []);

  const handleLaunchApp = () => {
    localStorage.setItem('singularity-visited', 'true');
    setCurrentView('HOME');
  };

  const handleOpenMap = (mapId: string) => {
    setActiveMapId(mapId);
    setCurrentView('CANVAS');
  };

  const handleCreateMap = (initialData?: any) => {
      const newId = generateId();
      
      const indexStr = localStorage.getItem('singularity-maps-index');
      const index = indexStr ? JSON.parse(indexStr) : [];
      
      const name = initialData?.projectName || 'Untitled Mind Map';
      const newMap = { id: newId, name, lastModified: Date.now() };
      
      localStorage.setItem('singularity-maps-index', JSON.stringify([newMap, ...index]));
      
      if (initialData) {
          // Initialize with template data
          const mapData = {
              nodes: initialData.nodes || [],
              edgeData: initialData.edgeData || {},
              drawings: [],
              viewport: { x: window.innerWidth/2, y: window.innerHeight/2, zoom: 1 },
              projectName: name,
              canvasSettings: { theme: 'default', showGrid: true },
              ...initialData
          };
          localStorage.setItem(`singularity-map-${newId}`, JSON.stringify(mapData));
      }
      
      setActiveMapId(newId);
      setCurrentView('CANVAS');
  };

  const handleBackToHome = () => {
      setActiveMapId(null);
      setCurrentView('HOME');
  };

  return (
    <div className="w-screen h-screen bg-[#f0f4f8] text-gray-800 overflow-hidden font-sans selection:bg-blue-200">
      
      {currentView === 'LANDING' && (
          <LandingPage onLaunch={handleLaunchApp} />
      )}

      {currentView === 'HOME' && (
          <HomeScreen 
            onOpenMap={handleOpenMap} 
            onCreateMap={handleCreateMap}
            onBackToLanding={() => setCurrentView('LANDING')}
          />
      )}

      {currentView === 'CANVAS' && activeMapId && (
        <SingularityCanvas 
          mapId={activeMapId}
          onBack={handleBackToHome}
          isGenerating={isGenerating}
          setIsGenerating={setIsGenerating}
          triggerAiPrompt={null}
        />
      )}
      
      {/* Global Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[9999] bg-white/50 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none">
          <div className="relative p-8 rounded-3xl bg-white shadow-clay-xl border border-white/50">
            <div className="w-16 h-16 border-8 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-4 mx-auto" />
            <p className="font-display font-bold text-xl text-blue-600 tracking-wide animate-pulse text-center">DREAMING...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
