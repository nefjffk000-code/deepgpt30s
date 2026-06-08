export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const ts = Date.now();
    const targetUrl = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?ts=${ts}`;

    const response = await fetch(targetUrl, {
      headers: {
        'Referer': 'https://hgnice.club/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const data = await response.json();
    const list = data.data?.list || data.list || [];
    const history = list.map(item => ({
      period: String(item.issueNumber || ''),
      number: parseInt(item.number || 0, 10),
      result: (item.number || 0) >= 5 ? 'BIG' : 'SMALL'
    }));

    return res.status(200).json({ success: true, history });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
