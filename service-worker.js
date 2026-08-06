const WISENT_VERSION="V224";
const WISENT_CACHE="wisent-erp-static-v224";
const WISENT_CACHE_PREFIX="wisent-erp-static-";
const WISENT_META_CACHE="wisent-erp-meta-v1";
const WISENT_STABLE_REQUEST="./__wisent_stable_cache__";
const WISENT_STATIC=["./index.html","./pdf-lib.min.js","./manifest.json"];

async function readStableCacheName(){
  try{
    const meta=await caches.open(WISENT_META_CACHE);
    const response=await meta.match(WISENT_STABLE_REQUEST);
    return response?String(await response.text()):"";
  }catch(error){
    return "";
  }
}

async function writeStableCacheName(cacheName){
  const meta=await caches.open(WISENT_META_CACHE);
  await meta.put(WISENT_STABLE_REQUEST,new Response(String(cacheName||""),{
    headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}
  }));
}

async function cacheApplicationShell(){
  const cache=await caches.open(WISENT_CACHE);
  for(const asset of WISENT_STATIC){
    try{
      const response=await fetch(new Request(asset,{cache:"reload"}));
      if(!response.ok)throw new Error("HTTP "+response.status);
      if(asset==="./index.html"){
        const html=await response.clone().text();
        if(!html.includes('APP_BUILD_VERSION="'+WISENT_VERSION+'"')){
          throw new Error("index.html ainda não corresponde à "+WISENT_VERSION);
        }
      }
      await cache.put(asset,response);
    }catch(error){
      if(asset==="./index.html")throw error;
    }
  }
}

async function staticCacheNames(){
  const keys=await caches.keys();
  return keys.filter(key=>key.startsWith(WISENT_CACHE_PREFIX)).sort().reverse();
}

async function previousOrStableIndex(){
  const stable=await readStableCacheName();
  const names=await staticCacheNames();
  const candidates=[];
  if(stable&&stable!==WISENT_CACHE)candidates.push(stable);
  names.forEach(name=>{if(name!==WISENT_CACHE&&!candidates.includes(name))candidates.push(name);});
  for(const name of candidates){
    const cache=await caches.open(name);
    const response=await cache.match("./index.html");
    if(response)return response;
  }
  return null;
}

async function currentOrStableIndex(){
  const current=await caches.open(WISENT_CACHE);
  const currentIndex=await current.match("./index.html");
  if(currentIndex)return currentIndex;
  const stable=await readStableCacheName();
  if(stable){
    const stableCache=await caches.open(stable);
    const stableIndex=await stableCache.match("./index.html");
    if(stableIndex)return stableIndex;
  }
  return previousOrStableIndex();
}

function offlineRecoveryResponse(){
  const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Private Label</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box;background:#020617;color:#f8fafc;font-family:system-ui,sans-serif"><main style="max-width:440px;padding:24px;border:1px solid #334155;border-radius:18px;background:#0f172a"><h1 style="font-size:20px">Aplicativo temporariamente offline</h1><p style="color:#cbd5e1;line-height:1.5">Não foi possível carregar o arquivo do aplicativo. Seus dados não foram apagados.</p><button onclick="location.reload()" style="width:100%;min-height:46px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:800">Tentar novamente</button></main></body></html>';
  return new Response(html,{status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
}

self.addEventListener("install",event=>{
  event.waitUntil(cacheApplicationShell().then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const stable=await readStableCacheName();
    const names=await staticCacheNames();
    const keep=new Set([WISENT_CACHE]);
    if(stable)keep.add(stable);
    const previous=names.find(name=>name!==WISENT_CACHE&&name!==stable);
    if(previous)keep.add(previous);
    await Promise.all(names.filter(name=>!keep.has(name)).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message",event=>{
  const data=event.data||{};
  if(data.type==="SKIP_WAITING"){
    self.skipWaiting();
    return;
  }
  if(data.type==="BOOT_OK"&&String(data.version||"").toUpperCase()===WISENT_VERSION){
    event.waitUntil(writeStableCacheName(WISENT_CACHE));
  }
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==="navigate"){
    event.respondWith((async()=>{
      if(url.searchParams.get("wisent_rollback")==="1"){
        return (await previousOrStableIndex())||(await currentOrStableIndex())||offlineRecoveryResponse();
      }
      try{
        const response=await fetch(request);
        if(!response.ok)throw new Error("HTTP "+response.status);
        const contentType=String(response.headers.get("content-type")||"");
        if(contentType.includes("text/html")){
          const html=await response.clone().text();
          if(html.length<1000||!html.toLowerCase().includes("</html>"))throw new Error("HTML incompleto");
          if(!html.includes('APP_BUILD_VERSION="'+WISENT_VERSION+'"')){
            throw new Error("index.html de rede ainda não corresponde à "+WISENT_VERSION);
          }
        }
        const cache=await caches.open(WISENT_CACHE);
        await cache.put("./index.html",response.clone());
        return response;
      }catch(error){
        return (await currentOrStableIndex())||offlineRecoveryResponse();
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(request,{ignoreSearch:true});
    if(cached)return cached;
    try{
      const response=await fetch(request);
      if(response.ok){
        const cache=await caches.open(WISENT_CACHE);
        await cache.put(request,response.clone());
      }
      return response;
    }catch(error){
      return new Response("Recurso indisponível offline",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
    }
  })());
});
