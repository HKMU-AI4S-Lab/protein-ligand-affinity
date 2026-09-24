"""Reproduce CC BY AGIMA-Score figures; preserve pixels, colours and proportions."""
from pathlib import Path
import hashlib,json
from PIL import Image
import pymupdf as fitz
R=Path(__file__).resolve().parents[1]
source=R/'research_works/AGIMA-Score';out=R/'public/paper-figures'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for num,name in [('002','agima-adjacency'),('003','agima-architecture'),('009','agima-feature-importance')]:
 p=source/f'figure-{num}.tif';im=Image.open(p).convert('RGB');dest=out/f'{name}.webp';im.save(dest,lossless=True,method=6)
 records.append({'id':name,'source':p.relative_to(R).as_posix(),'sourceSha256':sha(p),'sourceUrl':f'https://journals.plos.org/ploscompbiol/article/figure/image?download&size=original&id=10.1371/journal.pcbi.1013074.g{num}','label':'Figure '+str(int(num)),'license':'CC BY 4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','operation':'Lossless WebP encoding; no pixel edits','width':im.width,'height':im.height,'artifact':{'path':dest.relative_to(R/'public').as_posix(),'sha256':sha(dest),'bytes':dest.stat().st_size}})
 if num=='002':
  box=(735,700,1333,1375);thumb=im.crop(box);target=out/'agima-interface.webp';thumb.save(target,lossless=True,method=6)
  records.append({'id':'agima-interface','source':p.relative_to(R).as_posix(),'sourceSha256':sha(p),'label':'Figure 2D excerpt','license':'CC BY 4.0','operation':'Rectangular crop of panel D only; pixels unchanged','cropPixels':box,'width':thumb.width,'height':thumb.height,'artifact':{'path':target.relative_to(R/'public').as_posix(),'sha256':sha(target),'bytes':target.stat().st_size}})
p=source/'AGIMA-Score_PLOS_2025.pdf';doc=fitz.open(p);box=(37,469,577,684);pix=doc[9].get_pixmap(matrix=fitz.Matrix(4,4),clip=fitz.Rect(box),alpha=False);im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples);dest=out/'agima-scoring-benchmark.webp';im.save(dest,lossless=True,method=6)
records.append({'id':'agima-scoring-benchmark','source':p.relative_to(R).as_posix(),'sourceSha256':sha(p),'sourceUrl':'https://doi.org/10.1371/journal.pcbi.1013074','label':'Table 2','page':10,'cropPoints':box,'license':'CC BY 4.0','operation':'Unaltered PDF rendering, rectangular crop of table and footnotes','width':im.width,'height':im.height,'artifact':{'path':dest.relative_to(R/'public').as_posix(),'sha256':sha(dest),'bytes':dest.stat().st_size}})
(R/'artifacts/agima-figure-provenance.json').write_text(json.dumps(records,indent=2)+'\n')
print([(r['id'],r['width'],r['height']) for r in records])
