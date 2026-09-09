const sessions=new Map();
const waiters=new Map();
function safeName(name){return String(name||'worklog-backup.zip').replace(/[\\"\r\n]/g,'_').replace(/[<>:*?|]/g,'_')||'worklog-backup.zip'}
async function waitForSession(token){
  const current=sessions.get(token);if(current)return current;
  return await new Promise((resolve,reject)=>{const arr=waiters.get(token)||[];arr.push({resolve,reject});waiters.set(token,arr);setTimeout(()=>{const xs=waiters.get(token)||[];const i=xs.findIndex(x=>x.resolve===resolve);if(i>=0)xs.splice(i,1);if(xs.length)waiters.set(token,xs);else waiters.delete(token);reject(new Error('下载会话不存在'))},10000)})
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  const m=event.data||{};
  if(m.type==='worklog-download-init'){
    const token=String(m.token||'');if(!token||!event.ports[0])return;
    const port=event.ports[0];port.start?.();
    const session={token,name:safeName(m.name),port,controller:null,queue:[],done:0,closed:false,error:null,waiters:[]};
    sessions.set(token,session);
    const list=waiters.get(token)||[];waiters.delete(token);for(const w of list)w.resolve(session);
    port.onmessage=ev=>{
      const x=ev.data||{};
      if(x.type==='chunk'){
        const bytes=x.bytes instanceof Uint8Array?x.bytes:new Uint8Array(x.bytes||0);session.done+=bytes.byteLength;
        if(session.controller){try{session.controller.enqueue(bytes);session.port.postMessage({type:'ack'})}catch(e){session.error=e;try{session.controller.error(e)}catch{}session.port.postMessage({type:'error',message:e.message||'下载流写入失败'})}}
        else {session.queue.push(bytes);session.port.postMessage({type:'ack'})}
      }else if(x.type==='close'){
        session.closed=true;
        if(session.controller){try{session.controller.close()}catch{}session.port.postMessage({type:'closed',bytes:session.done});sessions.delete(token)}
      }else if(x.type==='abort'){
        session.error=new Error(x.message||'导出已中止');try{session.controller?.error(session.error)}catch{}try{session.port.postMessage({type:'error',message:session.error.message})}catch{}sessions.delete(token)
      }
    };
  }
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(!url.pathname.endsWith('/__worklog_download__'))return;const token=url.searchParams.get('token');if(!token)return;
  event.respondWith((async()=>{
    const session=await waitForSession(token);session.port.postMessage({type:'started'});
    const stream=new ReadableStream({start(controller){session.controller=controller;for(const bytes of session.queue)controller.enqueue(bytes);session.queue.length=0;if(session.closed){controller.close();session.port.postMessage({type:'closed',bytes:session.done});sessions.delete(token)}},cancel(reason){try{session.port.postMessage({type:'error',message:String(reason||'下载取消')})}catch{}sessions.delete(token)}});
    return new Response(stream,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${safeName(session.name)}"; filename*=UTF-8''${encodeURIComponent(session.name)}`,'Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
  })());
});
