/**
 * components/map-painter.js — 千禧数码像素风地图贴图层
 * ----------------------------------------------------------------------------
 * 在 SVG 底图渲染之前，于同一 0-30 坐标系内预先绘制：
 *   - 石板路：其余全部格子 → 灰色石板像素纹样（3 档灰阶 + 石块拼缝）
 *   - 区域照片：下沉广场/草坪/图书馆水池/教学楼 → 对应图片按格集裁剪拉伸，像素化
 *   - 摊位：每格平铺 替代绿方块.jpg
 * 绘制过的格子记入 paintedKeys，交给 renderSVG 跳过原纯色填充（只留网格线与文字）。
 * 一瓯茶（Y 格）不在此绘制，保留原 #ffc000 黄（预留）。
 * 图片任一张加载失败 → createMapPainter 返回 null，调用方回退到原纯色渲染。
 */
import plazaImg from '../../地图替换图片/下沉广场.jpg';
import libraryPoolImg from '../../地图替换图片/图书馆和水池.jpg';
import teachingImg from '../../地图替换图片/教学楼.jpg';
import lawnImg from '../../地图替换图片/草坪.jpg';
import boothTileImg from '../../地图替换图片/替代绿方块.jpg';
import { GRID } from '../data/map-grid.js';

/** 区域照片像素化因子：先缩到 1/N 再放大（关平滑）→ 像素块质感 */
const PIXEL_FACTOR = 10;

/** 石板路灰阶：基色 / 深缝 / 浅高光 */
const STONE_BASE = '#dfddde';
const STONE_DARK = '#b9b5b8';
const STONE_LIGHT = '#eceae9';

/** 区域判定（30×30 语义网格，坐标 = 行/列，格 1×1） */
function classify() {
  const booth = [];
  const plaza = [];
  const lawnLeft = [];
  const lawnRight = [];
  const lawnRest = [];
  const libraryPool = [];
  const teaching = [];
  const stone = [];
  const tea = [];
  for (let y = 0; y < GRID.length; y++) {
    for (let x = 0; x < GRID[y].length; x++) {
      const ch = GRID[y][x];
      if (ch === 'G') booth.push([x, y]);
      else if (ch === 'Y') tea.push([x, y]);
      else if (ch === 'P' && x >= 5 && x <= 14 && y >= 4 && y <= 11) plaza.push([x, y]);
      else if (ch === 'P' && x >= 3 && x <= 15 && y >= 13 && y <= 20) lawnLeft.push([x, y]);
      // 右草坪：第14-18行块与第21行条被两条白行隔开，并入同一块（含白隙）避免 10×1 细条拉伸变形
      else if ((ch === 'P' || ch === 'W') && x >= 20 && x <= 29 && y >= 14 && y <= 21) lawnRight.push([x, y]);
      else if (ch === 'P') lawnRest.push([x, y]);
      else if (ch === 'X' || ch === 'B' || (ch === 'W' && x >= 21 && x <= 29 && y >= 1 && y <= 9)) libraryPool.push([x, y]);
      else if (
        (x === 0 && y >= 26 && y <= 29) ||
        (x >= 1 && x <= 8 && y >= 26 && y <= 29) ||
        (x >= 9 && x <= 11 && y >= 26 && y <= 27) ||
        (x === 11 && (y === 25 || y === 28))
      ) teaching.push([x, y]);
      else stone.push([x, y]);
    }
  }
  return { booth, plaza, lawnLeft, lawnRight, lawnRest, libraryPool, teaching, stone, tea };
}

/** 把格集按连通性拆成若干块（草坪分左右两块，各自拉伸一张图） */
function components(cells) {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const seen = new Set();
  const comps = [];
  for (const [x, y] of cells) {
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    const comp = [];
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const k = `${cx},${cy}`;
      if (seen.has(k) || !set.has(k)) continue;
      seen.add(k);
      comp.push([cx, cy]);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    comps.push(comp);
  }
  return comps;
}

function bboxOf(cells) {
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs) + 1,
    h: Math.max(...ys) - Math.min(...ys) + 1,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load failed: ${src}`));
    img.src = src;
  });
}

/** 缩到 1/N 再放大绘制（配合 imageSmoothingEnabled=false）→ 像素块 */
function pixelate(img, factor) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth / factor));
  c.height = Math.max(1, Math.round(img.naturalHeight / factor));
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** 按格集裁剪并拉伸绘制一张区域图 */
function drawRegion(ctx, canvas, cells) {
  const b = bboxOf(cells);
  ctx.save();
  ctx.beginPath();
  for (const [x, y] of cells) ctx.rect(x, y, 1, 1);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, b.x, b.y, b.w, b.h);
  ctx.restore();
}

/** 一格石板纹样：基色 + 按格坐标确定性分布的石块拼缝与高光 */
function drawStoneCell(ctx, x, y) {
  const h = (x * 31 + y * 17) % 3;
  ctx.fillStyle = STONE_BASE;
  ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = h === 0 ? STONE_DARK : STONE_LIGHT;
  ctx.fillRect(x + ((h * 7) % 10) / 10, y + 0.04, 0.3, 0.1); // 石块拼缝
  ctx.fillStyle = h === 2 ? STONE_LIGHT : STONE_DARK;
  ctx.fillRect(x + 0.04, y + ((h * 5 + 2) % 10) / 10, 0.12, 0.3); // 竖缝
}

export async function createMapPainter() {
  const [booth, plaza, lawn, libraryPool, teaching] = await Promise.all([
    loadImage(boothTileImg),
    loadImage(plazaImg),
    loadImage(lawnImg),
    loadImage(libraryPoolImg),
    loadImage(teachingImg),
  ]);
  const regions = classify();
  const paintedKeys = new Set();
  const all = [
    ...regions.stone, ...regions.booth, ...regions.plaza,
    ...regions.lawnLeft, ...regions.lawnRight, ...regions.lawnRest,
    ...regions.libraryPool, ...regions.teaching,
  ];
  for (const [x, y] of all) paintedKeys.add(`${x},${y}`);

  const plazaPix = pixelate(plaza, PIXEL_FACTOR);
  const lawnPix = pixelate(lawn, PIXEL_FACTOR);
  const libraryPoolPix = pixelate(libraryPool, PIXEL_FACTOR);
  const teachingPix = pixelate(teaching, PIXEL_FACTOR);

  return {
    paintedKeys,
    /** 在 0-30 SVG 坐标系内绘制（需处于与 renderSVG 相同的变换块内） */
    paint(ctx) {
      ctx.save();
      // 石板路（垫底）
      for (const [x, y] of regions.stone) drawStoneCell(ctx, x, y);
      // 区域照片（裁剪到格集，拉伸到各自 bbox）
      drawRegion(ctx, plazaPix, regions.plaza);
      drawRegion(ctx, lawnPix, regions.lawnLeft);
      drawRegion(ctx, lawnPix, regions.lawnRight);
      for (const comp of components(regions.lawnRest)) drawRegion(ctx, lawnPix, comp);
      drawRegion(ctx, libraryPoolPix, regions.libraryPool);
      drawRegion(ctx, teachingPix, regions.teaching);
      // 摊位图块（每格一张，最上层）
      ctx.imageSmoothingEnabled = false;
      for (const [x, y] of regions.booth) ctx.drawImage(booth, x, y, 1, 1);
      ctx.restore();
    },
  };
}
