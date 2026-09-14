// Bounded, short-lived immutable image bytes; copied into each job's workspace.
export function createImageReuse({maxBytes=32*1024*1024,ttl=10*60*1000}={}){
  const entries=new Map();let bytes=0;
  return async function reuse(key,compute){
    const now=Date.now();
    for(const [k,v] of entries)if(now-v.at>=ttl){entries.delete(k);bytes-=v.size;}
    const hit=entries.get(key);
    if(hit){entries.delete(key);entries.set(key,hit);return hit.items;}
    const items=await compute();
    const size=items.reduce((n,x)=>n+x.data.length,0);
    if(!size||size>maxBytes/4)return items;
    // Another caller may have populated the same key during compute.
    if(entries.has(key))return entries.get(key).items;
    while(bytes+size>maxBytes){const k=entries.keys().next().value;bytes-=entries.get(k).size;entries.delete(k);}
    entries.set(key,{items,size,at:Date.now()});bytes+=size;
    return items;
  };
}
