/**
 * 30×30 校园地图语义格网。
 *
 * 坐标以左上角为 (0, 0)，向右为 x，向下为 y。每个字符对应一个 1×1
 * 单元，既是 SVG 素材的独立替换单位，也是摊位命中和定位吸附的依据。
 */
const GRID = [
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWGGGGGGGGGWWWWWWXXXXXXXXX',
  'WWWWWWWWWWWWWWWWWWWWWXXXXXXXXX',
  'WWWHHGGGGGGGGGGWWWWWWXXXXXXXXX',
  'WGWWGPPPPPPPPPPOWWWWWWWWWWWWWW',
  'WGWWGPPPPPPPPPPGWWWWWWWWWWWWWW',
  'WGWWGPPPPPPPPPPGWWWWWBBBBBBBBB',
  'WGWWGPPPPPPPPPPGWWWWWBBBBBBBBB',
  'WGWWGPPPPPPPPPPGWWWWWBBBBBBBBB',
  'WGWWGPPPPPPPPPPGWWWWWBBBBBBBBB',
  'WGWWOPPPPPPPPPPOWWWWWWWWWWWWWW',
  'WGWWOPPPPPPPPPPGWWWWWWWWWWWWWW',
  'WOWWOWWWWWWWWWWOWWWWWWWWWWWWWW',
  'WGWGPPPPPPPPPPPPGWWWWWWWWWWWWW',
  'WGWGPPPPPPPPPPPPGWWGPPPPPPPPPP',
  'WGWGPPPPPPPPPPPPGWWGPPPPPPPPPP',
  'WGWOPPPPPPPPPPPPGWWGPPPPPPPPPP',
  'WGWGPPPPPPPPPPPPGWWGPPPPPPPPPP',
  'WGWGPPPPPPPPPPPPGWWGPPPPPPPPPP',
  'WGWGPPGWGGDDDDPPGWWOWWWWWWWWWW',
  'ROWWPPWWWWDDDDPPGWWOWWWWWWWWWW',
  'ROWWGGWWWWWWWWWOWWWGPPPPPPPPPP',
  'WWWWWWWWWWWWWWWOWWWWWWWWWWWWWW',
  'WWWWWWWWWGGGGGGWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'GGGGGWWWWRRHGWWGGGWYYYYWWWWWWW',
  'HWWWWWWWWHHHGWGWWWWWWWWWWWWWWW',
  'HWWWWWWWWHHHWWGWWWWWWWWWWWWWWW',
  'HWWWWWWWWWWHWWWWWWWWWWWWWWWWWW',
  'HWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
];

const GRID_COLS = 30;
const GRID_ROWS = GRID.length;

const CELL_TYPES = {
  W: { key: 'activity', className: 'cell-activity', fill: '#ffffff' },
  G: { key: 'booth', className: 'cell-booth', fill: '#92d050' },
  P: { key: 'landscape', className: 'cell-landscape', fill: '#c3ead5' },
  B: { key: 'water', className: 'cell-water', fill: '#9bc2e6' },
  X: { key: 'building', className: 'cell-building', fill: '#e7e6e6' },
  H: { key: 'stairs', className: 'cell-stairs', fill: '#d8d8d8' },
  O: { key: 'service', className: 'cell-service', fill: '#ffc000' },
  C: { key: 'special', className: 'cell-special', fill: '#00a3f5' },
  D: { key: 'union', className: 'cell-union', fill: '#00a3f5' },
  R: { key: 'restricted', className: 'cell-restricted', fill: '#ffffff' },
  Y: { key: 'tea', className: 'cell-tea', fill: '#ffc000' },
};

const LABELS = [
  { x: 25.4, y: 2.55, text: '图书馆' },
  { x: 25.4, y: 8, text: '水池' },
  { x: 10, y: 8.55, text: '下沉广场' },
  { x: 9.5, y: 16.3, text: '草坪' },
  { x: 25, y: 16.5, text: '草坪' },
  { x: 12, y: 20.35, text: '社联摊位' },
  { x: 20.5, y: 26.5, text: '一鸥茶' },
].map((label) => ({ ...label, size: 0.5, fill: '#594661' }));

function inGrid(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS;
}

function cellCodeAt(x, y) {
  return inGrid(x, y) ? GRID[y][x] : null;
}

function isWalkableCell(x, y) {
  return cellCodeAt(x, y) === 'W';
}

function isBoothCell(x, y) {
  return cellCodeAt(x, y) === 'G';
}

export {
  GRID,
  GRID_COLS,
  GRID_ROWS,
  CELL_TYPES,
  LABELS,
  inGrid,
  cellCodeAt,
  isWalkableCell,
  isBoothCell,
};
