import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { deployment, siteBase } from './deployment.config.mjs';

export default defineConfig({
  site: deployment.site,
  base: siteBase,
  integrations: [react()],
  output: 'static',
  vite: { server: { strictPort: true, watch: {ignored:['**/research_works/**','**/artifacts/**','**/archive/**','**/.venv*/**']} }, preview: { strictPort: true } },
  devToolbar: { enabled: false },
});
