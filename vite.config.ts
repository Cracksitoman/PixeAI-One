import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Carga las variables de entorno basadas en el modo (development/production)
  // el tercer parámetro '' le dice a vite que cargue TODAS las variables, no solo las que empiezan por VITE_
  // Fix: cast process to any to avoid type error regarding cwd
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Inyecta la variable API_KEY de forma segura en el código del cliente
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    },
    build: {
      outDir: 'dist',
      target: 'esnext'
    }
  };
});