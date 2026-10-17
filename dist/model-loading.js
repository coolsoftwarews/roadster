// Keep network failures recoverable and never accept a cached HTML fallback as a model.
export async function fetchModelBytes(url,{onProgress=()=>{},fetchImpl=globalThis.fetch,timeoutMs=45000,cache='default'}={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{signal:controller.signal,cache});
    if(!response.ok)throw new Error(`Roadster download failed (${response.status})`);
    const total=Number(response.headers.get('content-length'))||0;
    const reader=response.body?.getReader();let data;
    if(reader){
      const chunks=[];let loaded=0;
      for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;onProgress({stage:'download',loaded,total});}
      const bytes=new Uint8Array(loaded);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}data=bytes.buffer;
    }else data=await response.arrayBuffer();
    const header=new DataView(data);
    if(data.byteLength<12||header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==data.byteLength)throw new Error('Roadster download was not a complete GLB model');
    return data;
  }catch(error){
    if(controller.signal.aborted)throw new Error('Roadster download timed out');
    throw error;
  }finally{clearTimeout(timeout);}
}

export async function loadModelWithRecovery(candidates,load,onProgress=()=>{}){
  const failures=[];
  for(let attempt=0;attempt<candidates.length;attempt++){
    const candidate=candidates[attempt];
    const report=progress=>onProgress({...progress,attempt,variant:candidate.variant});
    report({stage:attempt?'retry':'download',loaded:0,total:0});
    try{
      const rig=await load(candidate,{onProgress:report,cache:attempt?'reload':'default'});
      report({stage:'ready'});return rig;
    }catch(error){failures.push(error);}
  }
  throw new AggregateError(failures,'The detailed Roadster could not be loaded');
}
