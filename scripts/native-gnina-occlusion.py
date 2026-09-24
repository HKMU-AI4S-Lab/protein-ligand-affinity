from pathlib import Path
import importlib.util,json
import numpy as np,torch
root=Path.cwd();spec=importlib.util.spec_from_file_location('exporter',root/'scripts/export-research-models.py');ex=importlib.util.module_from_spec(spec);spec.loader.exec_module(ex);torch.set_num_threads(2);model,_=ex.load_gnina();report={}
for name in ['1hsg','1hvr']:
 grid=torch.from_numpy(np.fromfile(root/f'public/research/gnina-crossdock/{name}-grid.bin',dtype='<f4').reshape(1,28,48,48,48));changes=[]
 with torch.no_grad():
  baseline=model(grid)[1].item()
  for group in range(8):
   masked=grid.clone();x=(group>>2)&1;y=(group>>1)&1;z=group&1;masked[:,:,x*24:(x+1)*24,y*24:(y+1)*24,z*24:(z+1)*24]=0;changes.append(baseline-model(masked)[1].item())
 report[name]={'gridSha256':ex.digest(root/f'public/research/gnina-crossdock/{name}-grid.bin'),'baseline':baseline,'changes':changes}
(root/'artifacts/gnina-native-occlusion.json').write_text(json.dumps(report,indent=2));print(report)
