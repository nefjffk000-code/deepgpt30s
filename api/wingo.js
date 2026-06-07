export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Generate a timestamp similar to the game's actual requests
    const ts = Date.now();
    const targetUrl = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?ts=${ts}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Chromium";v="125", "Not.A/Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'Referer': 'https://hgnice.club/',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Upstream Error: ${response.status}`, errorText);
      return res.status(500).json({ success: false, error: `Game API Error: ${response.status}` });
    }

    const data = await response.json();
    
    // The game API often returns data inside a 'data' or 'list' property
    const list = data.data?.list || data.list || (Array.isArray(data) ? data : []);

    const history = list.map(item => ({
      period: String(item.issueNumber || item.IssueNumber || ''),
      number: parseInt(item.number || item.Number || 0, 10),
      result: (item.number || item.Number) >= 5 ? 'BIG' : 'SMALL'
    })).filter(item => item.period);

    return res.status(200).json({ success: true, history });

  } catch (error) {
    console.error('Proxy Catch:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
