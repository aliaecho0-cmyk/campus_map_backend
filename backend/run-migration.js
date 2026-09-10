// 数据库迁移脚本：执行 migrations/ 下的 SQL 迁移文件
// 用法：node run-migration.js [迁移文件名，默认 initial_schema.sql]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 数据库文件保存在项目根目录
const DB_PATH = path.join(__dirname, 'database.db');
// 迁移文件位于项目根目录下的 migrations/ 目录
const MIGRATION_DIR = path.join(__dirname, 'migrations');

function fail(message) {
  console.error(`[错误] ${message}`);
  process.exit(1);
}

function tableExists(db, name) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row !== undefined;
}

function listTables(db) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((r) => r.name);
}

function printTable(db, table) {
  const stmt = db.prepare(`SELECT * FROM ${table}`);
  const rows = stmt.all();
  const columns = stmt.columns().map((c) => c.name);

  console.log(`表 ${table}（${rows.length} 行）：`);
  if (rows.length === 0) {
    console.log('  （无数据）');
    return;
  }
  // 计算每列显示宽度（列名与内容取最大值）
  const widths = columns.map((col, i) => {
    const cellMax = Math.max(...rows.map((r) => String(r[col] ?? '').length));
    return Math.max(col.length, cellMax, String(i + 1).length);
  });
  const header = columns.map((col, i) => col.padEnd(widths[i])).join(' | ');
  console.log('  ' + header);
  console.log('  ' + widths.map((w) => '-'.repeat(w)).join('-+-'));
  rows.forEach((row, idx) => {
    console.log(
      '  ' +
        columns
          .map((col, i) => String(row[col] ?? '').padEnd(widths[i]))
          .join(' | ') +
        `  (行 ${idx + 1})`
    );
  });
}

function main() {
  const migrationName = process.argv[2] || 'initial_schema.sql';
  if (!migrationName.endsWith('.sql')) {
    fail(`迁移文件名必须以 .sql 结尾：${migrationName}`);
  }
  const migrationFile = path.join(MIGRATION_DIR, migrationName);
  // 用迁移文件名（去掉 .sql）作为 schema_migrations.version，保证重复执行时一致
  const version = path.basename(migrationName, '.sql');

  let sql;
  try {
    sql = readFileSync(migrationFile, 'utf8');
  } catch (err) {
    fail(`无法读取迁移文件 ${migrationFile}：${err.message}`);
  }

  let db;
  try {
    db = new DatabaseSync(DB_PATH);
  } catch (err) {
    fail(`无法打开数据库 ${DB_PATH}：${err.message}`);
  }

  try {
    // 必须在事务外开启，事务内该 PRAGMA 不生效
    db.exec('PRAGMA foreign_keys = ON');

    // 已执行过则跳过：schema_migrations 表中存在对应版本记录
    if (tableExists(db, 'schema_migrations')) {
      const recorded = db
        .prepare('SELECT version FROM schema_migrations WHERE version = ?')
        .get(version);
      if (recorded) {
        console.log(`迁移已执行，跳过（version = ${version}）`);
        return;
      }
    }

    db.exec('BEGIN');
    try {
      db.exec(sql);
      // 迁移文件只创建 schema_migrations 表，版本记录在此写入
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // 忽略回滚失败，优先报告原始错误
      }
      fail(`迁移执行失败（${migrationFile}）：${err.message}`);
    }

    console.log('迁移执行成功');
    console.log('数据库文件：' + DB_PATH);

    console.log('\n所有表：');
    listTables(db).forEach((name) => console.log('  - ' + name));

    console.log('\n初始数据：');
    printTable(db, 'events');
    console.log();
    printTable(db, 'badges');
  } finally {
    db.close();
  }
}

main();
