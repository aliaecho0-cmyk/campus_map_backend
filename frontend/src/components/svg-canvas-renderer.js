/**
 * svg-canvas-renderer.js
 * ----------------------------------------------------------------------------
 * 把一段 SVG 字符串渲染进 <canvas type="2d"> 的 2D 上下文，
 * **完全不使用 canvas.createImage()**，因此能绕开本机
 * 「canvas.createImage 对任意来源均 load error」的坑（见 stage-report 4.3）。
 *
 * 原理：把 SVG 的形状（rect/circle/ellipse/polygon/polyline/line/path/text）
 * 解析成 canvas 绘制命令（moveTo/lineTo/arc/bezier/arcTo/fillText）直接画出来。
 * 矢量在任意缩放级别都清晰；且不依赖任何外部图片资源。
 *
 * 支持的子集（覆盖扁平地图类 SVG）：
 *   <svg viewBox> <g transform> <rect rx> <circle> <ellipse> <polygon>
 *   <polyline> <line> <path d> <text>
 * 属性：fill / fill-opacity / stroke / stroke-width / stroke-opacity / transform
 *       font-size / font-weight / font-family / text-anchor
 *
 * 坐标假设：传入的 ctx 已经按目标尺寸缩放好（本项目为 1080 坐标系，
 * 且 dpr 已通过 ctx.scale(dpr,dpr) 施加）。SVG viewBox 与绘制坐标系一致，
 * 故本渲染器不再额外缩放，只用 save/translate/scale/rotate/transform 叠加
 * 元素自身的 transform —— 这些都会乘以已有的 dpr 变换（不会丢失 dpr）。
 */

/** 地图注释字整体垂直偏移：canvas 底图按 36× 缩放，1/36 格 ≈ 1px（仅 web 端补偿字体差异用，可按需调大调小） */
const TEXT_Y_OFFSET = 8 / 36;

function parseColor(raw) {
  if (!raw || raw === 'none' || raw === 'transparent') return null;
  raw = String(raw).trim();
  if (raw[0] === '#') {
    let h = raw.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 8) {
      const a = parseInt(h.slice(6, 8), 16) / 255;
      const n = parseInt(h.slice(0, 6), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
    }
    const n = parseInt(h.slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(',').map((s) => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] };
  }
  const named = {
    white: '#fff', black: '#000', red: '#f00', green: '#008000',
    blue: '#00f', yellow: '#ff0', orange: '#fa0', gray: '#808080', none: null,
  };
  if (named[raw.toLowerCase()] != null) return parseColor(named[raw.toLowerCase()]);
  return { r: 0, g: 0, b: 0, a: 1 };
}

function resolveColor(raw, opacity) {
  const c = parseColor(raw);
  if (!c) return null;
  const a = (c.a == null ? 1 : c.a) * (opacity == null ? 1 : opacity);
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`;
}

function parseAttrs(str) {
  const attrs = {};
  const re = /([\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(str))) {
    attrs[(m[1] || '').toLowerCase()] = m[3] != null ? m[3] : (m[4] != null ? m[4] : m[5]);
  }
  return attrs;
}

function parseSVG(svg) {
  const tagRe = /<(\/?)([a-zA-Z][\w]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const tokens = [];
  let m;
  let cursor = 0;
  while ((m = tagRe.exec(svg))) {
    const text = svg.slice(cursor, m.index).trim();
    if (text) tokens.push({ type: 'text', value: text });
    cursor = tagRe.lastIndex;
    tokens.push({
      type: m[1] === '/' ? 'close' : 'open',
      name: m[2].toLowerCase(),
      attrs: m[3],
      selfClose: m[4] === '/',
    });
  }
  const tail = svg.slice(cursor).trim();
  if (tail) tokens.push({ type: 'text', value: tail });

  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  for (const t of tokens) {
    if (t.type === 'text') {
      stack[stack.length - 1].text += t.value;
    } else if (t.type === 'open') {
      const node = { tag: t.name, attrs: parseAttrs(t.attrs), children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!t.selfClose) stack.push(node);
    } else {
      if (stack.length > 1) stack.pop();
    }
  }
  return root;
}

function applyTransform(ctx, str) {
  if (!str) return;
  const re = /(translate|scale|rotate|matrix|skewX|skewY)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(str))) {
    const op = m[1];
    const args = m[2].split(/[ ,]+/).filter((s) => s !== '').map(Number);
    if (op === 'translate') ctx.translate(args[0] || 0, args[1] || 0);
    else if (op === 'scale') ctx.scale(args[0] || 1, args[1] == null ? (args[0] || 1) : args[1]);
    else if (op === 'rotate') {
      const a = (args[0] || 0) * Math.PI / 180;
      if (args.length > 1) {
        ctx.translate(args[1], args[2] || 0);
        ctx.rotate(a);
        ctx.translate(-args[1], -(args[2] || 0));
      } else ctx.rotate(a);
    } else if (op === 'matrix') {
      ctx.transform(args[0], args[1], args[2], args[3], args[4], args[5]);
    }
  }
}

function roundedRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r || 0, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawEllipse(ctx, cx, cy, rx, ry, fill, stroke, sw) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(Math.max(0.0001, rx / Math.max(1, ry)), 1);
  ctx.beginPath();
  ctx.arc(0, 0, ry, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw || 1; ctx.stroke(); }
  ctx.restore();
}

function drawPath(ctx, d) {
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let m;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let px = 0;
  let py = 0;
  const seg = (cmd, vals) => {
    const n = vals.map(Number);
    const rel = cmd === cmd.toLowerCase();
    let x;
    let y;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = n[0] + (rel ? cx : 0); y = n[1] + (rel ? cy : 0);
        ctx.moveTo(x, y); sx = x; sy = y; cx = x; cy = y; break;
      case 'L':
        x = n[0] + (rel ? cx : 0); y = n[1] + (rel ? cy : 0);
        ctx.lineTo(x, y); cx = x; cy = y; break;
      case 'H':
        x = n[0] + (rel ? cx : 0); ctx.lineTo(x, cy); cx = x; break;
      case 'V':
        y = n[0] + (rel ? cy : 0); ctx.lineTo(cx, y); cy = y; break;
      case 'C':
        x = n[4] + (rel ? cx : 0); y = n[5] + (rel ? cy : 0);
        ctx.bezierCurveTo(n[0] + (rel ? cx : 0), n[1] + (rel ? cy : 0),
          n[2] + (rel ? cx : 0), n[3] + (rel ? cy : 0), x, y);
        cx = x; cy = y; break;
      case 'S':
        x = n[2] + (rel ? cx : 0); y = n[3] + (rel ? cy : 0);
        ctx.bezierCurveTo(cx, cy, n[0] + (rel ? cx : 0), n[1] + (rel ? cy : 0), x, y);
        cx = x; cy = y; break;
      case 'Q':
        x = n[2] + (rel ? cx : 0); y = n[3] + (rel ? cy : 0);
        ctx.quadraticCurveTo(n[0] + (rel ? cx : 0), n[1] + (rel ? cy : 0), x, y);
        cx = x; cy = y; break;
      case 'T':
        x = n[0] + (rel ? cx : 0); y = n[1] + (rel ? cy : 0);
        ctx.quadraticCurveTo(cx, cy, x, y); cx = x; cy = y; break;
      case 'A': {
        // 椭圆弧：采样为折线（xAxisRotation 仅支持 0，地图常见）
        const rx = n[0]; const ry = n[1]; const rot = (n[2] || 0) * Math.PI / 180;
        const large = n[3]; const sweep = n[4];
        const ex = n[5] + (rel ? cx : 0); const ey = n[6] + (rel ? cy : 0);
        const cos = Math.cos(rot); const sin = Math.sin(rot);
        const dx = (cx - ex) / 2; const dy = (cy - ey) / 2;
        let x1p = cos * dx + sin * dy;
        let y1p = -sin * dx + cos * dy;
        let l = (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p) /
          (rx * rx * y1p * y1p + ry * ry * x1p * x1p);
        l = Math.sqrt(Math.max(0, l));
        if (large === sweep) l = -l;
        const cxp = (l * rx * y1p) / ry;
        const cyp = (-l * ry * x1p) / rx;
        const cx2 = cxp * cos - cyp * sin + (cx + ex) / 2;
        const cy2 = cxp * sin + cyp * cos + (cy + ey) / 2;
        const a1 = Math.atan2(y1p - cyp, x1p - cxp);
        let a2 = Math.atan2(-y1p - cyp, -x1p - cxp);
        let da = a2 - a1;
        const dir = sweep ? 1 : -1;
        if (da * dir < 0) da += dir * Math.PI * 2;
        const steps = 24;
        for (let i = 1; i <= steps; i++) {
          const a = a1 + (da * i) / steps;
          const exx = cx2 + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin;
          const eyy = cy2 + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos;
          ctx.lineTo(exx, eyy);
        }
        cx = ex; cy = ey; break;
      }
      case 'Z':
        ctx.closePath(); cx = sx; cy = sy; break;
      default: break;
    }
  };
  while ((m = re.exec(d))) {
    const vals = m[2].trim().split(/[ ,]+/).filter((s) => s !== '');
    seg(m[1], vals);
  }
}

function walk(ctx, node, st, opts) {
  const a = node.attrs;
  const child = Object.assign({}, st);
  if (a.fill != null) child.fill = a.fill;
  if (a['fill-opacity'] != null) child.fillOpacity = parseFloat(a['fill-opacity']);
  if (a.stroke != null) child.stroke = a.stroke;
  if (a['stroke-width'] != null) child.strokeWidth = parseFloat(a['stroke-width']);
  if (a['stroke-opacity'] != null) child.strokeOpacity = parseFloat(a['stroke-opacity']);
  if (a['font-size'] != null) child.fontSize = parseFloat(a['font-size']);
  if (a['font-weight'] != null) child.fontWeight = a['font-weight'];
  if (a['font-family'] != null) child.fontFamily = a['font-family'];

  ctx.save();
  applyTransform(ctx, a.transform);

  const fill = resolveColor(child.fill, child.fillOpacity);
  const stroke = resolveColor(child.stroke, child.strokeOpacity);
  const sw = child.strokeWidth || 1;

  switch (node.tag) {
    case 'rect': {
      const x = parseFloat(a.x) || 0;
      const y = parseFloat(a.y) || 0;
      const w = parseFloat(a.width) || 0;
      const h = parseFloat(a.height) || 0;
      const r = parseFloat(a.rx || a.ry || 0);
      roundedRectPath(ctx, x, y, w, h, r);
      if (fill && child.fill !== 'none' && !(opts && opts.skipFill && opts.skipFill(a))) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke && child.stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
      break;
    }
    case 'circle': {
      const cx = parseFloat(a.cx) || 0;
      const cy = parseFloat(a.cy) || 0;
      const r = parseFloat(a.r) || 0;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (fill && child.fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke && child.stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
      break;
    }
    case 'ellipse':
      drawEllipse(ctx, parseFloat(a.cx) || 0, parseFloat(a.cy) || 0,
        parseFloat(a.rx) || 0, parseFloat(a.ry) || 0,
        (fill && child.fill !== 'none') ? fill : null,
        (stroke && child.stroke !== 'none') ? stroke : null, sw);
      break;
    case 'polygon':
    case 'polyline': {
      const pts = (a.points || '').trim().split(/[\s,]+/).map(Number);
      if (pts.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        if (node.tag === 'polygon') ctx.closePath();
        if (fill && child.fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke && child.stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
      }
      break;
    }
    case 'line': {
      ctx.beginPath();
      ctx.moveTo(parseFloat(a.x1) || 0, parseFloat(a.y1) || 0);
      ctx.lineTo(parseFloat(a.x2) || 0, parseFloat(a.y2) || 0);
      if (stroke && child.stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
      break;
    }
    case 'path': {
      ctx.beginPath();
      drawPath(ctx, a.d || '');
      if (fill && child.fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke && child.stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
      break;
    }
    case 'text': {
      const x = parseFloat(a.x) || 0;
      const y = parseFloat(a.y) || 0;
      const anchor = a['text-anchor'] || 'start';
      ctx.fillStyle = fill || '#000';
      ctx.font = `${child.fontWeight || '400'} ${child.fontSize || 16}px ${child.fontFamily || 'sans-serif'}`;
      ctx.textAlign = anchor === 'middle' ? 'center' : (anchor === 'end' ? 'right' : 'left');
      ctx.textBaseline = 'middle';
      const content = (node.text || '').replace(/\s+/g, ' ').trim();
      ctx.fillText(content, x, y + TEXT_Y_OFFSET);
      break;
    }
    default:
      break;
  }

  for (const c of node.children) walk(ctx, c, child, opts);
  ctx.restore();
}

/**
 * 渲染 SVG 字符串到 canvas 2D 上下文。
 * @param {CanvasRenderingContext2D} ctx 已按目标尺寸 + dpr 缩放好的上下文
 * @param {string} svg SVG 字符串
 * @param {{skipFill?: (attrs: object) => boolean}} [opts] skipFill 对某元素返回 true 时跳过填充（仍画描边）
 */
function renderSVG(ctx, svg, opts = {}) {
  if (!ctx || !svg) return;
  ctx.save();
  const root = parseSVG(svg);
  const svgEl = root.children.find((c) => c.tag === 'svg') || root;
  const baseStyle = {
    fill: '#000', fillOpacity: 1, stroke: 'none', strokeWidth: 1, strokeOpacity: 1,
    fontFamily: 'sans-serif', fontWeight: '400', fontSize: 16,
  };
  for (const c of svgEl.children) walk(ctx, c, baseStyle, opts);
  ctx.restore();
}

export default renderSVG;
