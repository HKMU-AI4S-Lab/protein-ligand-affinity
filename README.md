# Protein–Ligand Binding Affinity Prediction

Research and interactive molecular analyses from HKMU AI4S Lab project **UGC/FDS16/E16/23**.

The website has four working tools: **Molecular representations** (UniMolRep), **Molecular screening** (DL-FSG), **Bound-complex scoring** (GNINA, with AGIMA-Score research) and **Protein–ligand docking** (Webina / AutoDock Vina, with ETDock research). Screening includes Grad-CAM; bound-complex scoring includes spatial occlusion. The public docking tool generates poses in the visitor’s browser and can send a selected pose to the existing fixed-pose scorer. See [GNINA docking implementation and verification](docs/gnina-docking-implementation.md). The separate [ETDock implementation status](docs/etdock-implementation.md) records that research model's prerequisites.

The website is published at <https://hkmu-ai4s-lab.github.io/protein-ligand-affinity/>. Screening includes MAO-B, EGFR, PARP1, DPP4 and HIV-1 protease; see [five-target validation and limits](docs/five-target-local-preview.md).

## Local build

Use Node.js 24 and npm:

```sh
npm ci
npm run release:inputs
npm test
npm run check
npm run build
node scripts/audit-built-site.mjs
npm run preview
```

The preview is at `http://127.0.0.1:4321/protein-ligand-affinity/`. Representations, screening and bound-pose scoring run in browser workers. Docking accepts a PDB ID or uploaded protein and a SMILES/SDF ligand, and runs through Webina / AutoDock Vina in a browser worker. See [browser docking](docs/browser-docking.md). The private native GNINA implementation remains available to the maintainer through its existing loopback proxy.

`release:inputs` downloads the two prepared complex grids needed by the tests and figure provenance checks, and verifies their sizes and SHA-256 hashes. The previously hosted release assets are recorded in `artifacts/hosted-assets.json`. The four additional target checkpoints retain their original training provenance and documented coverage limits. Release validation binds their native/browser numerical parity and Grad-CAM export checks; it does not establish prospective or clinical performance. Each full Fusion model is approximately 901 MB; a target's download begins only when requested. Verified artifacts are cached for subsequent and offline calculations.

For native model validation, `node scripts/provision-release-inputs.mjs --models` also retrieves the large Fusion weight files. Native exports require the original research checkpoints and Python scientific environment; these are not required to build or use the website.

## Validation and reproduction

- [Custom-input validation](docs/custom-input-validation.md) records checkpoint scope, accepted structures, held-out screening results, prepared-complex numerical parity, privacy boundaries and remaining publication gates. Reproduce its browser assessments with `node scripts/assess-fusion-heldout.cjs`, `node scripts/assess-complex-submission.cjs` and `node scripts/check-custom-ui.cjs` after building and starting the local preview.
- [Five-target validation](docs/five-target-local-preview.md) records the new checkpoints, training provenance, per-target browser coverage and scientific limits.
- [Private native docking](docs/gnina-docking-implementation.md) records the engine, environment, service and run identifiers, two-complex structural checks, browser journeys and preservation checks. Reproduce with `scripts/verify-docking-science.py` and `node scripts/verify-docking-browser.cjs` while the private service is connected.
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

`npm run publication:check` checks all five screening checkpoints, GNINA scoring, figure redistribution records and chemistry source-distribution records. No reduced public profile excludes a target or figure.

[Publication checks](docs/publication-check.md) record the deployed release and live verification.

Paper credits and licences appear with the figures. Software notices and corresponding Open Babel sources are available at the website's **Software licences** link. Third-party files retain their own licences; no blanket licence is applied to the research material in this repository.
