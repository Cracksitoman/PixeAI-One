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

const STORAGE_KEY = 'pixeai_one_studio_data';
const DEFAULT_SIZE = 32;
const INITIAL_COLOR = '#06b6d4';

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
      if (!apiKey) throw new Error("API_KEY no encontrada en el sistema.");
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Professional pixel art sprite of: ${aiPrompt}. 
          Centered single character, flat colors, no shading, clean edges, solid white background, 
          style: 32-bit game asset, clear silhouette.` }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });

      const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (!part?.inlineData) {
        throw new Error("La IA no devolvió una imagen. Intenta con otra descripción.");
      }

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
        // Detectar blanco o transparencia
        const isWhite = r > 245 && g > 245 && b > 245;
        if (a < 128 || isWhite) {
          newData.push('transparent');
        } else {
          newData.push(`#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`);
        }
      }

      setProject(prev => {
        const newFrames = [...prev.frames];
        newFrames[prev.currentFrameIndex] = { ...newFrames[prev.currentFrameIndex], data: newData };
        return { ...prev, frames: newFrames };
      });
      setIsAiModalOpen(false);
      setAiPrompt('');
    } catch (e: any) {
      console.error("AI Error:", e);
      setErrorLog(e.message || "Error desconocido al conectar con la IA.");
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
      {/* HEADER */}
      <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-md z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-600 to-cyan-400 rounded-xl flex items-center justify-center font-black italic shadow-lg shadow-cyan-500/20 text-zinc-950">P</div>
          <div className="flex flex-col">
            <h1 className="font-black text-xl tracking-tighter leading-none">PixeAI</h1>
            <span className="text-[10px] uppercase font-bold text-cyan-500 tracking-widest">One Studio</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsAiModalOpen(true)} 
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-xl shadow-purple-600/20 active:scale-95 group"
          >
            <Sparkles size={16} className="group-hover:rotate-12 transition-transform" /> 
            CREAR CON IA
          </button>
          <button 
            onClick={() => {
              const canvas = document.createElement('canvas');
              canvas.width = project.width; canvas.height = project.height;
              const ctx = canvas.getContext('2d')!;
              currentFrame.data.forEach((c, i) => { if (c!=='transparent') { ctx.fillStyle=c; ctx.fillRect(i%project.width, Math.floor(i/project.width), 1, 1); }});
              const link = document.createElement('a');
              link.download = "sprite.png"; link.href = canvas.toDataURL(); link.click();
            }} 
            className="bg-zinc-800 hover:bg-zinc-700 p-2.5 rounded-xl border border-zinc-700 transition-colors" 
            title="Exportar Sprite"
          >
            <Download size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* BARRA DE HERRAMIENTAS IZQUIERDA */}
        <aside className="w-20 border-r border-zinc-900 flex flex-col items-center py-8 gap-6 bg-zinc-900/40">
          <ToolBtn icon={<Pencil size={22}/>} active={selectedTool==='pen'} onClick={()=>setSelectedTool('pen')} />
          <ToolBtn icon={<Eraser size={22}/>} active={selectedTool==='eraser'} onClick={()=>setSelectedTool('eraser')} />
          <ToolBtn icon={<PaintBucket size={22}/>} active={selectedTool==='bucket'} onClick={()=>setSelectedTool('bucket')} />
          <ToolBtn icon={<Pipette size={22}/>} active={selectedTool==='picker'} onClick={()=>setSelectedTool('picker')} />
          <div className="h-px w-10 bg-zinc-800" />
          <div className="w-12 h-12 rounded-2xl border-2 border-zinc-700 relative cursor-pointer shadow-inner overflow-hidden ring-4 ring-black/40" style={{backgroundColor: currentColor}}>
             <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={currentColor} onChange={e=>setCurrentColor(e.target.value)} />
          </div>
        </aside>

        {/* LIENZO CENTRAL */}
        <section className="flex-1 relative flex items-center justify-center p-12 bg-zinc-950 overflow-hidden">
          <div 
            className={`relative shadow-2xl cursor-crosshair touch-none transition-all duration-300 ${showGrid ? 'dark-pixel-grid' : 'bg-zinc-900'}`}
            style={{ 
              width: `${Math.min(window.innerWidth - 450, window.innerHeight - 350) * zoom}px`, 
              height: `${Math.min(window.innerWidth - 450, window.innerHeight - 350) * zoom}px`,
              outline: '1px solid #3f3f46'
            }}
            onMouseDown={handleCanvasInteraction}
            onMouseMove={e => e.buttons === 1 && handleCanvasInteraction(e)}
            onTouchStart={handleCanvasInteraction}
            onTouchMove={handleCanvasInteraction}
          >
            <canvas ref={canvasRef} width={2048} height={2048} className="w-full h-full image-render-pixel" />
          </div>
          
          {/* CONTROLES FLOTANTES */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl shadow-2xl backdrop-blur-xl">
            <button onClick={()=>setZoom(Math.max(0.1, zoom-0.1))} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"><ChevronLeft size={18}/></button>
            <span className="text-xs font-black font-mono w-14 text-center text-zinc-400">{Math.round(zoom*100)}%</span>
            <button onClick={()=>setZoom(Math.min(4, zoom+0.1))} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"><ChevronRight size={18}/></button>
            <div className="w-px h-8 bg-zinc-800 mx-2" />
            <button onClick={()=>setShowGrid(!showGrid)} className={`p-2.5 rounded-xl transition-all ${showGrid?'text-cyan-400 bg-cyan-400/10 ring-1 ring-cyan-400/30':'text-zinc-500 hover:text-white'}`} title="Mostrar Rejilla">
              <Grid3X3 size={24}/>
            </button>
          </div>
        </section>

        {/* PANEL LATERAL DERECHO */}
        <aside className="w-80 border-l border-zinc-900 bg-zinc-900/30 flex flex-col p-8 gap-10 overflow-y-auto">
           <section>
             <h3 className="text-[11px] font-black uppercase text-zinc-500 mb-5 tracking-widest flex items-center gap-2"><Settings2 size={14}/> Configuración</h3>
             <div className="grid grid-cols-2 gap-3">
               {[16, 32, 64, 128].map(s => (
                 <button 
                   key={s} 
                   onClick={() => { if(confirm(`¿Cambiar tamaño a ${s}x${s}? El progreso actual se perderá.`)) setProject(createDefaultProject(s)) }} 
                   className={`p-4 rounded-2xl border text-[12px] font-black transition-all ${project.width===s ? 'border-cyan-500 text-cyan-500 bg-cyan-500/5 shadow-lg shadow-cyan-500/10':'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-white bg-zinc-900/40'}`}
                 >
                   {s}x{s}
                 </button>
               ))}
             </div>
           </section>

           <section>
             <h3 className="text-[11px] font-black uppercase text-zinc-500 mb-5 tracking-widest flex items-center gap-2"><MonitorPlay size={14}/> Previsualización</h3>
             <div className="aspect-square w-full bg-zinc-950 rounded-3xl border border-zinc-800 flex items-center justify-center overflow-hidden dark-pixel-grid relative group">
                <canvas ref={previewRef} width={512} height={512} className="w-4/5 h-4/5 image-render-pixel" />
                {!isPlaying && <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors"><Play size={32} className="text-white opacity-40"/></div>}
             </div>
             <div className="mt-6 flex flex-col gap-4">
               <button 
                onClick={()=>setIsPlaying(!isPlaying)} 
                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${isPlaying ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-cyan-600 text-zinc-950 hover:bg-cyan-500 shadow-xl shadow-cyan-500/20'}`}
               >
                 {isPlaying ? <><Pause size={18}/> Detener</> : <><Play size={18}/> Reproducir</>}
               </button>
               <div className="flex flex-col gap-2 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                 <div className="flex items-center justify-between mb-1">
                   <span className="text-[10px] text-zinc-500 font-black uppercase flex items-center gap-1.5"><Sliders size={12}/> Velocidad</span>
                   <span className="text-xs font-mono font-black text-cyan-400">{project.fps} FPS</span>
                 </div>
                 <input type="range" min="1" max="60" value={project.fps} onChange={e=>setProject(p=>({...p, fps:parseInt(e.target.value)}))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
               </div>
             </div>
           </section>
        </aside>
      </main>

      {/* TIMELINE / FOOTER */}
      <footer className="h-40 border-t border-zinc-900 flex items-center px-10 bg-zinc-900/50 gap-8 overflow-hidden">
        <div className="flex flex-col items-center gap-2 flex-none group">
          <button 
            onClick={() => setProject(p => ({...p, frames: [...p.frames, {id: `f-${Date.now()}`, data: [...currentFrame.data]}], currentFrameIndex: p.frames.length}))} 
            className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 group-hover:text-white group-hover:bg-zinc-700 transition-all shadow-lg active:scale-90"
          >
            <Plus size={32} />
          </button>
          <span className="text-[9px] font-black text-zinc-600 uppercase tracking-tighter group-hover:text-zinc-400">Duplicar</span>
        </div>
        
        <div className="flex-1 flex gap-5 overflow-x-auto py-6 scrollbar-hide">
          {project.frames.map((f, i) => (
            <div 
              key={f.id} 
              onClick={() => setProject(p => ({...p, currentFrameIndex: i}))}
              className={`w-24 h-24 rounded-2xl border-2 flex-none cursor-pointer overflow-hidden transition-all relative ${project.currentFrameIndex === i ? 'border-cyan-500 scale-110 shadow-2xl shadow-cyan-500/20 z-10' : 'border-zinc-800 opacity-40 grayscale hover:opacity-100 grayscale-0'}`}
            >
              <span className="absolute top-2 left-2 text-[10px] font-black bg-black/70 px-2 py-0.5 rounded-md z-20 border border-white/10">{i+1}</span>
              <FramePreview frame={f} width={project.width} />
              {project.frames.length > 1 && project.currentFrameIndex === i && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setProject(p => ({...p, frames: p.frames.filter((_, idx)=>idx!==i), currentFrameIndex: Math.max(0, i-1)})); }} 
                  className="absolute bottom-2 right-2 bg-red-600 p-2 rounded-xl text-white hover:bg-red-500 transition-all shadow-xl active:scale-90"
                >
                  <Trash2 size={14}/>
                </button>
              )}
            </div>
          ))}
        </div>
      </footer>

      {/* MODAL IA */}
      {isAiModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-[2.5rem] p-10 animate-in zoom-in-95 shadow-[0_0_100px_rgba(147,51,234,0.15)]">
             <div className="flex justify-between items-center mb-8">
               <div className="flex flex-col">
                 <h2 className="text-2xl font-black flex items-center gap-3"><Sparkles className="text-purple-500" /> GENERADOR IA</h2>
                 <p className="text-zinc-500 text-xs mt-1">Describe tu personaje y la IA lo dibujará píxel a píxel.</p>
               </div>
               <button onClick={()=>setIsAiModalOpen(false)} className="text-zinc-500 hover:text-white bg-zinc-800 p-2 rounded-full transition-colors"><X size={20}/></button>
             </div>

             {errorLog && (
               <div className="mb-6 bg-red-500/10 border border-red-500/30 p-4 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                 <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                 <div className="flex flex-col">
                   <p className="text-xs font-bold text-red-500">Error de Conexión / IA</p>
                   <p className="text-[11px] text-red-400/80 leading-relaxed mt-1">{errorLog}</p>
                 </div>
               </div>
             )}

             <div className="relative mb-8">
               <textarea 
                 className="w-full bg-black border-2 border-zinc-800 rounded-3xl p-6 text-sm min-h-[160px] outline-none focus:border-purple-500/50 transition-all placeholder-zinc-700 text-white resize-none shadow-inner"
                 placeholder="Ej: Un dragón verde miniatura estilo GameBoy Color, caminando hacia la derecha..."
                 value={aiPrompt}
                 onChange={e=>setAiPrompt(e.target.value)}
                 disabled={isGenerating}
               />
               <div className="absolute bottom-4 right-6 text-[10px] font-black text-zinc-600 uppercase tracking-widest">GEMINI ENGINE</div>
             </div>

             <button 
               onClick={generateWithAi}
               disabled={isGenerating || !aiPrompt}
               className={`w-full py-5 rounded-3xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-2xl ${isGenerating || !aiPrompt ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30 active:scale-95'}`}
             >
               {isGenerating ? (
                 <>
                   <Loader2 className="animate-spin" />
                   <span className="animate-pulse">GENIANDO PÍXELES...</span>
                 </>
               ) : (
                 <>
                   <Sparkles size={18}/>
                   DIBUJAR AHORA
                 </>
               )}
             </button>
             
             <p className="text-[10px] text-zinc-600 mt-6 text-center font-bold tracking-tight">
               NOTA: El resultado se aplicará al frame seleccionado actualmente.
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
    className={`p-4 rounded-2xl transition-all duration-300 transform active:scale-90 ${active ? 'bg-cyan-600 text-zinc-950 shadow-[0_0_20px_rgba(6,182,212,0.4)] scale-110 z-10' : 'text-zinc-500 hover:text-white hover:bg-zinc-800'}`}
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
  return <canvas ref={canvasRef} width={128} height={128} className="w-full h-full image-render-pixel pointer-events-none" />;
}

export default App;