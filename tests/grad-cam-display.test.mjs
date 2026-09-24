import test from 'node:test';
import assert from 'node:assert/strict';
import {CAM_MAX,CAM_RESOLUTION,camColor,camSlice,camPlane,fusionCamFrame,validateCam,explanationMatches} from '../src/lib/research/grad-cam.mjs';

const center=[13,-2,7],frame=fusionCamFrame(center);
const explanation={method:'grad-cam',shape:[12,12,12],values:Float32Array.from({length:1728},(_,i)=>i*1e-9),spatialFrame:frame};
test('all Grad-CAM slices preserve tensor order and the strided native activation coordinates',()=>{
 assert.deepEqual(frame.origin,[3.5,-11.5,-2.5]);
 for(const axis of ['x','y','z'])for(let index=0;index<12;index++){
  const s=camSlice(explanation,axis,index),axisIndex=['x','y','z'].indexOf(axis);assert.equal(s.cells.length,144);
  const seen=new Set();for(const c of s.cells){assert.equal(c.xyz[axisIndex],index);const [x,y,z]=c.xyz;assert.equal(c.at,x*144+y*12+z);assert.equal(c.value,explanation.values[c.at]);assert.deepEqual(c.position,c.xyz.map((v,i)=>center[i]-9.5+2*v));assert.equal(c.xyz[s.u],c.col);assert.equal(c.xyz[s.v],c.row);seen.add(c.at);}assert.equal(seen.size,144);
  const plane=camPlane(explanation,axis,index);assert.equal(plane.vertexArr.length,144*4);assert.equal(plane.faceArr.length,144*6);
  for(let i=0;i<144;i++){const vertices=plane.vertexArr.slice(i*4,i*4+4);for(const a of ['x','y','z']){const mean=vertices.reduce((sum,p)=>sum+p[a],0)/4;assert.equal(mean,s.cells[i].position[['x','y','z'].indexOf(a)]);}assert.equal(plane.color.length,plane.vertexArr.length);}
 }
});
test('Grad-CAM colours use a shared absolute scale without boosting tiny or diffuse signals',()=>{
 for(const v of [0,1e-25,CAM_RESOLUTION*.999])assert.equal(camColor(v),'#f2f2f2');
 assert.notEqual(camColor(CAM_RESOLUTION),camColor(0));assert.notEqual(camColor(CAM_MAX/2),camColor(CAM_MAX));assert.equal(camColor(CAM_MAX),camColor(CAM_MAX*2));
 for(const value of [CAM_RESOLUTION,CAM_MAX/4,CAM_MAX/2,CAM_MAX,2*CAM_MAX]){const hex=camColor(value);assert.ok(parseInt(hex.slice(5,7),16)>parseInt(hex.slice(3,5),16));assert.ok(parseInt(hex.slice(3,5),16)>parseInt(hex.slice(1,3),16));}assert.equal(camColor(CAM_MAX),'#315da8');
 assert.throws(()=>camColor(NaN));assert.throws(()=>camColor(-1));assert.throws(()=>camSlice(explanation,'q',0));assert.throws(()=>camSlice(explanation,'x',12));assert.throws(()=>validateCam({...explanation,shape:[24,24,24]}));
});
test('explanations must match every input and model identity before display',()=>{
 const p={inputIdentity:'input',gridSha256:'grid',tokensSha256:'tokens',checkpointSha256:'weights',preprocessingVersion:'source-v1'};
 assert.equal(explanationMatches({...p,method:'grad-cam'},p),true);
 for(const key of Object.keys(p))assert.equal(explanationMatches({...p,[key]:'stale'},p),false);
 assert.equal(explanationMatches(p,null),false);
});
