/** services/event.js — 活动业务（只读） */
import * as mock from '../data/mock.js';

const TYPE_TEXT = {
  stage_show: '舞台表演',
  npc: '隐藏任务',
  reward: '兑奖点',
  club_event: '社团活动',
};

async function getEvents({ type = '' } = {}) {
  let list = mock.activities.slice();
  if (type) list = list.filter((e) => e.type === type);
  list.sort((a, b) => (a.startTime > b.startTime ? 1 : -1));
  return { list };
}

async function getEventDetail(eventId) {
  return mock.activities.find((e) => e.id === eventId) || null;
}

export { getEvents, getEventDetail, TYPE_TEXT };
