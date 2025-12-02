
import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icons';

interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageAdd: (url: string, label: string) => void;
}

export const MediaModal: React.FC<MediaModalProps> = ({ isOpen, onClose, onImageAdd }) => {
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'URL' | 'CAMERA'>('UPLOAD');
  const [urlInput, setUrlInput] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Camera Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen && activeTab === 'CAMERA') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, activeTab]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera Error:", err);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        onImageAdd(dataUrl, 'Captured Photo');
        onClose();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setFileError("File is too large (Max 5MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          onImageAdd(ev.target.result as string, file.name);
          onClose();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onImageAdd(urlInput, 'Linked Image');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <Icon.Image className="text-blue-500" /> Add Media
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500">
            <Icon.Close size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-2 border-b border-gray-100">
          {[
            { id: 'UPLOAD', label: 'Upload', icon: Icon.Download },
            { id: 'URL', label: 'From URL', icon: Icon.Connect },
            { id: 'CAMERA', label: 'Camera', icon: Icon.Camera },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 flex items-center justify-center gap-2 text-sm font-bold rounded-lg transition-colors
                ${activeTab === tab.id ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}
              `}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 min-h-[200px] flex flex-col justify-center">
          
          {activeTab === 'UPLOAD' && (
            <div className="text-center">
              <label className="block w-full border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-8 cursor-pointer transition-colors bg-gray-50 hover:bg-blue-50 group">
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                <div className="w-12 h-12 bg-white rounded-full shadow-sm mx-auto mb-3 flex items-center justify-center group-hover:scale-110 transition-transform">
                   <Icon.Download className="text-blue-500" size={24} />
                </div>
                <p className="text-sm font-bold text-gray-600 mb-1">Click to upload image</p>
                <p className="text-xs text-gray-400">SVG, PNG, JPG or GIF (Max 5MB)</p>
              </label>
              {fileError && <p className="text-red-500 text-xs font-bold mt-2">{fileError}</p>}
            </div>
          )}

          {activeTab === 'URL' && (
            <form onSubmit={handleUrlSubmit} className="space-y-4">
               <div>
                 <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Image Link</label>
                 <input 
                   type="url" 
                   autoFocus
                   value={urlInput}
                   onChange={(e) => setUrlInput(e.target.value)}
                   placeholder="Paste image link here (e.g., https://example.com/photo.jpg)"
                   className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                 />
               </div>
               <button 
                 type="submit"
                 disabled={!urlInput.trim()}
                 className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md transition-transform active:scale-95"
               >
                 Embed Image
               </button>
            </form>
          )}

          {activeTab === 'CAMERA' && (
            <div className="flex flex-col items-center">
               <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4 shadow-inner">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
               </div>
               <button 
                 onClick={handleCapture}
                 className="w-14 h-14 bg-red-500 border-4 border-white shadow-lg rounded-full flex items-center justify-center hover:scale-110 transition-transform"
               >
                 <div className="w-12 h-12 rounded-full border-2 border-white/20" />
               </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
