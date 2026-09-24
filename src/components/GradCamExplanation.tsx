import {citations} from '../data/citations.mjs';
import {CAM_AXES,CAM_MAX,CAM_RESOLUTION,camColor,camSlice} from '../lib/research/grad-cam.mjs';
import type {ReactNode} from 'react';
export type CamSelection={axis:'x'|'y'|'z';index:number;overlay:boolean};
export const initialCamSelection:CamSelection={axis:'z',index:5,overlay:true};
export default function GradCamExplanation({explanation:e,selection,onChange,molecule}:{explanation:any;selection:CamSelection;onChange:(s:CamSelection)=>void;molecule:ReactNode}) {
 const slice=camSlice(e,selection.axis,selection.index),max=Math.max(...e.values),below=max<CAM_RESOLUTION,overflow=max>CAM_MAX;
 const axisLabel=(a:number)=>CAM_AXES[a].toUpperCase(),origin=e.spatialFrame.origin;
 return <section className="explanation-view grad-cam-view" aria-labelledby="cam-title">
  <h3 id="cam-title">Grad-CAM</h3><p>Move through the grid to explore spatial evidence for this screening score.</p>
  <div className="cam-controls"><label>Cross-section axis<select aria-label="Grad-CAM axis" value={selection.axis} onChange={ev=>onChange({...selection,axis:ev.target.value as CamSelection['axis']})}>{CAM_AXES.map(a=><option key={a} value={a}>{a.toUpperCase()}</option>)}</select></label>
  <label>Slice <output>{selection.index+1} of 12</output><input aria-label="Grad-CAM slice" type="range" min="0" max="11" step="1" value={selection.index} onChange={ev=>onChange({...selection,index:Number(ev.target.value)})}/></label>
  <label className="cam-overlay"><input type="checkbox" checked={selection.overlay} onChange={ev=>onChange({...selection,overlay:ev.target.checked})}/>Show slice on molecule</label></div>
  <div className="cam-readout" aria-live="polite">{selection.axis.toUpperCase()} = {slice.position.toFixed(2)} Å · same slice in both views</div>
  <div className="cam-map-layout"><div className="cam-molecule">{molecule}</div><figure className="cam-map"><svg viewBox="0 0 320 312" role="img" aria-label={'Grad-CAM '+selection.axis.toUpperCase()+' cross-section, slice '+(selection.index+1)}>
   {slice.cells.map(cell=><rect key={cell.at} x={50+cell.col*20} y={18+(11-cell.row)*20} width="20" height="20" fill={camColor(cell.value)} data-voxel={cell.xyz.join(',')} data-value={cell.value}><title>{cell.xyz.map((i:number,a:number)=>axisLabel(a)+' '+(origin[a]+2*i).toFixed(2)+' Å').join(', ')}: {cell.value.toExponential(3)}</title></rect>)}
   <text x="60" y="277" textAnchor="middle">{origin[slice.u].toFixed(1)}</text><text x="280" y="277" textAnchor="middle">{(origin[slice.u]+22).toFixed(1)}</text><text x="170" y="300" textAnchor="middle">{axisLabel(slice.u)} (Å) →</text>
   <text x="43" y="32" textAnchor="end">{(origin[slice.v]+22).toFixed(1)}</text><text x="43" y="252" textAnchor="end">{origin[slice.v].toFixed(1)}</text><text transform="translate(14 137) rotate(-90)" textAnchor="middle">{axisLabel(slice.v)} (Å) →</text>
  </svg><figcaption>12 × 12 cross-section · 2 Å spacing.</figcaption></figure></div>
  <div className="cam-key"><h4>Grad-CAM intensity</h4><div className="cam-legend" aria-hidden="true"/><div className="cam-legend-labels"><span>0</span><span>0.00001</span></div><p className="small">Shared colour scale · neutral below 0.00000001.</p>
  <p className="cam-signal" role="status">{below?'Below colour-scale resolution':overflow?'Some values exceed the colour range (≥0.00001).':'Darker cells indicate stronger positive evidence.'}</p><p className="small">Peak intensity: {max.toExponential(3)}.</p></div>
  <p className="small"><a href={citations.gradcam.url}>About the method ↗</a></p>
 </section>;
}
