/**
 * utils/canvas-map.js — 自定义导览图坐标系工具（web 版，ESM）
 * 原样移植自小程序 utils/canvas-map.js（v5 格栅化，2026-09-04）。
 */
import * as mapGrid from '../data/map-grid.js';

const GRID_COLS = mapGrid.GRID_COLS;
const GRID_ROWS = mapGrid.GRID_ROWS;
const CELL_PX = 36;

const AFFINE = {
  a1: 16177.746568412096, a2: 20375.370403505265, a3: -2309988.502722116,
  b1: 20201.926189721344, b2: -20017.348319665063, b3: -1853143.6141524725,
};

const AFFINE_INV = {
  ia1: 2.7217552752540842e-05, ia2: 2.770435473564703e-05, ic1: 114.21238197430696,
  ib1: 2.7468522948585496e-05, ib2: -2.1996853103001257e-05, ic2: 22.688644329507174,
};

function latLngToMap(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const normalize = (value) => {
    const integer = Math.round(value);
    return Math.abs(value - integer) < 1e-6 ? integer : value;
  };
  return {
    x: normalize(AFFINE.a1 * lng + AFFINE.a2 * lat + AFFINE.a3),
    y: normalize(AFFINE.b1 * lng + AFFINE.b2 * lat + AFFINE.b3),
  };
}

function mapToLatLng(x, y) {
  return {
    lat: AFFINE_INV.ib1 * x + AFFINE_INV.ib2 * y + AFFINE_INV.ic2,
    lng: AFFINE_INV.ia1 * x + AFFINE_INV.ia2 * y + AFFINE_INV.ic1,
  };
}

const GRID_X_METERS = 4.14;
const GRID_Y_METERS = 3.75;
const PX_PER_METER = CELL_PX / ((GRID_X_METERS + GRID_Y_METERS) / 2);

const DEFAULT_MAP_POS = { x: 10, y: 12, label: '地图中心' };

const PLAZA_REGION = { x: 5, y: 4, w: 10, h: 8 };
const THANKS_REGION = { x: 3, y: 3, w: 2, h: 1 };
/* 社联摊位（union 区域，地图上写有「社联摊位 / SAUD」的招牌处） */
const UNION_REGION = { x: 10.5, y: 19.4, w: 3.2, h: 1.5 };

function errorCircleRadius(accuracy) {
  if (typeof accuracy !== 'number' || accuracy <= 0) return 1;
  return Math.max(1, Math.min(8, accuracy * PX_PER_METER));
}

function inBounds(x, y) {
  return x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS;
}

function distance(a, b) {
  const dx = (a.x - b.x) * GRID_X_METERS;
  const dy = (a.y - b.y) * GRID_Y_METERS;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

function floatToCell(x, y) {
  return {
    cx: Math.max(0, Math.min(GRID_COLS - 1, Math.floor(x))),
    cy: Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(y))),
  };
}

function snapToWalkableCell(x, y) {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const start = floatToCell(x, y);
  if (mapGrid.isWalkableCell(start.cx, start.cy)) {
    return { x: start.cx, y: start.cy, cx: start.cx, cy: start.cy };
  }

  let best = null;
  let bestDistance = Infinity;
  let bestCellDistance = Infinity;
  for (let cy = 0; cy < GRID_ROWS; cy++) {
    for (let cx = 0; cx < GRID_COLS; cx++) {
      if (!mapGrid.isWalkableCell(cx, cy)) continue;
      const dx = cx + 0.5 - x;
      const dy = cy + 0.5 - y;
      const d2 = dx * dx + dy * dy;
      const cellDx = cx - start.cx;
      const cellDy = cy - start.cy;
      const cellD2 = cellDx * cellDx + cellDy * cellDy;
      if (d2 < bestDistance - 1e-9 || (Math.abs(d2 - bestDistance) <= 1e-9 && cellD2 < bestCellDistance)) {
        bestDistance = d2;
        bestCellDistance = cellD2;
        best = { x: cx, y: cy, cx, cy };
      }
    }
  }
  return best;
}

function markerDensityLevel(scale) {
  if (scale < 0.7) return 'compact';
  if (scale < 1.2) return 'normal';
  return 'detail';
}

export {
  GRID_COLS,
  GRID_ROWS,
  CELL_PX,
  AFFINE,
  AFFINE_INV,
  PX_PER_METER,
  DEFAULT_MAP_POS,
  PLAZA_REGION,
  THANKS_REGION,
  UNION_REGION,
  latLngToMap,
  mapToLatLng,
  errorCircleRadius,
  inBounds,
  distance,
  floatToCell,
  snapToWalkableCell,
  markerDensityLevel,
};
