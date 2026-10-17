# Publication check - 17 October 2026

The four-tool website is published at [Molecular Affinity](https://hkmu-ai4s-lab.github.io/protein-ligand-affinity/). The owner authorized publication and selected Webina / AutoDock Vina for public browser docking.

- Deployed source: `4e1289595b60e750610a11320a07f30fdabe011b`.
- Successful [GitHub Pages workflow](https://github.com/HKMU-AI4S-Lab/protein-ligand-affinity/actions/runs/39041574477): build and deployment both completed on 17 October 2026.
- The manually disabled deployment workflow was re-enabled for this authorized release. Pushes alone still do not deploy; `workflow_dispatch` and `ENABLE_PUBLIC_DEPLOY=true` remain required.

## Production verification

All four tools passed against the public HTTPS URL in Chrome 153. The live resource audit checked 78 linked pages/assets with no issues. The production release profile contains only MAO-B and GNINA scoring; all six excluded experimental model/figure URLs return 404.

Live docking accepted RCSB 1HSG, completed real Webina searches, preserved ligand stereochemistry and passed exact-coordinate GNINA scoring. PDB/SDF uploads, explicit boxes, cancellation/retry, completed-run recovery, stale-output removal, JSON/SDF/PDB/TXT exports and mobile viewport layout passed. The page and worker were cross-origin isolated, and no request targeted the private docking API.

Representations, full MAO-B screening with matching Grad-CAM, GNINA bound-pose scoring with all eight occlusion regions, input errors, downloads and recovery passed. There were no uncaught browser exceptions in either live test suite. Browser model downloads passed the existing byte/hash verification.

## Build and local checks

- Clean installation, immutable build-input provisioning, 92 unit tests, Astro/TypeScript (121 files, no errors/warnings/hints), public build, publication gate and built-site audit passed. The audit covered 21 pages and 110 local references.
- Real browser docking from PDB IDs, protein/SDF uploads, reference and explicit boxes, pose exports, cancellation/retry, reload recovery and stale-result removal passed. The 1HSG stereochemical ligand also passed the exact-coordinate handoff to GNINA browser scoring. The 3PTB HIS/TRP rejection remains enforced by that scorer.
- Returning visitors can upgrade the previous service worker and enable browser isolation. A fresh visitor receives a guarded first-visit reload for SharedArrayBuffer. No private docking API request is used by the public engine.
- The existing three tools passed browser regression, including MAO-B prediction and Grad-CAM, GNINA scoring and occlusion, downloads, failures and retry. Desktop and mobile viewport checks passed; physical mobile device performance was not tested.
- Approved MAO-B and GNINA model bytes remain unchanged. The MAO-B manifest now links the September 28 browser validation report included under artifacts/browser-fusion-validation.json; its SHA-256 matches the manifest.

## Release boundary

The four experimental screening checkpoints retain pending validation and redistribution status and are excluded. The two uncleared ETDock paper crops are excluded; an original lab diagram explains the cited method. Native private GNINA workflows remain in the maintainer workspace. Live docking is accurately labelled AutoDock Vina 1.2.3 through Webina 1.0.5, with Vina energies and no CNN rescoring.

Webina's exact upstream runtime bytes, licence and pinned commit are distributed; its loader resolves the verified module URL for pthread startup. Inputs, preparation, engine hashes, coordinate mapping and results accompany JSON exports. Two redocking examples verify implementation, not general docking accuracy or experimental affinity.

The locked npm dependencies retain pre-existing audit advisories (six in the complete install; five when dev dependencies are omitted). They concern build/serialization/image/source-map dependencies; no dependency versions were changed in this release. The static site has no public Node server. Dependency maintenance remains separate from this release.

Local evidence under `artifacts/publication-20261017/` includes `deployment-status.json`, `deployment-logs.zip`, `live-resource-audit.json`, `live-release-profile.json`, `live-platform/platform-review.json`, `live-docking-1hsg/result.json`, clean-build logs, local browser reports and `service-worker-upgrade.json`. Screenshots and exact live inference exports accompany the reports. These local evidence directories are not included in the public repository.

The prior three-tool release was deployed from ed078a37909420864e21aa11f5e8d3f2745ade05 on 25 September 2026 in workflow run 36039966649, then taken offline during subsequent development.
