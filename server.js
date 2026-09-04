require('dotenv').config();
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const app = createApp();
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mydan marketplace listening on http://0.0.0.0:${PORT}`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
