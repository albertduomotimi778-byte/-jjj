import React, { useState, useEffect, useRef } from 'react';
import { extractTextFromZip } from './utils/zipUtils';
import { generateSalesScript, generateVoiceover, generateVisualPlan, generateAsset } from './services/geminiService';
import { extractFramesFromVideo, VideoFrame, generatePlaceholderImage } from './utils/mediaProcessing';
import { AppState, ProjectFile, VoiceOption, Platform, VisualAsset } from './types';
import { FileUploader } from './components/FileUploader';
import { Button } from './components/Button';
import { renderVideo } from './utils/videoUtils';
import { Wand2, Play, Pause, Download, RefreshCw, FileText, Music, Sparkles, ChevronLeft, Volume2, Youtube, Instagram, MonitorPlay, Link as LinkIcon, ArrowRight, Video, Loader2, Upload, Terminal, XCircle, CheckCircle, Info, Activity } from 'lucide-react';
import { subscribeToLogs, LogEntry } from './utils/logger';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [script, setScript] = useState<string>('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(VoiceOption.KORE);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(Platform.TIKTOK);
  const [referenceUrl, setReferenceUrl] = useState<string>('');
  
  // Video Input State
  const [demoVideoFile, setDemoVideoFile] = useState<File | null>(null);
  const [videoFrames, setVideoFrames] = useState<VideoFrame[]>([]);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);

  // Audio State
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Visual State
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [currentAssetIndex, setCurrentAssetIndex] = useState(0);

  // Video Rendering State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // Preview State
  const [previewBuffers, setPreviewBuffers] = useState<Record<string, AudioBuffer>>({});
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);

  // Debug Console State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Draggable Console State
  const [debugPos, setDebugPos] = useState({ x: 20, y: window.innerHeight - 250 });
  const [isDraggingDebug, setIsDraggingDebug] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const previewSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  // Initialize AudioContext
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Subscribe to Logger
  useEffect(() => {
    const unsubscribe = subscribeToLogs((log) => {
      setLogs(prev => [...prev, log]);
    });
    return unsubscribe;
  }, []);

  // Auto scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Draggable Logic
  const handleDebugStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Determine coordinates
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      e.preventDefault();
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    setIsDraggingDebug(true);
    dragStartPos.current = {
      x: clientX - debugPos.x,
      y: clientY - debugPos.y
    };
  };

  useEffect(() => {
    if (!isDraggingDebug) return;

    const handleMove = (clientX: number, clientY: number) => {
      setDebugPos({
        x: clientX - dragStartPos.current.x,
        y: clientY - dragStartPos.current.y
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent default scrolling only if we are dragging
      e.preventDefault(); 
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleUp = () => {
      setIsDraggingDebug(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleUp);
    // Add touch listeners to window
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDraggingDebug]);


  const handleFileSelect = async (file: File) => {
    setState(AppState.PROCESSING_ZIP);
    setErrorMsg(null);
    try {
      const extractedFiles = await extractTextFromZip(file);
      if (extractedFiles.length === 0) {
        throw new Error("No readable text files found in the ZIP.");
      }
      setFiles(extractedFiles);
      setState(AppState.REFERENCE_INPUT);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to process file.");
      setState(AppState.ERROR);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setDemoVideoFile(file);
      setIsProcessingVideo(true);
      try {
        // Extract frames for Gemini
        const frames = await extractFramesFromVideo(file, 4); // Every 4 seconds
        setVideoFrames(frames);
      } catch (err) {
        console.error("Failed to process video", err);
        setErrorMsg("Failed to process video file. It might be too large or corrupted.");
      } finally {
        setIsProcessingVideo(false);
      }
    }
  };

  const handleStartAnalysis = async () => {
    setState(AppState.ANALYZING);
    try {
      const generatedScript = await generateSalesScript(files, selectedPlatform, referenceUrl);
      setScript(generatedScript);
      setState(AppState.SCRIPT_REVIEW);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to generate script.");
      setState(AppState.ERROR);
    }
  };

  const handleGenerateContent = async () => {
    if (!script) return;
    setState(AppState.GENERATING_AUDIO);
    setErrorMsg(null);
    try {
      // 1. Generate Audio
      const { buffer } = await generateVoiceover(script, selectedVoice);
      setAudioBuffer(buffer);

      // 2. Generate Visuals
      setState(AppState.GENERATING_VISUALS);
      
      // Get Plan (Mix of Images and Video Timestamps)
      const plan = await generateVisualPlan(script, files, videoFrames);
      
      // Generate actual assets sequentially to avoid Rate Limits (429)
      const generatedAssets: VisualAsset[] = [];
      
      const width = (selectedPlatform === Platform.TIKTOK || selectedPlatform === Platform.INSTAGRAM) ? 1080 : 1920;
      const height = (selectedPlatform === Platform.TIKTOK || selectedPlatform === Platform.INSTAGRAM) ? 1920 : 1080;

      for (const [index, item] of plan.entries()) {
        let asset: VisualAsset | null = null;
        try {
          asset = await generateAsset(item, selectedPlatform);
        } catch (e) {
          console.warn(`Failed to generate asset for scene ${index}`, e);
        }

        if (asset) {
          generatedAssets.push(asset);
        } else {
          // Fallback if AI generation fails (429 or 500)
          // Use generated placeholder
          const placeholder = generatePlaceholderImage(item.description, width, height);
          generatedAssets.push({
            type: 'image',
            base64: placeholder,
            description: item.description + " (Fallback)",
            prompt: "Fallback"
          });
        }
        
        // Add a long delay between requests to respect strict free tier rate limits
        // 12 seconds delay between image generations
        if (index < plan.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      // Attach the blob URL to video assets
      if (demoVideoFile) {
        const videoUrl = URL.createObjectURL(demoVideoFile);
        generatedAssets.forEach(a => {
          if (a.type === 'video') a.videoUrl = videoUrl;
        });
      }

      if (generatedAssets.length === 0) throw new Error("Failed to generate visuals.");
      
      setAssets(generatedAssets);
      setState(AppState.DONE);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to generate content.");
      if (audioBuffer && !assets.length) setState(AppState.DONE);
      else setState(AppState.SCRIPT_REVIEW);
    }
  };

  // ... (Preview Voice functions same as before)
  const handlePreviewVoice = async (voice: VoiceOption, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingPreview === voice) {
      previewSourceNodeRef.current?.stop();
      setPlayingPreview(null);
      return;
    }
    if (loadingPreview) return;
    try {
      let buffer = previewBuffers[voice];
      if (!buffer) {
        setLoadingPreview(voice);
        const text = `This is a preview of the ${voice} voice.`;
        const result = await generateVoiceover(text, voice);
        buffer = result.buffer;
        setPreviewBuffers(prev => ({ ...prev, [voice]: buffer }));
        setLoadingPreview(null);
      }
      if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
      if (previewSourceNodeRef.current) try { previewSourceNodeRef.current.stop(); } catch(e) {}
      const source = audioContextRef.current!.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current!.destination);
      source.start();
      previewSourceNodeRef.current = source;
      setPlayingPreview(voice);
      source.onended = () => setPlayingPreview(null);
    } catch (err) { setLoadingPreview(null); setPlayingPreview(null); }
  };

  const updateSlideshow = () => {
    if (!audioContextRef.current || !audioBuffer || !assets.length) return;
    
    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    const duration = audioBuffer.duration;
    const sceneDuration = duration / assets.length;
    const index = Math.floor(elapsed / sceneDuration) % assets.length;
    
    // Check if changed
    if (index !== currentAssetIndex) {
      setCurrentAssetIndex(index);
    }

    // If video, update playback time manually to match current offset in scene
    const asset = assets[index];
    if (asset && asset.type === 'video' && videoPreviewRef.current) {
       const timeInScene = elapsed % sceneDuration;
       const clipDuration = (asset.videoEnd || 10) - (asset.videoStart || 0);
       const targetTime = (asset.videoStart || 0) + (timeInScene % clipDuration);
       
       if (Math.abs(videoPreviewRef.current.currentTime - targetTime) > 0.5) {
          videoPreviewRef.current.currentTime = targetTime;
       }
       if (videoPreviewRef.current.paused) videoPreviewRef.current.play().catch(() => {});
    } else if (videoPreviewRef.current && !videoPreviewRef.current.paused) {
       videoPreviewRef.current.pause();
    }
    
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateSlideshow);
    }
  };

  const playAudio = () => {
    if (!audioContextRef.current || !audioBuffer) return;
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.loop = true;
    const offset = pauseTimeRef.current % audioBuffer.duration;
    source.start(0, offset);
    startTimeRef.current = audioContextRef.current.currentTime - offset;
    sourceNodeRef.current = source;
    setIsPlaying(true);
    cancelAnimationFrame(animationFrameRef.current);
    const loop = () => {
        updateSlideshow(); // Trigger update logic immediately
        animationFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const pauseAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      if (audioContextRef.current) pauseTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current;
      setIsPlaying(false);
      cancelAnimationFrame(animationFrameRef.current);
      if (videoPreviewRef.current) videoPreviewRef.current.pause();
    }
  };

  const handleDownloadVideo = async () => {
    if (!audioBuffer || assets.length === 0) return;
    setIsRendering(true);
    setRenderProgress(0);
    if (isPlaying) pauseAudio();

    try {
      // Pass selectedPlatform here to ensure correct aspect ratio
      const blob = await renderVideo(audioBuffer, assets, selectedPlatform, (p) => setRenderProgress(p));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voxhype-${selectedPlatform}-video.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Failed to render video.");
    } finally {
      setIsRendering(false);
    }
  };

  const reset = () => {
    setState(AppState.IDLE);
    setFiles([]); setScript(''); setReferenceUrl('');
    setAudioBuffer(null); setAssets([]); setDemoVideoFile(null); setVideoFrames([]);
    setErrorMsg(null);
    setLogs([]);
    pauseTimeRef.current = 0;
  };

  const getPlatformIcon = (p: Platform) => {
    switch (p) {
      case Platform.YOUTUBE: return <Youtube className="w-5 h-5 text-red-500" />;
      case Platform.TIKTOK: return <Music className="w-5 h-5 text-pink-500" />;
      case Platform.INSTAGRAM: return <Instagram className="w-5 h-5 text-purple-500" />;
      default: return <MonitorPlay className="w-5 h-5 text-blue-500" />;
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
        case 'success': return <CheckCircle className="w-4 h-4 text-green-400" />;
        case 'error': return <XCircle className="w-4 h-4 text-red-400" />;
        case 'connect': return <Activity className="w-4 h-4 text-yellow-400" />;
        default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const getLogColor = (type: string) => {
      switch (type) {
        case 'success': return 'text-green-300';
        case 'error': return 'text-red-300';
        case 'connect': return 'text-yellow-300';
        default: return 'text-slate-300';
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#0f172a] to-[#0f172a] text-slate-100 p-4 md:p-8 flex flex-col items-center font-sans pb-40">
      
      <header className="w-full max-w-5xl flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Volume2 className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Vox<span className="text-indigo-400">Hype</span></h1>
        </div>
        {state !== AppState.IDLE && (
           <button onClick={reset} className="text-sm text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
             <RefreshCw className="w-4 h-4" /> Start Over
           </button>
        )}
      </header>

      <main className="w-full max-w-4xl relative">
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 flex items-center gap-3">
            <span className="font-bold">Error:</span> {errorMsg}
            <button onClick={() => setState(AppState.IDLE)} className="ml-auto text-sm underline">Try Again</button>
          </div>
        )}

        {state === AppState.IDLE && (
          <div className="animate-fade-in flex flex-col items-center gap-8">
            <div className="text-center space-y-4 mb-4">
              <h2 className="text-5xl md:text-6xl font-extrabold tracking-tight">
                Turn your Code into <br/>
                <span className="gradient-text">Viral Video.</span>
              </h2>
              <p className="text-lg text-slate-400 max-w-xl mx-auto">
                Upload your project ZIP. We'll analyze it, write a killer script, generate a pro voiceover, and create stunning visuals automatically.
              </p>
            </div>
            <div className="w-full max-w-2xl mb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.values(Platform).map((p) => (
                   <button key={p} onClick={() => setSelectedPlatform(p)} className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-200 ${selectedPlatform === p ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10 scale-105' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600'}`}>
                     <div className="mb-2 p-2 bg-slate-900/50 rounded-full">{getPlatformIcon(p)}</div>
                     <span className="text-sm font-medium">{p}</span>
                   </button>
                ))}
              </div>
            </div>
            <FileUploader onFileSelect={handleFileSelect} />
          </div>
        )}

        {state === AppState.REFERENCE_INPUT && (
           <div className="glass-panel w-full max-w-2xl mx-auto rounded-3xl p-8 md:p-12 animate-fade-in">
             <div className="text-center mb-8">
               <h3 className="text-2xl font-bold mb-2">Enhance with Real Footage?</h3>
               <p className="text-slate-400 text-sm">
                 Upload a screen recording of your app. AI will automatically cut to it when relevant features are mentioned.
               </p>
             </div>
             
             <div className="mb-8 border-2 border-dashed border-slate-700 rounded-xl p-6 bg-slate-800/30 text-center relative overflow-hidden group hover:border-indigo-500 transition-colors">
               <input type="file" onChange={handleVideoUpload} accept="video/mp4,video/webm" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
               <div className="flex flex-col items-center gap-2">
                 {isProcessingVideo ? (
                    <>
                      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                      <span className="text-indigo-400 font-medium">Analyzing frames...</span>
                    </>
                 ) : demoVideoFile ? (
                    <>
                      <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center"><Video className="w-6 h-6 text-green-500" /></div>
                      <span className="text-green-400 font-medium">{demoVideoFile.name} Ready</span>
                    </>
                 ) : (
                    <>
                      <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center group-hover:bg-indigo-600 transition-colors"><Upload className="w-6 h-6 text-white" /></div>
                      <span className="text-slate-300">Upload Demo Video (Optional)</span>
                    </>
                 )}
               </div>
             </div>

             <div className="space-y-6">
               <div className="relative">
                 <input type="text" placeholder="Optional: Paste YouTube Link for Style Ref" value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-5 py-4 pl-12 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all" />
                 <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
               </div>
               <Button onClick={handleStartAnalysis} variant="primary" className="w-full py-4 text-lg" disabled={isProcessingVideo}>
                 Start Generation <ArrowRight className="w-5 h-5" />
               </Button>
             </div>
           </div>
        )}

        {(state === AppState.PROCESSING_ZIP || state === AppState.ANALYZING || state === AppState.GENERATING_AUDIO || state === AppState.GENERATING_VISUALS) && (
          <div className="glass-panel w-full max-w-2xl mx-auto rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
            <div className="relative mb-8">
              <div className="w-24 h-24 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin"></div>
              <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-2xl font-bold mb-2">
              {state === AppState.PROCESSING_ZIP ? 'Unzipping contents...' : 
               state === AppState.ANALYZING ? 'Crafting your script...' :
               state === AppState.GENERATING_AUDIO ? 'Recording voiceover...' :
               'Creating & Splicing Visuals...'}
            </h3>
            <p className="text-slate-400">
               {state === AppState.GENERATING_VISUALS ? 'Mixing AI images with your video clips... (This may take a moment to avoid rate limits)' : 'Please wait while we process your request.'}
            </p>
          </div>
        )}

        {state === AppState.SCRIPT_REVIEW && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
            <div className="lg:col-span-2 space-y-4">
              <div className="glass-panel rounded-2xl p-1 relative">
                <textarea value={script} onChange={(e) => setScript(e.target.value)} className="w-full h-[500px] bg-transparent border-none focus:ring-0 text-lg leading-relaxed p-6 text-slate-200 resize-none font-mono placeholder-slate-600" />
              </div>
            </div>
            <div className="space-y-6">
              <div className="glass-panel rounded-2xl p-6 space-y-6">
                <h3 className="font-bold text-slate-200">Voice Settings</h3>
                <div className="grid grid-cols-1 gap-2">
                  {Object.values(VoiceOption).map((voice) => (
                    <div key={voice} onClick={() => setSelectedVoice(voice)} className={`px-4 py-3 rounded-xl transition-all flex items-center justify-between cursor-pointer group ${selectedVoice === voice ? 'bg-indigo-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'}`}>
                      <span className="font-medium">{voice}</span>
                      <button onClick={(e) => handlePreviewVoice(voice, e)} className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center"><Play className="w-3 h-3 text-white" /></button>
                    </div>
                  ))}
                </div>
                <Button onClick={handleGenerateContent} className="w-full" disabled={!script}><Video className="w-4 h-4" /> Generate Video</Button>
              </div>
            </div>
          </div>
        )}

        {state === AppState.DONE && (
          <div className="w-full max-w-4xl mx-auto animate-fade-in">
             <div className="glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden">
               <div className="flex flex-col md:flex-row gap-8 mb-8">
                 <div className={`relative bg-black rounded-2xl overflow-hidden shadow-2xl mx-auto ${selectedPlatform === Platform.TIKTOK || selectedPlatform === Platform.INSTAGRAM ? 'aspect-[9/16] w-[300px]' : 'aspect-video w-full'}`}>
                    
                    {assets[currentAssetIndex]?.type === 'image' && assets[currentAssetIndex].base64 && (
                      <img src={`data:image/jpeg;base64,${assets[currentAssetIndex].base64}`} alt="Scene" className="w-full h-full object-cover" />
                    )}
                    
                    {/* Hidden Video Element for Playback/Canvas */}
                    <video 
                        ref={videoPreviewRef} 
                        src={assets.find(a => a.type === 'video')?.videoUrl} 
                        className={`w-full h-full object-cover ${assets[currentAssetIndex]?.type === 'video' ? 'block' : 'hidden'}`}
                        muted 
                        playsInline
                    />

                    {!isPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10">
                        <button onClick={playAudio} className="w-20 h-20 bg-white/20 backdrop-blur-md border border-white/50 rounded-full flex items-center justify-center hover:scale-105 transition-transform"><Play className="w-8 h-8 text-white ml-1" /></button>
                      </div>
                    )}
                    
                    {assets[currentAssetIndex]?.type === 'video' && (
                        <div className="absolute top-4 right-4 bg-red-500 text-white text-xs px-2 py-1 rounded font-bold animate-pulse">
                            REAL FOOTAGE
                        </div>
                    )}
                 </div>

                 <div className="flex-1 flex flex-col justify-center space-y-6">
                    <div className="bg-slate-800/50 p-4 rounded-xl">
                      <h4 className="font-bold mb-2 text-indigo-300">Assets Used</h4>
                      <ul className="space-y-2 text-sm text-slate-400">
                         <li className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> {assets.filter(a => a.type === 'image').length} AI Images</li>
                         <li className="flex items-center gap-2"><Video className="w-4 h-4" /> {assets.filter(a => a.type === 'video').length} Real Clips</li>
                      </ul>
                    </div>
                    <div className="space-y-3">
                       {isRendering ? (
                          <div className="w-full py-4 bg-slate-800 rounded-xl flex flex-col items-center justify-center text-indigo-400 border border-indigo-500/20">
                            <Loader2 className="w-6 h-6 animate-spin mb-2" />
                            <span className="text-sm font-bold">Rendering... {Math.round(renderProgress)}%</span>
                          </div>
                       ) : (
                         <Button onClick={handleDownloadVideo} variant="primary" className="w-full py-4 text-lg"><Download className="w-5 h-5" /> Download Video</Button>
                       )}
                       <Button onClick={() => setState(AppState.SCRIPT_REVIEW)} variant="secondary" className="w-full py-4 text-lg" disabled={isRendering}><ChevronLeft className="w-5 h-5" /> Edit Script</Button>
                    </div>
                 </div>
               </div>
             </div>
          </div>
        )}
      </main>

      {/* DEBUG CONSOLE */}
      <div 
        style={{ left: debugPos.x, top: debugPos.y }}
        className="fixed w-[400px] h-[200px] bg-black/80 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs font-mono z-50 transition-shadow select-none"
      >
          <div 
            onMouseDown={handleDebugStart}
            onTouchStart={handleDebugStart}
            className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 cursor-move hover:bg-slate-800 transition-colors"
          >
              <span className="flex items-center gap-2 text-slate-400 font-bold"><Terminal className="w-3 h-3" /> Hugging Face Debug</span>
              <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                  <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                  <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
              </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2" id="console-logs">
              {logs.length === 0 && <div className="text-slate-600 italic">Waiting for logs...</div>}
              {logs.map((log) => (
                  <div key={log.id} className={`flex gap-2 items-start ${getLogColor(log.type)}`}>
                      <span className="opacity-50 mt-0.5">{getLogIcon(log.type)}</span>
                      <span className="break-all">{log.message}</span>
                  </div>
              ))}
              <div ref={logsEndRef} />
          </div>
      </div>
    </div>
  );
};

export default App;