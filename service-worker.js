const WISENT_CACHE="wisent-erp-static-v184";
const WISENT_STATIC=["./index.html","./pdf-lib.min.js","./manifest.json"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(WISENT_CACHE).then(cache=>cache.addAll(WISENT_STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith("wisent-erp-static-")&&key!==WISENT_CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==="navigate"){
    event.respondWith(
      fetch(request)
        .then(response=>{
          const copy=response.clone();
          caches.open(WISENT_CACHE).then(cache=>cache.put("./index.html",copy));
          return response;
        })
        .catch(()=>caches.open(WISENT_CACHE).then(cache=>cache.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok)caches.open(WISENT_CACHE).then(cache=>cache.put(request,response.clone()));
      return response;
    }))
  );
});
