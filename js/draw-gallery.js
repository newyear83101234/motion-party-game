// 畫畫遊戲作品牆：存在 iPad 瀏覽器的 IndexedDB，最多 50 件（含未完成），滿了不自動刪、由大人挑
export const MAX = 50;
const NAME = "draw-gallery", STORE = "works";
let dbp = null;

function open() {
  if (!dbp) dbp = new Promise((ok, bad) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
  dbp.catch(() => { dbp = null; });   // 失敗不要永久快取，下次再試
  return dbp;
}
function tx(mode, fn) {
  return open().then(db => new Promise((ok, bad) => {
    const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => bad(t.error);
    t.onabort = () => bad(t.error);
  }));
}

export const get = id => tx("readonly", s => s.get(id));
export const count = () => tx("readonly", s => s.count());
export const remove = id => tx("readwrite", s => s.delete(id));
export const wipe = () => tx("readwrite", s => s.clear());   // 只給測試用
export async function list() { return (await tx("readonly", s => s.getAll())).sort((a, b) => b.t - a.t); }

// 新作品在滿 50 件時丟出 code = "FULL"；已存在的作品照樣可以更新
export async function save(w) {
  if (!(await get(w.id)) && (await count()) >= MAX) { const e = new Error("作品牆滿了"); e.code = "FULL"; throw e; }
  await tx("readwrite", s => s.put({ ...w, t: Date.now() }));
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const toBlob = (canvas, type = "image/png", q) => new Promise((ok, bad) =>
  canvas.toBlob(b => (b ? ok(b) : bad(new Error("toBlob 回傳 null"))), type, q));
export function thumbOf(canvas, w = 360) {
  const c = document.createElement("canvas");
  c.width = w; c.height = Math.round(canvas.height * w / canvas.width);
  c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
  return toBlob(c, "image/jpeg", 0.8);
}

// 請瀏覽器不要自動清掉作品（Safari 不一定答應，回傳 true/false）
export async function persist() { try { return !!(await navigator.storage?.persist?.()); } catch { return false; } }

// 存到相簿：iPad 用分享選單（裡面有「儲存影像」），不支援分享的瀏覽器改成直接下載
export async function saveToPhotos(blob, name = "我的畫.png") {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return "share"; }
    catch (e) { if (e.name === "AbortError") return "cancel"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "download";
}
