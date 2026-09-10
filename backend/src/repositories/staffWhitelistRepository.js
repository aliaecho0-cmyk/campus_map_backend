import { withDb, withTransaction } from '../db.js';

/**
 * 按姓名精确查询白名单成员。
 * @param {string} name 工作人员姓名
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {{ id: number, name: string } | null} 命中返回该成员，否则返回 null
 */
export function findByName(name, connection) {
  return withDb(connection, (db) => {
    const row = db
      .prepare('SELECT id, name FROM staff_whitelist WHERE name = ?')
      .get(name);
    return row ?? null;
  });
}

/**
 * 批量插入白名单（初始化 / 运营导入）。
 * 使用 INSERT OR IGNORE：与现有行重名或数组内重名时自动忽略，不中断也不报错。
 * @param {string[]} names 姓名数组
 * @param {import('node:sqlite').DatabaseSync} [connection] 可选：调用方传入的连接（用于事务内复用）
 * @returns {number} 实际插入的行数（被忽略的重名不计入）
 */
export function insertMany(names, connection) {
  const clean = (names ?? []).filter(
    (n) => typeof n === 'string' && n.trim() !== ''
  );
  if (clean.length === 0) return 0;

  const runInsert = (db) => {
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO staff_whitelist (name) VALUES (?)'
    );
    let inserted = 0;
    for (const name of clean) {
      // changes：实际插入 1 行时为 1，被 UNIQUE 忽略时为 0
      inserted += stmt.run(name.trim()).changes;
    }
    return inserted;
  };

  // 未传入连接时包一层事务，保证整批原子提交
  return connection ? runInsert(connection) : withTransaction(runInsert);
}
