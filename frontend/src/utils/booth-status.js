const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const OPEN_MINUTE = 15 * 60;
const CLOSE_MINUTE = 18 * 60;

/** 每日北京时间 15:00（含）至 18:00（不含）营业。 */
function getCurrentBoothStatus(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const beijingTime = new Date(timestamp + BEIJING_UTC_OFFSET_MS);
  const minuteOfDay = beijingTime.getUTCHours() * 60 + beijingTime.getUTCMinutes();
  return minuteOfDay >= OPEN_MINUTE && minuteOfDay < CLOSE_MINUTE ? 'open' : 'closed';
}

export { getCurrentBoothStatus };
