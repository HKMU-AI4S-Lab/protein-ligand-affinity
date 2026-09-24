# Publication check — 25 September 2026

The approved three-method website is published at [protein-ligand-affinity](https://hkmu-ai4s-lab.github.io/protein-ligand-affinity/). The source repository is [HKMU-AI4S-Lab/protein-ligand-affinity](https://github.com/HKMU-AI4S-Lab/protein-ligand-affinity).

## Release

- Deployed source commit: `ed078a37909420864e21aa11f5e8d3f2745ade05`.
- Successful [GitHub Pages workflow](https://github.com/HKMU-AI4S-Lab/protein-ligand-affinity/actions/runs/36039966649): build and deploy both completed.
- Pages uses GitHub Actions. `ENABLE_PUBLIC_DEPLOY=true` enables the manually dispatched release workflow; a push alone does not deploy.
- The three large inference files were uploaded with the Hugging Face CLI to `micklee17/protein-ligand-affinity-web-assets`, revision `784a88468de2077a8b50d1fd9353590930039aee`.
- The Pages artifact is approximately 104.4 MB. Large model files remain outside Git and the Pages artifact; pinned manifest URLs retain their original byte counts and SHA-256 hashes.

Deployment preserved the approved public wording, design, paper crops, teaching figures, scientific inputs and outputs. Necessary release changes cover asset hosting, clean-build provisioning, publication records, and a small footer link to software licences and corresponding Open Babel sources.

## Completed checks

| Check | Result |
| --- | --- |
| Clean installation and unit tests | 66 passed; no failures |
| Astro and TypeScript | 96 files; zero errors, warnings or hints |
| Scientific content and figure provenance | 46 artifact hashes and all figure/source checks passed |
| Production build and publication gate | Passed locally and in the clean Ubuntu GitHub runner |
| Built-site audit | 18 HTML pages, 79 local references, zero issues |
| Deployed resource audit | 361 resources checked; no unresolved missing or broken resources |
| Hosted inference files | Immutable URLs, expected sizes, CORS and successful browser download/integrity checks |
| Live scientific workflows | Representations, Screening with Grad-CAM, and both BAP examples with all eight occlusion regions passed |
| Recovery and caching | Cancellation, changed inputs, stale-result suppression, failed/interrupted grid recovery, corrupt-cache repair and cached restarts passed |
| Offline operation | Reload and new calculations worked from verified caches for both models |
| Compatibility | Nested pages, legacy method redirects and missing-snapshot recovery passed |

The live Screening test downloaded the full hosted checkpoint and reused it for Grad-CAM. Interpretation retained the prediction score, model, tokens, grid and coordinates. Both prepared affinity examples matched native reference tolerances. Weak Grad-CAM values retained the shared scale. Existing native Fusion parity, derivative-download recovery and verified legacy snapshot-restoration checks remain applicable; publication did not change their scientific implementation.

The deployed resource audit accounted for platform-specific dependency licence lists and Astro-generated component identifiers when comparing the Windows preview with the Linux release. Scientific assets and runtime files retained their verified bytes.

## Rendered review

The live homepage and all three method articles were reviewed at desktop and mobile reading sizes, including published figures beside the teaching panels, captions, navigation and demonstration controls. Paper enlargement remained keyboard accessible. Mobile arrangements stayed within the viewport, with no observed clipping or overlap. The new software-credit page was also inspected on mobile.

Review used Chrome 153.0.8010.54 with desktop and mobile viewport emulation, not physical-device testing. Visual assessment was performed separately from the automated checks. Original dense paper figures remain available through enlargement on small screens.

Local evidence includes `live/rethink-chrome-verification.json`, `live/resource-audit.json`, live inference outputs, `live/visual-review/` captures, and `rethink-chrome-failures-and-visuals.json` in the publication evidence directory. These reports are not included in the public website.

No publication blockers remain. See [deployment instructions](deployment.md) for subsequent releases.
