# Molecular Affinity

Four interactive tools from HKMU AI4S Lab project **UGC/FDS16/E16/23**:

- Molecular representations: fingerprints, graphs, geometry and grids.
- Molecular screening: the approved MAO-B DL-FSG checkpoint, with Grad-CAM.
- Bound-complex scoring: GNINA fixed-pose scoring, with spatial occlusion.
- Protein–ligand docking: AutoDock Vina 1.2.3 through Webina 1.0.5, with pose exports and a scoring handoff.

All public calculations run on the visitor's computer. The research articles describe UniMolRep, DL-FSG, AGIMA-Score and ETDock; ETDock is separate from the live Vina engine.

## Build and preview

Use Node.js 24:

```sh
npm ci
npm run release:inputs
npm test
npm run check
npm run build:public
node scripts/audit-built-site.mjs
node scripts/check-publication.mjs --public
npm run preview
```

Open `http://127.0.0.1:4321/protein-ligand-affinity/`. Docking enables SharedArrayBuffer through the service worker, with one automatic reload on the first visit. Use a current desktop Chrome, Edge or Firefox browser with service workers enabled. Keep the tab open during calculations. A loopback-only engine selector also retains access to the maintainer's existing private GNINA service.

Large model and example grids are downloaded only on request from pinned Hugging Face revisions and verified before use. Webina and the chemistry tools are self-hosted, verified WebAssembly assets. Results and inputs are saved locally in this browser; clear site data to remove them. PDB ID loading contacts RCSB.

The four experimental screening checkpoints keep their pending validation status and are excluded from the public release. The two uncleared ETDock paper crops are excluded; the public article uses an original lab diagram and links to the paper. Existing private/native workflows and their records remain in the maintainer workspace.

See [browser docking](docs/browser-docking.md), [deployment](docs/deployment.md), [publication record](docs/publication-check.md) and [release approval](docs/release-approval.json).
