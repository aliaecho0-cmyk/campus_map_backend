import './styles/app.css';
import './styles/motion.css';
import { start, refresh, startOnboarding } from './router.js';
import { mountStartupIntro } from './components/startup-intro.js';
import { wx } from './adapter/wx.js';
import * as announcementService from './services/announcement.js';
import { localizeAnnouncement, setLanguage, t } from './i18n.js';
import { state } from './state.js';
import { startBackgroundMusic } from './services/background-music.js';
import { ensureLogin } from './services/auth.js';

async function chooseLanguage() {
  const result = await wx.showModal({
    title: '选择语言 / Choose Language',
    content: '请选择界面语言\nPlease select a language',
    confirmText: '中文',
    cancelText: 'English',
    maskClosable: false,
    success: () => startBackgroundMusic(),
  });
  setLanguage(result.confirm ? 'zh' : 'en');
  refresh();
}

async function showEntryAnnouncement() {
  const { list } = await announcementService.getAnnouncements();
  const announcement = list[0] ? localizeAnnouncement(list[0]) : null;
  if (!announcement) return;

  await wx.showModal({
    title: announcement.title,
    content: announcement.content,
    showCancel: false,
    confirmText: t('acknowledge'),
  });
}

const startupIntro = mountStartupIntro();
window.startOnboarding = startOnboarding;

// 先完成无感登录（或失败降级）再渲染，避免首屏接口 401；
// 之后依次播放开场动画 → 语言选择 → 首个公告 → 背景配乐
ensureLogin().finally(() => {
  start();
  startupIntro
    .play()
    .then(chooseLanguage)
    .then(showEntryAnnouncement)
    .catch(() => {})
    .finally(() => {
      state.entryReady = true;
    });
});
