import http from 'node:http';
import { getConfig } from './config.js';
import { createApp } from './app.js';
import { attachLiveTutorProxy } from './liveProxy.js';

const cfg = getConfig();
const { app, store } = createApp();
const server = http.createServer(app);

attachLiveTutorProxy(server, store);

server.listen(cfg.port, () => {
  console.log(
    `[HuquqPro] Server ishga tushdi: http://127.0.0.1:${cfg.port} (STORE=${cfg.storeType}, ENV=${cfg.nodeEnv})`
  );
});
