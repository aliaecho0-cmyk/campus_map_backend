/** services/club.js — 社团业务（只读） */
import * as mock from '../data/mock.js';
import { getCurrentBoothStatus } from '../utils/booth-status.js';

const CATEGORIES = ['全部', '实践体验类', '学术科技类', '体育运动类', '文化艺术类', '学生组织'];

async function getClubs({ category = '', keyword = '', page = 1, pageSize = 20 } = {}) {
  const boothMap = {};
  mock.booths.forEach((b) => (boothMap[b.clubId] = b));
  const status = getCurrentBoothStatus();
  let list = mock.clubs.map((c) => {
    const b = boothMap[c.id]; // clubs 上 clubId 存在 id 字段（同 getClubDetail 的 clubId 入参）
    return { ...c, status: b ? status : '', lat: b ? b.lat : 0, lng: b ? b.lng : 0 };
  });
  if (category) list = list.filter((c) => c.category === category);
  if (keyword) list = list.filter((c) => c.name.includes(keyword) || (c.slogan || '').includes(keyword));
  const start = (page - 1) * pageSize;
  return { list: list.slice(start, start + pageSize), total: list.length };
}

async function getClubDetail(clubId) {
  const club = mock.clubs.find((c) => c.id === clubId);
  const booth = mock.booths.find((b) => b.clubId === clubId);
  const status = getCurrentBoothStatus();
  const currentBooth = booth ? { ...booth, status } : null;
  return club ? { ...club, status: currentBooth ? status : '', booth: currentBooth } : null;
}

export { getClubs, getClubDetail, CATEGORIES };
