// api/wingo.js
export default async function handler(req, res) {
  // 1. Target URL (The game's data source)
  const gameUrl = "https://draw.ar-lottery01.com/WinGo/WinGo_30S.json?ts=" + Date.now();
  
  // 2. AllOrigins Proxy URL (Bypasses Cloudflare)
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(gameUrl)}`;

  try {
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      throw new Error(`Proxy status: ${response.status}`);
    }

    const json = await response.json();

    if (json.contents) {
      // Parse the string content into a real JSON object
      const data = JSON.parse(json.contents);
      
      // Allow your frontend to read this data
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      
      return res.status(200).json({
        success: true,
        data: data
      });
    } else {
      return res.status(200).json({ success: false, error: "Empty content from proxy" });
    }

  } catch (error) {
    console.error("Vercel Edge Error:", error.message);
    return res.status(200).json({ 
      success: false, 
      error: "Connection Failed: " + error.message 
    });
  }
}
