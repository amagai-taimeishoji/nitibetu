/* app.js
   - 軽量版フロント処理
   - 使い方: 先頭の API_URL と YEAR/MONTH/LAST_DAY を毎月セットしてください
*/

/* ======= 設定（必ず差し替える） ======= */
const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // ← ここを差し替え
const YEAR = 2025;   // 対象年（毎月コピーして運用）
const MONTH = 10;    // 対象月 (1-12)
const LAST_DAY = 30; // 対象月の最終日（例: 30）
// =======================================

/* --- DOM --- */
const nameInput = document.getElementById('nameInput');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const dateDisplay = document.getElementById('dateDisplay');
const datePicker = document.getElementById('datePicker');

const updateStatusEl = document.getElementById('updateStatus');
const participantCountEl = document.getElementById('participantCount');
const totalGamesEl = document.getElementById('totalGames');
const playerNoEl = document.getElementById('playerNo');
const playerNameEl = document.getElementById('playerName');

const loadingArea = document.getElementById('loadingArea');
const loadingBar = document.getElementById('loadingBar');
const loadingText = document.querySelector('.loading-text');

const resultsSection = document.getElementById('results');
const statusMessage = document.getElementById('statusMessage');

const rankingTable = document.getElementById('rankingTable');
const scoreTable = document.getElementById('scoreTable');
const barCanvas = document.getElementById('barChart');
const gamesList = document.getElementById('gamesList');
const placementTable = document.getElementById('placementTable');
const pieCanvas = document.getElementById('pieChart');

let barChartInstance = null;
let pieChartInstance = null;

/* --- helpers --- */
const DAYS = ['日','月','火','水','木','金','土'];
const pad = n => String(n).padStart(2,'0');

function tokyoNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}
function toYMD(date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
function toGASDate(isoDate) { return isoDate.replace(/-/g,'/'); }

/* --- date range fixed to YEAR/MONTH --- */
function monthMin() { return new Date(YEAR, MONTH-1, 1); }
function monthMax() { return new Date(YEAR, MONTH-1, LAST_DAY); }

/* initial date logic (Tokyo 20:00) */
function initialDate() {
  const t = tokyoNow();
  let d = new Date(YEAR, MONTH-1, t.getDate());
  if (t.getHours() < 20) d.setDate(d.getDate()-1);
  if (d.getDate() < 1) d.setDate(1);
  if (d.getDate() > LAST_DAY) d.setDate(LAST_DAY);
  return d;
}

/* render date display + constrain picker */
function setDateUI(date) {
  datePicker.min = toYMD(monthMin());
  datePicker.max = toYMD(monthMax());
  datePicker.value = toYMD(date);
  dateDisplay.textContent = `${MONTH}月${date.getDate()}日(${DAYS[date.getDay()]})`;
  prevBtn.disabled = date.getDate() === 1;
  nextBtn.disabled = date.getDate() === LAST_DAY;
}

/* loading bar control:
   - animate to 100% over 15s (no loop)
   - if complete early, fill quickly and hide
*/
let loadingTimeout = null;
function startLoading() {
  loadingArea.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  loadingBar.style.transition = 'width 15s linear';
  loadingBar.style.width = '100%';
  // safety: if fetch hangs, after 16s stop animation and show message
  clearTimeout(loadingTimeout);
  loadingTimeout = setTimeout(()=> {
    loadingBar.style.transition = '';
    loadingBar.style.width = '100%';
    loadingText.textContent = '読み込みが遅いです…';
  }, 16000);
}
function endLoading() {
  // finish quickly
  clearTimeout(loadingTimeout);
  loadingBar.style.transition = 'width 0.25s linear';
  loadingBar.style.width = '100%';
  setTimeout(()=> {
    loadingArea.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    // reset bar for next time
    loadingBar.style.transition = '';
    loadingBar.style.width = '0%';
    loadingText.textContent = 'ロード…チュ♡';
  }, 250);
}

/* fetch data from GAS */
async function fetchData(name, isoDate) {
  const gasDate = toGASDate(isoDate); // yyyy/mm/dd
  const url = `${API_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(gasDate)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error);
  return json;
}

/* compute ranks from all[] */
function computeRanks(all, name) {
  const players = (all || []).filter(p => Number(p.半荘数) > 0);
  const keys = [
    {k:'半荘数', higher:true},
    {k:'総スコア', higher:true},
    {k:'最高スコア', higher:true},
    {k:'平均スコア', higher:true},
    {k:'平均着順', higher:false}
  ];
  const out = {};
  keys.forEach(({k,higher}) => {
    if (!players.length) { out[k]='-'; return; }
    const sorted = players.slice().sort((a,b)=>{
      const va = a[k]==null? (k==='最高スコア'?-Infinity:0) : Number(a[k]);
      const vb = b[k]==null? (k==='最高スコア'?-Infinity:0) : Number(b[k]);
      if (va === vb) {
        const sa = Number(a['総スコア']||0), sb = Number(b['総スコア']||0);
        if (sb !== sa) return sb - sa;
        return (a.name||'').localeCompare(b.name||'');
      }
      return higher ? (vb - va) : (va - vb);
    });
    const idx = sorted.findIndex(p => p.name === name);
    out[k] = idx >= 0 ? `${idx+1}位` : '-';
  });
  return out;
}

/* compute total distinct games from all (unique times) */
function computeTotalGames(all) {
  const s = new Set();
  (all||[]).forEach(p => (p.games||[]).forEach(g => { if (g && g.time) s.add(g.time); }));
  return s.size;
}

/* count placements (including .5) for one player's games */
function countPlacements(games) {
  const keys = ['1着','1.5着','2着','2.5着','3着','3.5着','4着'];
  const counts = {}; keys.forEach(k=>counts[k]=0);
  (games||[]).forEach(g => {
    if (g==null || g.rank==null) return;
    const k = `${g.rank}着`;
    if (counts[k] !== undefined) counts[k] += 1;
  });
  return counts;
}

/* render ranking 2x5 */
function renderRankingTable(ranks) {
  rankingTable.innerHTML = '';
  const headers = ['累計半荘数ランキング','総スコアランキング','最高スコアランキング','平均スコアランキング','平均着順ランキング'];
  const headerRow = document.createElement('div'); // using grid container
  headerRow.className = 'two-row-table';
  headers.forEach(h => {
    const el = document.createElement('div'); el.className='header'; el.textContent = h; rankingTable.appendChild(el);
  });
  // data row
  ['半荘数','総スコア','最高スコア','平均スコア','平均着順'].forEach(k=>{
    const el = document.createElement('div'); el.className='data'; el.textContent = ranks[k]||'-'; rankingTable.appendChild(el);
  });
}

/* render score summary 2x5 */
function renderScoreSummary(summary) {
  scoreTable.innerHTML = '';
  const labels = ['累計半荘数','総スコア','最高スコア','平均スコア','平均着順'];
  labels.forEach(l => {
    const el = document.createElement('div'); el.className='header'; el.textContent = l; scoreTable.appendChild(el);
  });
  const vals = [
    summary?.半荘数 != null ? `${Number(summary.半荘数).toFixed(0)}半荘` : '-',
    summary?.総スコア != null ? `${Number(summary.総スコア).toFixed(1)}pt` : '-',
    (summary?.最高スコア != null && summary.最高スコア !== -Infinity) ? `${Number(summary.最高スコア).toFixed(1)}pt` : '-',
    summary?.平均スコア != null ? `${Number(summary.平均スコア).toFixed(3)}pt` : '-',
    summary?.平均着順 != null ? `${Number(summary.平均着順).toFixed(3)}着` : '-'
  ];
  vals.forEach(v => { const el=document.createElement('div'); el.className='data'; el.textContent=v; scoreTable.appendChild(el); });
}

/* render games (cards) and build bar chart centered at 0 */
function renderGamesAndChart(games) {
  gamesList.innerHTML = '';
  if (!games || !games.length) {
    const n = document.createElement('div'); n.className='game-card'; n.textContent='この日のゲームはありません。'; gamesList.appendChild(n);
    if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
    return;
  }
  const sorted = games.slice().sort((a,b)=> (a.time||'').localeCompare(b.time||''));
  sorted.forEach((g,i) => {
    const card = document.createElement('div'); card.className='game-card';
    const left = document.createElement('div'); left.className='time'; left.textContent = `${pad(i+1)} ${g.time ? g.time.slice(0,5) : '--:--'}`;
    const right = document.createElement('div'); right.className='score'; right.textContent = `${(Number(g.score)||0).toFixed(1)}pt　${g.rank}着`;
    card.appendChild(left); card.appendChild(right);
    gamesList.appendChild(card);
  });

  const scores = sorted.map(g => Number(g.score) || 0);
  const labels = sorted.map((g,i) => `#${i+1}`);
  const maxAbs = Math.max(1, ...scores.map(s => Math.abs(s)));
  const bound = Math.ceil(maxAbs * 1.1);

  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
  const ctx = barCanvas.getContext('2d');
  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label:'スコア', data: scores, backgroundColor: scores.map(s => s>=0 ? '#4caf50' : '#f44336') }] },
    options: {
      animation:false,
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{ y:{ min:-bound, max:bound } }
    }
  });
}

/* render placement table and pie */
function renderPlacementAndPie(games) {
  const counts = countPlacements(games);
  // build placement table (4x4 layout as plain table)
  placementTable.innerHTML = '';
  const table = document.createElement('table');
  // header1
  const tr1 = document.createElement('tr');
  ['1着の回数','2着の回数','3着の回数','4着の回数'].forEach(h => { const th=document.createElement('th'); th.textContent = h; tr1.appendChild(th);});
  table.appendChild(tr1);
  // data1
  const tr2 = document.createElement('tr');
  ['1着','2着','3着','4着'].forEach(k => { const td=document.createElement('td'); td.textContent = counts[k]||0; tr2.appendChild(td);});
  table.appendChild(tr2);
  // header2
  const tr3 = document.createElement('tr');
  ['1.5着の回数','2.5着の回数','3.5着の回数',''].forEach(h => { const th=document.createElement('th'); th.textContent = h; tr3.appendChild(th);});
  table.appendChild(tr3);
  // data2
  const tr4 = document.createElement('tr');
  ['1.5着','2.5着','3.5着',''].forEach(k => { const td=document.createElement('td'); td.textContent = k ? (counts[k]||0) : ''; tr4.appendChild(td);});
  table.appendChild(tr4);

  placementTable.appendChild(table);

  // pie data: order as requested
  const pieLabels = ['1着','1.5着','2着','2.5着','3着','3.5着','4着'];
  const pieData = pieLabels.map(l => counts[l] || 0);

  if (pieChartInstance) { pieChartInstance.destroy(); pieChartInstance = null; }
  const ctx = pieCanvas.getContext('2d');
  pieChartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: pieLabels,
      datasets: [{
        data: pieData,
        backgroundColor: ["rgba(240,122,122,1)","rgba(240,158,109,1)","rgba(240,217,109,1)","rgba(181,217,109,1)","rgba(109,194,122,1)","rgba(109,194,181,1)","rgba(109,158,217,1)"]
      }]
    },
    options:{ animation:false, responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right'}} }
  });
}

/* main flow: load + render */
let debounceTimer = null;
async function loadAndRender() {
  const name = nameInput.value.trim();
  if (!name) { statusMessage.textContent = '名前を入力してねっ'; return; }
  statusMessage.textContent = '';
  startLoading();
  try {
    const iso = datePicker.value; // yyyy-mm-dd
    const data = await fetchData(name, iso);
    // show updateStatus verbatim
    updateStatusEl.textContent = data.updateStatus || '';

    // participant & total games
    const all = data.all || [];
    participantCountEl.textContent = `${all.filter(p => Number(p.半荘数) > 0).length}人`;
    totalGamesEl.textContent = `${computeTotalGames(all)}半荘`;

    // player header
    playerNoEl.textContent = data.no != null ? String(data.no).padStart(4,'0') : '----';
    playerNameEl.textContent = data.name || name;

    // ranks
    const ranks = computeRanks(all, data.name);
    renderRankingTable(ranks);

    // score summary from data.summary
    renderScoreSummary(data.summary || {});

    // games + chart
    renderGamesAndChart(data.games || []);

    // placement + pie
    renderPlacementAndPie(data.games || []);

    statusMessage.textContent = '';
  } catch (err) {
    console.error(err);
    statusMessage.textContent = `読み込みエラー: ${err.message}`;
    // clear visuals
    rankingTable.innerHTML = '';
    scoreTable.innerHTML = '';
    gamesList.innerHTML = '';
    placementTable.innerHTML = '';
    if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
    if (pieChartInstance) { pieChartInstance.destroy(); pieChartInstance = null; }
  } finally {
    endLoading();
  }
}

/* events */
document.addEventListener('DOMContentLoaded', () => {
  // init date to Tokyo 20:00 rule but clamp to YEAR/MONTH
  const init = initialDate();
  setDateUI(init);

  // wire controls
  prevBtn.addEventListener('click', () => {
    const cur = new Date(datePicker.value);
    cur.setDate(cur.getDate() - 1);
    if (cur.getMonth() !== (MONTH - 1)) return;
    setDateUI(cur);
    // immediate load if name present
    if (nameInput.value.trim()) loadAndRender();
  });
  nextBtn.addEventListener('click', () => {
    const cur = new Date(datePicker.value);
    cur.setDate(cur.getDate() + 1);
    if (cur.getMonth() !== (MONTH - 1)) return;
    setDateUI(cur);
    if (nameInput.value.trim()) loadAndRender();
  });

  datePicker.addEventListener('change', () => {
    const cur = new Date(datePicker.value);
    // clamp into this month
    if (cur.getMonth() !== (MONTH - 1)) {
      const safeDay = Math.min(Math.max(1, cur.getDate()), LAST_DAY);
      const safe = new Date(YEAR, MONTH-1, safeDay);
      setDateUI(safe);
    } else {
      setDateUI(cur);
    }
    if (nameInput.value.trim()) loadAndRender();
  });

  // debounce name input (small delay to avoid excessive fetch)
  nameInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(()=> {
      if (nameInput.value.trim()) loadAndRender();
    }, 450);
  });

  // ensure datePicker limited to this month
  datePicker.min = toYMD(monthMin());
  datePicker.max = toYMD(monthMax());
});