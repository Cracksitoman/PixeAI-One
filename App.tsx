
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
  Maximize,
  Settings2,
  Wand2,
  Film,
  Clock,
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
  // Función para crear un proyecto limpio
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
      // Validación estricta para evitar bloqueos
      if (parsed && Array.isArray(parsed.frames) && parsed.frames.length > 0 && typeof parsed.width === 'number') {
        return parsed;
      }
    } catch (e) {
      console.error("Error cargando datos:", e);
    }
    return createDefaultProject();
  };

  const [project, setProject] = useState<PixelProject>(loadInitialProject);
  const [selectedTool, setSelectedTool] = useState<Tool>('pen');
  const [currentColor, setCurrentColor] = useState<string>(INITIAL_COLOR);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(0.85);
  const [history, setHistory] = useState<string[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sizeInput, setSizeInput] = useState<string>(project?.width?.toString() || "32");
  const [showRightPanel, setShowRightPanel] = useState(false);
  
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [isAiAnimModalOpen, setIsAiAnimModalOpen] = useState(false);
  const [aiAnimPrompt, setAiAnimPrompt] = useState('');
  const [isGeneratingAnim, setIsGeneratingAnim] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const animationIntervalRef = useRef<number | null>(null);

  // Guardar proyecto automáticamente
  useEffect(() => {
    if (project) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    }
  }, [project]);

  // Manejo de error crítico si el estado se vuelve null por alguna razón
  if (!project || !project.frames) {
    return (
      <div className="flex items-center justify-center h-screen flex-col gap-6 bg-zinc-950 p-10 text-center">
        <AlertTriangle size={64} className="text-red-500 animate-pulse" />
        <h2 className="text-2xl font-black text-white">¡Ups! Algo salió mal</h2>
        <p className="text-zinc-400 max-w-md">No pudimos cargar tu área de trabajo. Esto puede deberse a datos antiguos en el navegador.</p>
        <button 
          onClick={() => { localStorage.clear(); window.location.reload(); }}
          className="bg-white text-black px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-zinc-200 transition"
        >
          <RotateCcw size={20} /> Reiniciar Editor Completamente
        </button>
      </div>
    );
  }

  const currentFrame = project.frames[project.currentFrameIndex] || project.frames[0];

  const addToHistory = useCallback((data: string[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...data]);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const applyNewSize = (newSize: number) => {
    if (isNaN(newSize) || newSize < 4 || newSize > 128) return;
    if (confirm(`¿Cambiar tamaño a ${newSize}x${newSize}? Se borrará el dibujo actual.`)) {
      setProject({
        ...createDefaultProject(),
        width: newSize,
        height: newSize,
        frames: [{ id: Date.now().toString(), data: new Array(newSize * newSize).fill('transparent') }]
      });
      setSizeInput(newSize.toString());
      setHistory([]);
      setHistoryIndex(-1);
    }
  };

  const updatePixel = (index: number, color: string) => {
    if (!currentFrame) return;
    const newData = [...currentFrame.data];
    if (newData[index] === color) return;
    newData[index] = color;
    const newFrames = [...project.frames];
    newFrames[project.currentFrameIndex] = { ...currentFrame, data: newData };
    setProject(prev => ({ ...prev, frames: newFrames }));
    addToHistory(newData);
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
    }
  };

  // Dibujar canvas principal
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

  return (
    <div className="flex flex-col h-full w-full select-none bg-zinc-950 text-white overflow-hidden">
      {/* Header Simplificado */}
      <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-6 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center font-black italic shadow-lg shadow-cyan-500/20">P</div>
          <h1 className="font-black text-xl tracking-tighter">PixeAI <span className="text-cyan-500">One</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsAiModalOpen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-xl text-xs font-bold transition">
            <Sparkles size={14} /> Crear con IA
          </button>
          <button onClick={() => {}} className="bg-zinc-800 hover:bg-zinc-700 p-2 rounded-xl"><Settings2 size={18} /></button>
        </div>
      </header>

      {/* Editor Principal */}
      <main className="flex-1 flex overflow-hidden">
        {/* Barra lateral herramientas */}
        <aside className="w-20 border-r border-zinc-900 flex flex-col items-center py-6 gap-6">
          <ToolBtn icon={<Pencil size={20}/>} active={selectedTool==='pen'} onClick={()=>setSelectedTool('pen')} />
          <ToolBtn icon={<Eraser size={20}/>} active={selectedTool==='eraser'} onClick={()=>setSelectedTool('eraser')} />
          <div className="h-px w-8 bg-zinc-900" />
          <div className="w-10 h-10 rounded-xl border-2 border-zinc-800 relative cursor-pointer" style={{backgroundColor: currentColor}}>
             <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" value={currentColor} onChange={e=>setCurrentColor(e.target.value)} />
          </div>
        </aside>

        {/* Lienzo */}
        <section className="flex-1 relative flex items-center justify-center p-10 overflow-hidden bg-zinc-950">
          <div 
            className={`relative shadow-2xl cursor-crosshair touch-none ${showGrid ? 'dark-pixel-grid' : 'bg-zinc-900'}`}
            style={{ 
              width: `${Math.min(window.innerWidth - 300, window.innerHeight - 300) * zoom}px`, 
              height: `${Math.min(window.innerWidth - 300, window.innerHeight - 300) * zoom}px`,
            }}
            onMouseDown={handleCanvasInteraction}
            onMouseMove={e => e.buttons === 1 && handleCanvasInteraction(e)}
            onTouchStart={handleCanvasInteraction}
            onTouchMove={handleCanvasInteraction}
          >
            <canvas ref={canvasRef} width={1024} height={1024} className="w-full h-full image-render-pixel" />
          </div>
          
          {/* Controles flotantes */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900 border border-zinc-800 p-3 rounded-2xl shadow-2xl">
            <button onClick={()=>setZoom(Math.max(0.1, zoom-0.1))} className="p-2 hover:bg-zinc-800 rounded-lg"><ChevronLeft size={16}/></button>
            <span className="text-[10px] font-bold font-mono w-10 text-center">{Math.round(zoom*100)}%</span>
            <button onClick={()=>setZoom(Math.min(3, zoom+0.1))} className="p-2 hover:bg-zinc-800 rounded-lg"><ChevronRight size={16}/></button>
            <div className="w-px h-6 bg-zinc-800" />
            <button onClick={()=>setShowGrid(!showGrid)} className={`p-2 rounded-lg ${showGrid?'text-cyan-400 bg-cyan-400/10':'text-zinc-500'}`}><Grid3X3 size={20}/></button>
          </div>
        </section>

        {/* Panel Derecho */}
        <aside className="w-72 border-l border-zinc-900 bg-zinc-900/30 flex flex-col p-6 gap-8">
           <div>
             <h3 className="text-[10px] font-black uppercase text-zinc-500 mb-4 tracking-widest">Dimensiones</h3>
             <div className="grid grid-cols-2 gap-2">
               {[16, 32, 64].map(s => (
                 <button key={s} onClick={()=>applyNewSize(s)} className={`p-3 rounded-xl border text-xs font-bold transition ${project.width===s ? 'border-cyan-500 text-cyan-500 bg-cyan-500/5':'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>
                   {s}x{s}
                 </button>
               ))}
             </div>
           </div>

           <div>
             <h3 className="text-[10px] font-black uppercase text-zinc-500 mb-4 tracking-widest">Previsualización</h3>
             <div className="aspect-square w-full bg-zinc-950 rounded-2xl border border-zinc-800 flex items-center justify-center overflow-hidden">
                <canvas ref={previewRef} width={256} height={256} className="w-4/5 h-4/5 image-render-pixel" />
             </div>
           </div>
        </aside>
      </main>

      {/* Footer / Timeline */}
      <footer className="h-32 border-t border-zinc-900 flex items-center px-8 bg-zinc-900/50 gap-6">
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => setProject(p => ({...p, frames: [...p.frames, {id: Date.now().toString(), data: new Array(p.width*p.height).fill('transparent')}]}))} className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition">
            <Plus size={24} />
          </button>
          <span className="text-[8px] font-bold text-zinc-600 uppercase">Añadir</span>
        </div>
        <div className="flex-1 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {project.frames.map((f, i) => (
            <div 
              key={f.id} 
              onClick={() => setProject(p => ({...p, currentFrameIndex: i}))}
              className={`w-16 h-16 rounded-xl border-2 flex-none cursor-pointer overflow-hidden transition-all ${project.currentFrameIndex === i ? 'border-cyan-500 scale-105 shadow-lg shadow-cyan-500/10' : 'border-zinc-800 opacity-50'}`}
            >
              <FramePreview frame={f} width={project.width} />
            </div>
          ))}
        </div>
      </footer>

      {/* Modal IA Básico */}
      {isAiModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-3xl p-8 animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-black flex items-center gap-2"><Sparkles className="text-purple-500" /> Generar Sprite</h2>
               <button onClick={()=>setIsAiModalOpen(false)}><X/></button>
             </div>
             <textarea 
               className="w-full bg-black border border-zinc-800 rounded-2xl p-4 text-sm mb-6 min-h-[100px] outline-none focus:border-purple-500"
               placeholder="ej: Pequeño robot rojo estilo GameBoy..."
               value={aiPrompt}
               onChange={e=>setAiPrompt(e.target.value)}
             />
             <button disabled className="w-full bg-purple-600 py-4 rounded-2xl font-black text-sm uppercase tracking-wider opacity-50 cursor-not-allowed">
               Generar (Configura API KEY)
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ToolBtn = ({icon, active, onClick}: any) => (
  <button onClick={onClick} className={`p-3 rounded-xl transition-all ${active?'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20':'text-zinc-500 hover:text-white hover:bg-zinc-900'}`}>
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
  return <canvas ref={canvasRef} width={64} height={64} className="w-full h-full image-render-pixel" />;
}

export default App;
