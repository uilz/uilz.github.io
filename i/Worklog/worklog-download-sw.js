const sessions=new Map();
const waiters=new Map();
const REATTACH_GRACE_MS=90000;
function safeName(name){return String(name||'worklog-backup.zip').replace(/[\\"\r\n]/g,'_').replace(/[<>:*?|]/g,'_')||'worklog-backup.zip'}
async function waitForSession(token){
  const current=sessions.get(token);if(current)return current;
  return await new Promise((resolve,reject)=>{const arr=waiters.get(token)||[];arr.push({resolve,reject});waiters.set(token,arr);setTimeout(()=>{const xs=waiters.get(token)||[];const i=xs.findIndex(x=>x.resolve===resolve);if(i>=0)xs.splice(i,1);if(xs.length)waiters.set(token,xs);else waiters.delete(token);reject(new Error('下载会话不存在'))},30000)})
}
function failSession(session,message){
  session.error=new Error(message||'流式下载失败');
  clearTimeout(session.expireTimer);
  try{session.controller?.error(session.error)}catch{}
  try{session.port.postMessage({type:'error',message:session.error.message})}catch{}
  while(session.pendingAcks.length)session.pendingAcks.shift()(session.error);
  sessions.delete(session.token)
}
function armReattachTimeout(session){
  clearTimeout(session.reattachTimer);
  session.reattachTimer=setTimeout(()=>{
    if(session.detached&&!session.error&&!session.closed){failSession(session,'浏览器未完成下载确认，流式下载已停止')}
  },REATTACH_GRACE_MS)
}
function drain(session){
  if(!session.controller||session.error)return;
  try{
    while(session.queue.length && session.controller.desiredSize>0){
      const item=session.queue.shift();
      session.controller.enqueue(item.bytes);
      item.ack();
    }
    if(session.closed&&!session.queue.length){
      session.controller.close();
      try{session.port.postMessage({type:'closed',bytes:session.done})}catch{}
      clearTimeout(session.reattachTimer);sessions.delete(session.token)
    }
  }catch(e){failSession(session,e?.message||'下载流写入失败')}
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  const m=event.data||{};if(m.type!=='worklog-download-init')return;
  const token=String(m.token||'');if(!token||!event.ports[0])return;
  const port=event.ports[0];port.start?.();
  if(sessions.has(token)){
    try{port.postMessage({type:'error',message:'下载会话重复创建'})}catch{}
    try{port.close?.()}catch{}
    return;
  }
  const session={token,name:safeName(m.name),contentLength:Number.isFinite(Number(m.contentLength))?Number(m.contentLength):null,port,controller:null,queue:[],done:0,closed:false,error:null,pendingAcks:[],started:false,detached:false,reattachTimer:null,expireTimer:setTimeout(()=>failSession(session,'下载会话已过期'),10*60*1000)};
  sessions.set(token,session);
  const list=waiters.get(token)||[];waiters.delete(token);for(const w of list)w.resolve(session);
  port.onmessage=ev=>{
    const x=ev.data||{};
    if(x.type==='chunk'){
      if(session.error||session.detached)return;
      const bytes=x.bytes instanceof Uint8Array?x.bytes:new Uint8Array(x.bytes||0);
      const ack=()=>{try{session.port.postMessage({type:'ack'})}catch{}};
      session.done+=bytes.byteLength;session.queue.push({bytes,ack});drain(session)
    }else if(x.type==='close'){session.closed=true;drain(session)}
    else if(x.type==='abort'){failSession(session,String(x.message||'导出已中止'))}
  };
});
function landingHtml(token,name){
  const safe=String(name||'worklog-backup.zip').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const path=new URL(self.registration.scope).pathname;
  const downloadPath=path+'__worklog_download__?token='+encodeURIComponent(token);
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Worklog 备份下载</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f9;color:#1f2328}.box{width:min(420px,calc(100% - 40px));background:#fff;border:1px solid #e1e4e8;border-radius:18px;padding:28px;box-sizing:border-box;box-shadow:0 8px 30px rgba(0,0,0,.06)}h1{font-size:20px;margin:0 0 10px}.name{font-size:14px;line-height:1.5;word-break:break-all;color:#656d76;margin-bottom:22px}.btn{display:block;width:100%;border:0;border-radius:12px;padding:13px 16px;font-size:16px;background:#111827;color:#fff;text-align:center;text-decoration:none;box-sizing:border-box}.hint{font-size:12px;color:#8a919a;line-height:1.6;margin-top:14px}</style><div class="box"><h1>Worklog 备份已准备</h1><div class="name">${safe}</div><a class="btn" href="${downloadPath}" id="download">开始下载</a><div class="hint">请点击一次“开始下载”。浏览器确认后，备份会以流式方式持续传输。</div></div><script>document.getElementById('download').addEventListener('click',()=>{document.querySelector('.btn').textContent='正在启动下载…';},{once:true});</script>`;
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.pathname.endsWith('/__worklog_download_landing__')){
    const token=url.searchParams.get('token');
    if(!token)return;
    event.respondWith((async()=>{
      const session=await waitForSession(token);
      if(!session) return new Response('下载会话不存在或已过期',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      return new Response(landingHtml(token,session.name),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    })());
    return;
  }
  if(!url.pathname.endsWith('/__worklog_download__'))return;
  const token=url.searchParams.get('token');if(!token)return;
  event.respondWith((async()=>{
    const session=await waitForSession(token);
    session.started=true;session.detached=false;clearTimeout(session.reattachTimer);clearTimeout(session.expireTimer);
    try{session.port.postMessage({type:'started'})}catch{}
    const stream=new ReadableStream({
      start(controller){session.controller=controller;drain(session)},
      pull(controller){session.controller=controller;drain(session)},
      cancel(reason){
        const message=String(reason||'下载已取消');
        failSession(session,`浏览器下载已取消：${message}`);
      }
    });
    return new Response(stream,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${safeName(session.name)}"; filename*=UTF-8''${encodeURIComponent(session.name)}`,'Cache-Control':'no-store, no-cache, must-revalidate','Pragma':'no-cache','X-Content-Type-Options':'nosniff',...(session.contentLength!=null?{'Content-Length':String(session.contentLength)}:{})} });
  })());
});
