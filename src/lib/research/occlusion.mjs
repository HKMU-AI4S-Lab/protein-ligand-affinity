export const regionLabel=group=>String.fromCharCode(65+group);
export function occlusionDisplay(delta,fusion){
 const threshold=fusion?.0001:.001;
 return {negligible:Math.abs(delta)<threshold,threshold,precision:fusion?4:3,color:Math.abs(delta)<threshold?'#aaaaaa':delta>0?'#345da8':'#a76436'};
}
/** Bounds are voxel edges in the native grid's coordinate system. */
export function regionBounds(group,center,kind){
 if(!Number.isInteger(group)||group<0||group>7||center.length!==3||!center.every(Number.isFinite))throw Error('Invalid spatial region');
 const bits=[(group>>2)&1,(group>>1)&1,group&1],origin=kind==='fusion'?-10:-12;
 const min=center.map((c,i)=>c+origin+12*bits[i]);return {min,max:min.map(v=>v+12)};
}
