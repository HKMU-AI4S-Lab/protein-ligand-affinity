// Display calibration is fixed across molecules; raw attributions are untouched.
export const CAM_MAX = 1e-5;
export const CAM_RESOLUTION = 1e-8;
export const CAM_AXES = ['x', 'y', 'z'];
export function fusionCamFrame(center) {
  if (center?.length !== 3 || !center.every(Number.isFinite)) throw Error('Invalid Grad-CAM center');
  return {origin:center.map(v=>v-9.5),spacing:[2,2,2],axes:['x','y','z'],units:'angstrom'};
}
export function validateCam(e) {
  if(e?.method!=='grad-cam'||e.shape?.join(',')!=='12,12,12'||e.values?.length!==1728||
    !e.values.every(v=>Number.isFinite(v)&&v>=0)||e.spatialFrame?.axes?.join(',')!=='x,y,z'||
    e.spatialFrame.origin?.length!==3||!e.spatialFrame.origin.every(Number.isFinite)||e.spatialFrame.spacing?.join(',')!=='2,2,2')
    throw Error('Invalid spatial Grad-CAM result');
  return e;
}
export function camColor(value) {
  if(!Number.isFinite(value)||value<0)throw Error('Invalid Grad-CAM intensity');
  if(value<CAM_RESOLUTION)return '#f2f2f2';
  const t=Math.min(1,value/CAM_MAX),low=[242,245,252],high=[49,93,168];
  return '#'+low.map((v,i)=>Math.round(v+(high[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
export function camSlice(explanation,axis,index) {
  const e=validateCam(explanation),fixed=CAM_AXES.indexOf(axis);
  if(fixed<0||!Number.isInteger(index)||index<0||index>=12)throw Error('Invalid Grad-CAM slice');
  const [u,v]=[0,1,2].filter(a=>a!==fixed),{origin,spacing}=e.spatialFrame,cells=[];
  for(let row=0;row<12;row++)for(let col=0;col<12;col++) {
    const xyz=[0,0,0];xyz[fixed]=index;xyz[u]=col;xyz[v]=row;
    const at=(xyz[0]*12+xyz[1])*12+xyz[2];
    cells.push({row,col,xyz,at,value:e.values[at],position:xyz.map((j,a)=>origin[a]+spacing[a]*j)});
  }
  return {cells,u,v,fixed,position:origin[fixed]+spacing[fixed]*index};
}
export function camPlane(explanation,axis,index) {
  const slice=camSlice(explanation,axis,index),vertexArr=[],faceArr=[],color=[];
  for(const cell of slice.cells) {
    const start=vertexArr.length,hex=camColor(cell.value),rgb={r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255};
    for(const [du,dv] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      const p=cell.position.slice();p[slice.u]+=du;p[slice.v]+=dv;
      vertexArr.push({x:p[0],y:p[1],z:p[2]});color.push(rgb);
    }
    faceArr.push(start,start+1,start+2,start,start+2,start+3);
  }
  return {vertexArr,faceArr,color,opacity:.38};
}
export function explanationMatches(e,prediction) {
  return !!prediction&&['inputIdentity','gridSha256','tokensSha256','checkpointSha256','preprocessingVersion'].every(key=>e?.[key]===prediction[key]);
}
