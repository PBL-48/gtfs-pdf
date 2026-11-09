import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' にすると、リポジトリ名に関係なく GitHub Pages で動作する
export default defineConfig({
  plugins: [react()],
  base: './',
});