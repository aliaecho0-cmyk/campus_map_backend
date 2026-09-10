import './styles/app.css';
import './styles/motion.css';
import { start } from './router.js';
import { ensureLogin } from './services/auth.js';

// 学生无感登录：启动即执行；内部有 token 去重，失败时非阻断降级，不阻塞页面渲染
ensureLogin();

start();
