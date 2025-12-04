
import React, { useState, useEffect } from 'react';
import SingularityCanvas from './components/SingularityCanvas';
import { LandingPage } from './components/LandingPage';
import { HomeScreen } from './components/HomeScreen';
import { generateId } from './constants';
import { AuthModal } from './components/AuthModal';
import { supabase } from './lib/supabase';
import { migrateLocalMapsToCloud, saveMapToCloud, createMapInCloud, loadMapFromCloud } from './services/cloudService';

type ViewState = 'LANDING' | 'HOME' | 'CANVAS';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('LANDING');
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Auth State
  const [user, setUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Check Auth on Mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
          // Attempt migration on first load if logged in
          migrateLocalMapsToCloud(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
          migrateLocalMapsToCloud(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Check for existing user or first time load (Local)
  useEffect(() => {
    // If not logged in, check local storage to determine view
    if (!user) {
        const hasVisited = localStorage.getItem('singularity-visited');
        const indexData = localStorage.getItem('singularity-maps-index');

        if (hasVisited && indexData) {
           setCurrentView('HOME');
        } else {
           // Legacy Migration Check (v2 -> v3 Local)
           const oldData = localStorage.getItem('singularity-data-v2');
           if (oldData) {
               const migrationId = generateId();
               const parsed = JSON.parse(oldData);
               const name = parsed.projectName || "Legacy Map";
               
               localStorage.setItem(`singularity-map-${migrationId}`, oldData);
               
               const newIndex = [{ id: migrationId, name, lastModified: Date.now() }];
               localStorage.setItem('singularity-maps-index', JSON.stringify(newIndex));
               localStorage.setItem('singularity-visited', 'true');
               
               setCurrentView('HOME');
           }
        }
    } else {
        // If logged in, default to HOME unless specific logic
        setCurrentView('HOME');
    }
  }, [user]);

  const handleLaunchApp = () => {
    localStorage.setItem('singularity-visited', 'true');
    setCurrentView('HOME');
  };

  const handleOpenMap = async (mapId: string) => {
    if (user) {
        // If logged in, we might need to fetch data into local storage or state
        // For simplicity in this version, we load into localStorage to keep Canvas component compatible,
        // or we could pass initialData prop to Canvas.
        // Let's load into localStorage as a cache mechanism.
        try {
            const content = await loadMapFromCloud(mapId);
            if (content) {
                localStorage.setItem(`singularity-map-${mapId}`, JSON.stringify(content));
            }
        } catch (e) {
            console.error("Failed to load map from cloud", e);
            // Fallback to local if it exists?
        }
    }
    setActiveMapId(mapId);
    setCurrentView('CANVAS');
  };

  const handleCreateMap = async (initialData?: any) => {
      const newId = generateId(); // Note: For Cloud, Supabase generates UUIDs usually, but we can use generated ID for optimistic UI
      const name = initialData?.projectName || 'Untitled Mind Map';
      
      const mapData = {
          nodes: initialData?.nodes || [],
          edgeData: initialData?.edgeData || {},
          drawings: [],
          viewport: { x: window.innerWidth/2, y: window.innerHeight/2, zoom: 1 },
          projectName: name,
          canvasSettings: { theme: 'default', showGrid: true },
          ...initialData
      };

      if (user) {
          try {
              // Create in cloud
              const newMap = await createMapInCloud(mapData);
              // Note: newMap.id from Supabase might be different if we used auto-gen UUID. 
              // For this hybrid approach, let's rely on the ID we generate if using upsert, 
              // OR use the returned ID. 
              // Simplest: Use the ID returned by Supabase if insert.
              // But createMapInCloud in service currently returns data.
              
              // Update local cache
              localStorage.setItem(`singularity-map-${newMap.id}`, JSON.stringify(mapData));
              setActiveMapId(newMap.id);
          } catch (e) {
              console.error("Failed to create map in cloud", e);
              alert("Failed to create map online. Saving locally.");
              // Fallback local
              saveLocal(newId, name, mapData);
              setActiveMapId(newId);
          }
      } else {
          saveLocal(newId, name, mapData);
          setActiveMapId(newId);
      }
      
      setCurrentView('CANVAS');
  };

  const saveLocal = (id: string, name: string, data: any) => {
      const indexStr = localStorage.getItem('singularity-maps-index');
      const index = indexStr ? JSON.parse(indexStr) : [];
      const newMap = { id, name, lastModified: Date.now() };
      localStorage.setItem('singularity-maps-index', JSON.stringify([newMap, ...index]));
      localStorage.setItem(`singularity-map-${id}`, JSON.stringify(data));
  };

  const handleBackToHome = () => {
      setActiveMapId(null);
      setCurrentView('HOME');
      // Trigger a save to cloud if dirty? 
      // Canvas component has auto-save to localStorage. 
      // We should hook into that or trigger sync on exit.
      // For now, rely on the Canvas auto-save which writes to localStorage.
      // We need a mechanism to sync localStorage -> Cloud on exit.
      if (user && activeMapId) {
          const localData = localStorage.getItem(`singularity-map-${activeMapId}`);
          if (localData) {
              saveMapToCloud(activeMapId, JSON.parse(localData)).catch(e => console.error("Sync failed", e));
          }
      }
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
            onLoginClick={() => setIsAuthModalOpen(true)}
            user={user}
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

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
            // Migration is handled by useEffect on user change
            setCurrentView('HOME');
        }}
      />
    </div>
  );
};

export default App;
