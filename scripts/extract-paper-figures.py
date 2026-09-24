"""Render unaltered figure/table crops from the supplied manuscripts."""
from pathlib import Path
import hashlib
import json
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'unimolrep': 'research_works/UniMolRep/UniMolRep_JCIM_clean.pdf',
    'fusion': 'research_works/MolecularGridFusion/Deep learning on the fusion of chemical sequences and molecular grids.pdf',
}
# Rectangles in PDF points, measured from the top left. Only the figure/table
# is cropped; the accessible website caption supplies the source attribution.
CROPS = [
    ('unimolrep-taxonomy', 'unimolrep', 2, (144, 58, 470, 272), 'Figure 1'),
    ('unimolrep-workflow', 'unimolrep', 3, (115, 61, 492, 255), 'Figure 2'),
    ('unimolrep-small-molecule-benchmarks', 'unimolrep', 7, (72, 91, 541, 345), 'Table 3'),
    ('unimolrep-affinity-benchmarks', 'unimolrep', 7, (72, 384, 541, 531), 'Table 4'),
    ('fusion-screening-overview', 'fusion', 2, (121, 192, 361, 351), 'Figure 1'),
    ('fusion-architecture', 'fusion', 3, (56, 106, 425, 233), 'Figure 2'),
    ('fusion-performance', 'fusion', 6, (57, 497, 425, 613), 'Figure 3'),
    ('fusion-attention-ablation', 'fusion', 7, (128, 430, 353, 469), 'Table 4'),
    ('fusion-representation-ablation', 'fusion', 8, (128, 81, 353, 120), 'Table 5'),
]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    output = ROOT / 'public/paper-figures'
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for name, source, number, rect, label in CROPS:
        path = ROOT / SOURCES[source]
        doc = pdfium.PdfDocument(path)
        page = doc[number - 1]
        bitmap = page.render(scale=4)
        image = bitmap.to_pil().crop(tuple(round(v * 4) for v in rect))
        target = output / (name + '.webp')
        image.save(target, lossless=True, method=6)
        records.append({'id': name, 'source': SOURCES[source], 'sourceSha256': digest(path),
                        'page': number, 'label': label, 'cropPoints': rect,
                        'artifact': {'path': target.relative_to(ROOT / 'public').as_posix(),
                                     'sha256': digest(target), 'bytes': target.stat().st_size},
                        'width': image.width, 'height': image.height,
                        'operation': 'Unaltered PDF rendering; rectangular crop only',
                        'redistributionApproved': False})
        bitmap.close()
        page.close()
        doc.close()
    (ROOT / 'artifacts/paper-figure-provenance.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
    print('Rendered', len(records), 'paper figure/table crops.')

if __name__ == '__main__':
    main()
