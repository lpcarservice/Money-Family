/**
 * Service worker แบบเบาๆ — ให้เปิดแอปได้แม้ไม่มีเน็ต
 * ไม่ยุ่งกับ request ที่วิ่งไป Apps Script (คนละ origin) ปล่อยผ่านตลอด
 */
const CACHE = 'finance-shell-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // หน้าเว็บ: เอาของใหม่ก่อน ถ้าออฟไลน์ค่อยใช้ที่เก็บไว้
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('index', copy));
          return res;
        })
        .catch(() => caches.open(CACHE).then(c => c.match('index')))
    );
    return;
  }

  // ไฟล์ js/css/รูป: ชื่อไฟล์มี hash อยู่แล้ว เวอร์ชันใหม่ = ชื่อใหม่ จึงใช้ของใน cache ได้เลย
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }))
  );
});
