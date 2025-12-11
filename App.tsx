
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { generateId } from './constants';
import { AuthModal } from './components/AuthModal';
import { OnboardingModal } from './components/OnboardingModal';
import { supabase } from './lib/supabase';
import { migrateLocalMapsToCloud, saveMapToCloud, createMapInCloud, loadMapFromCloud, CLOUD_UNAVAILABLE } from './services/cloudService';
import { getProfile } from './services/profileService';

// --- LAZY LOAD HEAVY COMPONENTS ---
// This drastically reduces the initial load time by splitting code into chunks.
const SingularityCanvas = lazy(() => import('./components/SingularityCanvas'));
const LandingPage = lazy(() => import('./components/LandingPage').then(module => ({ default: module.LandingPage })));
const HomeScreen = lazy(() => import('./components/HomeScreen').then(module => ({ default: module.HomeScreen })));
const NotepadScreen = lazy(() => import('./components/NotepadScreen').then(module => ({ default: module.NotepadScreen })));
const TableScreen = lazy(() => import('./components/TableScreen').then(module => ({ default: module.TableScreen })));

type ViewState = 'LANDING' | 'HOME' | 'CANVAS' | 'NOTEPAD' | 'TABLES';

// Loading Component for Suspense
const GlobalLoader = ({ text }: { text?: string }) => (
  <div className="fixed inset-0 z-[9999] bg-[#f0f4f8] flex flex-col items-center justify-center">
    <div className="w-16 h-16 border-8 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-6" />
    <p className="font-display font-bold text-xl text-blue-600 tracking-wide animate-pulse">{text || "LOADING..."}</p>
  </div>
);

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('LANDING');
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState<string>("DREAMING...");
  
  // Auth State
  const [user, setUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  
  // Profile/Onboarding State
  const [showOnboarding, setShowOnboarding] = useState(false);

  const checkProfile = async (userId: string) => {
      const profile = await getProfile(userId);
      if (!profile) {
          setShowOnboarding(true);
      }
  };

  // Check Auth on Mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
          // Attempt migration on first load if logged in
          migrateLocalMapsToCloud(session.user.id);
          checkProfile(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
          migrateLocalMapsToCloud(session.user.id);
          checkProfile(session.user.id);
      } else {
          setShowOnboarding(false);
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
        // If logged in, default to HOME
        setCurrentView('HOME');
    }
  }, [user]);

  const handleLaunchApp = () => {
    // Instead of going directly to HOME, we trigger Auth
    setIsAuthModalOpen(true);
  };

  const handleGuestAccess = () => {
      localStorage.setItem('singularity-visited', 'true');
      setCurrentView('HOME');
      setIsAuthModalOpen(false);
  };

  const handleOpenMap = async (mapId: string) => {
    if (user) {
        try {
            const content = await loadMapFromCloud(mapId);
            if (content) {
                localStorage.setItem(`singularity-map-${mapId}`, JSON.stringify(content));
            }
        } catch (e) {
            console.error("Failed to load map from cloud", e);
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
              
              // Update local cache
              localStorage.setItem(`singularity-map-${newMap.id}`, JSON.stringify(mapData));
              setActiveMapId(newMap.id);
          } catch (e: any) {
              if (e.message === CLOUD_UNAVAILABLE) {
                  console.warn("Cloud unavailable (tables missing). Creating locally.");
                  // Fallback local silent
                  saveLocal(newId, name, mapData);
                  setActiveMapId(newId);
              } else {
                  console.error("Failed to create map in cloud", e);
                  alert("Failed to create map online. Saving locally.");
                  // Fallback local with alert
                  saveLocal(newId, name, mapData);
                  setActiveMapId(newId);
              }
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
      
      if (user && activeMapId) {
          const localData = localStorage.getItem(`singularity-map-${activeMapId}`);
          if (localData) {
              saveMapToCloud(activeMapId, JSON.parse(localData)).catch(e => console.error("Sync failed", e));
          }
      }
  };

  return (
    <div className="w-screen h-screen bg-[#f0f4f8] text-gray-800 overflow-hidden font-sans selection:bg-blue-200">
      
      <Suspense fallback={<GlobalLoader text="INITIALIZING..." />}>
        {currentView === 'LANDING' && (
            <LandingPage onLaunch={handleLaunchApp} />
        )}

        {currentView === 'HOME' && (
            <HomeScreen 
              onOpenMap={handleOpenMap} 
              onCreateMap={handleCreateMap}
              onOpenNotepad={() => setCurrentView('NOTEPAD')}
              onOpenTables={() => setCurrentView('TABLES')}
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
            setLoadingText={setLoadingText}
            triggerAiPrompt={null}
            user={user}
          />
        )}

        {currentView === 'NOTEPAD' && (
            <NotepadScreen onBack={() => setCurrentView('HOME')} />
        )}

        {currentView === 'TABLES' && (
            <TableScreen onBack={() => setCurrentView('HOME')} />
        )}
      </Suspense>
      
      {/* Global Loading Overlay (For AI operations) */}
      {isGenerating && (
        <div className="fixed inset-0 z-[9999] bg-white/50 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none">
          <div className="relative p-8 rounded-3xl bg-white shadow-clay-xl border border-white/50">
            <div className="w-16 h-16 border-8 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-4 mx-auto" />
            <p className="font-display font-bold text-xl text-blue-600 tracking-wide animate-pulse text-center">{loadingText}</p>
          </div>
        </div>
      )}

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
            setCurrentView('HOME');
        }}
        allowGuest={currentView === 'LANDING'}
        onGuest={handleGuestAccess}
      />

      {/* Onboarding Modal */}
      {user && showOnboarding && (
          <OnboardingModal 
              isOpen={true}
              userId={user.id}
              userEmail={user.email || ''}
              onComplete={() => setShowOnboarding(false)}
          />
      )}
    </div>
  );
};

export default App;
