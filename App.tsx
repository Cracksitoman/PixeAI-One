
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Pencil, 
  Eraser, 
  PaintBucket, 
  Pipette, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  Download, 
  Layers, 
  Grid3X3,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Loader2,
  X,
  Save,
  Trash,
  RefreshCw,
  Maximize,
  Settings2,
  Wand2,
  Film,
  Zap,
  Clock,
  Bot,
  MonitorPlay,
  Sliders
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { Tool, Frame, PixelProject } from './types';

const STORAGE_KEY = 'pixeai_one_data';
const DEFAULT_SIZE = 32;
const INITIAL_COLOR = '#06b6d4'; // Cyan from logo

const App: React.FC = () => {
  const loadInitialProject = (): PixelProject => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.frames) return parsed;
      } catch (e) {
        console.error("Error al cargar el proyecto", e);
      }
    }
    return {
      width: DEFAULT_SIZE,
      height: DEFAULT_SIZE,
      frames: [{ id: '1', data: new Array(DEFAULT_SIZE * DEFAULT_SIZE).fill('transparent') }],
      currentFrameIndex: 0,
      fps: 10,
    };
  };

  const [project, setProject] = useState<PixelProject>(loadInitialProject);
  const [selectedTool, setSelectedTool] = useState<Tool>('pen');
  const [currentColor, setCurrentColor] = useState<string>(INITIAL_COLOR);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [history, setHistory] = useState<string[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sizeInput, setSizeInput] = useState<string>(project.width.toString());
  const [showRightPanel, setShowRightPanel] = useState(false);
  
  // AI States
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // AI Animation States
  const [isAiAnimModalOpen, setIsAiAnimModalOpen] = useState(false);
  const [aiAnimPrompt, setAiAnimPrompt] = useState('');
  const [isGeneratingAnim, setIsGeneratingAnim] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const animationIntervalRef = useRef<number | null>(null);

  const currentFrame = project.frames[project.currentFrameIndex];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  const addToHistory = useCallback((data: string[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...data]);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const isCanvasEmpty = useCallback(() => {
    return currentFrame.data.every(pixel => pixel === 'transparent');
  }, [currentFrame]);

  const applyNewSize = (newSize: number) => {
    if (isNaN(newSize) || newSize < 4 || newSize > 512) {
      setSizeInput(project.width.toString());
      return;
    }
    const performResize = () => {
      const newProject: PixelProject = {
        width: newSize, height: newSize,
        frames: [{ id: Date.now().toString(), data: new Array(newSize * newSize).fill('transparent') }],
        currentFrameIndex: 0, fps: project.fps,
      };
      setProject(newProject);
      setSizeInput(newSize.toString());
      setHistory([]); setHistoryIndex(-1);
    };
    if (isCanvasEmpty() || confirm(`¿Cambiar tamaño a ${newSize}x${newSize}? Se borrará el dibujo.`)) performResize();
    else setSizeInput(project.width.toString());
  };

  const addFrame = () => {
    const newFrame: Frame = { id: Date.now().toString(), data: new Array(project.width * project.height).fill('transparent') };
    setProject(prev => ({ ...prev, frames: [...prev.frames, newFrame], currentFrameIndex: prev.frames.length }));
  };

  const duplicateFrame = () => {
    const currentData = [...project.frames[project.currentFrameIndex].data];
    const newFrame: Frame = { id: Date.now().toString(), data: currentData };
    const newFrames = [...project.frames];
    newFrames.splice(project.currentFrameIndex + 1, 0, newFrame);
    setProject(prev => ({ ...prev, frames: newFrames, currentFrameIndex: prev.currentFrameIndex + 1 }));
  };

  const deleteFrame = (index: number) => {
    if (project.frames.length <= 1) return;
    const newFrames = project.frames.filter((_, i) => i !== index);
    setProject(prev => ({ ...prev, frames: newFrames, currentFrameIndex: Math.min(prev.currentFrameIndex, newFrames.length - 1) }));
  };

  const updatePixel = (index: number, color: string) => {
    const newData = [...currentFrame.data];
    if (newData[index] === color) return;
    newData[index] = color;
    const newFrames = [...project.frames];
    newFrames[project.currentFrameIndex] = { ...currentFrame, data: newData };
    setProject(prev => ({ ...prev, frames: newFrames }));
    addToHistory(newData);
  };

  const floodFill = (index: number, targetColor: string, replacementColor: string) => {
    if (targetColor === replacementColor) return;
    const newData = [...currentFrame.data];
    const { width } = project;
    const stack = [index];
    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (newData[curr] === targetColor) {
        newData[curr] = replacementColor;
        const x = curr % width;
        const y = Math.floor(curr / width);
        if (x > 0) stack.push(curr - 1);
        if (x < width - 1) stack.push(curr + 1);
        if (y > 0) stack.push(curr - width);
        if (y < project.height - 1) stack.push(curr + width);
      }
    }
    const newFrames = [...project.frames];
    newFrames[project.currentFrameIndex] = { ...currentFrame, data: newData };
    setProject(prev => ({ ...prev, frames: newFrames }));
    addToHistory(newData);
  };

  const getFrameAsBase64 = () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = project.width;
    tempCanvas.height = project.height;
    const ctx = tempCanvas.getContext('2d')!;
    currentFrame.data.forEach((color, i) => {
      if (color !== 'transparent') {
        ctx.fillStyle = color;
        ctx.fillRect(i % project.width, Math.floor(i / project.width), 1, 1);
      }
    });
    return tempCanvas.toDataURL('image/png').split(',')[1];
  };

  const processSpriteSheet = (img: HTMLImageElement) => {
    try {
      const cols = 2;
      const rows = 2;
      const srcFrameWidth = img.width / cols;
      const srcFrameHeight = img.height / rows;
      
      const targetWidth = project.width;
      const targetHeight = project.height;
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = targetWidth;
      tempCanvas.height = targetHeight;
      const ctx = tempCanvas.getContext('2d', { willReadFrequently: true })!;

      const newFrames: Frame[] = [];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            img, 
            c * srcFrameWidth, r * srcFrameHeight, srcFrameWidth, srcFrameHeight,
            0, 0, targetWidth, targetHeight
          );
          
          const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
          const pixels = imageData.data;
          const frameData: string[] = [];
          
          for (let i = 0; i < pixels.length; i += 4) {
            const a = pixels[i + 3];
            if (a < 128 || (pixels[i] > 240 && pixels[i+1] > 240 && pixels[i+2] > 240)) {
              frameData.push('transparent');
            } else {
              const hex = `#${((1 << 24) + (pixels[i] << 16) + (pixels[i+1] << 8) + pixels[i+2]).toString(16).slice(1)}`;
              frameData.push(hex);
            }
          }
          newFrames.push({ id: `ai-${Date.now()}-${r}-${c}`, data: frameData });
        }
      }

      setProject(prev => ({
        ...prev,
        frames: [...prev.frames, ...newFrames],
        currentFrameIndex: prev.frames.length + newFrames.length - 1
      }));
    } catch (err) {
      console.error("Error procesando Sprite Sheet:", err);
      alert("Error al procesar la animación.");
    }
  };

  const handleAiAnimation = async () => {
    if (!aiAnimPrompt || isCanvasEmpty()) return;
    setIsGeneratingAnim(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const currentBase64 = getFrameAsBase64();

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: currentBase64, mimeType: 'image/png' } },
            { text: `Based on this pixel art character, generate a professional sprite sheet with 4 animation frames for: "${aiAnimPrompt}". Layout: 2x2 grid. Background: Solid White. Keep colors consistent.` }
          ]
        },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });

      const base64 = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
      if (base64) {
        const img = new Image();
        img.onload = () => {
          processSpriteSheet(img);
          setIsGeneratingAnim(false);
          setIsAiAnimModalOpen(false);
          setAiAnimPrompt('');
        };
        img.src = `data:image/png;base64,${base64}`;
      }
    } catch (e) {
      console.error(e);
      setIsGeneratingAnim(false);
      alert("Error de IA. Intenta de nuevo.");
    }
  };

  const generateSpriteWithAi = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Single pixel art game asset: ${aiPrompt}. 2D sprite, white background.` }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      const base64 = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
      if (base64) {
        const img = new Image();
        img.onload = () => {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = project.width; tempCanvas.height = project.height;
          const ctx = tempCanvas.getContext('2d')!;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, project.width, project.height);
          const imageData = ctx.getImageData(0, 0, project.width, project.height).data;
          const newData: string[] = [];
          for(let i=0; i<imageData.length; i+=4) {
            if(imageData[i+3] < 128 || (imageData[i]>245 && imageData[i+1]>245 && imageData[i+2]>245)) newData.push('transparent');
            else newData.push(`#${((1 << 24) + (imageData[i] << 16) + (imageData[i+1] << 8) + imageData[i+2]).toString(16).slice(1)}`);
          }
          setProject(prev => {
            const newFrames = [...prev.frames];
            newFrames[prev.currentFrameIndex] = { ...newFrames[prev.currentFrameIndex], data: newData };
            return { ...prev, frames: newFrames };
          });
          setIsGenerating(false); setIsAiModalOpen(false); setAiPrompt('');
        };
        img.src = `data:image/png;base64,${base64}`;
      }
    } catch (e) { console.error(e); setIsGenerating(false); }
  };

  const handleCanvasInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.cancelable) e.preventDefault();
    const container = e.currentTarget as HTMLDivElement;
    const rect = container.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX; clientY = (e as React.MouseEvent).clientY;
    }
    const x = Math.floor(((clientX - rect.left) / rect.width) * project.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * project.height);
    if (x >= 0 && x < project.width && y >= 0 && y < project.height) {
      const index = y * project.width + x;
      if (selectedTool === 'pen') updatePixel(index, currentColor);
      else if (selectedTool === 'eraser') updatePixel(index, 'transparent');
      else if (selectedTool === 'bucket') floodFill(index, currentFrame.data[index], currentColor);
      else if (selectedTool === 'picker') {
        const color = currentFrame.data[index];
        if (color !== 'transparent') setCurrentColor(color);
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pixelSize = canvas.width / project.width;
    currentFrame.data.forEach((color, i) => {
      if (color !== 'transparent') {
        const x = (i % project.width) * pixelSize;
        const y = Math.floor(i / project.width) * pixelSize;
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(pixelSize), Math.ceil(pixelSize));
      }
    });
  }, [currentFrame, project.width]);

  useEffect(() => {
    let frameIdx = 0;
    if (isPlaying) {
      animationIntervalRef.current = window.setInterval(() => {
        const previewCanvas = previewRef.current; if (!previewCanvas) return;
        const ctx = previewCanvas.getContext('2d'); if (!ctx) return;
        const currentAnimFrame = project.frames[frameIdx];
        if (!currentAnimFrame) { frameIdx = 0; return; }
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        const pixelSize = previewCanvas.width / project.width;
        currentAnimFrame.data.forEach((color, i) => {
          if (color !== 'transparent') {
            const x = (i % project.width) * pixelSize;
            const y = Math.floor(i / project.width) * pixelSize;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, pixelSize, pixelSize);
          }
        });
        frameIdx = (frameIdx + 1) % project.frames.length;
      }, 1000 / project.fps);
    }
    return () => { if (animationIntervalRef.current) clearInterval(animationIntervalRef.current); };
  }, [isPlaying, project.frames, project.width, project.fps]);

  return (
    <div className="flex flex-col h-full w-full select-none bg-zinc-950 overflow-hidden font-sans">
      {/* AI Sprites Modal */}
      {isAiModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in-95 overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-400"><Sparkles size={20} /><h2 className="font-semibold text-white">Crear Personaje</h2></div>
              <button onClick={() => setIsAiModalOpen(false)} className="text-zinc-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <textarea 
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe tu personaje... ej: Caballero oscuro pixelado"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 min-h-[100px] resize-none"
              />
              <button onClick={generateSpriteWithAi} disabled={isGenerating || !aiPrompt} className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg">
                {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />} Generar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Animation Modal */}
      {isAiAnimModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in-95 overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-400"><Film size={20} /><h2 className="font-semibold text-white">Animación IA</h2></div>
              <button onClick={() => setIsAiAnimModalOpen(false)} className="text-zinc-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-4 mb-2 p-3 bg-zinc-800/50 rounded-xl border border-zinc-700">
                 <div className="w-16 h-16 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
                    <FrameThumb frame={currentFrame} width={project.width} />
                 </div>
                 <div className="flex-1">
                   <p className="text-[10px] text-zinc-400 uppercase font-black mb-1">Base de animación</p>
                   <p className="text-xs text-zinc-300">La IA dibujará el movimiento para este frame.</p>
                 </div>
              </div>
              <textarea 
                value={aiAnimPrompt}
                onChange={(e) => setAiAnimPrompt(e.target.value)}
                placeholder="Acción a realizar... ej: Caminando de lado"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 min-h-[100px] resize-none"
              />
              <button 
                onClick={handleAiAnimation} 
                disabled={isGeneratingAnim || !aiAnimPrompt || isCanvasEmpty()} 
                className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20"
              >
                {isGeneratingAnim ? <Loader2 className="animate-spin" /> : <Wand2 size={18} />} 
                {isGeneratingAnim ? "Procesando frames..." : "Animar (4 cuadros)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none h-16 border-b border-zinc-800 flex items-center justify-between px-4 sm:px-6 bg-zinc-900/50 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          {/* Logo Representation */}
          <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl flex flex-col items-center justify-center shadow-lg border border-purple-400/30">
            <div className="flex gap-1 mb-0.5">
               <div className="w-2 h-2 bg-cyan-300 rounded-sm animate-pulse"></div>
               <div className="w-2 h-2 bg-cyan-300 rounded-sm animate-pulse"></div>
            </div>
            <div className="w-5 h-2 bg-purple-900/40 rounded-full"></div>
          </div>
          <div className="flex flex-col -gap-1">
             <h1 className="font-black text-lg tracking-tighter text-white leading-none">PixeAI</h1>
             <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest leading-none">One</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowRightPanel(!showRightPanel)} 
            className={`md:hidden p-2 rounded-xl transition-all ${showRightPanel ? 'bg-cyan-600 text-white' : 'text-zinc-400 bg-zinc-800'}`}
          >
            <Settings2 size={18} />
          </button>
          <button onClick={() => {
              const canvas = document.createElement('canvas'); canvas.width = project.width; canvas.height = project.height;
              const ctx = canvas.getContext('2d')!;
              currentFrame.data.forEach((color, i) => { if (color !== 'transparent') { ctx.fillStyle = color; ctx.fillRect(i % project.width, Math.floor(i / project.width), 1, 1); }});
              const link = document.createElement('a'); link.download = "sprite.png"; link.href = canvas.toDataURL(); link.click();
            }} className="bg-cyan-600 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-600/20 hover:bg-cyan-500 transition-all active:scale-95">
            <Download size={14} /> Exportar
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <aside className="hidden md:flex w-20 border-r border-zinc-800 flex-col items-center py-8 gap-6 bg-zinc-900/40">
          <ToolButton icon={<Pencil size={22} />} active={selectedTool === 'pen'} onClick={() => setSelectedTool('pen')} title="Lápiz" />
          <ToolButton icon={<Eraser size={22} />} active={selectedTool === 'eraser'} onClick={() => setSelectedTool('eraser')} title="Borrador" />
          <ToolButton icon={<PaintBucket size={22} />} active={selectedTool === 'bucket'} onClick={() => setSelectedTool('bucket')} title="Cubo" />
          <ToolButton icon={<Pipette size={22} />} active={selectedTool === 'picker'} onClick={() => setSelectedTool('picker')} title="Gotero" />
          <div className="h-px w-10 bg-zinc-800" />
          <button onClick={() => setIsAiModalOpen(true)} className="p-3.5 rounded-2xl bg-purple-600/10 text-purple-400 hover:bg-purple-600 hover:text-white transition-all shadow-xl active:scale-90"><Sparkles size={22} /></button>
          <button onClick={() => setIsAiAnimModalOpen(true)} className="p-3.5 rounded-2xl bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600 hover:text-white transition-all shadow-xl active:scale-90"><Film size={22} /></button>
          <div className="mt-auto">
            <div className="w-10 h-10 rounded-2xl border-2 border-zinc-700 relative overflow-hidden cursor-pointer shadow-inner" style={{ backgroundColor: currentColor }}>
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} />
            </div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col bg-zinc-950 relative overflow-hidden items-center justify-center p-4">
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900/90 border border-zinc-800 px-6 py-3 rounded-2xl z-20 shadow-2xl backdrop-blur-xl">
             <button 
                onClick={() => setIsPlaying(!isPlaying)} 
                className={`p-2 rounded-xl transition-all ${isPlaying ? 'bg-red-500/20 text-red-400' : 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600 hover:text-white'}`}
                title={isPlaying ? "Pausar" : "Reproducir"}
             >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
             </button>
             <div className="w-px h-6 bg-zinc-800 mx-2" />
             <div className="flex items-center gap-2">
                <button onClick={() => setZoom(Math.max(0.1, zoom - 0.1))} className="text-zinc-400 hover:text-white transition-colors"><ChevronLeft size={18} /></button>
                <span className="text-xs font-mono text-zinc-400 min-w-[4ch] text-center font-bold">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(Math.min(5, zoom + 0.1))} className="text-zinc-400 hover:text-white transition-colors"><ChevronRight size={18} /></button>
             </div>
             <button onClick={() => setShowGrid(!showGrid)} className={`p-1.5 rounded-lg transition-colors ${showGrid ? 'text-cyan-400 bg-cyan-400/10' : 'text-zinc-500'}`}><Grid3X3 size={20} /></button>
          </div>

          <div 
            className={`relative shadow-2xl transition-all duration-75 cursor-crosshair touch-none ${showGrid ? 'dark-pixel-grid' : 'bg-zinc-900/20'}`}
            style={{ 
              width: `${Math.min(window.innerWidth - 80, window.innerHeight - 350) * zoom}px`, 
              height: `${Math.min(window.innerWidth - 80, window.innerHeight - 350) * zoom}px`,
              outline: '1px solid #3f3f46'
            }}
            onMouseDown={handleCanvasInteraction}
            onMouseMove={(e) => e.buttons === 1 && handleCanvasInteraction(e)}
            onTouchStart={handleCanvasInteraction}
            onTouchMove={handleCanvasInteraction}
          >
            <canvas ref={canvasRef} width={2048} height={2048} className="w-full h-full image-render-pixel" />
          </div>

          {/* Mobile bottom tools */}
          <div className="md:hidden mt-6 flex gap-2 bg-zinc-900/90 p-2 rounded-2xl border border-zinc-800 shadow-xl overflow-x-auto max-w-full no-scrollbar">
             <ToolButton icon={<Pencil size={20} />} active={selectedTool === 'pen'} onClick={() => setSelectedTool('pen')} title="" />
             <ToolButton icon={<Eraser size={20} />} active={selectedTool === 'eraser'} onClick={() => setSelectedTool('eraser')} title="" />
             <ToolButton icon={<PaintBucket size={20} />} active={selectedTool === 'bucket'} onClick={() => setSelectedTool('bucket')} title="" />
             <button onClick={() => setIsAiModalOpen(true)} className="p-3 rounded-xl bg-purple-600 text-white min-w-[44px]"><Sparkles size={20} /></button>
             <button onClick={() => setIsAiAnimModalOpen(true)} className="p-3 rounded-xl bg-cyan-600 text-white min-w-[44px]"><Film size={20} /></button>
          </div>
        </section>

        {/* REFACTORED RIGHT PANEL */}
        <aside className={`${showRightPanel ? 'fixed inset-0 z-40 bg-zinc-950 flex' : 'hidden md:flex'} md:static w-full md:w-80 border-l border-zinc-800 bg-zinc-900/20 flex-col overflow-y-auto overflow-x-hidden`}>
          <div className="md:hidden flex items-center justify-between p-6 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
             <h2 className="text-white font-bold flex items-center gap-2 text-cyan-400"><Settings2 size={18} /> Configuración</h2>
             <button onClick={() => setShowRightPanel(false)} className="text-zinc-400 p-2 hover:bg-zinc-800 rounded-lg"><X size={24} /></button>
          </div>

          {/* SECTION 1: CANVAS SIZE */}
          <div className="p-6 border-b border-zinc-800">
            <h3 className="text-[11px] font-black uppercase text-zinc-500 mb-6 flex items-center gap-2 tracking-widest">
              <Maximize size={14} className="text-cyan-400" /> Tamaño de Lienzo
            </h3>
            <div className="space-y-6">
              <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus-within:border-cyan-500/50 transition-colors">
                <input 
                  type="number" 
                  value={sizeInput} 
                  onChange={(e) => setSizeInput(e.target.value)} 
                  onBlur={() => applyNewSize(parseInt(sizeInput))} 
                  onKeyDown={(e) => e.key === 'Enter' && applyNewSize(parseInt(sizeInput))} 
                  className="flex-1 bg-transparent text-sm text-white text-center font-mono focus:outline-none" 
                />
                <button 
                  onClick={() => applyNewSize(parseInt(sizeInput))} 
                  className="p-1.5 bg-cyan-600 rounded-lg text-white hover:bg-cyan-500 transition-colors shadow-lg shadow-cyan-600/20"
                  title="Redimensionar"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[16, 32, 64, 128].map((s) => (
                  <button 
                    key={s} 
                    onClick={() => { setSizeInput(s.toString()); applyNewSize(s); }} 
                    className={`py-2.5 px-1 rounded-xl text-[10px] font-black transition-all border ${project.width === s ? 'bg-cyan-600 text-white border-cyan-500 shadow-lg' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-white'}`}
                  >
                    {s} x {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 2: PREVIEW */}
          <div className="p-6 border-b border-zinc-800 bg-zinc-900/10">
            <div className="flex items-center justify-between mb-6">
               <h3 className="text-[11px] font-black uppercase text-zinc-500 flex items-center gap-2 tracking-widest">
                 <MonitorPlay size={14} className="text-cyan-400" /> Previsualización
               </h3>
               <button 
                onClick={() => setIsAiAnimModalOpen(true)} 
                className="p-1.5 bg-cyan-600/10 text-cyan-400 rounded-lg border border-cyan-400/20 hover:bg-cyan-600 hover:text-white transition-all group"
                title="Generar animación con IA"
               >
                 <Wand2 size={14} className="group-hover:rotate-12 transition-transform" />
               </button>
            </div>
            <div className="aspect-square w-full bg-black/40 rounded-2xl overflow-hidden flex items-center justify-center border border-zinc-800 dark-pixel-grid relative group">
               <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
               <canvas ref={previewRef} width={256} height={256} className="w-4/5 h-4/5 image-render-pixel" />
            </div>
          </div>

          {/* SECTION 3: ANIMATION SETTINGS */}
          <div className="p-6">
            <h3 className="text-[11px] font-black uppercase text-zinc-500 mb-6 flex items-center gap-2 tracking-widest">
              <Sliders size={14} className="text-cyan-400" /> Ajustes de Animación
            </h3>
            <div className="space-y-6">
              <button 
                onClick={() => setIsPlaying(!isPlaying)} 
                className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl transition font-black text-xs uppercase tracking-wider ${isPlaying ? 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-lg shadow-red-500/10' : 'bg-cyan-600 text-white shadow-xl shadow-cyan-600/30 hover:bg-cyan-500'}`}
              >
                {isPlaying ? <><Pause size={18} fill="currentColor" /> Detener Preview</> : <><Play size={18} fill="currentColor" /> Iniciar Preview</>}
              </button>
              
              <div className="flex flex-col gap-4 bg-zinc-800/40 px-5 py-4 rounded-2xl border border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-black uppercase tracking-tighter">Velocidad Actual</span>
                  <span className="text-sm font-mono font-bold text-cyan-400">{project.fps} FPS</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="60" 
                  value={project.fps} 
                  onChange={(e) => setProject(p => ({ ...p, fps: parseInt(e.target.value) }))} 
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between px-1">
                   <span className="text-[9px] text-zinc-600 font-bold">1</span>
                   <span className="text-[9px] text-zinc-600 font-bold">30</span>
                   <span className="text-[9px] text-zinc-600 font-bold">60</span>
                </div>
              </div>

              {/* FPS Presets in Sidebar too for convenience */}
              <div className="flex flex-wrap gap-2">
                {[5, 12, 24, 30].map(fps => (
                  <button 
                    key={fps}
                    onClick={() => setProject(p => ({ ...p, fps }))}
                    className={`flex-1 min-w-[60px] py-2 rounded-xl text-[10px] font-bold transition-all border ${project.fps === fps ? 'bg-zinc-800 text-cyan-400 border-cyan-500/50' : 'bg-zinc-900/50 text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 mt-auto bg-zinc-900/40 border-t border-zinc-800">
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-[10px] font-black uppercase text-zinc-500">Estado</h3>
               <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                 <Save size={10} className="text-green-500" />
                 <span className="text-[9px] font-black text-green-500 uppercase tracking-tighter">Local Storage</span>
               </div>
             </div>
             <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">Proyecto: <span className="text-white">{project.width}x{project.height} px</span></p>
             <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">Frames: <span className="text-white">{project.frames.length}</span></p>
          </div>
        </aside>
      </main>

      <footer className="flex-none h-44 border-t border-zinc-800 bg-zinc-900/90 flex flex-col z-20">
        <div className="h-14 flex items-center px-4 sm:px-6 border-b border-zinc-800 justify-between bg-zinc-900/50">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-zinc-500 flex items-center gap-2"><Layers size={14} /> Timeline</span>
                <button 
                  onClick={() => setIsPlaying(!isPlaying)} 
                  className={`p-2 rounded-xl transition-all ${isPlaying ? 'text-red-400 bg-red-400/10 ring-1 ring-red-400/30' : 'text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 shadow-sm'}`}
                >
                  {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
              </div>
              
              <div className="h-8 w-px bg-zinc-800 hidden sm:block" />

              {/* Enhanced Speed Controls */}
              <div className="hidden sm:flex items-center gap-4">
                 <div className="flex items-center gap-2">
                    <Clock size={14} className="text-zinc-500" />
                    <span className="text-[10px] font-black uppercase text-zinc-500">Velocidad:</span>
                 </div>
                 <div className="flex gap-1">
                    {[1, 5, 10, 12, 24].map(fps => (
                      <button 
                        key={fps} 
                        onClick={() => setProject(p => ({ ...p, fps }))}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${project.fps === fps ? 'bg-cyan-600 text-white shadow-lg' : 'bg-zinc-800 text-zinc-500 hover:text-white'}`}
                      >
                        {fps}
                      </button>
                    ))}
                 </div>
                 <div className="flex items-center gap-2 w-24 sm:w-32">
                    <input 
                      type="range" 
                      min="1" 
                      max="60" 
                      value={project.fps} 
                      onChange={(e) => setProject(p => ({ ...p, fps: parseInt(e.target.value) }))} 
                      className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-[10px] font-mono font-bold text-cyan-400 w-8 text-right">{project.fps}</span>
                 </div>
              </div>
           </div>

           <div className="flex gap-4">
              <button onClick={addFrame} className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1.5 uppercase font-black transition-colors bg-zinc-800/50 px-3 py-1.5 rounded-xl border border-zinc-700/50 hover:bg-zinc-800"><Plus size={14} /> Nuevo Frame</button>
              <button onClick={duplicateFrame} className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1.5 uppercase font-black transition-colors bg-zinc-800/50 px-3 py-1.5 rounded-xl border border-zinc-700/50 hover:bg-zinc-800"><Layers size={14} /> Clonar</button>
           </div>
        </div>
        
        {/* Mobile Speed Bar */}
        <div className="sm:hidden h-8 flex items-center px-4 bg-zinc-950/50 border-b border-zinc-800/50 gap-4 overflow-x-auto no-scrollbar">
            <span className="text-[8px] font-black uppercase text-zinc-600 whitespace-nowrap">Velocidad:</span>
            <input 
              type="range" 
              min="1" 
              max="60" 
              value={project.fps} 
              onChange={(e) => setProject(p => ({ ...p, fps: parseInt(e.target.value) }))} 
              className="min-w-[100px] flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <span className="text-[10px] font-mono font-bold text-cyan-400 min-w-[30px]">{project.fps} FPS</span>
        </div>

        <div className="flex-1 flex overflow-x-auto items-center px-4 sm:px-6 gap-4 py-3 scrollbar-hide">
           {project.frames.map((frame, idx) => (
             <div key={frame.id} onClick={() => setProject(p => ({ ...p, currentFrameIndex: idx }))} className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 transition-all cursor-pointer overflow-hidden ${project.currentFrameIndex === idx ? 'border-cyan-500 ring-4 ring-cyan-500/20 scale-105 z-10 shadow-2xl' : 'border-zinc-800 hover:border-zinc-700 shadow-lg'}`}>
                <div className="absolute top-1 left-1 text-[8px] font-black bg-black/80 px-1.5 py-0.5 rounded-md text-white z-10 backdrop-blur-sm border border-white/10">{idx + 1}</div>
                {project.currentFrameIndex === idx && project.frames.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); deleteFrame(idx); }} className="absolute bottom-1 right-1 bg-red-600/90 hover:bg-red-500 p-1.5 rounded-lg z-20 shadow-lg active:scale-90"><Trash2 size={12} /></button>
                )}
                <FrameThumb frame={frame} width={project.width} />
             </div>
           ))}
        </div>
      </footer>
    </div>
  );
};

const ToolButton = ({ icon, active, onClick, title }: { icon: React.ReactNode, active: boolean, onClick: () => void, title: string }) => (
  <button onClick={onClick} title={title} className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all duration-300 active:scale-90 ${active ? 'bg-cyan-600 text-white shadow-xl shadow-cyan-600/30' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}>{icon}</button>
);

const FrameThumb = ({ frame, width }: { frame: Frame, width: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!; const pixelSize = canvas.width / width;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame.data.forEach((color, i) => { if (color !== 'transparent') { ctx.fillStyle = color; ctx.fillRect(Math.floor((i % width) * pixelSize), Math.floor(Math.floor(i / width) * pixelSize), Math.ceil(pixelSize), Math.ceil(pixelSize)); }});
  }, [frame, width]);
  return <canvas ref={canvasRef} width={80} height={80} className="w-full h-full image-render-pixel pointer-events-none" />;
};

export default App;
