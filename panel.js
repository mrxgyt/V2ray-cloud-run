const express = require('express');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PANEL_PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

function getConfig() {
  try {
    const raw = fs.readFileSync('./config.json', 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function getDomain() {
  return process.env.REPLIT_DEV_DOMAIN ||
    process.env.REPL_SLUG + '.' + process.env.REPL_OWNER + '.repl.co' ||
    process.env.HOSTNAME ||
    'your-domain.repl.co';
}

app.get('/api/config', (req, res) => {
  const cfg = getConfig();
  const domain = getDomain();

  if (!cfg) return res.status(500).json({ error: 'config.json not found' });

  const inbound = cfg.inbounds && cfg.inbounds[0];
  const uuid = inbound?.settings?.clients?.[0]?.id || '';
  const port = inbound?.port || 8080;
  const path = inbound?.streamSettings?.wsSettings?.path || '/';
  const protocol = inbound?.protocol || 'vless';
  const network = inbound?.streamSettings?.network || 'ws';

  const vlessLink = `vless://${uuid}@${domain}:443?encryption=none&security=tls&sni=${domain}&fp=randomized&type=${network}&host=${domain}&path=${encodeURIComponent(path)}#VLESS-${domain}`;

  res.json({
    uuid,
    domain,
    port,
    path,
    protocol,
    network,
    vlessLink,
    serverPort: port,
    tlsPort: 443
  });
});

app.get('/api/speedtest', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const start = Date.now();
  const sizes = [
    { name: '10MB', url: 'https://speed.cloudflare.com/__down?bytes=10000000' },
  ];

  try {
    const result = await new Promise((resolve, reject) => {
      const startTime = Date.now();
      let received = 0;
      const req2 = https.get('https://speed.cloudflare.com/__down?bytes=10000000', (response) => {
        response.on('data', chunk => { received += chunk.length; });
        response.on('end', () => {
          const duration = (Date.now() - startTime) / 1000;
          const speedMbps = ((received * 8) / duration / 1000000).toFixed(2);
          resolve({ speedMbps, duration: duration.toFixed(2), bytes: received });
        });
      });
      req2.on('error', reject);
      req2.setTimeout(15000, () => { req2.destroy(); reject(new Error('timeout')); });
    });

    const pingStart = Date.now();
    await new Promise((resolve, reject) => {
      const r = https.get('https://speed.cloudflare.com/', resolve);
      r.on('error', reject);
    });
    const ping = Date.now() - pingStart;

    res.json({ success: true, ...result, ping });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({ pong: true, ts: Date.now() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 V2Ray Panel running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Domain: ${getDomain()}`);
  const cfg = getConfig();
  if (cfg) {
    const uuid = cfg.inbounds?.[0]?.settings?.clients?.[0]?.id;
    const path = cfg.inbounds?.[0]?.streamSettings?.wsSettings?.path;
    const domain = getDomain();
    console.log(`🔑 UUID: ${uuid}`);
    console.log(`📂 Path: ${path}`);
    console.log(`\n📋 VLESS Link:\nvless://${uuid}@${domain}:443?encryption=none&security=tls&sni=${domain}&type=ws&host=${domain}&path=${encodeURIComponent(path)}#VLESS-${domain}\n`);
  }
});
