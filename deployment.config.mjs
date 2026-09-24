// Confirmed publication destination. Importing this file never deploys the site.
export const deployment = {
  repository: 'HKMU-AI4S-Lab/protein-ligand-affinity',
  site: 'https://hkmu-ai4s-lab.github.io',
  base: '/protein-ligand-affinity/',
};
export const siteBase = (process.env.SITE_BASE || deployment.base).replace(/\/?$/, '/');
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(siteBase)) throw new Error('SITE_BASE must be an absolute directory path.');
