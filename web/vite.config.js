import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Same-origin CODAP: /codap/* proxies to codap3.concord.org so the wrapper
// and CODAP share an origin — the host page can then reach into the iframe
// DOM and dispatch synthetic pointer events (spike: docs/SPIKE-same-origin.md).
//
// IN PRODUCTION the same job is done by `functions/codap/[[path]].js`, a
// Cloudflare Pages Function. The two must stay in step: if the upstream host
// changes, change it in both places. Purely static hosting cannot serve this
// app at all — see that file for why.
export default defineConfig({
  server: {
    // CORS FOR CODAP'S IMPORTER PLUGIN — this is what makes tutorial 1's
    // "drag the file icon" task work in dev.
    //
    // A CSV URL dropped on CODAP v3 is not fetched by CODAP itself. It routes
    // through `initiateImportFromCsv({ url })`, which launches CODAP's Importer
    // as a hidden WebView from `codap.concord.org/codap-resources/plugins/` —
    // a DIFFERENT ORIGIN — and that plugin fetches our CSV. Without CORS the
    // fetch is blocked and the drop silently does nothing, for a real student
    // dragging the icon just as much as for Dot.
    //
    // Vite tightened dev-server CORS by default (a dev server that answers any
    // origin lets a malicious page read your source), so this has to be opted
    // into — but only for the origins that actually need it, not `*`.
    // Cloudflare Pages already sends `access-control-allow-origin: *` for
    // static assets, which is why the deployed site does not need this.
    cors: { origin: ['https://codap.concord.org', 'https://codap3.concord.org'] },
    proxy: {
      '/codap/': {
        target: 'https://codap3.concord.org/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/codap\//, '/'),
      },
    },
  },
  build: {
    rollupOptions: {
      // Every page is an entry point. Vite builds only index.html by default,
      // and silently shipping a site whose tutorial pages 404 is a bad day.
      input: {
        home: resolve(import.meta.dirname, 'home.html'),
        index: resolve(import.meta.dirname, 'index.html'),
        codapSame: resolve(import.meta.dirname, 'codap-same.html'),
        codap: resolve(import.meta.dirname, 'codap.html'),
        injectTest: resolve(import.meta.dirname, 'inject-test.html'),
      },
    },
  },
});
