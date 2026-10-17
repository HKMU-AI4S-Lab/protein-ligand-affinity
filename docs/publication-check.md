# Publication check - 17 October 2026

The owner authorized publication and selected Webina / AutoDock Vina for public browser docking. The release is prepared for GitHub Pages at https://hkmu-ai4s-lab.github.io/protein-ligand-affinity/. Deployment and production verification are pending; this record will be updated after they complete.

## Verified release candidate

- Clean installation, immutable build-input provisioning, 92 unit tests, Astro/TypeScript (121 files, no errors/warnings/hints), public build, publication gate and built-site audit passed. The audit covered 21 pages and 110 local references.
- Real browser docking from PDB IDs, protein/SDF uploads, reference and explicit boxes, pose exports, cancellation/retry, reload recovery and stale-result removal passed. The 1HSG stereochemical ligand also passed the exact-coordinate handoff to GNINA browser scoring. The 3PTB HIS/TRP rejection remains enforced by that scorer.
- Returning visitors can upgrade the previous service worker and enable browser isolation. A fresh visitor receives a guarded first-visit reload for SharedArrayBuffer. No private docking API request is used by the public engine.
- The existing three tools passed browser regression, including MAO-B prediction and Grad-CAM, GNINA scoring and occlusion, downloads, failures and retry. Desktop and mobile viewport checks passed; physical mobile device performance was not tested.
- Approved MAO-B and GNINA model bytes remain unchanged. The MAO-B manifest now links the September 28 browser validation report included under artifacts/browser-fusion-validation.json; its SHA-256 matches the manifest.

## Release boundary

The four experimental screening checkpoints retain pending validation and redistribution status and are excluded. The two uncleared ETDock paper crops are excluded; an original lab diagram explains the cited method. Native private GNINA workflows remain in the maintainer workspace. Live docking is accurately labelled AutoDock Vina 1.2.3 through Webina 1.0.5, with Vina energies and no CNN rescoring.

Webina's exact upstream runtime bytes, licence and pinned commit are distributed; its loader resolves the verified module URL for pthread startup. Inputs, preparation, engine hashes, coordinate mapping and results accompany JSON exports. Two redocking examples verify implementation, not general docking accuracy or experimental affinity.

The locked npm dependencies retain pre-existing audit advisories (six in the complete install; five when dev dependencies are omitted). They concern build/serialization/image/source-map dependencies; no dependency versions were changed in this release. The static site has no public Node server. Dependency maintenance remains separate from this release.

Local evidence: artifacts/publication-20261017/ contains clean-*.log, browser-full.log, clean-browser-1hsg/, platform/platform-review.json and service-worker-upgrade.json. Runtime inputs and results in those local evidence directories are not included in the public repository.

The prior three-tool release was deployed from ed078a37909420864e21aa11f5e8d3f2745ade05 on 25 September 2026 in workflow run 36039966649, then taken offline during subsequent development.
