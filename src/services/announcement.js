/** services/announcement.js — 公告业务（只读） */
import * as mock from '../data/mock.js';

async function getAnnouncements() {
  const list = mock.announcements
    .filter((a) => a.status === 'published')
    .slice()
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return { list };
}

export { getAnnouncements };
