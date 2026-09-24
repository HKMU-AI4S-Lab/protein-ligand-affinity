# Deployment

The confirmed repository is `HKMU-AI4S-Lab/protein-ligand-affinity`. GitHub Pages serves the production build at `https://hkmu-ai4s-lab.github.io/protein-ligand-affinity/`.

## Manual release

1. In repository Settings → Pages, select **GitHub Actions** as the source.
2. Set the repository Actions variable `ENABLE_PUBLIC_DEPLOY` to `true`.
3. Run **Deploy lab website to GitHub Pages** from the Actions tab on `main`.

The workflow installs the locked dependencies, retrieves and verifies the prepared complex grids, runs tests and type checking, builds and audits the static output, and checks the publication records before deploying. Pushes alone do not publish changes.

## Asset hosting

Three large inference files are hosted in `micklee17/protein-ligand-affinity-web-assets` at Hugging Face revision `784a88468de2077a8b50d1fd9353590930039aee`. The manifests use immutable URLs and retain the original SHA-256 hashes and byte counts. Checkpoints, inputs, numerical reference results and scientific figures were not changed for deployment.

`npm run release:inputs` obtains the two grids needed by build-time provenance and unit checks. `npm run build` omits duplicate large assets from `dist` after verifying any local copies. The browser downloads them directly from the pinned URLs when a visitor requests a calculation and verifies them before inference.

`artifacts/publication-manifest-migration.json` records the original and release manifest hashes and the identity comparison. `artifacts/chemistry-source-provenance.json` records the distributed runtime and matching source archives. Runtime licence and source links remain available under `notices/`.

## Release verification

Run the README build commands from a clean checkout. After deployment, check the homepage, direct nested URLs and legacy redirects; confirm images and licences load; run both affinity examples with occlusion and Screening with Grad-CAM; inspect desktop and mobile layouts. Browser evidence is kept outside the public build.
