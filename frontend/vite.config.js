import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  assetsInclude: ['**/*.PNG', '**/*.JPG', '**/*.JPEG'], // 社团logo合集 中的大写扩展名图片
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
