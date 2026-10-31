// 畫畫遊戲主程式（暫時版：只有點一下填紅色）
import { Board } from "./draw-canvas.js?v=1";
import { Painter } from "./draw-paint.js?v=1";

const $ = s => document.querySelector(s);
const S = { color: "#e53935", mat: { kind: "solid" }, tool: "fill" };
const board = new Board($("#stage"));
const painter = new Painter(board);

async function openArt(url) { await board.load(url); painter.reset(); }

$("#stage").addEventListener("pointerdown", e => {
  if (S.tool !== "fill" || !board.labels) return;
  const pt = board.toImage(e.clientX, e.clientY), id = painter.regionAt(pt.x, pt.y);
  if (id >= 0) painter.fill(id, S.mat, S.color).done();
});
window.addEventListener("resize", () => board.labels && board.fit());

window.__draw = { S, board, painter, openArt };
openArt(new URLSearchParams(location.search).get("art") || "IMAGE/draw/lineart/test-shapes.svg");
