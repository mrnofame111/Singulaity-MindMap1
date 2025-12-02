
import React, { useRef, useState, useEffect } from 'react';
import { Icon } from './Icons';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageData: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Unable to access camera. Please check permissions.");
      onClose();
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
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
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        onCapture(dataUrl);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl p-4 shadow-2xl max-w-lg w-full relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600"
        >
          <Icon.Close size={20} />
        </button>
        
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
          <Icon.Camera size={24} className="text-blue-500"/>
          Take Photo
        </h2>

        <div className="relative aspect-video bg-black rounded-xl overflow-hidden mb-4 border-2 border-gray-200">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex justify-center">
          <button 
            onClick={handleCapture}
            className="w-16 h-16 rounded-full bg-red-500 border-4 border-white shadow-lg hover:scale-110 transition-transform flex items-center justify-center"
          >
            <div className="w-14 h-14 rounded-full border-2 border-white/30" />
          </button>
        </div>
      </div>
    </div>
  );
};
