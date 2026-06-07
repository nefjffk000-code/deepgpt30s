// ==========================================
// content.js - WINGO LOGIC
// ==========================================

const PROXY_URL = 'https://aihgzyvip.vercel.app/api/wingo'; 
let autoUpdateInterval = null;

// --- Initialize UI Elements ---
document.addEventListener('DOMContentLoaded', () => {
    const fetchBtn = document.getElementById('fetchLiveBtn');
    const autoBtn = document.getElementById('toggleAutoLiveBtn');
    const proxyInput = document.getElementById('proxyUrl');

    // Set the proxy URL input to your Vercel URL automatically
    if (proxyInput) proxyInput.value = PROXY_URL;

    // Attach Click Events
    if (fetchBtn) fetchBtn.onclick = fetchLiveData;
    if (autoBtn) autoBtn.onclick = toggleAutoUpdate;

    // Initial Fetch
    fetchLiveData();
});

// --- Fetch Logic ---
async function fetchLiveData() {
    const errorDiv = document.getElementById('liveErrorMsg');
    const tableBody = document.getElementById('liveTableBody');
    const balanceSpan = document.getElementById('liveBalance');
    const timestampSpan = document.getElementById('liveTimestamp');

    if (errorDiv) errorDiv.style.display = 'none';
    if (tableBody && tableBody.rows.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4">⏳ Fetching...</td></tr>';
    }

    try {
        const res = await fetch(PROXY_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Proxy Error');

        // Update UI with new data
        updateTable(data.history);
        if (balanceSpan) balanceSpan.innerText = data.balance || "0.00";
        if (timestampSpan) timestampSpan.innerText = new Date().toLocaleTimeString();

    } catch (err) {
        console.error("Proxy Error:", err);
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.innerHTML = `❌ Connection failed: ${err.message}`;
        }
    }
}

// --- Update Table UI ---
function updateTable(history) {
    const tableBody = document.getElementById('liveTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Clear table
    
    history.forEach(item => {
        const num = parseInt(item.number);
        const resultClass = item.result === 'BIG' ? 'history-big' : 'history-small';
        const numClass = (num === 0) ? 'num-zero' : (num === 5 ? 'num-five' : (num % 2 === 0 ? 'num-red' : 'num-green'));
        
        const row = `
            <tr>
                <td class="period-cell">${item.period}</td>
                <td class="history-num ${numClass}">${num}</td>
                <td class="${resultClass}">${item.result}</td>
                <td><span class="dot ${num % 2 === 0 ? 'red-dot' : 'green-dot'}"></span></td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// --- Auto Update Logic ---
function toggleAutoUpdate() {
    const btn = document.getElementById('toggleAutoLiveBtn');
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
        btn.innerText = "▶️ Auto (Off)";
        btn.style.background = "#2a2f44";
    } else {
        autoUpdateInterval = setInterval(fetchLiveData, 5000); // 5 seconds
        btn.innerText = "⏸️ Auto (On)";
        btn.style.background = "#ff3366";
    }
}