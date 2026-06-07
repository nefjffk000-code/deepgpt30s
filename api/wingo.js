// api/wingo.js
export default async function handler(req, res) {
  // 1. CORS Headers (Keep these to allow your widget to connect)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const apiKey = '2f3e5638f4ace8154d1da9db0a2e00e5'; // Your ScraperAPI Key
    const ts = Date.now();
    const targetUrl = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?ts=${ts}`;

    // 2. Wrap the targetUrl with ScraperAPI
    const proxyUrl = `https://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}`;

    const response = await fetch(proxyUrl, {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error(`ScraperAPI responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    // 3. Process the data (Keep your existing mapping logic)
    const list = data.data?.list || data.list || (Array.isArray(data) ? data : []);

    const history = list.map(item => ({
      period: String(item.issueNumber || item.IssueNumber || ''),
      number: parseInt(item.number || item.Number || 0, 10),
      result: (item.number || item.Number) >= 5 ? 'BIG' : 'SMALL'
    })).filter(item => item.period);

    // 4. Return the formatted history to your widget
    return res.status(200).json({ success: true, history });

  } catch (error) {
    console.error('Proxy Error:', error.message);
    return res.status(200).json({ 
      success: false, 
      error: "Connection Error: " + error.message 
    });
  }
}
