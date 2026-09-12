// 决定性实验：把「慢」和「同步 SQL 阻塞」分离。
// 起一个极简 http 服务器：不碰数据库，只在 DELAY ms 后返回 200。
// 用与 test-concurrency.js 完全相同的方式（fetch、N 条新连接）打它。
//   node test-probe-limit.js
import http from 'node:http';

const DELAY = Number(process.env.DELAY) || 20;   // 模拟「每个请求占用连接 ~20ms」
const N = Number(process.env.N) || 1000;

const server = http.createServer((req, res) => {
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  }, DELAY);
});

await new Promise((r) => server.listen(3003, '127.0.0.1', r));
console.log(`[慢响应服务器] http://127.0.0.1:3003  每请求延迟 ${DELAY}ms（无数据库）\n`);

async function burst(label, n) {
  const t0 = Date.now();
  const out = await Promise.all(
    Array.from({ length: n }, async () => {
      try {
        const r = await fetch('http://127.0.0.1:3003/', { signal: AbortSignal.timeout(30000) });
        await r.text();
        return { ok: true };
      } catch (e) {
        return { ok: false, err: e?.cause?.code || e?.message };
      }
    })
  );
  const ms = Date.now() - t0;
  const okN = out.filter((r) => r.ok).length;
  const errs = out.filter((r) => !r.ok).reduce((m, r) => { m[r.err] = (m[r.err] || 0) + 1; return m; }, {});
  console.log(
    `${label.padEnd(30)} 成功=${String(okN).padStart(5)}/${String(n).padStart(5)}  ` +
    `${ms}ms  ${Object.keys(errs).length ? JSON.stringify(errs) : ''}`
  );
  return okN;
}

console.log('=== fetch，每条请求各开一条新连接 ===');
for (const n of [400, 1000]) await burst(`纯慢响应 DELAY=${DELAY}ms`, n);
console.log('');

console.log('=== 同一批请求，改用 keep-alive 连接池（复用 50 条连接）===');
{
  const agent = new http.Agent({ keepAlive: true, maxSockets: 50 });
  const t0 = Date.now();
  const out = await Promise.all(
    Array.from({ length: 1000 }, () =>
      new Promise((resolve) => {
        const req = http.request({ host: '127.0.0.1', port: 3003, path: '/', method: 'GET', agent },
          (res) => { res.resume(); res.on('end', () => resolve({ ok: true })); });
        req.on('error', (e) => resolve({ ok: false, err: e.code }));
        req.end();
      })
    )
  );
  const okN = out.filter((r) => r.ok).length;
  const errs = out.filter((r) => !r.ok).reduce((m, r) => { m[r.err] = (m[r.err] || 0) + 1; return m; }, {});
  console.log(`keep-alive 50 条连接        成功=${String(okN).padStart(5)}/ 1000  ${Date.now() - t0}ms  ${Object.keys(errs).length ? JSON.stringify(errs) : ''}`);
}

server.close();
