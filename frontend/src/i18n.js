/** Lightweight runtime localization. Map artwork remains unchanged by design. */
let language = 'zh';

const UI = {
  zh: {
    appTitle: '百团大战 · 活动导览',
    map: '地图', clubs: '社团', events: '活动',
    searchClubs: '搜索社团', searchClubNames: '搜索社团名称', search: '搜索',
    clubBooths: '社团摊位', lawnPlaza: '草坪 / 广场', stonePath: '石板路',
    clubIntro: '社团介绍', clubEmail: '社团邮箱', gameRules: '游戏规则', viewDetails: '查看详情',
    announcement: '公告', acknowledge: '知道了', booth: '摊位 {id}',
    boothStatus: '摊位 {id} · {status}', noSearchResults: '未找到匹配的社团',
    all: '全部', academic: '学术', tech: '科技', art: '艺术', sport: '体育', volunteer: '志愿',
    open: '营业中', break: '休息中', closed: '已收摊',
    totalClubs: '共 {count} 个社团', viewOnMap: '在地图查看',
    noClubs: '暂无社团，换个分类或关键词试试', noDescription: '暂无简介',
    clubDetails: '社团详情', clubProfile: '社团简介', boothLocation: '摊位位置',
    boothNumber: '摊位号 {id}', mapView: '地图查看', clubMissing: '社团不存在',
    loading: '加载中', stage: '舞台', hiddenQuest: '隐藏任务', prizePoint: '兑奖点',
    npc: 'NPC', prize: '兑奖', allDay: '全天', goThere: '去现场', noEvents: '暂无活动',
    eventDetails: '活动详情', stageShow: '舞台表演', clubEvent: '社团活动',
    event: '活动', location: '地点', time: '时间', starts: '开始', eventIntro: '活动介绍',
    eventMissing: '活动不存在', skip: '跳过', next: '下一步', complete: '完成',
    tutorialHint: '★ 新手提示', tutorialPrevious: '◀ 上一步',
    tutorialNext: '下一步 ▶', startExploring: '开始探索 ▶',
    confirm: '确定', cancel: '取消', loadingEllipsis: '加载中…',
    pauseRecord: '暂停唱片', resumeRecord: '继续播放唱片', notProvided: '未提供',
    copyEmail: '复制邮箱', emailCopied: '已复制', copyFailed: '复制失败',
  },
  en: {
    appTitle: 'Clubs Fair · Event Guide',
    map: 'Map', clubs: 'Clubs', events: 'Events',
    searchClubs: 'Search clubs', searchClubNames: 'Search club names', search: 'Search',
    clubBooths: 'Club Booths', lawnPlaza: 'Lawn / Plaza', stonePath: 'Stone Path',
    clubIntro: 'Club Profile', clubEmail: 'Club Email', gameRules: 'Activity Rules', viewDetails: 'View Details',
    announcement: 'Notice', acknowledge: 'Got it', booth: 'Booth {id}',
    boothStatus: 'Booth {id} · {status}', noSearchResults: 'No matching clubs found',
    all: 'All', academic: 'Academic', tech: 'Technology', art: 'Arts', sport: 'Sports', volunteer: 'Community',
    open: 'Open', break: 'On Break', closed: 'Closed',
    totalClubs: '{count} clubs', viewOnMap: 'View on Map',
    noClubs: 'No clubs found. Try another category or keyword.', noDescription: 'No description available.',
    clubDetails: 'Club Details', clubProfile: 'Club Profile', boothLocation: 'Booth Location',
    boothNumber: 'Booth {id}', mapView: 'View on Map', clubMissing: 'Club not found',
    loading: 'Loading', stage: 'Stage', hiddenQuest: 'Hidden Quest', prizePoint: 'Prize Point',
    npc: 'NPC', prize: 'Prize', allDay: 'All Day', goThere: 'Go There', noEvents: 'No events',
    eventDetails: 'Event Details', stageShow: 'Stage Performance', clubEvent: 'Club Event',
    event: 'Event', location: 'Location', time: 'Time', starts: 'Starts', eventIntro: 'About This Event',
    eventMissing: 'Event not found', skip: 'Skip', next: 'Next', complete: 'Done',
    tutorialHint: '★ Rookie Guide', tutorialPrevious: '◀ Previous',
    tutorialNext: 'Next ▶', startExploring: 'Start Exploring ▶',
    confirm: 'Confirm', cancel: 'Cancel', loadingEllipsis: 'Loading…',
    pauseRecord: 'Pause record', resumeRecord: 'Resume record', notProvided: 'Not provided',
    copyEmail: 'Copy email', emailCopied: 'Copied', copyFailed: 'Copy failed',
  },
};

const CLUB_NAMES_EN = {
  '校园媒体人': 'Campus Media Agency (CMA)',
  '交通社': 'Transport Fans Club',
  '尚饮社': 'Tea & Bartending Club',
  '模拟联合国协会': 'The Model United Nations of CUHKSZ (MUN)',
  '跑步社': 'Running Club',
  '“沉浸人生”推理协会': 'Life in Mystery',
  'HIPHOP音乐社': 'HIPHOP Club',
  'TIDE Club': 'TIDE Club',
  '经管头马演讲俱乐部': 'SME Toastmasters Club',
  '学生大使团': 'The Student Ambassador Group',
  '金融工程学会': 'Finance Engineering Club',
  '英辩队': 'English Debate Team',
  '国旗护卫队': 'National Flag Guard',
  '国际学生协会': "International Students' Association",
  '台球社': 'Billiards Club',
  'Encore音乐剧社': 'Encore Musical Club',
  '唯在设计': 'Wesign',
  'Lg足球社': 'Lg Football Club',
  '桌游社': 'Board Game Club',
  '羽毛球社': 'Badminton Club',
  '分类大师': 'Sorting Master',
  '城市特派队': 'City Wanderers',
  '知津公益剧社': 'LifePedia',
  '微光公益': 'Shimmer',
  'SPC主摊位': 'Social Practice Center (SPC)',
  'uBuddies': 'uBuddies',
  '青年会': 'Youth Union',
  '电音社': 'Electronic Music Club',
  '2Tired骑行社': '2Tired Cycling Club',
  'ACE网球社': 'ACE Tennis Club',
  'English Animator': 'English Animator',
  '睡眠社': 'Sleep Matters Club',
  '颜究所': 'The Mask Studio',
  'PIC摄影社': 'P.I.C. Photography Association',
  '涤纶诗社': 'Dylan Poetry Club',
  '酷滑社': 'SkateCool Club',
  '人文历史社': 'Humanities and History Club',
  '桥牌社': 'Bridge Club',
  '天文社': 'Astronomy Society',
  '粤语社': 'Cantonese Club',
  '鹿鸣配音社': 'The Voice of Deer Dubbing Club (VDDC)',
  '化学协会': 'ChemA Community',
  '新能源学会': 'New Energy Association',
  '游戏研究社': 'Gaming Odyssey',
  'IEA投资启蒙协会': 'Investment Enlightenment Association',
  '物理学会': 'Physical Society',
  '计算机协会': 'Computer Association',
  '凤凰漫研社': 'Phoenix ACG Club',
  '生物科学学会': 'DeepBio Association',
  '武联社': 'Martial Arts Union',
  '逸夫青年研习社': 'Shaw Awakened Youth',
  'Respecx 青春健康同伴社': 'Respecx',
  '奇点科幻社': 'Singularity Science Fiction',
  '魅影戏剧社': 'Phantom Club',
  '乒乓球社': 'Table Tennis Club',
  '机智协会': 'Electronic Intelligence Association',
  '棒球社': 'Baseball Club',
  'V8橄榄球俱乐部': 'V8 Football Club',
  '匹克球社': 'Pickleball Club',
  '排球社': 'Volleyball Club',
  '击剑社': 'The First Sword Fencing Club',
  '聚乐部': 'Music Union',
  '极限飞盘协会': 'Ultimate Frisbee Organization',
  '高尔夫社': 'Golf Association',
  '电竞社': 'E-sport Club',
  'LGUBA篮球社': 'Basketball Club',
  '游泳社': 'Swimming Club',
  '淇奥手创社': 'iCraft Club',
  'CP 食研社': 'Cooking Pioneer',
  '润泽书社': 'Runze Book Society',
  '攀岩社': 'Climbing Club',
  '趣旅行': 'Darlingo',
  '戏曲社': 'Chinese Opera Association',
  '掬月社': 'Jvyue Club',
  '醉红学': 'Redology Club',
  '弈秋棋社': 'Chess Club',
  '锦灰社': 'Jinhui Club',
  '手极社': 'Hand Extreme Sports Club',
  '精舞团': 'Max Dancing Club',
  'TEDxCUHKSZ': 'TEDxCUHKSZ',
  '自说自话脱口秀社': 'SOMIC Stand-up Comedy Club',
  '南露书法社': 'Nanlu Calligraphy Club',
  '数独社': 'Sudoku Club',
  '电影俱乐部': 'Film Club',
  '客属联谊会': 'Hakka Association',
  '健身社': 'Fitness Club',
  '万寿模型社': 'Bantako Model Club',
  '研究生会': 'The Graduate Student Union',
};

const EVENT_EN = {
  'evt-stage-1': { title: 'Max Dancing Club: Opening Dance', location: 'Sunken Plaza Stage', desc: 'A high-energy dance medley opens the Clubs Fair.' },
  'evt-stage-2': { title: 'Music Union Band: Burgundy Red', location: 'Sunken Plaza Stage', desc: 'Drums and guitar bring a relaxed late-summer groove to the stage.' },
  'evt-stage-3': { title: 'Chinese Opera Association: Water Sleeves Through Time', location: 'Sunken Plaza Stage', desc: 'Traditional water-sleeve movements connect classical theatre with the present.' },
  'evt-stage-4': { title: 'HIPHOP Club: Fearless', location: 'Sunken Plaza Stage', desc: 'Powerful beats and vocals encourage everyone to face every challenge.' },
  'evt-stage-5': { title: 'Phoenix ACG Club: Otaku Dance', location: 'Sunken Plaza Stage', desc: 'Jump into the music with an energetic ACG dance performance.' },
  'evt-npc': { title: 'Hidden Quest: Find the NPC', location: 'Roaming among the booths', desc: 'Find the roaming NPC, complete the mission, and claim a special prize.' },
  'evt-reward': { title: 'Student Association Prize Point', location: 'Top-left Prize Point', desc: 'Redeem event rewards here. Limited moon and star charms are available.' },
};

const ANNOUNCEMENT_EN = {
  'ann-1': {
    title: 'Welcome to the Clubs Fair!',
    content: 'Visit the Student Association Supply Station on the first floor of the Student Activity Centre to learn how the event works and collect your materials. Complete booth activities to earn prizes, and do not miss the live stage performances!',
  },
};

const CATEGORY_KEYS = { 学术: 'academic', 科技: 'tech', 艺术: 'art', 体育: 'sport', 志愿: 'volunteer' };
const STATUS_KEYS = { open: 'open', break: 'break', closed: 'closed' };

function setLanguage(next) {
  language = next === 'en' ? 'en' : 'zh';
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.title = t('appTitle');
}

function getLanguage() {
  return language;
}

function isEnglish() {
  return language === 'en';
}

function t(key, values = {}) {
  const template = UI[language][key] ?? UI.zh[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
}

function categoryText(category) {
  return isEnglish() ? t(CATEGORY_KEYS[category] || category) : category;
}

function statusText(status) {
  return t(STATUS_KEYS[status] || status);
}

function englishClubName(name) {
  return CLUB_NAMES_EN[name] || name;
}

function englishClubCopy(name, boothId) {
  const booth = boothId ? ` at Booth ${boothId}` : '';
  return {
    slogan: `Meet ${name}${booth}.`,
    intro: `Meet ${name}${booth} and learn about the club and its activities from the team on site.`,
    gameRules: 'Please ask the booth staff for the current activity rules.',
  };
}

function localizeBooth(booth) {
  if (!isEnglish()) return booth;
  const name = booth.nameEn || englishClubName(booth.clubName);
  const fallback = englishClubCopy(name, booth.id);
  return {
    ...booth,
    clubName: name,
    category: categoryText(booth.category),
    ...fallback,
    intro: booth.introEn || fallback.intro,
    gameRules: booth.gameRulesEn || '',
  };
}

function localizeClub(club) {
  if (!isEnglish()) return club;
  const name = club.nameEn || englishClubName(club.name);
  const fallback = englishClubCopy(name, club.boothId);
  return {
    ...club,
    name,
    category: categoryText(club.category),
    ...fallback,
    intro: club.introEn || fallback.intro,
    gameRules: club.gameRulesEn || '',
  };
}

function localizeEvent(event) {
  if (!isEnglish()) return event;
  return { ...event, ...(EVENT_EN[event.id] || {}) };
}

function localizeAnnouncement(announcement) {
  if (!isEnglish()) return announcement;
  return { ...announcement, ...(ANNOUNCEMENT_EN[announcement.id] || {}) };
}

export {
  setLanguage,
  getLanguage,
  isEnglish,
  t,
  categoryText,
  statusText,
  localizeBooth,
  localizeClub,
  localizeEvent,
  localizeAnnouncement,
};
