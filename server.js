const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'configs.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadConfigs() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function saveConfigs(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}
function uuidv4() { return crypto.randomUUID(); }

function generateX25519() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519');
  const privRaw = privateKey.export({ format: 'der', type: 'pkcs8' }).slice(-32);
  const pubRaw = publicKey.export({ format: 'der', type: 'spki' }).slice(-32);
  return {
    privateKey: privRaw.toString('base64url'),
    publicKey: pubRaw.toString('base64url'),
  };
}
function randomShortId(len = 8) {
  return crypto.randomBytes(len / 2).toString('hex');
}

function normalize(input) {
  const c = { ...input };
  c.id = c.id || uuidv4();
  c.name = (c.name || 'config').trim();
  c.protocol = c.protocol || 'vless';
  c.address = (c.address || '').trim();
  c.port = parseInt(c.port, 10) || 443;
  c.network = c.network || 'tcp';
  c.security = c.security || 'none';

  if (c.protocol === 'vless' || c.protocol === 'vmess') {
    if (!c.uuid) c.uuid = uuidv4();
  }
  if (c.protocol === 'vmess') {
    c.alterId = parseInt(c.alterId, 10) || 0;
  }
  if (c.protocol === 'trojan') {
    if (!c.password) c.password = crypto.randomBytes(16).toString('hex');
  }
  if (c.protocol === 'vless') {
    c.flow = c.flow || (c.security === 'reality' ? 'xtls-rprx-vision' : '');
  }

  c.path = c.path || '';
  c.host = c.host || '';
  c.serviceName = c.serviceName || '';
  c.grpcMode = c.grpcMode || 'gun';
  c.headerType = c.headerType || 'none';

  c.sni = c.sni || '';
  c.alpn = c.alpn || '';
  c.fingerprint = c.fingerprint || 'chrome';
  c.allowInsecure = !!c.allowInsecure;

  if (c.security === 'reality') {
    c.realityDest = c.realityDest || 'www.microsoft.com:443';
    if (!Array.isArray(c.realityServerNames) || c.realityServerNames.length === 0) {
      c.realityServerNames = [c.realityDest.split(':')[0]];
    }
    if (!c.realityPrivateKey || !c.realityPublicKey) {
      const keys = generateX25519();
      c.realityPrivateKey = keys.privateKey;
      c.realityPublicKey = keys.publicKey;
    }
    if (!c.realityShortId) c.realityShortId = randomShortId(8);
  }

  c.createdAt = c.createdAt || new Date().toISOString();
  return c;
}

function buildServerConfig(c) {
  const inbound = {
    tag: `in-${c.protocol}`,
    listen: '0.0.0.0',
    port: c.port,
    protocol: c.protocol,
    settings: {},
    streamSettings: { network: c.network, security: c.security },
    sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'], routeOnly: true },
  };

  if (c.protocol === 'vless') {
    inbound.settings = {
      clients: [{ id: c.uuid, flow: c.flow || '', email: `${c.name}@local` }],
      decryption: 'none',
    };
  } else if (c.protocol === 'vmess') {
    inbound.settings = {
      clients: [{ id: c.uuid, alterId: c.alterId, email: `${c.name}@local` }],
    };
  } else if (c.protocol === 'trojan') {
    inbound.settings = {
      clients: [{ password: c.password, email: `${c.name}@local` }],
    };
  }

  const ss = inbound.streamSettings;
  if (c.network === 'ws') {
    ss.wsSettings = { path: c.path || '/', headers: c.host ? { Host: c.host } : {} };
  } else if (c.network === 'grpc') {
    ss.grpcSettings = { serviceName: c.serviceName || '', multiMode: c.grpcMode === 'multi' };
  } else if (c.network === 'h2') {
    ss.httpSettings = { path: c.path || '/', host: c.host ? [c.host] : [] };
  } else if (c.network === 'tcp') {
    if (c.headerType === 'http') {
      ss.tcpSettings = {
        header: {
          type: 'http',
          request: { path: [c.path || '/'], headers: c.host ? { Host: [c.host] } : {} },
        },
      };
    }
  } else if (c.network === 'kcp') {
    ss.kcpSettings = { header: { type: c.headerType || 'none' } };
  } else if (c.network === 'quic') {
    ss.quicSettings = { security: 'none', key: '', header: { type: c.headerType || 'none' } };
  }

  if (c.security === 'tls') {
    ss.tlsSettings = {
      serverName: c.sni || c.address,
      alpn: c.alpn ? c.alpn.split(',').map(s => s.trim()).filter(Boolean) : ['h2', 'http/1.1'],
      certificates: [
        {
          certificateFile: '/etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem',
          keyFile: '/etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem',
        },
      ],
    };
  } else if (c.security === 'reality') {
    ss.realitySettings = {
      show: false,
      dest: c.realityDest,
      xver: 0,
      serverNames: c.realityServerNames,
      privateKey: c.realityPrivateKey,
      shortIds: ['', c.realityShortId],
    };
  }

  return {
    log: { loglevel: 'warning' },
    dns: {
      servers: ['https+local://1.1.1.1/dns-query', 'localhost'],
      queryStrategy: 'UseIP',
    },
    inbounds: [inbound],
    outbounds: [
      { tag: 'direct', protocol: 'freedom', settings: { domainStrategy: 'UseIPv4' } },
      { tag: 'blocked', protocol: 'blackhole', settings: {} },
    ],
    routing: {
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { type: 'field', ip: ['geoip:private'], outboundTag: 'blocked' },
        { type: 'field', protocol: ['bittorrent'], outboundTag: 'blocked' },
      ],
    },
    policy: {
      levels: { 0: { handshake: 2, connIdle: 120, uplinkOnly: 1, downlinkOnly: 1, bufferSize: 4 } },
    },
  };
}

function buildVlessLink(c) {
  const params = new URLSearchParams();
  params.set('type', c.network);
  params.set('security', c.security);
  params.set('encryption', 'none');
  if (c.flow) params.set('flow', c.flow);

  if (c.security === 'tls') {
    if (c.sni) params.set('sni', c.sni);
    if (c.alpn) params.set('alpn', c.alpn);
    if (c.fingerprint) params.set('fp', c.fingerprint);
    if (c.allowInsecure) params.set('allowInsecure', '1');
  }
  if (c.security === 'reality') {
    const sni = c.sni || (c.realityServerNames && c.realityServerNames[0]) || '';
    if (sni) params.set('sni', sni);
    if (c.fingerprint) params.set('fp', c.fingerprint);
    if (c.realityPublicKey) params.set('pbk', c.realityPublicKey);
    if (c.realityShortId) params.set('sid', c.realityShortId);
    params.set('spx', '/');
  }

  if (c.network === 'ws') {
    params.set('path', c.path || '/');
    if (c.host) params.set('host', c.host);
  } else if (c.network === 'grpc') {
    params.set('serviceName', c.serviceName || '');
    params.set('mode', c.grpcMode || 'gun');
  } else if (c.network === 'h2') {
    params.set('path', c.path || '/');
    if (c.host) params.set('host', c.host);
  } else if (c.network === 'tcp') {
    if (c.headerType === 'http') {
      params.set('headerType', 'http');
      if (c.host) params.set('host', c.host);
      if (c.path) params.set('path', c.path);
    }
  } else if (c.network === 'kcp' || c.network === 'quic') {
    if (c.headerType && c.headerType !== 'none') params.set('headerType', c.headerType);
  }

  return `vless://${c.uuid}@${c.address}:${c.port}?${params.toString()}#${encodeURIComponent(c.name)}`;
}

function buildVmessLink(c) {
  const obj = {
    v: '2',
    ps: c.name,
    add: c.address,
    port: String(c.port),
    id: c.uuid,
    aid: String(c.alterId || 0),
    scy: 'auto',
    net: c.network,
    type: c.network === 'tcp' ? c.headerType || 'none' : c.headerType || 'none',
    host: c.host || '',
    path: c.path || '',
    tls: c.security === 'tls' ? 'tls' : '',
    sni: c.sni || '',
    alpn: c.alpn || '',
    fp: c.fingerprint || '',
  };
  if (c.network === 'grpc') {
    obj.path = c.serviceName || '';
    obj.type = c.grpcMode || 'gun';
  }
  return 'vmess://' + Buffer.from(JSON.stringify(obj)).toString('base64');
}

function buildTrojanLink(c) {
  const params = new URLSearchParams();
  params.set('type', c.network);
  params.set('security', c.security === 'none' ? 'tls' : c.security);
  if (c.sni) params.set('sni', c.sni);
  if (c.alpn) params.set('alpn', c.alpn);
  if (c.fingerprint) params.set('fp', c.fingerprint);
  if (c.allowInsecure) params.set('allowInsecure', '1');

  if (c.network === 'ws') {
    params.set('path', c.path || '/');
    if (c.host) params.set('host', c.host);
  } else if (c.network === 'grpc') {
    params.set('serviceName', c.serviceName || '');
    params.set('mode', c.grpcMode || 'gun');
  } else if (c.network === 'h2') {
    params.set('path', c.path || '/');
    if (c.host) params.set('host', c.host);
  }

  return `trojan://${encodeURIComponent(c.password)}@${c.address}:${c.port}?${params.toString()}#${encodeURIComponent(c.name)}`;
}

function buildShareLink(c) {
  if (c.protocol === 'vless') return buildVlessLink(c);
  if (c.protocol === 'vmess') return buildVmessLink(c);
  if (c.protocol === 'trojan') return buildTrojanLink(c);
  return '';
}

app.get('/api/configs', (req, res) => {
  res.json(loadConfigs());
});

app.post('/api/configs', (req, res) => {
  const list = loadConfigs();
  const c = normalize(req.body || {});
  list.push(c);
  saveConfigs(list);
  res.json(c);
});

app.put('/api/configs/:id', (req, res) => {
  const list = loadConfigs();
  const idx = list.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const merged = normalize({ ...list[idx], ...(req.body || {}), id: list[idx].id, createdAt: list[idx].createdAt });
  list[idx] = merged;
  saveConfigs(list);
  res.json(merged);
});

app.delete('/api/configs/:id', (req, res) => {
  const list = loadConfigs();
  const next = list.filter(x => x.id !== req.params.id);
  saveConfigs(next);
  res.json({ ok: true });
});

app.get('/api/configs/:id', (req, res) => {
  const c = loadConfigs().find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

app.get('/api/configs/:id/server', (req, res) => {
  const c = loadConfigs().find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const cfg = buildServerConfig(c);
  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${c.name}-server.json"`);
  }
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(cfg, null, 2));
});

app.get('/api/configs/:id/link', async (req, res) => {
  const c = loadConfigs().find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const link = buildShareLink(c);
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 320 });
  res.json({ link, qr });
});

app.post('/api/preview', async (req, res) => {
  const c = normalize({ ...(req.body || {}), id: 'preview' });
  const link = buildShareLink(c);
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 320 });
  res.json({ config: c, server: buildServerConfig(c), link, qr });
});

app.post('/api/x25519', (req, res) => res.json(generateX25519()));
app.post('/api/uuid', (req, res) => res.json({ uuid: uuidv4() }));
app.post('/api/shortid', (req, res) => {
  const len = Math.max(2, Math.min(16, parseInt(req.body?.length, 10) || 8));
  res.json({ shortId: randomShortId(len) });
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`V2Ray config panel listening on http://0.0.0.0:${PORT}`);
});
