export interface VideoFrame {
  timestamp: number;
  base64: string;
}

export const extractFramesFromVideo = async (videoFile: File, intervalSeconds: number = 3): Promise<VideoFrame[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const frames: VideoFrame[] = [];
    const videoUrl = URL.createObjectURL(videoFile);

    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;

    // Reduced resolution to prevent "Rpc failed" / Payload too large errors
    const ANALYZE_WIDTH = 320; 

    video.onloadedmetadata = async () => {
      canvas.width = ANALYZE_WIDTH;
      canvas.height = (video.videoHeight / video.videoWidth) * ANALYZE_WIDTH;
      
      const duration = video.duration;
      let currentTime = 0;

      // Helper to seek video
      const seekResolve = (time: number) => {
        return new Promise<void>((res) => {
          const onSeek = () => {
            video.removeEventListener('seeked', onSeek);
            res();
          };
          video.addEventListener('seeked', onSeek);
          video.currentTime = time;
        });
      };

      try {
        while (currentTime < duration) {
          await seekResolve(currentTime);
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            // Lower quality (0.5) to reduce base64 string length
            const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
            frames.push({ timestamp: Math.round(currentTime), base64 });
          }
          currentTime += intervalSeconds;
        }
        URL.revokeObjectURL(videoUrl);
        resolve(frames);
      } catch (e) {
        URL.revokeObjectURL(videoUrl);
        reject(e);
      }
    };

    video.onerror = (e) => {
        URL.revokeObjectURL(videoUrl);
        reject(e);
    };
  });
};

export const generatePlaceholderImage = (text: string, width: number, height: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return "";

  // Dark background with gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Center Text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Font size relative to width
  const fontSize = Math.floor(Math.min(width, height) * 0.05); 
  
  // Label
  ctx.fillStyle = '#6366f1'; // indigo-500
  ctx.font = `bold ${Math.floor(fontSize * 0.8)}px sans-serif`;
  ctx.fillText("SCENE VISUAL", width / 2, height / 2 - fontSize * 2);

  // Description
  ctx.fillStyle = '#e2e8f0'; // slate-200
  ctx.font = `${fontSize}px sans-serif`;
  
  // Simple wrapping/truncation
  const displayText = text.length > 50 ? text.substring(0, 47) + "..." : text;
  ctx.fillText(displayText, width / 2, height / 2);
  
  // Quota Notice
  ctx.fillStyle = '#475569';
  ctx.font = `italic ${Math.floor(fontSize * 0.6)}px sans-serif`;
  ctx.fillText("(AI Generation Quota Reached)", width / 2, height / 2 + fontSize * 2);

  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
};