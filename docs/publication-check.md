# Publication check - restoration, 17 October 2026

This release restores the website requested by the project owner: the method sequence is representations, screening, docking, scoring; the original ETDock pose and architecture images are retained; the ETDock paper links to its working publisher page; all five screening targets are included. Public docking retains Webina 1.0.5 / AutoDock Vina 1.2.3. No reduced public profile or exclusion list is used.

## Why the four targets were absent

The four checkpoints already had native/browser parity and held-out assessment records. Their manifests still carried pending validation and redistribution metadata, which the production-host worker rejected while localhost permitted them. Each also referenced an approximately 891 MB weight file that had no immutable public URL. The prior publication excluded the targets instead of resolving those release prerequisites.

The unchanged weight files are now hosted at Hugging Face revision `8438a8c92c5aedd45b98b425aa6614f613fe7088`. Their manifests retain the original model, checkpoint and weight hashes, bind the existing numerical validation reports, and record the owner's explicit publication authorization. The standard publication gate checks all five screening targets, GNINA scoring, figure records and chemistry source distribution. The worker's validation guard remains enabled.

`validation.status: passed` records native/ONNX/browser numerical fidelity and the checked Grad-CAM export. It does not claim prospective validation or calibrated activity probabilities. The measured input-rejection and conformer-repeatability limits remain in [five-target validation](five-target-local-preview.md).

## Verification

- 92 tests passed; Astro/TypeScript checked the release source without errors, warnings or hints.
- Standard production build, full publication gate and built-site audit passed: 21 pages, 110 local references, no audit issues.
- Original ETDock images match their recorded SHA-256 values. The working publisher paper URL returns HTTP 200.
- Desktop and mobile checks cover 1440, 1024, 820 and 390 px, with no horizontal overflow.
- All five screening targets completed actual browser scoring, matching Grad-CAM, downloads and target-change invalidation. GNINA scoring, structure preparation, exports, cancellation and network-error recovery passed without uncaught browser exceptions.
- Webina completed an actual docking search, JSON export, reload recovery and the GNINA scoring handoff.

## Published restoration

- GitHub Pages deployed source commit `903b7daf8972b75b08524723aaaf6c568666bdab`; [workflow run 39046082165](https://github.com/HKMU-AI4S-Lab/protein-ligand-affinity/actions/runs/39046082165) completed successfully, including tests, type checking, the normal build, built-site audit and full publication gate.
- Live verification used `https://hkmu-ai4s-lab.github.io/protein-ligand-affinity/`, not localhost. MAO-B, EGFR, PARP1, DPP4 and HIV-1 protease each downloaded their full public weights, completed scoring and matching Grad-CAM, exported results, and invalidated stale output on a target change.
- The public Webina tool completed docking from PDB ID 1HSG and from uploaded receptor/ligand files, result downloads, reload recovery, cancellation/retry, and the GNINA scoring handoff. No private proxy requests occurred.
- Representations, GNINA PDB/upload scoring and occlusion, all exports, input rejection, cancellation and network-error retry passed. No uncaught browser exceptions were observed across these journeys.
- Live DOM and image checks confirmed the original method order, the working ETDock publisher URL, and both original ETDock images by SHA-256. Desktop/mobile layout checks passed at 1440, 1024, 820 and 390 px.

Browser evidence is retained outside the public build in `%TEMP%/molecule-net-restore-live/` (`platform-review.json`, `restoration-review.json`, screenshots and inference exports) and `%TEMP%/molecule-net-restore-docking-live/` (`result.json`, screenshots and run exports).
