const modules=import.meta.glob('./*.mjs',{eager:true,import:'default'});
export const adapters=Object.fromEntries(Object.values(modules).map(a=>[a.id,a]));
