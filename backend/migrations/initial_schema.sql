-- 001_initial_schema.sql

-- 活动表
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  end_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('draft', 'active', 'closed'))
);

-- 工作人员白名单
CREATE TABLE staff_whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 徽章定义表
CREATE TABLE badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  required_unique_booths INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, code),
  FOREIGN KEY (event_id) REFERENCES events(id),
  CHECK (required_unique_booths > 0)
);

-- 摊位浏览记录表
CREATE TABLE booth_view_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  booth_id TEXT NOT NULL,
  first_viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  view_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE (event_id, device_id, booth_id),
  FOREIGN KEY (event_id) REFERENCES events(id),
  CHECK (view_count > 0)
);

-- 用户已解锁徽章表
CREATE TABLE user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  badge_id INTEGER NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_id, badge_id),
  FOREIGN KEY (badge_id) REFERENCES badges(id)
);

-- 学生领取码表
CREATE TABLE claim_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redeemed_at TEXT,
  redeemed_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_id),
  CHECK (status IN ('active', 'redeemed'))
);

-- 核销记录表
CREATE TABLE redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_token_id INTEGER NOT NULL,
  staff_name TEXT NOT NULL,
  student_device_id TEXT NOT NULL,
  redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_token_id) REFERENCES claim_tokens(id),
  UNIQUE (claim_token_id)
);

-- 数据库迁移记录表
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 插入一条初始活动记录
INSERT INTO events (slug, name, status, end_at)
VALUES ('online_map_try_2026', 'online_map_try 2026', 'active', 1789833599);

-- 插入 knowitall 徽章定义
INSERT INTO badges (event_id, code, name, description, required_unique_booths)
VALUES (1, 'knowitall', '百事通', '浏览5个不同摊位即可解锁', 5);