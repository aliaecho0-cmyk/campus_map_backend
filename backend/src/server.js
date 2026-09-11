import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;

const app = createApp();

const required = ['STAFF_CODE', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`缺少必需环境变量: ${key}`);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});