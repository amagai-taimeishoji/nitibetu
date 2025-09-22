/* script.js
   フロントで all からランキングを計算・グラフ描画する実装
   --- 必要に応じて毎月ここを編集してください ---
*/
const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // <-- ここを差し替えてください
const YEAR = 2025;   // 対象の年（毎月コピー運用する場合はここを変える）
const MONTH = 10;    // 対象の月(1-12)
const LAST_DAY = 30; // 対象月の最終日（運用ルールで固定）
// ==================================================

/* global state */
let scoreBarChart = null;
let placementPieChart = null;

const DAYS_JP = ['日','月','火','水','木','金','土'];
const pad2 = n => String(n).padStart(2,'0');

/* --- DOM --- */
const nameInput = document.getElementById('nameInput');
const prevBtn = document.getElementById('prevDay');
const nextBtn = document.getElementById('nextDay');
const datePicker = document.getElementById('datePicker');
const currentDateLabel = document.getElementById('currentDate');

const updateStatusEl = document.getElementById('updateStatus');
const totalPlayersEl = document.getElementById('totalPlayers');
const totalGamesEl = document.getElementById('totalGames');
const playerIdEl = document.getElementById('playerId');
const playerNameEl = document.getElementById('playerName');

const rankTable = document.getElementById('rankTable');
const scoreTable = document.getElementById('scoreTable');
const gameListEl = document.getElementById('gameList');
const placementTableEl = document.getElementById('placementTable');

const scoreCanvas = document.getElementById('scoreChart');
const placementCanvas = document.getElementById('placementPie');

const loadingArea = document.getElementById('loadingArea');
const statusMessage = document.getElementById('statusMessage');

/* --- Helpers --- */
function getTokyoNow() {
  // return Date in Tokyo timezone (approx using toLocaleString trick)
  const tok = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return tok;
}
function formatYMD(date) {
  return `${date.getFullYear()}/${pad2(date.getMonth()+1)}/${pad2(date.getDate())}`;
}
function formatISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`;
}
function formatMonthDayWithWeek(date) {
  return `${date.getMonth()+1}月${date.getDate()}日(${DAYS_JP[date.getDay()]})`;
}
function safeNum(v, fallback = 0) {
  return (v == null || isNaN(Number(v))) ? fallback : Number(v);
}

/* --- UI: set date range to fixed YEAR/MONTH --- */
function setDateRangeToMonth() {
  const min = `${YEAR}-${pad2(MONTH)}-01`;
  const max = `${YEAR}-${pad2(MONTH)}-${pad2(LAST_DAY)}`;
  datePicker.min = min;
  datePicker.max = max;
}

/* --- initial date logic (Tokyo 20:00 rule) --- */
function initialSelectedDate() {
  const tok = getTokyoNow();
  let day = tok.getDate();
  if (tok.getHours() < 20) day = day - 1;
  if (day < 1) day = 1;
  if (day > LAST_DAY) day = LAST_DAY;
  return new Date(YEAR, MONTH - 1, day);
}

/* --- UI updates --- */
function updateDateUI(dateObj) {
  // dateObj is a Date in local (we keep YEAR/MONTH fixed)
  datePicker.value = formatISO(dateObj);
  currentDateLabel.textContent = formatMonthDayWithWeek(dateObj);

  // show/hide prev/next
  const day = dateObj.getDate();
  prevBtn.style.visibility = day <= 1 ? 'hidden' : 'visible';
  nextBtn.style.visibility = day >= LAST_DAY ? 'hidden' : 'visible';
}

/* --- Loading UI --- */
function showLoading(flag) {
  if (flag) {
    loadingArea.classList.remove('hidden');
  } else {
    loadingArea.classList.add('hidden');
  }
}

/* --- Fetch from GAS --- */
async function fetchDataFromGAS(name, dateYMD) {
  // dateYMD should be 'YYYY/MM/DD'
  const url = `${API_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(dateYMD)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

/* --- Ranking calculation (front-end using data.all) ---
   Returns object with ranks for keys:
   半荘数, 総スコア, 最高スコア, 平均スコア, 平均着順
*/
function calcRanksFromAll(allList, targetName) {
  // filter players who played at least once
  const players = (allList || []).filter(p => safeNum(p.半荘数,0) > 0);

  const keys = [
    { key: '半荘数', higherBetter: true },
    { key: '総スコア', higherBetter: true },
    { key: '最高スコア', higherBetter: true },
    { key: '平均スコア', higherBetter: true },
    { key: '平均着順', higherBetter: false } // smaller better
  ];

  const result = {};

  keys.forEach(({key, higherBetter}) => {
    if (!players.length) {
      result[key] = '-';
      return;
    }
    const sorted = players.slice().sort((a,b) => {
      const va = (a[key] == null) ? (key === '最高スコア' ? -Infinity : 0) : Number(a[key]);
      const vb = (b[key] == null) ? (key === '最高スコア' ? -Infinity : 0) : Number(b[key]);

      if (va === vb) {
        // tie-breaker: 総スコア が大きい方を上に（安定）
        const sa = Number(a['総スコア'] || 0);
        const sb = Number(b['総スコア'] || 0);
        if (sb !== sa) return sb - sa;
        // 最後は名前で安定ソート
        return (a.name || '').localeCompare(b.name || '');
      }
      return higherBetter ? (vb - va) : (va - vb);
    });

    const idx = sorted.findIndex(p => p.name === targetName);
    result[key] = idx >= 0 ? `${idx + 1}位` : '-';
  });

  return result;
}

/* --- Compute unique total games count for the day from all players' games ---
     Count distinct game-times (string) across all players to avoid double-counting.
*/
function computeTotalGamesFromAll(allList) {
  const times = new Set();
  (allList || []).forEach(p => {
    (p.games || []).forEach(g => {
      if (g && g.time) times.add(g.time);
    });
  });
  return times.size;
}

/* --- Placement counts for a single player (their games) ---
   returns object with keys: '1着','1.5着','2着','2.5着','3着','3.5着','4着'
*/
function countPlacementsFromGames(games) {
  const counts = { '1着':0, '1.5着':0, '2着':0, '2.5着':0, '3着':0, '3.5着':0, '4着':0 };
  (games || []).forEach(g => {
    if (g == null) return;
    const r = g.rank;
    if (r == null) return;
    // r might be number like 1, 1.5, 2, 2.5 ...
    const key = (Number.isInteger(r)) ? `${r}着` : `${r}着`; // 1.5 -> "1.5着"
    if (counts[key] !== undefined) counts[key] += 1;
  });
  return counts;
}

/* --- Render ranking table (2行 x 5列 as requested) --- */
function renderDailyRankingTable(ranksObj) {
  // ranksObj keys: '半荘数','総スコア','最高スコア','平均スコア','平均着順' with values like '3位' or '-'
  rankTable.innerHTML = '';
  const headerRow = document.createElement('tr');
  ['累計半荘数ランキング','総スコアランキング','最高スコアランキング','平均スコアランキング','平均着順ランキング']
    .forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
  rankTable.appendChild(headerRow);

  const dataRow = document.createElement('tr');
  ['半荘数','総スコア','最高スコア','平均スコア','平均着順'].forEach(k => {
    const td = document.createElement('td');
    td.textContent = ranksObj[k] || '-';
    dataRow.appendChild(td);
  });
  rankTable.appendChild(dataRow);
}

/* --- Render score summary (2行 x 5列) --- */
function renderScoreSummary(summary) {
  scoreTable.innerHTML = '';
  const headerRow = document.createElement('tr');
  ['累計半荘数','総スコア','最高スコア','平均スコア','平均着順'].forEach(h => {
    const th = document.createElement('th'); th.textContent = h; headerRow.appendChild(th);
  });
  scoreTable.appendChild(headerRow);

  const dataRow = document.createElement('tr');
  const vals = [
    summary && summary.半荘数 != null ? `${Number(summary.半荘数).toFixed(0)}半荘` : '-',
    summary && summary.総スコア != null ? `${Number(summary.総スコア).toFixed(1)}pt` : '-',
    (summary && summary.最高スコア != null && summary.最高スコア !== -Infinity) ? `${Number(summary.最高スコア).toFixed(1)}pt` : '-',
    summary && summary.平均スコア != null ? `${Number(summary.平均スコア).toFixed(3)}pt` : '-',
    summary && summary.平均着順 != null ? `${Number(summary.平均着順).toFixed(3)}着` : '-'
  ];
  vals.forEach(v => {
    const td = document.createElement('td'); td.textContent = v; dataRow.appendChild(td);
  });
  scoreTable.appendChild(dataRow);
}

/* --- Render game cards list and bar chart (center 0) --- */
function renderGamesAndBarChart(games) {
  gameListEl.innerHTML = '';

  if (!games || games.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'game-card';
    msg.textContent = 'この日のゲームはありません。';
    gameListEl.appendChild(msg);
    // destroy chart if exists
    if (scoreBarChart) { scoreBarChart.destroy(); scoreBarChart = null; }
    return;
  }

  // sort by time string ascending (time format like HH:mm:ss)
  const sorted = games.slice().sort((a,b) => (a.time || '').localeCompare(b.time || ''));

  // render cards (vertical)
  sorted.forEach((g, i) => {
    const card = document.createElement('div');
    card.className = 'game-card';
    const time = g.time ? g.time.slice(0,5) : '--:--';
    const scoreText = (g.score != null && !isNaN(g.score)) ? `${Number(g.score).toFixed(1)}pt` : '0.0pt';
    const rankText = (g.rank != null && g.rank !== '') ? `${g.rank}着` : 'ー';
    card.innerHTML = `<h4>ゲーム${i+1}</h4>
      <div class="game-info">
        <span>${time}</span>
        <span>${scoreText}</span>
        <span>${rankText}</span>
      </div>`;
    gameListEl.appendChild(card);
  });

  // prepare chart data
  const labels = sorted.map((g,i) => (i+1) + '\n' + (g.time ? g.time.slice(0,5) : '--:--'));
  const scores = sorted.map(g => safeNum(g.score, 0));
  const maxVal = Math.max(...scores.map(s => s || 0));
  const minVal = Math.min(...scores.map(s => s || 0));
  const maxAbs = Math.max(Math.abs(maxVal), Math.abs(minVal));
  const padding = Math.max(1, Math.ceil(maxAbs * 0.1));
  const yMax = Math.max(1, Math.ceil(maxAbs + padding));
  const yMin = -yMax;

  // destroy previous chart if exists (prevents animation loop issues)
  if (scoreBarChart) { scoreBarChart.destroy(); scoreBarChart = null; }

  // create canvas context
  const ctx = scoreCanvas.getContext('2d');
  // ensure canvas displayed
  scoreCanvas.style.display = 'block';
  scoreBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'スコア',
        data: scores,
        backgroundColor: scores.map(s => s >= 0 ? 'rgba(186,140,255,0.9)' : 'rgba(240,122,122,0.9)')
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: yMin,
          max: yMax,
          ticks: { stepSize: Math.ceil((yMax - yMin) / 6) }
        }
      }
    }
  });
}

/* --- Render placement table + pie chart for target player's games --- */
function renderPlacementCountsAndPie(games) {
  const counts = countPlacementsFromGames(games);

  // render 4x4 table as required
  placementTableEl.innerHTML = '';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const trh1 = document.createElement('tr');
  ['1着の回数','2着の回数','3着の回数','4着の回数'].forEach(h => {
    const th = document.createElement('th'); th.textContent = h; trh1.appendChild(th);
  });
  const trc1 = document.createElement('tr');
  ['1着','2着','3着','4着'].forEach(k => {
    const td = document.createElement('td'); td.textContent = counts[k] || 0; trc1.appendChild(td);
  });

  const trh2 = document.createElement('tr');
  ['1.5着の回数','2.5着の回数','3.5着の回数',''].forEach(h => {
    const th = document.createElement('th'); th.textContent = h; trh2.appendChild(th);
  });
  const trc2 = document.createElement('tr');
  ['1.5着','2.5着','3.5着',''].forEach(k => {
    const td = document.createElement('td'); td.textContent = k === '' ? '' : (counts[k] || 0); trc2.appendChild(td);
  });

  thead.appendChild(trh1);
  tbody.appendChild(trc1);
  thead.appendChild(trh2);
  tbody.appendChild(trc2);
  table.appendChild(thead);
  table.appendChild(tbody);
  placementTableEl.appendChild(table);

  // pie chart
  const labels = ['1着','1.5着','2着','2.5着','3着','3.5着','4着'];
  const values = [counts['1着']||0, counts['1.5着']||0, counts['2着']||0, counts['2.5着']||0, counts['3着']||0, counts['3.5着']||0, counts['4着']||0];

  if (placementPieChart) { placementPieChart.destroy(); placementPieChart = null; }
  const ctx = placementCanvas.getContext('2d');
  placementPieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          "rgba(240,122,122,1)",
          "rgba(240,158,109,1)",
          "rgba(240,217,109,1)",
          "rgba(181,217,109,1)",
          "rgba(109,194,122,1)",
          "rgba(109,194,181,1)",
          "rgba(109,158,217,1)"
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: { legend: { position: 'right' } }
    }
  });
}

/* --- Main flow: fetch & render --- */
async function fetchAndRender() {
  const name = (nameInput.value || '').trim();
  if (!name) {
    statusMessage && (statusMessage.textContent = '名前を入力してねっ');
    return;
  }
  statusMessage && (statusMessage.textContent = '');
  showLoading(true);

  // date value from datePicker (ISO yyyy-mm-dd) -> convert to yyyy/mm/dd for GAS
  const iso = datePicker.value; // ex "2025-10-01"
  const dateYMD = iso.replace(/-/g, '/'); // "2025/10/01"

  try {
    const data = await fetchDataFromGAS(name, dateYMD);

    // updateStatus string shown as-is
    updateStatusEl.textContent = data.updateStatus || '';

    // total players count (those who had games)
    const allList = data.all || [];
    const participantsPlayed = allList.filter(p => safeNum(p.半荘数,0) > 0).length;
    totalPlayersEl.textContent = `${participantsPlayed}`;

    // totalGames: compute unique times across all players (so not double-counting)
    const totalGamesCount = computeTotalGamesFromAll(allList);
    totalGamesEl.textContent = `${totalGamesCount}`;

    // player info
    playerIdEl.textContent = data.no != null ? String(data.no).padStart(4,'0') : '----';
    playerNameEl.textContent = data.name || name;

    // ranking calculation (front-end)
    const ranksObj = calcRanksFromAll(allList, data.name);
    renderDailyRankingTable(ranksObj);

    // score summary (server returned summary)
    renderScoreSummary(data.summary || {});

    // games & bar chart for searched person (data.games)
    renderGamesAndBarChart(data.games || []);

    // placement counts and pie for searched person
    renderPlacementCountsAndPie(data.games || []);

    // clear status
    statusMessage && (statusMessage.textContent = '');

  } catch (err) {
    console.error(err);
    statusMessage && (statusMessage.textContent = `エラー: ${err.message}`);
    // clear visuals on error
    rankTable.innerHTML = '';
    scoreTable.innerHTML = '';
    gameListEl.innerHTML = '';
    placementTableEl.innerHTML = '';
    if (scoreBarChart) { scoreBarChart.destroy(); scoreBarChart = null; }
    if (placementPieChart) { placementPieChart.destroy(); placementPieChart = null; }
  } finally {
    // ensure a small delay so loading bar is visible briefly
    setTimeout(() => showLoading(false), 160);
  }
}

/* --- Event wiring & initialization --- */
document.addEventListener('DOMContentLoaded', () => {
  // set date range and initial date
  setDateRangeToMonth();
  const initDate = initialSelectedDate();
  datePicker.value = formatISO(initDate);
  updateDateUI(initDate);

  // prev/next
  prevBtn.addEventListener('click', () => {
    const cur = new Date(datePicker.value);
    cur.setDate(cur.getDate() - 1);
    // prevent month cross
    if (cur.getMonth() !== (MONTH - 1)) return;
    datePicker.value = formatISO(cur);
    updateDateUI(cur);
    if (nameInput.value.trim()) fetchAndRender();
  });
  nextBtn.addEventListener('click', () => {
    const cur = new Date(datePicker.value);
    cur.setDate(cur.getDate() + 1);
    if (cur.getMonth() !== (MONTH - 1)) return;
    datePicker.value = formatISO(cur);
    updateDateUI(cur);
    if (nameInput.value.trim()) fetchAndRender();
  });

  // calendar change
  datePicker.addEventListener('change', (e) => {
    const cur = new Date(e.target.value);
    // clamp into this month if necessary
    if (cur.getMonth() !== (MONTH - 1)) {
      // reset to nearest valid day in this month
      const safe = new Date(YEAR, MONTH - 1, Math.min(Math.max(1, cur.getDate()), LAST_DAY));
      datePicker.value = formatISO(safe);
      updateDateUI(safe);
      return;
    }
    updateDateUI(cur);
    if (nameInput.value.trim()) fetchAndRender();
  });

  // search button + enter key
  const searchBtn = document.getElementById('searchBtn');
  if (searchBtn) searchBtn.addEventListener('click', fetchAndRender);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchAndRender(); });

  // initial state: show updateStatus blank until search
  updateStatusEl.textContent = '';

  // hide loading initially
  showLoading(false);
});