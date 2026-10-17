import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { deployment, siteBase } from './deployment.config.mjs';
import {dockingProxy} from './scripts/docking-proxy.mjs';

export default defineConfig({
  site: deployment.site,
  base: siteBase,
  integrations: [react()],
  output: 'static',
  vite: { plugins:[{name:'private-docking-preview',configureServer(server){server.middlewares.use(dockingProxy);}}], server: { strictPort: true, watch: {ignored:['**/research_works/**','**/artifacts/**','**/archive/**','**/.venv*/**']} }, preview: { strictPort: true } },
  devToolbar: { enabled: false },
});
