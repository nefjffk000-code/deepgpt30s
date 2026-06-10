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
      previous: previous.issueNumber ? mapItem(previous) : null,
      fetchedAt: now
    };

    // Adaptive interval: 200ms in last 15s, else 1000ms
    const nextDelay = remainTime <= 15 ? 200 : 1000;
    statePollerHandle = setTimeout(pollState, nextDelay);

    // Kick off early poller when we enter the 15s window
    if (remainTime <= 15 && remainTime > 0 && !earlyPollerHandle) {
      scheduleEarlyPoller();
    }
  } catch (e) {
    statePollerHandle = setTimeout(pollState, 1000);
  }
}

// ── Early poller — runs every 150ms in the critical window ───────────────────
// Stops once a new result is cached or the period advances past the window.
async function pollEarly() {
  earlyPollerHandle = null;
  try {
    const ts = Date.now();
    const url = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=1&pageSize=1&ts=${ts}`;
    const response = await fetch(url, { headers: HEADERS });
    const data = await response.json();
    const list = data.data?.list || data.list || [];
    if (list.length) {
      const item = mapItem(list[0]);
      // Update cache if this is a new or more recent result
      if (!earlyCache.latest || item.period !== earlyCache.latest.period) {
        earlyCache = { latest: item, fetchedAt: Date.now() };
        console.log(`[early] new result cached: period=${item.period} number=${item.number} result=${item.result}`);
      }
    }
  } catch (e) { /* ignore */ }

  // Keep polling if still in critical window
  const remain = stateCache.remainTime - (Date.now() - stateCache.fetchedAt) / 1000;
  if (remain > -5 && remain <= 15) {
    scheduleEarlyPoller();
  }
}

function scheduleEarlyPoller() {
  if (earlyPollerHandle) return;
  earlyPollerHandle = setTimeout(pollEarly, 150);
}

// Start background pollers immediately
pollState();

// ── API Endpoints ─────────────────────────────────────────────────────────────

app.get('/api/wingo', async (req, res) => {
  setCors(res);
  try {
    const ts = Date.now();
    const url = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=1&pageSize=10&ts=${ts}`;
    const response = await fetch(url, { headers: HEADERS });
    const data = await response.json();
    const list = data.data?.list || data.list || [];
    return res.status(200).json({ success: true, history: list.map(mapItem) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/wingo/bulk', async (req, res) => {
  setCors(res);
  try {
    const pages = Math.min(50, Math.max(1, parseInt(req.query.pages) || 10));
    const fetches = [];
    for (let p = 1; p <= pages; p++) {
      const ts = Date.now();
      const url = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=${p}&pageSize=10&ts=${ts}`;
      fetches.push(fetch(url, { headers: HEADERS }).then(r => r.json()).catch(() => null));
    }
    const results = await Promise.all(fetches);
    const history = [];
    for (const data of results) {
      if (!data) continue;
      const list = data.data?.list || data.list || [];
      for (const item of list) history.push(mapItem(item));
    }
    return res.status(200).json({ success: true, history });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// State endpoint — served from cache (updated every 200-1000ms server-side)
app.get('/api/wingo/state', (req, res) => {
  setCors(res);
  // Adjust remainTime for time elapsed since last cache fetch
  const elapsed = (Date.now() - stateCache.fetchedAt) / 1000;
  const remainTime = Math.max(0, stateCache.remainTime - elapsed);
  return res.status(200).json({
    success: true,
    issueNumber:     stateCache.issueNumber,
    nextIssueNumber: stateCache.nextIssueNumber,
    endTime:         stateCache.endTime,
    remainTime,
    totalTime: 30,
    previous:  stateCache.previous
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
