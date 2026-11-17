import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

const GITHUB_PAGES_BASE = '/RENT-CRM/';

function resolveBasePath(command: 'build' | 'serve'): string {
  if (process.env.VITE_BASE_PATH) {
    return process.env.VITE_BASE_PATH;
  }
  if (process.env.GITHUB_ACTIONS === 'true' || process.env.GITHUB_PAGES === 'true') {
    return GITHUB_PAGES_BASE;
  }
  return command === 'build' ? './' : '/';
}

function buildSpa404Html(basePath: string): string {
  const normalizedBase = basePath === './' ? './' : (basePath.endsWith('/') ? basePath : `${basePath}/`);
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RENTAL GATE CRM</title>
    <script>
      (function () {
        var base = ${JSON.stringify(normalizedBase)};
        var pathname = window.location.pathname || '/';
        var cleanBase = base === './' ? '/' : base;
        var relative = pathname.indexOf(cleanBase) === 0
          ? pathname.slice(cleanBase.length)
          : pathname.replace(/^\\//, '');
        var route = relative.replace(/^\\/+|\\/+$/g, '').split('/')[0] || '';
        if (route && route !== 'index.html' && route !== '404.html') {
          try {
            sessionStorage.setItem('rg_crm_redirect_route', route);
          } catch (e) {}
        }
        var target = (base === './' ? './' : cleanBase) + (route && route !== 'index.html' && route !== '404.html' ? ('#' + encodeURIComponent(route)) : '');
        window.location.replace(target);
      })();
    </script>
  </head>
  <body></body>
</html>
`;
}

export default defineConfig(({command}) => {
  const base = resolveBasePath(command);
  const rootDir = import.meta.dirname;

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'rental-gate-base-assets',
        transformIndexHtml(html) {
          const normalizedBase = base === './' ? './' : (base.endsWith('/') ? base : `${base}/`);
          const baseInject = `    <script>window.__RG_BASE_URL__ = ${JSON.stringify(normalizedBase)};</script>\n`;
          let nextHtml = html.replace('</head>', `${baseInject}  </head>`);
          if (normalizedBase !== './') {
            nextHtml = nextHtml.replace(/(src|href)="\.\/assets\//g, `$1="${normalizedBase}assets/`);
          }
          return nextHtml;
        },
      },
      // Copies src/assets & assets into dist/ and generates GitHub Pages SPA 404.html + .nojekyll
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(rootDir, 'dist');
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
          const rootAssets = path.resolve(rootDir, 'assets');
          const distRootAssets = path.resolve(distDir, 'assets');
          if (fs.existsSync(distDir) && fs.existsSync(rootAssets)) {
            fs.cpSync(rootAssets, distRootAssets, {recursive: true, force: true});
          }
          if (fs.existsSync(distDir)) {
            fs.writeFileSync(path.resolve(distDir, '.nojekyll'), '', 'utf8');
            fs.writeFileSync(path.resolve(distDir, '404.html'), buildSpa404Html(base), 'utf8');
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
