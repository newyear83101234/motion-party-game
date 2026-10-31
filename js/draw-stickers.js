// 畫畫遊戲貼紙：12 種原創向量圖（viewBox 100×100），第一次用到才轉成圖片並快取
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${body}</svg>`;
const O = 'stroke="#3b2a1a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"';

export const STICKERS = [
  { id: "star", svg: svg(`<path ${O} fill="#ffd54f" d="M50 6l13 28 30 3-23 20 7 30-27-16-27 16 7-30L7 37l30-3z"/>`) },
  { id: "heart", svg: svg(`<path ${O} fill="#f06292" d="M50 88C18 64 6 46 14 28c8-16 28-16 36 2 8-18 28-18 36-2 8 18-4 36-36 60z"/>`) },
  { id: "flower", svg: svg(`<g ${O} fill="#ba68c8"><circle cx="50" cy="24" r="16"/><circle cx="76" cy="44" r="16"/><circle cx="66" cy="74" r="16"/><circle cx="34" cy="74" r="16"/><circle cx="24" cy="44" r="16"/></g><circle ${O} cx="50" cy="52" r="13" fill="#ffd54f"/>`) },
  { id: "sun", svg: svg(`<g ${O}><path d="M50 4v14M50 82v14M4 50h14M82 50h14M17 17l10 10M73 73l10 10M83 17L73 27M27 73L17 83"/></g><circle ${O} cx="50" cy="50" r="24" fill="#ffb300"/>`) },
  { id: "rainbow", svg: svg(`<g fill="none" stroke-width="9" stroke-linecap="round"><path stroke="#e53935" d="M12 78a38 38 0 0 1 76 0"/><path stroke="#fdd835" d="M22 78a28 28 0 0 1 56 0"/><path stroke="#43a047" d="M32 78a18 18 0 0 1 36 0"/></g>`) },
  { id: "cloud", svg: svg(`<path ${O} fill="#e3f2fd" d="M26 74h50a16 16 0 0 0 0-32 22 22 0 0 0-42-6 18 18 0 0 0-8 38z"/>`) },
  { id: "moon", svg: svg(`<path ${O} fill="#fff59d" d="M62 10a40 40 0 1 0 28 62A32 32 0 0 1 62 10z"/>`) },
  { id: "crown", svg: svg(`<path ${O} fill="#ffca28" d="M12 76l-4-46 22 18 20-30 20 30 22-18-4 46z"/><circle ${O} cx="50" cy="60" r="7" fill="#e53935"/>`) },
  { id: "balloon", svg: svg(`<path ${O} fill="none" d="M50 70c-6 10 6 16 0 26"/><ellipse ${O} cx="50" cy="40" rx="26" ry="32" fill="#4fc3f7"/><path ${O} fill="#4fc3f7" d="M44 72h12l-6-6z"/>`) },
  { id: "note", svg: svg(`<path ${O} fill="#7e57c2" d="M38 14l44-8v58a12 12 0 1 1-8-11V24l-28 5v43a12 12 0 1 1-8-11z"/>`) },
  { id: "smile", svg: svg(`<circle ${O} cx="50" cy="50" r="42" fill="#ffee58"/><circle cx="36" cy="40" r="6" fill="#3b2a1a"/><circle cx="64" cy="40" r="6" fill="#3b2a1a"/><path ${O} fill="none" d="M30 58q20 22 40 0"/>`) },
  { id: "paw", svg: svg(`<g ${O} fill="#a1887f"><ellipse cx="50" cy="66" rx="22" ry="18"/><circle cx="24" cy="40" r="10"/><circle cx="40" cy="24" r="10"/><circle cx="60" cy="24" r="10"/><circle cx="76" cy="40" r="10"/></g>`) },
];

const cache = new Map();
export function stickerImage(id) {
  if (!cache.has(id)) {
    const s = STICKERS.find(t => t.id === id);
    cache.set(id, new Promise((ok, bad) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => { cache.delete(id); bad(new Error("貼紙載入失敗：" + id)); };   // 失敗不留快取，下次才能重試
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.svg);
    }));
  }
  return cache.get(id);
}
