const http = require('http');
const app = require('./app');
const config = require('./shared/config');
const { initSocket } = require('./websocket/socket.handlers');
const { initCronJobs } = require('./jobs/cron');

const PORT = config.port;

const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

// Initialize Cron Jobs
initCronJobs();

server.listen(PORT, () => {
  console.log(`\n🚀 ${config.app.name} API server running`);
  console.log(`📍 Environment: ${config.nodeEnv}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/v1`);
  console.log(`📚 Docs: http://localhost:${PORT}/api-docs`);
  console.log(`⚡ WebSocket: ws://localhost:${PORT}/socket.io`);
  console.log(`❤️  Health: http://localhost:${PORT}/health\n`);
});
