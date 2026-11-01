import {defineConfig} from 'vite';
export default defineConfig({root:'web',base:'./',publicDir:false,build:{outDir:'../dist',emptyOutDir:true,copyPublicDir:false,rollupOptions:{input:'web/index.html'}}});
