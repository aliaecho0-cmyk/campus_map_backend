/** state.js — 等价 app.globalData 的全局状态（跨页高亮、教程启动标记） */
export const state = {
  highlightBoothId: '', // 社团「在地图查看」→ 地图页高亮摊位
  boothViewHandoff: null,
  startBoothViewAfterMapFocus: '',
  highlightCenter: null, // 活动「去现场」→ 地图页定位/高亮区域
  tutorialLaunched: false, // 本会话是否已处理过新手指引（每会话只播一次）
  tabbar: null,
  tutorial: null,
};
