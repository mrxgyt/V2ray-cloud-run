/* ============================================================
   V2Ray Panel – app.js
   Fetches /api/config, renders QR, speed test, copy helpers
============================================================ */

let configData = null;
let uuidVisible = false;

/* ─── DOM helpers ─── */
const $ = id => document.getElementById(id);

/* ─── Toast ─── */
function showToast(msg, duration = 2200) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

/* ─── Copy ─── */
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '✅ Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
    }
    showToast('Copied to clipboard ✓');
  } catch {
    showToast('Copy failed – select manually');
  }
}

/* ─── Draw gauge ─── */
function drawGauge(canvas, value, max = 1000) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H - 10;
  const r = H - 22;
  const startA = Math.PI, endA = 2 * Math.PI;

  // background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startA, endA);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.stroke();

  if (value > 0) {
    const pct = Math.min(value / max, 1);
    const valueAngle = startA + pct * Math.PI;
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0, '#6c63ff');
    grad.addColorStop(1, '#00d4ff');
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, valueAngle);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.stroke();

    // glow
    ctx.shadowColor = '#6c63ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, valueAngle);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

/* ─── Generate QR ─── */
async function renderQR(text) {
  if (!window.QRCode || !text || text === 'Loading…') return;
  const canvas = $('qrCanvas');
  try {
    await QRCode.toCanvas(canvas, text, {
      width: 180,
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch (e) {
    console.warn('QR error', e);
  }
}

/* ─── Fetch config ─── */
async function loadConfig() {
  const badge = $('statusBadge');
  const statusText = $('statusText');
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    configData = data;

    // Header status
    badge.classList.remove('offline');
    statusText.textContent = 'Online';

    // Stats row
    $('valProtocol').textContent = (data.protocol || 'vless').toUpperCase();
    $('valNetwork').textContent = (data.network || 'ws').toUpperCase();
    $('valPort').textContent = data.tlsPort || 443;
    $('valPath').textContent = data.path || '/';

    // Connection card
    $('infoDomain').textContent = data.domain || '—';
    $('infoUuid').dataset.real = data.uuid || '';
    $('infoUuid').textContent = uuidVisible ? data.uuid : '••••••••-••••-••••-••••-••••••••••••';

    // VLESS link
    const link = data.vlessLink || '';
    $('vlessLink').textContent = link;

    // Server details
    $('srvHost').textContent = data.domain || '—';
    $('srvPort').textContent = data.serverPort || data.port || '—';
    $('srvProto').textContent = (data.protocol || 'vless').toUpperCase();
    $('srvNet').textContent = (data.network || 'ws').toUpperCase();

    // QR
    await renderQR(link);

  } catch (e) {
    badge.classList.add('offline');
    statusText.textContent = 'Offline';
    console.error('Config fetch error:', e);
  }
}

/* ─── Speed test ─── */
async function runSpeedTest() {
  const btn = $('runSpeedTest');
  const progressWrap = $('progressWrap');
  const progressFill = $('progressFill');
  btn.disabled = true;
  btn.textContent = 'Testing…';
  progressWrap.style.display = 'flex';
  $('gaugeVal').textContent = '…';
  $('speedDown').textContent = '—';
  $('speedDur').textContent = '—';
  $('speedPing').textContent = '—';
  $('speedBytes').textContent = '—';
  drawGauge($('gaugeCanvas'), 0);

  try {
    const res = await fetch('/api/speedtest');
    const data = await res.json();
    progressWrap.style.display = 'none';

    if (data.success) {
      const spd = parseFloat(data.speedMbps);
      $('gaugeVal').textContent = spd.toFixed(1);
      drawGauge($('gaugeCanvas'), spd, 500);
      $('speedDown').textContent = spd.toFixed(2) + ' Mbps';
      $('speedDur').textContent = data.duration + 's';
      $('speedPing').textContent = data.ping + ' ms';
      $('speedBytes').textContent = formatBytes(data.bytes);
      showToast(`Speed: ${spd.toFixed(1)} Mbps · Ping: ${data.ping}ms`);
    } else {
      $('gaugeVal').textContent = 'ERR';
      showToast('Speed test failed: ' + (data.error || 'unknown'), 3500);
    }
  } catch (e) {
    progressWrap.style.display = 'none';
    $('gaugeVal').textContent = 'ERR';
    showToast('Speed test error: ' + e.message, 3500);
  }

  btn.disabled = false;
  btn.textContent = 'Run Test';
}

/* ─── Format bytes ─── */
function formatBytes(b) {
  if (!b) return '—';
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(2) + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
}

/* ─── Clash config builder ─── */
function buildClashConfig(data) {
  if (!data) return '';
  return `proxies:
  - name: "VLESS-${data.domain}"
    type: vless
    server: ${data.domain}
    port: 443
    uuid: ${data.uuid}
    tls: true
    servername: ${data.domain}
    network: ws
    ws-opts:
      path: ${data.path}
      headers:
        Host: ${data.domain}`;
}

/* ─── Sing-Box config builder ─── */
function buildSingBoxConfig(data) {
  if (!data) return '';
  return JSON.stringify({
    outbounds: [{
      type: 'vless',
      tag: `VLESS-${data.domain}`,
      server: data.domain,
      server_port: 443,
      uuid: data.uuid,
      tls: { enabled: true, server_name: data.domain },
      transport: { type: 'ws', path: data.path, headers: { Host: data.domain } }
    }]
  }, null, 2);
}

/* ─── Download QR ─── */
function downloadQR() {
  const canvas = $('qrCanvas');
  if (!canvas.toDataURL) return showToast('QR not generated yet');
  const link = document.createElement('a');
  link.download = 'v2ray-qr.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/* ─── Event listeners ─── */
function initEvents() {
  /* Refresh */
  $('refreshBtn').addEventListener('click', () => {
    $('refreshBtn').classList.add('spinning');
    loadConfig().finally(() => {
      setTimeout(() => $('refreshBtn').classList.remove('spinning'), 800);
    });
  });

  /* Copy VLESS */
  $('copyVless').addEventListener('click', () => {
    const link = $('vlessLink').textContent;
    if (link && link !== 'Loading…') copyText(link, $('copyVless'));
    else showToast('Link not loaded yet');
  });

  /* Toggle UUID */
  $('toggleUuid').addEventListener('click', () => {
    uuidVisible = !uuidVisible;
    const el = $('infoUuid');
    el.textContent = uuidVisible ? (el.dataset.real || '—') : '••••••••-••••-••••-••••-••••••••••••';
    el.className = 'info-val mono ' + (uuidVisible ? 'uuid-shown' : 'uuid-hidden');
    $('toggleUuid').textContent = uuidVisible ? '🙈' : '👁';
  });

  /* Speed test */
  $('runSpeedTest').addEventListener('click', runSpeedTest);

  /* Import buttons */
  $('copyV2rayN').addEventListener('click', () => {
    if (!configData) return showToast('Config not loaded');
    copyText(configData.vlessLink || '');
  });

  $('copyClash').addEventListener('click', () => {
    if (!configData) return showToast('Config not loaded');
    copyText(buildClashConfig(configData));
  });

  $('copySingBox').addEventListener('click', () => {
    if (!configData) return showToast('Config not loaded');
    copyText(buildSingBoxConfig(configData));
  });

  $('downloadQR').addEventListener('click', downloadQR);
}

/* ─── Footer timestamp ─── */
function updateTimestamp() {
  const el = $('footerTs');
  if (el) el.textContent = new Date().toLocaleTimeString();
}

/* ─── Init ─── */
window.addEventListener('DOMContentLoaded', async () => {
  // Draw empty gauge
  drawGauge($('gaugeCanvas'), 0);

  await loadConfig();
  initEvents();
  updateTimestamp();

  // Live clock
  setInterval(updateTimestamp, 1000);
});
