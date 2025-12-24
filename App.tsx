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
  MonitorPlay,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { Tool, Frame, PixelProject } from './types';

const STORAGE_KEY = 'pixeai_one_studio_final';
const DEFAULT_SIZE = 32;
const INITIAL_COLOR = '#06b6d4';

// Componente para recrear fielmente el logo del robot morado
const RobotLogo = () => (
  <div className="relative w-10 h-10 flex flex-col items-center justify-center">
    {/* Cabeza */}
    <div className="w-8 h-7 bg-purple-600 rounded-t-lg flex items-center justify-around px-1 relative">
      {/* Ojos Neón */}
      <div className="w-2 h-2 bg-green-400 shadow-[0_0_8px_#4ade80]" />
      <div className="w-2 h-2 bg-green-400 shadow-[0_0_8px_#4ade80]" />
      {/* Brillo superior */}
      <div className="absolute top-0.5 left-1 w-6 h-0.5 bg-purple-400 opacity-50" />
    </div>
    {/* Cuerpo */}
    <div className="w-8 h-3 flex gap-1 mt-0.5">
      <div className="flex-1 bg-purple-800 rounded-bl-sm" />
      <div className="w-5 bg-purple-700 h-4 -mt-1 rounded-sm shadow-inner" />
      <div className="flex-1 bg-purple-800 rounded-br-sm" />
    </div>
  </div>
);

const App: React.FC = () => {
  const createDefaultProject = (size: number = DEFAULT_SIZE): PixelProject => ({
    width: size,
    height: size,
    frames: [{ id: `f-${Date.now()}`, data: new Array(size * size).fill('transparent') }],
    currentFrameIndex: 0,
    fps: 10,
  });

  const loadInitialProject = (): PixelProject => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.frames) && parsed.frames.length > 0) return parsed;
      }
    } catch (e) { console.error("Error loading project:", e); }
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
  const [errorLog, setErrorLog] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const animationIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  const currentFrame = project.frames[project.currentFrameIndex] || project.frames[0];

  const updatePixel = (index: number, color: string) => {
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
    const h = project.height;
    while (stack.length > 0) {
      const curr = stack.pop()!;
      if (newData[curr] === targetColor) {
        newData[curr] = replacementColor;
        const x = curr % w;
        const y = Math.floor(curr / w);
        if (x > 0) stack.push(curr - 1);
        if (x < w - 1) stack.push(curr + 1);
        if (y > 0) stack.push(curr - w);
        if (y < h - 1) stack.push(curr + w);
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
    setErrorLog(null);
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API_KEY no detectada. Por favor, verifica tu configuración.");

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Professional pixel art sprite for game: ${aiPrompt}. 
          Flat colors, 32x32 look, centered, solid white background, sharp edges, no shadows, masterwork game asset.` }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });

      const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (!part?.inlineData) throw new Error("La IA no generó una imagen. Prueba con otra descripción.");

      const img = new Image();
      img.src = `data:image/png;base64,${part.inlineData.data}`;
      await img.decode();

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = project.width;
      tempCanvas.height = project.height;
      const ctx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, project.width, project.height);
      
      const imageData = ctx.getImageData(0, 0, project.width, project.height).data;
      const newData: string[] = [];
      
      for(let i=0; i<imageData.length; i+=4) {
        const r = imageData[i], g = imageData[i+1], b = imageData[i+2], a = imageData[i+3];
        const isBackground = (r > 240 && g > 240 && b > 240) || a < 128;
        if (isBackground) newData.push('transparent');
        else newData.push(`#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`);
      }

      setProject(prev => {
        const newFrames = [...prev.frames];
        newFrames[prev.currentFrameIndex] = { ...newFrames[prev.currentFrameIndex], data: newData };
        return { ...prev, frames: newFrames };
      });
      setIsAiModalOpen(false);
      setAiPrompt('');
    } catch (e: any) {
      console.error(e);
      setErrorLog(e.message || "Error al conectar con el servidor de IA. Revisa tu conexión.");
    } finally {
      setIsGenerating(false);
    }
  };

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

  useEffect(() => {
    let frameIdx = 0;
    if (isPlaying && project.frames.length > 0) {
      animationIntervalRef.current = window.setInterval(() => {
        const canvas = previewRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const f = project.frames[frameIdx];
        if (!f) return;
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
      {/* HEADER CON LOGO OFICIAL RESTAURADO */}
      <header className="h-20 border-b border-zinc-900 flex items-center justify-between px-8 bg-zinc-900/60 backdrop-blur-xl z-30">
        <div className="flex items-center gap-4">
          <RobotLogo />
          <div className="flex flex-col">
            <h1 className="font-black text-2xl tracking-tighter leading-none text-cyan-400">PixeAI</h1>
            <span className="text-[12px] uppercase font-bold text-white tracking-[0.2em] opacity-90">One</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <button 
            onClick={() => setIsAiModalOpen(true)} 
            className="flex items-center gap-3 bg-purple-600 hover:bg-purple-500 px-6 py-3 rounded-2xl text-xs font-black transition-all shadow-xl shadow-purple-600/30 active:scale-95 group"
          >
            <Sparkles size={18} className="group-hover:rotate-12 transition-transform" /> 
            CREAR CON IA
          </button>
          <button 
            onClick={() => {
              const canvas = document.createElement('canvas');
              canvas.width = project.width; canvas.height = project.height;
              const ctx = canvas.getContext('2d')!;
              currentFrame.data.forEach((c, i) => { if (c!=='transparent') { ctx.fillStyle=c; ctx.fillRect(i%project.width, Math.floor(i/project.width), 1, 1); }});
              const link = document.createElement('a');
              link.download = "pixeai_sprite.png"; link.href = canvas.toDataURL(); link.click();
            }} 
            className="bg-zinc-800 hover:bg-zinc-700 p-3 rounded-2xl border border-zinc-700 transition-colors shadow-lg" 
            title="Exportar"
          >
            <Download size={22} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* BARRA DE HERRAMIENTAS */}
        <aside className="w-20 border-r border-zinc-900 flex flex-col items-center py-10 gap-8 bg-zinc-900/40">
          <ToolBtn icon={<Pencil size={24}/>} active={selectedTool==='pen'} onClick={()=>setSelectedTool('pen')} />
          <ToolBtn icon={<Eraser size={24}/>} active={selectedTool==='eraser'} onClick={()=>setSelectedTool('eraser')} />
          <ToolBtn icon={<PaintBucket size={24}/>} active={selectedTool==='bucket'} onClick={()=>setSelectedTool('bucket')} />
          <ToolBtn icon={<Pipette size={24}/>} active={selectedTool==='picker'} onClick={()=>setSelectedTool('picker')} />
          <div className="h-px w-12 bg-zinc-800" />
          <div className="w-14 h-14 rounded-2xl border-2 border-zinc-700 relative cursor-pointer shadow-inner overflow-hidden ring-4 ring-black/50 hover:scale-105 transition-transform" style={{backgroundColor: currentColor}}>
             <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={currentColor} onChange={e=>setCurrentColor(e.target.value)} />
          </div>
        </aside>

        {/* ÁREA DE DIBUJO */}
        <section className="flex-1 relative flex items-center justify-center p-12 bg-zinc-950 overflow-hidden">
          <div 
            className={`relative shadow-[0_0_100px_rgba(0,0,0,0.5)] cursor-crosshair touch-none transition-all duration-500 ${showGrid ? 'dark-pixel-grid' : 'bg-zinc-900'}`}
            style={{ 
              width: `${Math.min(window.innerWidth - 480, window.innerHeight - 380) * zoom}px`, 
              height: `${Math.min(window.innerWidth - 480, window.innerHeight - 380) * zoom}px`,
              outline: '1px solid #27272a'
            }}
            onMouseDown={handleCanvasInteraction}
            onMouseMove={e => e.buttons === 1 && handleCanvasInteraction(e)}
            onTouchStart={handleCanvasInteraction}
            onTouchMove={handleCanvasInteraction}
          >
            <canvas ref={canvasRef} width={2048} height={2048} className="w-full h-full image-render-pixel" />
          </div>
          
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-5 bg-zinc-900/95 border border-zinc-800 p-5 rounded-[2rem] shadow-2xl backdrop-blur-2xl">
            <button onClick={()=>setZoom(Math.max(0.1, zoom-0.1))} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors"><ChevronLeft size={20}/></button>
            <span className="text-sm font-black font-mono w-16 text-center text-zinc-500">{Math.round(zoom*100)}%</span>
            <button onClick={()=>setZoom(Math.min(4, zoom+0.1))} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors"><ChevronRight size={20}/></button>
            <div className="w-px h-8 bg-zinc-800 mx-2" />
            <button onClick={()=>setShowGrid(!showGrid)} className={`p-3 rounded-2xl transition-all ${showGrid?'text-cyan-400 bg-cyan-400/10 ring-1 ring-cyan-400/30':'text-zinc-600 hover:text-white'}`}>
              <Grid3X3 size={26}/>
            </button>
          </div>
        </section>

        {/* PANEL DERECHO */}
        <aside className="w-80 border-l border-zinc-900 bg-zinc-900/40 flex flex-col p-8 gap-10 overflow-y-auto">
           <section>
             <h3 className="text-[12px] font-black uppercase text-zinc-500 mb-6 tracking-[0.2em] flex items-center gap-3"><Settings2 size={16}/> Ajustes</h3>
             <div className="grid grid-cols-2 gap-3">
               {[16, 32, 64, 128].map(s => (
                 <button 
                   key={s} 
                   onClick={() => { if(confirm(`¿Deseas cambiar el tamaño a ${s}x${s}?`)) setProject(createDefaultProject(s)) }} 
                   className={`p-4 rounded-2xl border-2 text-[14px] font-black transition-all ${project.width===s ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5 shadow-[0_0_20px_rgba(6,182,212,0.1)]':'border-zinc-800 text-zinc-600 hover:border-zinc-600 bg-zinc-950/50'}`}
                 >
                   {s}x{s}
                 </button>
               ))}
             </div>
           </section>

           <section>
             <h3 className="text-[12px] font-black uppercase text-zinc-500 mb-6 tracking-[0.2em] flex items-center gap-3"><MonitorPlay size={16}/> Animación</h3>
             <div className="aspect-square w-full bg-zinc-950 rounded-[2.5rem] border border-zinc-800 flex items-center justify-center overflow-hidden dark-pixel-grid relative group shadow-inner">
                <canvas ref={previewRef} width={512} height={512} className="w-4/5 h-4/5 image-render-pixel" />
                {!isPlaying && <div className="absolute inset-0 flex items-center justify-center bg-black/50 transition-colors group-hover:bg-black/30"><Play size={40} className="text-white opacity-40"/></div>}
             </div>
             <div className="mt-8 flex flex-col gap-5">
               <button 
                onClick={()=>setIsPlaying(!isPlaying)} 
                className={`w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${isPlaying ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' : 'bg-cyan-500 text-zinc-950 hover:bg-cyan-400 shadow-xl shadow-cyan-500/20'}`}
               >
                 {isPlaying ? <><Pause size={20}/> Detener</> : <><Play size={20}/> Reproducir</>}
               </button>
               <div className="flex flex-col gap-3 bg-zinc-950/50 p-5 rounded-3xl border border-zinc-800">
                 <div className="flex items-center justify-between mb-1">
                   <span className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Velocidad</span>
                   <span className="text-xs font-mono font-black text-cyan-400">{project.fps} FPS</span>
                 </div>
                 <input type="range" min="1" max="60" value={project.fps} onChange={e=>setProject(p=>({...p, fps:parseInt(e.target.value)}))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
               </div>
             </div>
           </section>
        </aside>
      </main>

      {/* TIMELINE */}
      <footer className="h-44 border-t border-zinc-900 flex items-center px-12 bg-zinc-900/60 backdrop-blur-xl gap-10 overflow-hidden">
        <div className="flex flex-col items-center gap-3 flex-none group">
          <button 
            onClick={() => setProject(p => ({...p, frames: [...p.frames, {id: `f-${Date.now()}`, data: [...currentFrame.data]}], currentFrameIndex: p.frames.length}))} 
            className="w-20 h-20 rounded-3xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-600 group-hover:text-white transition-all shadow-xl active:scale-90"
          >
            <Plus size={36} />
          </button>
          <span className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Duplicar</span>
        </div>
        
        <div className="flex-1 flex gap-6 overflow-x-auto py-8 scrollbar-hide">
          {project.frames.map((f, i) => (
            <div 
              key={f.id} 
              onClick={() => setProject(p => ({...p, currentFrameIndex: i}))}
              className={`w-28 h-28 rounded-3xl border-2 flex-none cursor-pointer overflow-hidden transition-all relative ${project.currentFrameIndex === i ? 'border-cyan-500 scale-110 shadow-2xl shadow-cyan-500/30 z-10' : 'border-zinc-800 opacity-50 hover:opacity-100'}`}
            >
              <span className="absolute top-2.5 left-2.5 text-[11px] font-black bg-black/80 px-2.5 py-1 rounded-lg z-20 border border-white/5">{i+1}</span>
              <FramePreview frame={f} width={project.width} />
              {project.frames.length > 1 && project.currentFrameIndex === i && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setProject(p => ({...p, frames: p.frames.filter((_, idx)=>idx!==i), currentFrameIndex: Math.max(0, i-1)})); }} 
                  className="absolute bottom-2.5 right-2.5 bg-red-600/90 p-2.5 rounded-xl text-white hover:bg-red-500 transition-all shadow-xl active:scale-90"
                >
                  <Trash2 size={16}/>
                </button>
              )}
            </div>
          ))}
        </div>
      </footer>

      {/* MODAL IA */}
      {isAiModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-[3rem] p-12 animate-in zoom-in-95 duration-300 shadow-[0_0_100px_rgba(147,51,234,0.15)]">
             <div className="flex justify-between items-start mb-10">
               <div className="flex flex-col gap-1">
                 <h2 className="text-3xl font-black flex items-center gap-4 text-purple-400"><Sparkles size={32}/> Generar con IA</h2>
                 <p className="text-zinc-500 text-sm font-medium tracking-wide">La IA de Gemini dibujará tus personajes por ti.</p>
               </div>
               <button onClick={()=>setIsAiModalOpen(false)} className="text-zinc-500 hover:text-white bg-zinc-800 p-3 rounded-full transition-transform hover:rotate-90"><X size={24}/></button>
             </div>

             {errorLog && (
               <div className="mb-8 bg-red-500/10 border-l-4 border-red-500 p-6 rounded-2xl flex items-start gap-4 animate-in slide-in-from-top-4">
                 <AlertCircle className="text-red-500 shrink-0 mt-1" size={24} />
                 <div className="flex flex-col gap-1">
                    <p className="text-sm font-black text-red-500 uppercase tracking-tighter">Problema de Conexión</p>
                    <p className="text-xs text-red-400/80 leading-relaxed font-medium">{errorLog}</p>
                 </div>
               </div>
             )}

             <div className="relative mb-10">
               <textarea 
                 className="w-full bg-zinc-950 border-2 border-zinc-800 rounded-[2rem] p-8 text-base min-h-[180px] outline-none focus:border-purple-600/50 transition-all text-white resize-none shadow-inner font-medium placeholder-zinc-800"
                 placeholder="Ej: Un ninja cibernético con luces rojas, vista lateral, estilo 16 bits..."
                 value={aiPrompt}
                 onChange={e=>setAiPrompt(e.target.value)}
                 disabled={isGenerating}
               />
               <div className="absolute bottom-6 right-8 text-[10px] font-black text-zinc-700 uppercase tracking-[0.3em]">IA Engine v2.5</div>
             </div>

             <button 
               onClick={generateWithAi}
               disabled={isGenerating || !aiPrompt}
               className={`w-full py-6 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 shadow-2xl ${isGenerating || !aiPrompt ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/40 active:scale-[0.98]'}`}
             >
               {isGenerating ? (
                 <>
                    <Loader2 className="animate-spin" size={24} />
                    <span className="animate-pulse">Procesando Píxeles...</span>
                 </>
               ) : (
                 <>
                    <Sparkles size={24}/>
                    Dibujar Sprite
                 </>
               )}
             </button>
             
             <p className="text-[11px] text-zinc-600 mt-8 text-center font-bold tracking-tight uppercase opacity-50">
               El resultado reemplazará el contenido del frame actual.
             </p>
          </div>
        </div>
      )}
    </div>
  );
};

const ToolBtn = ({icon, active, onClick}: any) => (
  <button 
    onClick={onClick} 
    className={`p-5 rounded-[1.5rem] transition-all duration-500 transform active:scale-75 ${active ? 'bg-cyan-500 text-zinc-950 shadow-[0_0_30px_rgba(6,182,212,0.4)] scale-110 z-10' : 'text-zinc-600 hover:text-white hover:bg-zinc-800'}`}
  >
    {icon}
  </button>
);

const FramePreview = ({frame, width}: {frame: Frame, width: number}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const pSize = canvas.width / width;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    frame.data.forEach((c, i) => { 
      if (c!=='transparent') { 
        ctx.fillStyle=c; 
        ctx.fillRect(Math.floor((i%width)*pSize), Math.floor(Math.floor(i/width)*pSize), Math.ceil(pSize), Math.ceil(pSize)); 
      }
    });
  }, [frame, width]);
  return <canvas ref={canvasRef} width={160} height={160} className="w-full h-full image-render-pixel pointer-events-none" />;
}

export default App;