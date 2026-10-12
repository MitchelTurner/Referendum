import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.API_PROXY ?? 'http://127.0.0.1:3000';

function apiProxy() {
  return {
    target,
    bypass(req: { headers: { accept?: string }; url?: string }) {
      const accept = req.headers.accept ?? '';
      if (accept.includes('text/html')) return req.url;
      return undefined;
    },
  };
}

const proxy = {
  '/public': apiProxy(),
  '/staff': apiProxy(),
  '/api': target,
  '/auth': target,
  '/health': target,
  '/docs': target,
  '/embed/v1': target,
};

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, proxy },
  preview: { host: '0.0.0.0', port: 5173, proxy },
});
