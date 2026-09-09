const sessions=new Map();
const waiters=new Map();
function safeName(name){return String(name||'worklog-backup.zip').replace(/[\\"\r\n]/g,'_').replace(/[<>:*?|]/g,'_')||'worklog-backup.zip'}
async function waitForSession(token){
  const current=sessions.get(token);if(current)return current;
  return await new Promise((resolve,reject)=>{const arr=waiters.get(token)||[];arr.push({resolve,reject});waiters.set(token,arr);setTimeout(()=>{const xs=waiters.get(token)||[];const i=xs.findIndex(x=>x.resolve===resolve);if(i>=0)xs.splice(i,1);if(xs.length)waiters.set(token,xs);else waiters.delete(token);reject(new Error('下载会话不存在'))},30000)})
}
function failSession(session,message){
  session.error=new Error(message||'流式下载失败');
  try{session.controller?.error(session.error)}catch{}
  try{session.port.postMessage({type:'error',message:session.error.message})}catch{}
  while(session.pendingAcks.length)session.pendingAcks.shift()();
  sessions.delete(session.token);
}
function drain(session){
  if(!session.controller||session.error)return;
  try{
    while(session.queue.length && session.controller.desiredSize>0){
      const item=session.queue.shift();
      session.controller.enqueue(item.bytes);
      item.ack();
    }
    if(session.closed && !session.queue.length){
      session.controller.close();
      try{session.port.postMessage({type:'closed',bytes:session.done})}catch{}
      sessions.delete(session.token);
    }
  }catch(e){failSession(session,e?.message||'下载流写入失败')}
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  const m=event.data||{};
  if(m.type!=='worklog-download-init')return;
  const token=String(m.token||'');if(!token||!event.ports[0])return;
  const port=event.ports[0];port.start?.();
  const session={token,name:safeName(m.name),port,controller:null,queue:[],done:0,closed:false,error:null,pendingAcks:[]};
  sessions.set(token,session);
  const list=waiters.get(token)||[];waiters.delete(token);for(const w of list)w.resolve(session);
  port.onmessage=ev=>{
    const x=ev.data||{};
    if(x.type==='chunk'){
      const bytes=x.bytes instanceof Uint8Array?x.bytes:new Uint8Array(x.bytes||0);
      const ack=()=>{try{session.port.postMessage({type:'ack'})}catch{}};
      session.done+=bytes.byteLength;
      session.queue.push({bytes,ack});
      drain(session);
    }else if(x.type==='close'){
      session.closed=true;
      drain(session);
    }else if(x.type==='abort'){
      failSession(session,String(x.message||'导出已中止'));
    }
  };
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(!url.pathname.endsWith('/__worklog_download__'))return;
  const token=url.searchParams.get('token');if(!token)return;
  event.respondWith((async()=>{
    const session=await waitForSession(token);
    session.port.postMessage({type:'started'});
    const stream=new ReadableStream({
      start(controller){session.controller=controller;drain(session)},
      pull(controller){session.controller=controller;drain(session)},
      cancel(reason){failSession(session,String(reason||'下载已取消'))}
    });
    return new Response(stream,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${safeName(session.name)}"; filename*=UTF-8''${encodeURIComponent(session.name)}`,'Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
  })());
});
