import { defineConfig } from 'vite';

export default defineConfig({
    server: {
    open: true, // abre o navegador automaticamente quando iniciar o servidor
  },
  build: {
    outDir: 'dist', // pasta onde o projeto será gerado após o build
  },
  esbuild: {
    loader: 'tsx',  // Isso garante que arquivos .ts e .tsx sejam processados corretamente
  },
});
