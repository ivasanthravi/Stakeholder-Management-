import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: { port: 4173, proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 8787}` } },
  server: { port: Number(process.env.VITE_PORT ?? 5173), strictPort: true, proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 8787}` } },
})
