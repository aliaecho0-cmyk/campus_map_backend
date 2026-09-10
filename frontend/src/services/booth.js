/** services/booth.js — 摊位业务（只读，数据来自打包的 mock） */
import * as mock from '../data/mock.js';

async function getBooths({ area = 'ALL' } = {}) {
  const list = area === 'ALL' ? mock.booths : mock.booths.filter((b) => b.area === area);
  return { list };
}

async function getAreas() {
  return { list: mock.areas };
}

export { getBooths, getAreas };
