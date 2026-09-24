# Protein–Ligand Binding Affinity Prediction

Research and interactive molecular analyses from HKMU AI4S Lab project **UGC/FDS16/E16/23**.

The website presents UniMolRep, DL-FSG and AGIMA-Score through three method articles: **Representations**, **Screening** and **Binding-affinity prediction**. Browser demonstrations connect molecular inputs to predictions, with Grad-CAM within Screening and spatial occlusion within BAP. The affinity demonstration uses the external GNINA model; it is credited in the article.

Website: <https://hkmu-ai4s-lab.github.io/protein-ligand-affinity/>

## Local build

Use Node.js 24 and npm:

```sh
npm ci
npm run release:inputs
npm test
npm run check
npm run build
node scripts/audit-built-site.mjs
npm run publication:check
npm run preview
```

The preview is at `http://127.0.0.1:4321/protein-ligand-affinity/`. No inference server is needed. Model inference, input preparation and interpretation run in browser workers.

`release:inputs` downloads the two prepared complex grids needed by the tests and figure provenance checks, and verifies their sizes and SHA-256 hashes. The three large browser assets are hosted at an immutable Hugging Face revision recorded in `artifacts/hosted-assets.json`. They are omitted from the GitHub Pages bundle. The full Fusion model download is approximately 901 MB including the smaller site-hosted files; it starts only when a visitor requests screening. Verified artifacts are cached for subsequent and offline calculations.

For native model validation, `node scripts/provision-release-inputs.mjs --models` also retrieves the large Fusion weight file. Native exports require the original research checkpoints and Python scientific environment; these are not required to build or use the website.

## Validation and reproduction

- `npm test` checks molecular representations, curated inputs, scientific contracts, model identity and legacy restoration.
- `npm run check` checks Astro and TypeScript.
- The production build checks scientific artifact hashes and figure provenance.
- `scripts/browser-grant.cjs` tests the three demonstrations, both affinity complexes, inline interpretation, cancellation, changed inputs and cached operation.
- `scripts/browser-grant-failures.cjs`, `scripts/browser-grad-cam-failures.cjs` and `scripts/browser-legacy-restoration.cjs` test recovery and compatibility.
- Figure sources, exact crop coordinates, input arrays and output hashes are recorded in `artifacts/*provenance.json`. `scripts/prepare-teaching-panels.py` and `scripts/render-teaching-molecules.cjs` reproduce the current scientific panels. `scripts/extract-paper-figures.py` requires the original author-supplied manuscripts; those manuscripts are not redistributed here.
- Native fixture methods are documented in [tests/fixtures/README.md](tests/fixtures/README.md).

The browser checks accept `TEST_BASE_URL` and `QA_OUTPUT_DIR`. Their local Chromium/Playwright paths need adapting for another machine. Visual review remains a separate human assessment.

## Deployment and credits

[Deployment instructions](docs/deployment.md) describe the manual GitHub Pages workflow. `deployment.config.mjs` defines the confirmed repository, site URL and subdirectory. Publication requires the artifact and source-distribution checks in `npm run publication:check`.

Paper credits and licences appear with the figures. Software notices and corresponding Open Babel sources are available at the website's **Software licences** link. Third-party files retain their own licences; no blanket licence is applied to the research material in this repository.
