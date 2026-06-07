// ==========================================
// index.js - Main Widget for WINGO Predictor
// Deployed on: https://bdwingohack.vercel.app/
// ==========================================

// Configuration
const API_URL = 'https://bdwingohack.vercel.app/api/wingo';
let liveHistory = [];
let predictionHistory = [];
let currentPrediction = null;
let currentPredictedNumber = null;
let lastPatternName = "pattern detection";
let lastConfidence = 0.7;
let timerAnimation = null;
let isPageVisible = true;
let lastFetchSecond = -1;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    loadSavedData();
    startAutoSync();
    
    // Page visibility handling
    document.addEventListener('visibilitychange', () => {
        isPageVisible = !document.hidden;
        if (isPageVisible) {
            startTimer();
            fetchLiveData();
        }
    });
    
    // Tab switching
    setupTabs();
});

// ==========================================
// DATA PERSISTENCE
// ==========================================

function loadSavedData() {
    const savedHistory = localStorage.getItem('wingo_live_history');
    if (savedHistory) {
        try {
            liveHistory = JSON.parse(savedHistory);
            renderLiveTable();
        } catch(e) { liveHistory = []; }
    }
    
    const savedPredHistory = localStorage.getItem('wingo_prediction_history');
    if (savedPredHistory) {
        try {
            predictionHistory = JSON.parse(savedPredHistory);
            renderHistoryTable();
        } catch(e) { predictionHistory = []; }
    }
    
    if (liveHistory.length > 0) {
        generateStablePrediction();
        updateUIWithCurrentPrediction();
    } else {
        updateUIDefault();
    }
}

function saveLiveHistory() {
    localStorage.setItem('wingo_live_history', JSON.stringify(liveHistory.slice(-500)));
}

function savePredictionHistory() {
    localStorage.setItem('wingo_prediction_history', JSON.stringify(predictionHistory.slice(-200)));
    updateHistoryStats();
}

// ==========================================
// UI RENDERING
// ==========================================

function renderLiveTable() {
    const tbody = document.getElementById('liveTableBody');
    if (!tbody) return;
    
    if (!liveHistory.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:36px;">✨ Waiting for first sync...✨</tr></tr>';
        const totalCount = document.getElementById('liveTotalCount');
        if (totalCount) totalCount.innerText = '0';
        return;
    }
    
    let html = '';
    liveHistory.slice(0, 50).forEach(row => {
        const numVal = row.number;
        const numberClass = getNumberClass(numVal);
        const dotMarkup = getDotHtml(numVal);
        const resultClass = (row.result === 'BIG') ? 'big-result' : 'small-result';
        html += `
            <tr>
                <td style="font-family:monospace;">${row.period}</td>
                <td class="${numberClass}"><strong>${numVal}</strong></td>
                <td class="${resultClass}" style="font-weight:700;">${row.result}</td>
                <td class="dot-cell">${dotMarkup}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    const totalCount = document.getElementById('liveTotalCount');
    if (totalCount) totalCount.innerText = liveHistory.length;
}

function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    
    if (!predictionHistory.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:36px;">No predictions yet</td></tr>';
        return;
    }
    
    let html = '';
    predictionHistory.slice(0, 50).forEach(p => {
        const correctMark = p.correct ? '✅' : '❌';
        const actualClass = p.actualResult ? (p.actualResult === 'BIG' ? 'big-result' : 'small-result') : '';
        html += `
            <tr>
                <td style="font-family:monospace;">${p.period}</td>
                <td class="${p.predictedResult === 'BIG' ? 'big-result' : 'small-result'}">${p.predictedResult}</td>
                <td class="${getNumberClass(p.predictedNumber)}"><strong>${p.predictedNumber}</strong></td>
                <td class="${actualClass}">${p.actualResult || 'pending'} ${p.actualNumber !== undefined ? p.actualNumber : ''}</td>
                <td class="match-cell">${correctMark}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
    updateHistoryStats();
}

function updateHistoryStats() {
    const statsDiv = document.getElementById('historyStats');
    if (!statsDiv) return;
    const total = predictionHistory.length;
    const correct = predictionHistory.filter(p => p.correct === true).length;
    const incorrect = total - correct;
    statsDiv.innerHTML = `📜 PREDICTION HISTORY — ✅ ${correct}  |  ❌ ${incorrect}  |  Total: ${total}`;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getResultFromNumber(num) {
    return (num >= 5 && num <= 9) ? 'BIG' : 'SMALL';
}

function getDotHtml(num) {
    const n = parseInt(num);
    let dots = [];
    if (n === 5) dots = ['green-dot', 'purple-dot'];
    else if (n === 0) dots = ['red-dot', 'purple-dot'];
    else if ([1, 3, 7, 9].includes(n)) dots = ['green-dot'];
    else if ([2, 4, 6, 8].includes(n)) dots = ['red-dot'];
    if (dots.length === 0) return '<span class="dot" style="background:#aaa;"></span>';
    return `<div class="dot-wrapper">${dots.map(d => `<span class="dot ${d}"></span>`).join('')}</div>`;
}

function getNumberClass(num) {
    const n = parseInt(num);
    if ([1, 3, 7, 9].includes(n)) return 'num-green';
    if ([2, 4, 6, 8].includes(n)) return 'num-red';
    if (n === 5 || n === 0) return 'num-purple';
    return '';
}

function getNextPeriod() {
    if (liveHistory.length === 0) return "----";
    
    let maxPeriod = liveHistory[0].period;
    let maxNum = -1;
    for (let h of liveHistory) {
        let match = h.period.match(/\d+$/);
        if (match) {
            let num = parseInt(match[0], 10);
            if (num > maxNum) {
                maxNum = num;
                maxPeriod = h.period;
            }
        }
    }
    
    const match = maxPeriod.match(/\d+$/);
    if (match) {
        let numStr = match[0];
        let num = parseInt(numStr, 10);
        let nextNum = num + 1;
        let nextNumStr = nextNum.toString();
        while (nextNumStr.length < numStr.length) nextNumStr = "0" + nextNumStr;
        return maxPeriod.slice(0, maxPeriod.length - numStr.length) + nextNumStr;
    }
    return maxPeriod + "+1";
}

// ==========================================
// PATTERN RECOGNITION (A=SMALL, B=BIG)
// ==========================================

function convertToAB(history) {
    return history.map(h => h.result === 'SMALL' ? 'A' : 'B');
}

const patterns = [
    { name: "1A1B (ABAB)", regex: /^(AB)+$/, next: (seq) => seq[seq.length-1] === 'A' ? 'B' : 'A', weight: 0.75 },
    { name: "2A2B (AABB)", regex: /^(AABB)+$/, next: (seq) => {
        let last = seq.slice(-2).join('');
        if (last === 'AA') return 'B';
        if (last === 'BB') return 'A';
        return 'A';
    }, weight: 0.7 },
    { name: "3A3B (AAABBB)", regex: /^(AAABBB)+$/, next: (seq) => {
        let lastThree = seq.slice(-3).join('');
        if (lastThree === 'AAA') return 'B';
        if (lastThree === 'BBB') return 'A';
        return 'A';
    }, weight: 0.7 },
    { name: "4A4B (AAAABBBB)", regex: /^(AAAABBBB)+$/, next: (seq) => seq.slice(-4).join('') === 'AAAA' ? 'B' : 'A', weight: 0.7 },
    { name: "1A2B (ABB)", regex: /^(ABB)+$/, next: (seq) => seq.slice(-3).join('') === 'ABB' ? 'A' : 'B', weight: 0.7 },
    { name: "2A1B (AAB)", regex: /^(AAB)+$/, next: (seq) => seq.slice(-2).join('') === 'AA' ? 'B' : 'A', weight: 0.7 },
    { name: "Long streak A", regex: /^A{5,}$/, next: () => 'B', weight: 0.85 },
    { name: "Long streak B", regex: /^B{5,}$/, next: () => 'A', weight: 0.85 },
    { name: "Mirror trend", regex: /^ABABABAB/, next: (seq) => seq[seq.length-1] === 'A' ? 'B' : 'A', weight: 0.75 }
];

function detectPattern(abSeq) {
    if (abSeq.length < 2) return null;
    let testSeq = abSeq.join('');
    for (let p of patterns) {
        if (p.regex.test(testSeq) || (testSeq.length > 12 && p.regex.test(testSeq.slice(-12)))) {
            let next = p.next(abSeq);
            return { pattern: p.name, next, confidence: p.weight };
        }
    }
    let recent = abSeq.slice(0, 6);
    let aCount = recent.filter(c => c === 'A').length;
    let bCount = recent.length - aCount;
    let next = aCount > bCount ? 'B' : 'A';
    let conf = Math.max(aCount, bCount) / recent.length;
    return { pattern: "Weighted recency", next, confidence: conf };
}

function predictNumberMatchingResult(history, targetResult) {
    if (history.length === 0) return targetResult === 'BIG' ? 7 : 2;
    let scores = Array(10).fill(0);
    let totalWeight = 0;
    for (let i = 0; i < Math.min(history.length, 30); i++) {
        let weight = Math.pow(0.88, i);
        let num = history[i].number;
        scores[num] += weight;
        totalWeight += weight;
    }
    if (history[0]) scores[history[0].number] *= 0.4;
    
    let candidates = targetResult === 'BIG' ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
    let bestNum = candidates[0];
    let bestScore = -1;
    for (let num of candidates) {
        if (scores[num] > bestScore) {
            bestScore = scores[num];
            bestNum = num;
        }
    }
    let confidence = totalWeight > 0 ? bestScore / totalWeight : 0.5;
    return { number: bestNum, conf: Math.min(0.85, confidence + 0.1) };
}

function generateStablePrediction() {
    if (liveHistory.length === 0) {
        currentPrediction = 'BIG';
        currentPredictedNumber = 7;
        lastPatternName = "Initial";
        lastConfidence = 0.5;
        return;
    }
    const abSeq = convertToAB(liveHistory);
    const patternResult = detectPattern(abSeq);
    let predictedResult = patternResult.next === 'A' ? 'SMALL' : 'BIG';
    let patternConf = patternResult.confidence;
    const numPred = predictNumberMatchingResult(liveHistory, predictedResult);
    let predictedNumber = numPred.number;
    let numConf = numPred.conf;
    let overallConf = (patternConf + numConf) / 2;
    overallConf = Math.min(0.94, Math.max(0.52, overallConf));
    currentPrediction = predictedResult;
    currentPredictedNumber = predictedNumber;
    lastPatternName = patternResult.pattern;
    lastConfidence = overallConf;
}

// ==========================================
// UI UPDATE
// ==========================================

function getNumberDisplayData(num) {
    if ([1, 3, 7, 9].includes(num)) return { dotClass: "green-dot", dual: false, textClass: "num-green" };
    if ([2, 4, 6, 8].includes(num)) return { dotClass: "red-dot", dual: false, textClass: "num-red" };
    if (num === 5) return { dotClass: "green-dot purple-dot", dual: true, textClass: "num-purple" };
    if (num === 0) return { dotClass: "red-dot purple-dot", dual: true, textClass: "num-purple" };
    return { dotClass: "", dual: false, textClass: "" };
}

function updateUIWithCurrentPrediction() {
    if (!currentPrediction) return;
    
    const bigCount = liveHistory.filter(r => r.result === 'BIG').length;
    const smallCount = liveHistory.length - bigCount;
    const bigStat = document.getElementById('bigStat');
    const smallStat = document.getElementById('smallStat');
    if (bigStat) bigStat.innerText = bigCount;
    if (smallStat) smallStat.innerText = smallCount;
    
    const confPercent = Math.floor(lastConfidence * 100);
    const confStat = document.getElementById('confStat');
    const confidenceFill = document.getElementById('confidenceFill');
    if (confStat) confStat.innerText = `${confPercent}%`;
    if (confidenceFill) confidenceFill.style.width = `${confPercent}%`;

    const displayData = getNumberDisplayData(currentPredictedNumber);
    let dotHtml = '';
    if (displayData.dual) {
        let classes = displayData.dotClass.split(' ');
        dotHtml = `<div class="dual-dot-container">${classes.map(c => `<div class="dual-dot ${c}"></div>`).join('')}</div>`;
    } else if (displayData.dotClass) {
        dotHtml = `<div class="prediction-dot ${displayData.dotClass}"></div>`;
    } else {
        dotHtml = `<div class="prediction-dot" style="background:#aaa;"></div>`;
    }
    
    const resultClass = (currentPrediction === 'BIG') ? 'big-result' : 'small-result';
    const bigSmallText = (currentPrediction === 'BIG') ? 'BIG' : 'SMALL';
    
    const predictionArea = document.getElementById('predictionArea');
    if (predictionArea) {
        predictionArea.innerHTML = `
            <div class="prediction-row">
                ${dotHtml}
                <div class="prediction-big-small ${resultClass}">${bigSmallText}</div>
                <div class="prediction-number ${displayData.textClass}">${currentPredictedNumber}</div>
            </div>
        `;
    }
    
    const trendName = document.getElementById('trendName');
    const trendDesc = document.getElementById('trendDesc');
    const futurePeriodDisplay = document.getElementById('futurePeriodDisplay');
    
    if (trendName) trendName.innerHTML = `🎯 ${currentPrediction} · Predicted ${currentPredictedNumber}`;
    if (trendDesc) {
        const lastActual = liveHistory[0] ? `${liveHistory[0].result} ${liveHistory[0].number}` : 'none';
        trendDesc.innerHTML = `🧠 ${lastPatternName} | ${liveHistory.length} rounds | Last actual: ${lastActual} (not copied)`;
    }
    if (futurePeriodDisplay) futurePeriodDisplay.innerText = getNextPeriod();
}

function updateUIDefault() {
    const bigStat = document.getElementById('bigStat');
    const smallStat = document.getElementById('smallStat');
    const confStat = document.getElementById('confStat');
    const confidenceFill = document.getElementById('confidenceFill');
    const predictionArea = document.getElementById('predictionArea');
    const trendName = document.getElementById('trendName');
    const trendDesc = document.getElementById('trendDesc');
    const futurePeriodDisplay = document.getElementById('futurePeriodDisplay');
    
    if (bigStat) bigStat.innerText = '0';
    if (smallStat) smallStat.innerText = '0';
    if (confStat) confStat.innerText = '0%';
    if (confidenceFill) confidenceFill.style.width = '0%';
    if (predictionArea) predictionArea.innerHTML = '<div class="prediction-row">---</div>';
    if (trendName) trendName.innerHTML = '📊 AWAITING DATA';
    if (trendDesc) trendDesc.innerHTML = 'Fetching first rounds...';
    if (futurePeriodDisplay) futurePeriodDisplay.innerText = '----';
}

function onNewRoundData() {
    if (liveHistory.length > 0 && currentPrediction) {
        const latestRound = liveHistory[0];
        const existing = predictionHistory.find(p => p.period === latestRound.period);
        if (!existing) {
            predictionHistory.unshift({
                period: latestRound.period,
                predictedResult: currentPrediction,
                predictedNumber: currentPredictedNumber,
                actualResult: latestRound.result,
                actualNumber: latestRound.number,
                correct: (currentPrediction === latestRound.result)
            });
            savePredictionHistory();
            renderHistoryTable();
        }
    }
    generateStablePrediction();
    updateUIWithCurrentPrediction();
}

// ==========================================
// API FETCHING
// ==========================================

async function fetchLiveData() {
    if (!isPageVisible) return;
    
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        
        const newHistory = data.history || [];
        const existingSet = new Set(liveHistory.map(h => h.period));
        let added = 0;
        
        for (const item of newHistory) {
            if (item.period && !existingSet.has(item.period) && typeof item.number !== 'undefined') {
                let finalResult = item.result;
                if (!finalResult) finalResult = getResultFromNumber(item.number);
                liveHistory.unshift({
                    period: String(item.period),
                    number: item.number,
                    result: finalResult
                });
                existingSet.add(item.period);
                added++;
            }
        }
        
        if (added > 0) {
            liveHistory.sort((a, b) => String(b.period).localeCompare(String(a.period)));
            saveLiveHistory();
            renderLiveTable();
            onNewRoundData();
        }
    } catch (err) {
        console.warn('Fetch error:', err);
        const apiStatus = document.getElementById('apiStatus');
        if (apiStatus) {
            apiStatus.innerText = '⚠️ API error';
            apiStatus.style.background = '#ef4444';
            setTimeout(() => {
                if (apiStatus) apiStatus.innerText = '🔄 connecting';
            }, 3000);
        }
    }
}

// ==========================================
// TIMER (30-second round sync)
// ==========================================

function startTimer() {
    function update() {
        if (!isPageVisible) {
            timerAnimation = requestAnimationFrame(update);
            return;
        }
        
        const now = new Date();
        const sec = now.getSeconds();
        const ms = now.getMilliseconds();
        let remaining;
        if (sec < 30) {
            remaining = (30 - sec) * 1000 - ms;
        } else {
            remaining = (60 - sec) * 1000 - ms;
        }
        if (remaining < 0) remaining = 0;
        
        const roundTimerDisplay = document.getElementById('roundTimerDisplay');
        if (roundTimerDisplay) {
            const secondsLeft = Math.ceil(remaining / 1000);
            roundTimerDisplay.innerText = `${secondsLeft}s`;
            roundTimerDisplay.style.color = secondsLeft <= 3 ? '#ff8866' : '#ffcc88';
        }
        
        if (remaining < 50 && remaining > -50) {
            const nowSec = new Date().getSeconds();
            if (lastFetchSecond !== nowSec) {
                lastFetchSecond = nowSec;
                fetchLiveData();
            }
        }
        
        timerAnimation = requestAnimationFrame(update);
    }
    
    if (timerAnimation) cancelAnimationFrame(timerAnimation);
    timerAnimation = requestAnimationFrame(update);
}

function startAutoSync() {
    startTimer();
    fetchLiveData();
}

// ==========================================
// TAB SWITCHING
// ==========================================

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    if (!tabs.length) return;
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            if (!tabId) return;
            
            // Remove active class from all tabs and panels
            tabs.forEach(t => t.classList.remove('active'));
            const panels = document.querySelectorAll('.panel');
            panels.forEach(p => p.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding panel
            tab.classList.add('active');
            const activePanel = document.getElementById(`${tabId}Tab`);
            if (activePanel) activePanel.classList.add('active');
        });
    });
}

// ==========================================
// EXPOSE FUNCTIONS FOR DEBUGGING (optional)
// ==========================================

window.wingoAPI = {
    refresh: fetchLiveData,
    getHistory: () => liveHistory,
    getPrediction: () => ({ prediction: currentPrediction, number: currentPredictedNumber })
};
