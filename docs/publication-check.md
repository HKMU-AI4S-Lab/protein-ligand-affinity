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

Deployment and live verification are recorded below after the restoration is published. Browser screenshots and inference exports remain outside the public build.
