const CACHE_NAME = 'vicuna-v83';
const LIBS_CACHE = 'vicuna-libs-1';      // librerías externas: no cambian nunca, se guardan una sola vez
const ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const ESPERA_RED_MS = 2500;              // si la red no responde en este tiempo, se usa la copia guardada

self.addEventListener('install', e => {
  // cada archivo por separado: si uno falla, los demás igual quedan guardados
  e.waitUntil(caches.open(CACHE_NAME).then(c=>Promise.all(ASSETS.map(a=>c.add(new Request(a,{cache:'no-cache'})).catch(()=>{})))).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME && k!==LIBS_CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

function esLibreria(url){
  return url.hostname==='cdnjs.cloudflare.com' || url.hostname==='www.gstatic.com' ||
         url.hostname==='fonts.gstatic.com' || url.hostname==='fonts.googleapis.com';
}

self.addEventListener('fetch', e => {
  if(e.request.method!=='GET') return;
  const url = new URL(e.request.url);

  // Librerías externas con versión fija: primero la copia guardada (no se vuelven a descargar)
  if(esLibreria(url)){
    e.respondWith(caches.open(LIBS_CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if(r && (r.ok || r.type==='opaque')) c.put(e.request, r.clone());
      return r;
    }))));
    return;
  }
  if(url.origin !== self.location.origin) return;     // Firebase y demás: directo a la red

  // La app: se pide a la red (para tener siempre la última versión), pero si tarda se muestra la guardada.
  const esPagina = e.request.mode==='navigate';
  const clave = esPagina ? './index.html' : e.request;   // ?u=PATENTE usa la misma página guardada
  const deRed = fetch(e.request,{cache:'no-cache'}).then(r => {
    if(r && r.ok){ const c=r.clone(); caches.open(CACHE_NAME).then(x=>x.put(clave,c)); }
    return r;
  });
  const guardada = () => caches.match(clave).then(r => r || (esPagina ? caches.match('./index.html') : undefined));
  e.respondWith(new Promise(resolve => {
    let listo = false;
    const fin = r => { if(!listo && r){ listo = true; resolve(r); } };
    const t = setTimeout(() => guardada().then(fin), ESPERA_RED_MS);
    deRed.then(r => { clearTimeout(t); fin(r); })
         .catch(() => { clearTimeout(t); guardada().then(r => { if(r) fin(r); else if(!listo){ listo=true; resolve(Response.error()); } }); });
    e.waitUntil(deRed.catch(()=>{}));
  }));
});
