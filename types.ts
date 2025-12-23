
export type Tool = 'pen' | 'eraser' | 'bucket' | 'picker';

export interface Frame {
  id: string;
  data: string[]; // Flat array of colors (hex or rgba)
}

export interface PixelProject {
  width: number;
  height: number;
  frames: Frame[];
  currentFrameIndex: number;
  fps: number;
}

export enum CanvasSize {
  SIZE_16 = 16,
  SIZE_32 = 32,
  SIZE_64 = 64,
  SIZE_128 = 128,
  SIZE_256 = 256
}
