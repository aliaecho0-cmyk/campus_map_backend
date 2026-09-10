-- 002_update_knowitall_threshold.sql
-- 将「百事通」徽章解锁阈值从 5 提高到 20（2026-09-10）
UPDATE badges SET required_unique_booths = 20 WHERE code = 'knowitall';