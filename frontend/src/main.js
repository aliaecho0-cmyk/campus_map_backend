import './styles/app.css';
import './styles/motion.css';
import { start } from './router.js';
import { ensureLogin } from './services/auth.js';

// 先完成无感登录（或失败降级），再启动路由
// 这样页面渲染时 token 已就绪，避免首屏接口 401
ensureLogin().finally(() => {
  start();
});