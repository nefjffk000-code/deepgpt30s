const axios = require('axios');

module.exports = async (req, res) => {
    // 1. CORS HEADERS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const historyUrl = `https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?ts=${Date.now()}`;
        
        const response = await axios.get(historyUrl, { 
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://hgnice.club/',
                'Origin': 'https://hgnice.club'
            },
            // REMOVED arraybuffer. Axios will handle JSON automatically.
            timeout: 8000
        });

        // 2. CHECK IF RESPONSE IS ACTUALLY JSON
        if (typeof response.data !== 'object') {
            throw new Error("The game server returned HTML instead of JSON. You might be blocked.");
        }

        const root = response.data;
        const rawList = root?.data?.list || root?.List || [];

        const formattedHistory = rawList.map(item => ({
            period: item.issue || item.IssueNumber,
            number: parseInt(item.number || 0),
            result: parseInt(item.number) >= 5 ? 'BIG' : 'SMALL'
        }));

        res.status(200).json({
            success: true,
            history: formattedHistory,
            balance: 0 
        });

    } catch (error) {
        console.error("PROXY ERROR:", error.message);
        res.status(500).json({ 
            success: false, 
            error: "Game Server Error: " + error.message 
        });
    }
};