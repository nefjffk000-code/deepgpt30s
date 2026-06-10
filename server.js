import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 5000;

app.use(express.json());

const HEADERS = {
  'Referer': 'https://www.tigrozone.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function mapItem(item) {
  return {
    period: String(item.issueNumber || ''),
    number: parseInt(item.number || 0, 10),
    result: (item.number || 0) >= 5 ? 'BIG' : 'SMALL',
    color: String(item.color || '')
  };
}

// ── Server-side proactive caches ──────────────────────────────────────────────
let stateCache = {
  issueNumber: '', nextIssueNumber: '', endTime: 0,
  remainTime: 0, previous: null, fetchedAt: 0
};
let earlyCache = { latest: null, fetchedAt: 0 };
let earlyPollerHandle = null;
let statePollerHandle = null;

// ── State poller — always running, speeds up near round end ──────────────────
async function pollState() {
  try {
    const now = Date.now();
    const url = `https://draw.ar-lottery01.com/WinGo/WinGo_30S.json?ts=${now}`;
    const response = await fetch(url, { headers: HEADERS });
    const data = await response.json();
    const current  = data.current  || {};
    const next     = data.next     || {};
    const previous = data.previous || {};

    const endTime    = parseInt(current.endTime || 0, 10);
    const remainTime = endTime ? Math.max(0, (endTime - now) / 1000) : 0;

    stateCache = {
      issueNumber:     String(current.issueNumber || ''),
      nextIssueNumber: String(next.issueNumber    || ''),
      endTime,
      remainTime,
      previousIssueNumber: String(previous.issueNumber || ''),
      previous: null,   // state API has no number/result — use earlyCache instead
      fetchedAt: now
    };

    // Adaptive interval: 80ms in last 20s (API publishes at ~13s), else 800ms
    const nextDelay = remainTime <= 20 ? 80 : 800;
    statePollerHandle = setTimeout(pollState, nextDelay);

    // Kick off early poller when we enter the 20s window
    if (remainTime <= 20 && remainTime > 0 && !earlyPollerHandle) {
      scheduleEarlyPoller();
    }
  } catch (e) {
    statePollerHandle = setTimeout(pollState, 1000);
  }
}

// ── Early poller — runs every 50ms in the critical window ────────────────────
// API publishes results ~13s before round end. Poll from 20s to catch it ASAP.
async function pollEarly() {
  earlyPollerHandle = null;
  try {
    const ts = Date.now();
    const url = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=1&pageSize=1&ts=${ts}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await response.json();
    const list = data.data?.list || data.list || [];
    if (list.length) {
      const item = mapItem(list[0]);
      if (!earlyCache.latest || item.period !== earlyCache.latest.period) {
        earlyCache = { latest: item, fetchedAt: Date.now() };
        const remain = stateCache.remainTime - (Date.now() - stateCache.fetchedAt) / 1000;
        console.log(`[early] NEW RESULT: period=${item.period} num=${item.number} result=${item.result} detected_at_remain=${remain.toFixed(1)}s`);
      }
    }
  } catch (e) { /* network error: retry */ }

  // Keep polling: 20s before round end, up to 8s after (catches slow publishes)
  const remain = stateCache.remainTime - (Date.now() - stateCache.fetchedAt) / 1000;
  if (remain > -8 && remain <= 20) {
    scheduleEarlyPoller();
  }
}

function scheduleEarlyPoller() {
  if (earlyPollerHandle) return;
  earlyPollerHandle = setTimeout(pollEarly, 50);
}

// ── Seed earlyCache immediately at startup ────────────────────────────────────
async function seedEarlyCache() {
  try {
    const ts = Date.now();
    const url = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=1&pageSize=1&ts=${ts}`;
    const response = await fetch(url, { headers: HEADERS });
    const data = await response.json();
    const list = data.data?.list || data.list || [];
    if (list.length) {
      const item = mapItem(list[0]);
      earlyCache = { latest: item, fetchedAt: Date.now() };
      console.log(`[seed] earlyCache initialized: period=${item.period} number=${item.number} result=${item.result}`);
    }
  } catch (e) { console.warn('[seed] earlyCache init failed:', e.message); }
}

// Start background pollers immediately
pollState();
seedEarlyCache();

// ── API Endpoints ─────────────────────────────────────────────────────────────

app.get('/api/wingo', async (req, res) => {
  setCors(res);
  try {
    const ts = Date.now();
    const url = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=1&pageSize=20&ts=${ts}`;
    const response = await fetch(url, { headers: HEADERS });
    const data = await response.json();
    const list = data.data?.list || data.list || [];
    const mapped = list.map(mapItem);
    // Keep earlyCache up to date with the freshest known result
    if (mapped.length && (!earlyCache.latest || mapped[0].period !== earlyCache.latest.period)) {
      earlyCache = { latest: mapped[0], fetchedAt: Date.now() };
    }
    return res.status(200).json({ success: true, history: mapped });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/wingo/bulk', async (req, res) => {
  setCors(res);
  try {
    const pages = Math.min(50, Math.max(1, parseInt(req.query.pages) || 50));
    const BATCH = 10; // fetch 10 pages at a time to avoid overwhelming the API
    const history = [];
    for (let batchStart = 1; batchStart <= pages; batchStart += BATCH) {
      const batchEnd = Math.min(batchStart + BATCH - 1, pages);
      const fetches = [];
      for (let p = batchStart; p <= batchEnd; p++) {
        const ts = Date.now();
        const url = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=${p}&pageSize=10&ts=${ts}`;
        fetches.push(fetch(url, { headers: HEADERS }).then(r => r.json()).catch(() => null));
      }
      const results = await Promise.all(fetches);
      for (const data of results) {
        if (!data) continue;
        const list = data.data?.list || data.list || [];
        for (const item of list) history.push(mapItem(item));
      }
    }
    // Update earlyCache with freshest result from bulk load
    if (history.length && (!earlyCache.latest || history[0].period !== earlyCache.latest.period)) {
      earlyCache = { latest: history[0], fetchedAt: Date.now() };
    }
    return res.status(200).json({ success: true, history, total: history.length });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// State endpoint — served from cache (updated every 100-1000ms server-side)
app.get('/api/wingo/state', (req, res) => {
  setCors(res);
  // Adjust remainTime for time elapsed since last cache fetch
  const elapsed = (Date.now() - stateCache.fetchedAt) / 1000;
  const remainTime = Math.max(0, stateCache.remainTime - elapsed);
  // Use earlyCache for previous result — it comes from history API (has real number/result)
  const previous = earlyCache.latest || null;
  return res.status(200).json({
    success: true,
    issueNumber:     stateCache.issueNumber,
    nextIssueNumber: stateCache.nextIssueNumber,
    endTime:         stateCache.endTime,
    remainTime,
    totalTime: 30,
    previous
  });
});

// Early-result endpoint — served from cache (updated every 150ms server-side)
app.get('/api/wingo/early', (req, res) => {
  setCors(res);
  return res.status(200).json({ success: true, latest: earlyCache.latest });
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(`${__dirname}/index.html`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
