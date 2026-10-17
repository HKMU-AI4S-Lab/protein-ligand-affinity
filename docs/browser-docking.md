# Browser docking and public release

The project owner selected Webina / AutoDock Vina for public browser docking on 17 October 2026 and authorized publication of the website. Native GNINA docking remains available through the existing localhost-only private proxy; no private server is exposed by the static release.

## Engine and preparation

The three vendored, unmodified Webina 1.0.5 runtime assets come from commit `4230729e7dad197b4c77912dffe30c8bcdd492ba`, compiled upstream from AutoDock Vina 1.2.3. Apache 2.0 notice and pinned source links accompany the distribution. Runtime preparation records their byte counts and SHA-256 values. The loader verifies the bytes, then resolves `import.meta.url` to the module's absolute same-origin URL before Blob loading, allowing upstream pthread initialisation to resolve its files. No docking/scoring algorithm is replaced.

Docking runs in a dedicated worker, with one Vina search CPU, user-specified search seed, exhaustiveness and maximum modes, and an energy range of 8 kcal/mol. PDB ID and PDB upload share the same inspection. Selected standard protein chains supply the rigid receptor; waters, non-selected chains and HETATM cofactors are removed. Modified residues, metals, covalent docking and unresolved alternate positions are unsupported. Binding-site completeness remains the user's responsibility. Hydrogens are rebuilt with Open Babel defaults without pH optimisation. The exported receptor retains deposited heavy-atom coordinates and names; GNINA adds hydrogens for typing when scoring a supplied pose.

SMILES or single-molecule SDF supplies ligand connectivity and explicit protonation/stereochemistry. RDKit validates a connected ligand with 5–80 heavy atoms and at most 15 rotatable bonds; supported elements are H/C/N/O/F/P/S/Cl/Br/I, without isotope labels or radicals. Open Babel Gen3D balanced creates a fresh conformer, discarding SDF starting coordinates. Gen3D is not seeded: the displayed seed controls the Vina search only. A canonical isomeric-SMILES round trip checks the generated conformer and every returned pose. Unsupported preparation fails visibly.

PDBQT serials preserve the original heavy-atom indices. Coordinates and types are checked before docking and after output. SDF export replaces only coordinates in the prepared molecule's connection table, retaining bonds, formal charges and stereo records; it does not infer bonds from a PDBQT pose. Poses are ranked by ascending Vina energy, in kcal/mol. No CNNscore or CNNaffinity is fabricated. The separate GNINA browser scorer receives the selected SDF and receptor coordinates unchanged and retains its existing chemical-typing and overlap guards.

## Browser lifecycle

GitHub Pages cannot set COOP/COEP response headers. The existing same-origin service worker adds those headers to controlled responses; the docking tool waits for activation and performs a guarded, single reload before accepting input. Unsupported browsers show a recovery message. Chemistry/Vina bytes load only after a calculation is requested, and use the existing integrity-checked cache. No analytics or upstream Webina app code is included.

IndexedDB stores the submitted inputs, terminal state and complete result. Session storage identifies the current run. Completed results restore after reload; a calculation interrupted by reload restores its inputs and requires a fresh calculation. Cancel or input changes terminate the worker and its descendant threads, discard visible results and prevent late output from becoming current. A ten-minute limit stops unbounded browser jobs. Storage errors are actionable; terminal results can still be downloaded if storage fills. Clear site data to remove stored structures.

## Release boundary and validation

`npm run build:public` retains the approved MAO-B and GNINA scoring manifests, removes four pending experimental checkpoint directories and both uncleared ETDock paper crops, and emits a release profile. The public publication gate checks actual packaged manifests and exclusions. Pending source records remain pending. An original SVG explains the ETDock method with a citation; it is not labelled a reproduced paper figure. The generic local publication gate continues to reject unapproved research assets.

`scripts/verify-browser-docking.cjs` runs actual Webina searches from RCSB PDB IDs, verifies exports and reload recovery, exercises SDF/protein uploads and explicit boxes, cancellation/retry, stale-result removal and mobile layout. Set `DOCKING_PDB_ID=1HSG` for the stereo-rich indinavir case and a successful GNINA scoring handoff; default 3PTB exercises benzamidine and the scorer's expected HIS/TRP rejection. `PUBLIC_QA=1 node scripts/check-custom-ui.cjs` verifies the three existing tools, including MAO-B Grad-CAM and GNINA occlusion. Set `TEST_BASE_URL` and `QA_OUTPUT_DIR` for a production run and isolated evidence.

Two redocking examples and existing numerical parity checks are implementation checks, not a broad docking benchmark or evidence of experimental affinity. Browser conformer generation differs from the private native GNINA pipeline. Device speed, available memory and browser policy determine usability. Desktop Chrome was tested; mobile viewport checks do not establish performance on physical mobile hardware.
