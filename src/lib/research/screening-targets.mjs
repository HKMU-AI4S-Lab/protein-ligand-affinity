// Only full GridSmiMCANet/Fusion checkpoints belong in this registry.
export const screeningTargets = [
  {id:'fusion-aofb', code:'aofb', label:'MAO-B', name:'Monoamine oxidase B'},
  {id:'fusion-egfr', code:'egfr', label:'EGFR', name:'Epidermal growth factor receptor'},
  {id:'fusion-parp1', code:'parp1', label:'PARP1', name:'Poly(ADP-ribose) polymerase 1'},
  {id:'fusion-dpp4', code:'dpp4', label:'DPP4', name:'Dipeptidyl peptidase 4'},
  {id:'fusion-hivpr', code:'hivpr', label:'HIV-1 protease', name:'HIV-1 protease'},
];
export const screeningTarget = id => screeningTargets.find(target => target.id === id);
export const isFusionModel = id => Boolean(screeningTarget(id));
export const isLocalPreviewHost = hostname => ['127.0.0.1','localhost','[::1]'].includes(hostname);
export const availableScreeningTargets = (manifests,hostname) => screeningTargets.filter(target => {
  const manifest=manifests[target.id];
  return Boolean(manifest&&(manifest.validation.status==='passed'||isLocalPreviewHost(hostname)));
});
