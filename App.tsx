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
  Settings2,
  Wand2,
  Film,
  MonitorPlay,
  Sliders,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { Tool, Frame, PixelProject } from './types';

const STORAGE_KEY = 'pixeai_one_v2_data';
const DEFAULT_SIZE = 32;
const INITIAL_COLOR = '#06b6d4';

const App: React.FC = () => {
  const createDefaultProject = (): PixelProject => ({
    width: DEFAULT_SIZE,
    height: DEFAULT_SIZE,
    frames: [{ id: 'init-1', data: new Array(DEFAULT_SIZE * DEFAULT_SIZE).fill('transparent') }],
    currentFrameIndex: 0,
    fps: 10,
  });

  const loadInitialProject = (): PixelProject => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return createDefaultProject();
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.frames) && parsed.frames.length > 0) return parsed;
    } catch (e) { console.error(e); }
    return createDefaultProject();
  };

  const [project, setProject] = useState<PixelProject>(loadInitialProject);
  const [selectedTool, setSelectedTool] = useState<Tool>('pen');
  const [currentColor, setCurrentColor] = useState<string>(INITIAL_COLOR);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const animationIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  const currentFrame = project.frames[project.currentFrameIndex] || project.frames[0];

  const updatePixel = (index: number, color: string) => {
    if (!currentFrame) return;
    const newData = [...currentFrame.data];
    if (newData[index] === color) return;
    newData[index] = color;
    const newFrames = [...project.frames];
    newFrames[project.currentFrameIndex] = { ...currentFrame, data: newData };
    setProject(prev => ({ ...prev, frames: newFrames }));
  };

  const floodFill = (index: number, targetColor: string, replacementColor: string) => {
    if (targetColor === replacementColor) return;
    const newData = [...currentFrame.data];
    const stack = [index];
    const w = project.width;
    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (newData[curr] === targetColor) {
        newData[curr] = replacementColor;
        const x = curr % w;
        const y = Math.floor(curr / w);
        if (x > 0) stack.push(curr - 1);
        if (x < w - 1) stack.push(curr + 1);
        if (y > 0) stack.push(curr - w);
        if (y < project.height - 1) stack.push(curr + w);
      }
    }
    const newFrames = [...project.frames];
    newFrames[project.currentFrameIndex] = { ...currentFrame, data: newData };
    setProject(prev => ({ ...prev, frames: newFrames }));
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
      else if (selectedTool === 'picker' && currentFrame.data[index] !== 'transparent') setCurrentColor(currentFrame.data[index]);
    }
  };

  const generateWithAi = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Pixel art character: ${aiPrompt}. Style: Professional game asset, 32x32 look, solid white background, centered.` }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });

      const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (!part?.inlineData) throw new Error("No image data");

      const img = new Image();
      img.src = `data:image/png;base64,${part.inlineData.data}`;
      await img.decode();

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = project.width;
      tempCanvas.height = project.height;
      const ctx = tempCanvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, project.width, project.height);
      
      const imageData = ctx.getImageData(0, 0, project.width, project.height).data;
      const newData: string[] = [];
      for(let i=0; i<imageData.length; i+=4) {
        const r = imageData[i], g = imageData[i+1], b = imageData[i+2], a = imageData[i+3];
        if (a < 128 || (r > 240 && g > 240 && b > 240)) newData.push('transparent');
        else newData.push(`#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`);
      }

      setProject(prev => {
        const newFrames = [...prev.frames];
        newFrames[prev.currentFrameIndex] = { ...newFrames[prev.currentFrameIndex], data: newData };
        return { ...prev, frames: newFrames };
      });
      setIsAiModalOpen(false);
      setAiPrompt('');
    } catch (e) {
      console.error(e);
      alert("Error al generar con IA. Verifica tu conexión.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Dibujar canvas principal
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pSize = canvas.width / project.width;
    currentFrame.data.forEach((color, i) => {
      if (color !== 'transparent') {
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor((i % project.width) * pSize), Math.floor(Math.floor(i / project.width) * pSize), Math.ceil(pSize), Math.ceil(pSize));
      }
    });
  }, [currentFrame, project.width]);

  // Preview de animación
  useEffect(() => {
    let frameIdx = 0;
    if (isPlaying) {
      animationIntervalRef.current = window.setInterval(() => {
        const canvas = previewRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const f = project.frames[frameIdx];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pSize = canvas.width / project.width;
        f.data.forEach((c, i) => {
          if (c !== 'transparent') {
            ctx.fillStyle = c;
            ctx.fillRect((i % project.width) * pSize, Math.floor(i / project.width) * pSize, pSize, pSize);
          }
        });
        frameIdx = (frameIdx + 1) % project.frames.length;
      }, 1000 / project.fps);
    }
    return () => { if (animationIntervalRef.current) clearInterval(animationIntervalRef.current); };
  }, [isPlaying, project.frames, project.fps, project.width]);

  return (
    <div className="flex flex-col h-full w-full select-none bg-zinc-950 text-white overflow-hidden">
      <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-6 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center font-black italic shadow-lg shadow-cyan-500/20">P</div>
          <h1 className="font-black text-xl tracking-tighter">PixeAI <span className="text-cyan-500">One</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsAiModalOpen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg shadow-purple-600/20">
            <Sparkles size={14} /> Crear con IA
          </button>
          <button onClick={() => {
            const canvas = document.createElement('canvas');
            canvas.width = project.width; canvas.height = project.height;
            const ctx = canvas.getContext('2d')!;
            currentFrame.data.forEach((c, i) => { if (c!=='transparent') { ctx.fillStyle=c; ctx.fillRect(i%project.width, Math.floor(i/project.width), 1, 1); }});
            const link = document.createElement('a');
            link.download = "sprite.png"; link.href = canvas.toDataURL(); link.click();
          }} className="bg-zinc-800 hover:bg-zinc-700 p-2 rounded-xl" title="Exportar">
            <Download size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-20 border-r border-zinc-900 flex flex-col items-center py-6 gap-6 bg-zinc-900/20">
          <ToolBtn icon={<Pencil size={20}/>} active={selectedTool==='pen'} onClick={()=>setSelectedTool('pen')} />
          <ToolBtn icon={<Eraser size={20}/>} active={selectedTool==='eraser'} onClick={()=>setSelectedTool('eraser')} />
          <ToolBtn icon={<PaintBucket size={20}/>} active={selectedTool==='bucket'} onClick={()=>setSelectedTool('bucket')} />
          <ToolBtn icon={<Pipette size={20}/>} active={selectedTool==='picker'} onClick={()=>setSelectedTool('picker')} />
          <div className="h-px w-8 bg-zinc-900" />
          <div className="w-10 h-10 rounded-xl border-2 border-zinc-800 relative cursor-pointer shadow-inner overflow-hidden" style={{backgroundColor: currentColor}}>
             <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={currentColor} onChange={e=>setCurrentColor(e.target.value)} />
          </div>
        </aside>

        <section className="flex-1 relative flex items-center justify-center p-10 bg-zinc-950 overflow-hidden">
          <div 
            className={`relative shadow-2xl cursor-crosshair touch-none transition-all ${showGrid ? 'dark-pixel-grid' : 'bg-zinc-900'}`}
            style={{ 
              width: `${Math.min(window.innerWidth - 400, window.innerHeight - 350) * zoom}px`, 
              height: `${Math.min(window.innerWidth - 400, window.innerHeight - 350) * zoom}px`,
            }}
            onMouseDown={handleCanvasInteraction}
            onMouseMove={e => e.buttons === 1 && handleCanvasInteraction(e)}
            onTouchStart={handleCanvasInteraction}
            onTouchMove={handleCanvasInteraction}
          >
            <canvas ref={canvasRef} width={1024} height={1024} className="w-full h-full image-render-pixel" />
          </div>
          
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900 border border-zinc-800 p-3 rounded-2xl shadow-2xl backdrop-blur-xl">
            <button onClick={()=>setZoom(Math.max(0.1, zoom-0.1))} className="p-2 hover:bg-zinc-800 rounded-lg"><ChevronLeft size={16}/></button>
            <span className="text-[10px] font-bold font-mono w-12 text-center text-zinc-400">{Math.round(zoom*100)}%</span>
            <button onClick={()=>setZoom(Math.min(3, zoom+0.1))} className="p-2 hover:bg-zinc-800 rounded-lg"><ChevronRight size={16}/></button>
            <div className="w-px h-6 bg-zinc-800" />
            <button onClick={()=>setShowGrid(!showGrid)} className={`p-2 rounded-lg transition-colors ${showGrid?'text-cyan-400 bg-cyan-400/10':'text-zinc-500'}`}><Grid3X3 size={20}/></button>
          </div>
        </section>

        <aside className="w-72 border-l border-zinc-900 bg-zinc-900/30 flex flex-col p-6 gap-8">
           <div>
             <h3 className="text-[10px] font-black uppercase text-zinc-500 mb-4 tracking-widest flex items-center gap-2"><Sliders size={12}/> Tamaño</h3>
             <div className="grid grid-cols-2 gap-2">
               {[16, 32, 64, 128].map(s => (
                 <button key={s} onClick={() => { if(confirm("¿Cambiar tamaño? Se borrará el progreso.")) setProject({...createDefaultProject(), width: s, height: s, frames: [{id:'1', data: new Array(s*s).fill('transparent')}]}) }} className={`p-3 rounded-xl border text-[10px] font-black transition ${project.width===s ? 'border-cyan-500 text-cyan-500 bg-cyan-500/5 shadow-lg shadow-cyan-500/10':'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                   {s}x{s}
                 </button>
               ))}
             </div>
           </div>

           <div>
             <h3 className="text-[10px] font-black uppercase text-zinc-500 mb-4 tracking-widest flex items-center gap-2"><MonitorPlay size={12}/> Preview</h3>
             <div className="aspect-square w-full bg-zinc-950 rounded-2xl border border-zinc-800 flex items-center justify-center overflow-hidden dark-pixel-grid relative">
                <canvas ref={previewRef} width={256} height={256} className="w-4/5 h-4/5 image-render-pixel" />
                {!isPlaying && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Play size={24} className="text-white opacity-50"/></div>}
             </div>
             <div className="mt-4 flex flex-col gap-3">
               <button onClick={()=>setIsPlaying(!isPlaying)} className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${isPlaying ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-cyan-600 text-white'}`}>
                 {isPlaying ? <><Pause size={14}/> Pausar</> : <><Play size={14}/> Reproducir</>}
               </button>
               <div className="flex items-center justify-between px-1">
                 <span className="text-[10px] text-zinc-500 font-bold uppercase">FPS</span>
                 <input type="range" min="1" max="60" value={project.fps} onChange={e=>setProject(p=>({...p, fps:parseInt(e.target.value)}))} className="w-2/3 h-1 bg-zinc-800 rounded-lg appearance-none accent-cyan-500" />
                 <span className="text-[10px] font-mono text-cyan-400 w-6 text-right">{project.fps}</span>
               </div>
             </div>
           </div>
        </aside>
      </main>

      <footer className="h-36 border-t border-zinc-900 flex items-center px-8 bg-zinc-900/50 gap-6 overflow-hidden">
        <div className="flex flex-col items-center gap-2 flex-none">
          <button onClick={() => setProject(p => ({...p, frames: [...p.frames, {id: Date.now().toString(), data: [...project.frames[project.currentFrameIndex].data]}]}))} className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition shadow-lg">
            <Plus size={28} />
          </button>
          <span className="text-[8px] font-black text-zinc-500 uppercase tracking-tighter">Duplicar</span>
        </div>
        <div className="flex-1 flex gap-4 overflow-x-auto py-4 scrollbar-hide">
          {project.frames.map((f, i) => (
            <div 
              key={f.id} 
              onClick={() => setProject(p => ({...p, currentFrameIndex: i}))}
              className={`w-20 h-20 rounded-2xl border-2 flex-none cursor-pointer overflow-hidden transition-all relative ${project.currentFrameIndex === i ? 'border-cyan-500 scale-105 shadow-xl shadow-cyan-500/20 z-10' : 'border-zinc-800 opacity-40 grayscale hover:opacity-100'}`}
            >
              <span className="absolute top-1 left-1 text-[8px] font-black bg-black/60 px-1 rounded-sm z-20">{i+1}</span>
              <FramePreview frame={f} width={project.width} />
              {project.frames.length > 1 && project.currentFrameIndex === i && (
                <button onClick={(e) => { e.stopPropagation(); setProject(p => ({...p, frames: p.frames.filter((_, idx)=>idx!==i), currentFrameIndex: Math.max(0, i-1)})); }} className="absolute bottom-1 right-1 bg-red-600 p-1 rounded-lg text-white hover:bg-red-500 transition shadow-lg">
                  <Trash2 size={12}/>
                </button>
              )}
            </div>
          ))}
        </div>
      </footer>

      {isAiModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-8 animate-in zoom-in-95 shadow-2xl">
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-black flex items-center gap-2"><Sparkles className="text-purple-500" /> Generar Sprite IA</h2>
               <button onClick={()=>setIsAiModalOpen(false)} className="text-zinc-500 hover:text-white"><X/></button>
             </div>
             <textarea 
               className="w-full bg-black border border-zinc-800 rounded-2xl p-4 text-sm mb-6 min-h-[120px] outline-none focus:border-purple-500 transition-colors placeholder-zinc-700 text-white"
               placeholder="ej: Guerrero medieval con armadura azul, estilo píxel art 32 bits..."
               value={aiPrompt}
               onChange={e=>setAiPrompt(e.target.value)}
             />
             <button 
               onClick={generateWithAi}
               disabled={isGenerating || !aiPrompt}
               className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2"
             >
               {isGenerating ? <><Loader2 className="animate-spin" /> Generando...</> : <><Sparkles size={16}/> Crear Sprite</>}
             </button>
             <p className="text-[10px] text-zinc-500 mt-4 text-center">La IA generará el dibujo sobre el frame actual.</p>
          </div>
        </div>
      )}
    </div>
  );
};

const ToolBtn = ({icon, active, onClick}: any) => (
  <button onClick={onClick} className={`p-3 rounded-xl transition-all duration-300 ${active?'bg-cyan-500 text-white shadow-xl shadow-cyan-500/30 scale-110':'text-zinc-500 hover:text-white hover:bg-zinc-900'}`}>
    {icon}
  </button>
);

const FramePreview = ({frame, width}: {frame: Frame, width: number}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pSize = canvas.width / width;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    frame.data.forEach((c, i) => { if (c!=='transparent') { ctx.fillStyle=c; ctx.fillRect((i%width)*pSize, Math.floor(i/width)*pSize, pSize, pSize); }});
  }, [frame, width]);
  return <canvas ref={canvasRef} width={80} height={80} className="w-full h-full image-render-pixel" />;
}

export default App;