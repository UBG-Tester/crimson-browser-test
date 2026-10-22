import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import express from 'express';
import ipaddr from 'ipaddr.js';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
import { createBareServer } from '@tomphttp/bare-server-node';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dirOf = name => path.dirname(require.resolve(name));
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.get('/health', (_req, res) => res.json({
  ok: true,
  name: 'Crimson GX',
  engine: 'Scramjet',
  transports: ['Bare', 'Wisp'],
  uptimeSeconds: Math.round(process.uptime()),
  note: 'Web proxy endpoint; not a device-wide VPN.'
}));
app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /'));
app.get('/sw.js', (_req, res) => {
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send("importScripts('/controller/controller.sw.js'); self.addEventListener('fetch',e=>{if(self.$scramjetController?.shouldRoute(e))e.respondWith(self.$scramjetController.route(e))}); self.addEventListener('install',()=>self.skipWaiting()); self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");
});
app.use('/scram/', express.static(scramjetPath, { fallthrough: false }));
app.use('/utils/', express.static(dirOf('@mercuryworkshop/scramjet-utils')));
app.use('/controller/', express.static(dirOf('@mercuryworkshop/scramjet-controller')));
app.use('/libcurl/', express.static(dirOf('@mercuryworkshop/libcurl-transport')));
app.use('/baremod/', express.static(dirOf('@mercuryworkshop/bare-transport')));
app.get('/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.get('/index.html', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.use((_req, res) => res.status(404).type('text').send('Not found'));

const bare = createBareServer('/bare/', {
  filterRemote(url) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (ipaddr.isValid(host) && ipaddr.parse(host).range() !== 'unicast') {
      throw new RangeError('Forbidden IP address');
    }
  },
  connectionLimiter: { maxConnectionsPerIP: 120, windowDuration: 60, blockDuration: 10 }
});
const server = http.createServer((req, res) => bare.shouldRoute(req) ? bare.routeRequest(req, res) : app(req, res));
server.on('upgrade', (req, socket, head) => {
  if (bare.shouldRoute(req)) return bare.routeUpgrade(req, socket, head);
  if (new URL(req.url ?? '/', 'http://localhost').pathname === '/wisp/') return wisp.routeRequest(req, socket, head);
  socket.end();
});
const port = Number(process.env.PORT) || 8080;
server.listen(port, '0.0.0.0', () => console.log('Crimson GX listening on ' + port));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
