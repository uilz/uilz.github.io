self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
const enc=new TextEncoder();
function fixedBytes(n,seed=65){const b=new Uint8Array(n);for(let i=0;i<n;i++)b[i]=(seed+i)%256;return b}
function streamBytes(total,chunk=64*1024){let sent=0;return new ReadableStream({pull(c){if(sent>=total){c.close();return}const n=Math.min(chunk,total-sent);c.enqueue(fixedBytes(n,65+(sent/chunk)%23));sent+=n},cancel(){}})}
function infoBlob(kind){if(kind==='blob-cl')return new Blob([fixedBytes(64*1024)],{type:'application/octet-stream'});if(kind==='blob-nolen')return new Blob([fixedBytes(64*1024)],{type:'application/octet-stream'});return null}
function headers(name,len,withLen=true){const h={'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${name.replace(/"/g,'')}"`,'Cache-Control':'no-store'};if(withLen)h['Content-Length']=String(len);return h}
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='download-probe-start'){try{e.source?.postMessage({type:'download-prepared',id:d.id})}catch{}}});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.hostname!=='download-probe.invalid')return;const p=u.pathname.split('/').filter(Boolean);const kind=p[0]||'';const id=decodeURIComponent(p[1]||'');const qs=u.searchParams;let body, len, withLen=true, name='probe.bin';
if(kind==='blob-cl'){body=fixedBytes(64*1024);len=body.byteLength;name='probe-04-sw-blob.bin'}
else if(kind==='blob-nolen'){body=new Blob([fixedBytes(64*1024)]);len=body.size;withLen=false;name='probe-05-sw-blob-nolen.bin'}
else if(kind==='bytes'){body=fixedBytes(64*1024);len=body.byteLength;name='probe-06-sw-bytes.bin'}
else if(kind==='stream'){body=streamBytes(1024*1024);len=1024*1024;name='probe-07-sw-stream.bin'}
else if(kind==='stream-nolen'){body=streamBytes(1024*1024);len=1024*1024;withLen=false;name='probe-08-sw-stream-nolen.bin'}
else if(kind==='stream-8m'){body=streamBytes(8*1024*1024);len=8*1024*1024;name='probe-09-sw-stream-8m.bin'}
else if(kind==='stream-utf8'){body=streamBytes(256*1024);len=256*1024;name='probe-10-中文文件名.bin'}
else if(kind==='stream-token'){body=streamBytes(512*1024);len=512*1024;name='probe-11-token.bin'}
else if(kind==='cache'){body=fixedBytes(128*1024);len=128*1024;name='probe-12-cache.bin'}
else{return}
let response;
try{response=new Response(body,{status:200,headers:headers(name,len,withLen)})}catch(err){e.respondWith(new Response('SW error',{status:500}));return}
e.respondWith((async()=>{const clients=await self.clients.matchAll({includeUncontrolled:true,type:'window'});for(const c of clients){try{c.postMessage({type:'download-started',id,kind,bytes:len,contentLength:withLen?len:null})}catch{}}return response})());
});
