import { defineConfig } from 'vite';

// Same-origin CODAP: /codap/* proxies to codap3.concord.org so the wrapper
// and CODAP share an origin — the host page can then reach into the iframe
// DOM and dispatch synthetic pointer events (spike: docs/SPIKE-same-origin.md).
export default defineConfig({
  server: {
    proxy: {
      '/codap/': {
        target: 'https://codap3.concord.org/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/codap\//, '/'),
      },
    },
  },
});
