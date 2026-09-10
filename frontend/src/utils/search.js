/**
 * utils/search.js — 社团/摊位名称匹配与高亮片段生成（web 版，原样移植）
 */

function buildMatch(query, name) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return { matched: true, continuous: true, score: 0, segs: [{ text: name, hl: false }] };

  const n = (name || '').toLowerCase();

  const idx = n.indexOf(q);
  if (idx !== -1) {
    const segs = [];
    if (idx > 0) segs.push({ text: name.slice(0, idx), hl: false });
    segs.push({ text: name.slice(idx, idx + q.length), hl: true });
    if (idx + q.length < name.length) segs.push({ text: name.slice(idx + q.length), hl: false });
    const score = 10000 + (idx === 0 ? 500 : 0) - idx;
    return { matched: true, continuous: true, score, segs };
  }

  const qchars = [...q];
  const nchars = [...name];
  const hit = [];
  let qi = 0;
  for (let ni = 0; ni < nchars.length && qi < qchars.length; ni++) {
    if (qchars[qi] === nchars[ni].toLowerCase()) {
      hit.push(ni);
      qi++;
    }
  }
  if (qi === qchars.length) {
    const hitSet = new Set(hit);
    const segs = [];
    let buf = '';
    let bufHl = false;
    for (let i = 0; i < nchars.length; i++) {
      const hl = hitSet.has(i);
      if (hl !== bufHl && buf) {
        segs.push({ text: buf, hl: bufHl });
        buf = '';
      }
      bufHl = hl;
      buf += nchars[i];
    }
    if (buf) segs.push({ text: buf, hl: bufHl });
    const span = hit[hit.length - 1] - hit[0];
    const score = -1000 - span - hit[0];
    return { matched: true, continuous: false, score, segs };
  }

  return { matched: false };
}

export { buildMatch };
