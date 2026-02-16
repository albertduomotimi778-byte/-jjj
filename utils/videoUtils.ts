import { VisualAsset, Platform } from "../types";

export const renderVideo = async (
  audioBuffer: AudioBuffer,
  assets: VisualAsset[],
  platform: Platform,
  onProgress: (progress: number) => void
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    
    // Determine aspect ratio based on platform
    // YouTube & Generic = Landscape (16:9)
    // TikTok & Instagram = Portrait (9:16)
    const isLandscape = platform === Platform.YOUTUBE || platform === Platform.GENERIC;
    
    canvas.width = isLandscape ? 1920 : 1080;
    canvas.height = isLandscape ? 1080 : 1920; 
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    // 1. Setup Audio
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dest = audioContext.createMediaStreamDestination();
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);

    // 2. Setup Video Stream
    // 30 FPS is standard for social media
    const canvasStream = canvas.captureStream(30);
    const audioTrack = dest.stream.getAudioTracks()[0];
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), audioTrack]);
    
    // 3. Determine best supported MIME type
    // Priority: MP4 (Safari/modern) > WebM H.264 (Chrome/Edge compatibility) > WebM VP9 (Standard)
    const mimeTypes = [
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm'
    ];
    
    const selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';
    console.log(`Using MIME type: ${selectedMimeType} for ${platform}`);

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 8000000 // 8 Mbps for high quality
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: selectedMimeType });
      source.disconnect();
      audioContext.close();
      resolve(blob);
    };

    // 4. Preload Images with Error Handling
    const loadedImages = Promise.all(assets.map(asset => {
      if (asset.type === 'image' && asset.base64) {
        return new Promise<HTMLImageElement | null>((resolveImg) => {
          const img = new Image();
          img.onload = () => resolveImg(img);
          img.onerror = () => {
            console.error("Failed to load image asset");
            resolveImg(null);
          };
          img.src = `data:image/jpeg;base64,${asset.base64}`;
        });
      }
      return Promise.resolve(null);
    }));

    // 5. Prepare Video Element for playback of clips
    const videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.playsInline = true;
    
    // Optimization: If multiple assets use the same video source, we only set src once.
    // In this app, we currently assume one uploaded video file for all 'video' assets.
    const videoAsset = assets.find(a => a.type === 'video');
    if (videoAsset && videoAsset.videoUrl) {
      videoEl.src = videoAsset.videoUrl;
    }

    // 6. Start Recording Loop
    const duration = audioBuffer.duration;
    // Calculate timing for scenes
    const sceneDuration = duration / assets.length;
    
    loadedImages.then((imgs) => {
      recorder.start();
      source.start(); // Start audio playback
      const startTime = audioContext.currentTime;

      // Start video element if needed
      if (videoAsset) {
        videoEl.play().catch(e => console.warn("Video play failed", e));
      }

      const drawFrame = () => {
        // Calculate elapsed time based on AudioContext (most accurate clock)
        const elapsed = audioContext.currentTime - startTime;
        const progress = Math.min(100, (elapsed / duration) * 100);
        onProgress(progress);

        if (elapsed >= duration) {
          // Add a buffer (500ms) to ensure the very last frames and audio tail are captured
          setTimeout(() => recorder.stop(), 500);
          return;
        }

        // Determine which scene we are in
        const index = Math.floor(elapsed / sceneDuration);
        // Clamp index
        const safeIndex = Math.min(index, assets.length - 1);
        
        const asset = assets[safeIndex];
        const img = imgs[safeIndex];

        // Clear Canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (asset.type === 'image' && img) {
           // DRAW IMAGE (Cover Fit)
           const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
           const x = (canvas.width / 2) - (img.width / 2) * scale;
           const y = (canvas.height / 2) - (img.height / 2) * scale;
           ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        } 
        else if (asset.type === 'video' && videoEl.readyState >= 2) {
           // DRAW VIDEO CLIP
           // Calculate local time within the clip
           const timeInScene = elapsed % sceneDuration;
           
           const vStart = asset.videoStart || 0;
           const vEnd = asset.videoEnd || (vStart + 5);
           const clipLen = vEnd - vStart;
           
           // Loop the clip if scene is longer than the defined clip
           const targetTime = vStart + (timeInScene % clipLen);

           // Sync: If video element drifted too far, seek it.
           // Tolerance of 0.2s to prevent choppy playback
           if (Math.abs(videoEl.currentTime - targetTime) > 0.2) {
             videoEl.currentTime = targetTime;
           }
           
           // Render Frame (Cover Fit)
           const vw = videoEl.videoWidth;
           const vh = videoEl.videoHeight;
           
           if (vw > 0 && vh > 0) {
             const scale = Math.max(canvas.width / vw, canvas.height / vh);
             const x = (canvas.width / 2) - (vw / 2) * scale;
             const y = (canvas.height / 2) - (vh / 2) * scale;
             ctx.drawImage(videoEl, x, y, vw * scale, vh * scale);
           }
        }

        requestAnimationFrame(drawFrame);
      };

      drawFrame();
    });
  });
};