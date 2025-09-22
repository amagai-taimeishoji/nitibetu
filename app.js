/* ==========================
   毎月ここだけ書き換えてください
   ===========================
   API_URL: Google Apps Script のデプロイ URL（Webアプリ URL）
   YEAR/MONTH/LAST_DAY: 対象の年月、月末日（毎月コピペで変更）
*/
const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // <-- ここに GAS の exec URL を入れてください
const YEAR = 2025;   // 例: 2025
const MONTH = 10;    // 例: 10（10月）
const LAST_DAY = 30; // 例: 30（10月を30日で運用する場合）
/* ========================== */

const WEEKDAYS = ['日','月','火','水','木','金','土'];
const z = n => String(n).padStart(2,'0');

let barChart = null;
let pieChart = null;

// DOM
const nameInput = document.getElementById('nameInput');
const datePicker = document.getElementById('datePicker');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const searchBtn = document.getElementById('searchBtn');
const loadingArea = document.getElementById('loadingArea');
const content = document.getElementById('content');
const statusMessage = document.getElementById('statusMessage');

const lastUpdatedEl = document.getElementById('lastUpdated');
const updateStatusEl = document.getElementById('updateStatus');
const dateTitleEl = document.getElementById('dateTitle');
const participantsEl = document.getElementById('participants');
const totalGamesEl = document.getElementById('totalGames');
const playerNoEl = document.getElementById('playerNo');
const playerNameEl = document.getElementById('playerName');

const dailyRankEl = document.getElementById('dailyRank');
const scoreDataEl = document.getElementById('scoreData');
const gameListEl = document.getElementById('gameList');
const placementTableEl = document.getElementById('placementTable');

const barCtx = document.getElementById('barChart').getContext('2d');
const pieCtx = document.getElementById('pieChart').getContext('2d');

// helper: Tokyo now
function getTokyoNow(){
  const tokyoStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
  return new Date(tokyoStr);
}

// init
document.addEventListener('DOMContentLoaded', () => {
  setupDatePicker();
  attachEvents();
  // 初期表示は日付だけセット（検索はユーザー操作で）
});

// set up date picker limited to this month
function setupDatePicker(){
  datePicker.min = `${YEAR}-${z(MONTH)}-01`;
  datePicker.max = `${YEAR}-${z(MONTH)}-${z(LAST_DAY)}`;

  // decide initial day by Tokyo rule
  const tokyo = getTokyoNow();
  let initDay = tokyo.getDate();
  if (tokyo.getHours() < 20) initDay = initDay - 1;
  if (initDay < 1) initDay = 1;
  if (initDay > LAST_DAY) initDay = LAST_DAY;

  setDate(initDay);
}

function attachEvents(){
  prevBtn.addEventListener('click', () => {
    const day = Number(datePicker.value.split('-')[2]);
    if (day > 1){
      setDate(day-1);
      // only fetch if name provided
      if (nameInput.value.trim()) fetchAndRender();
    }
  });
  nextBtn.addEventListener('click', () => {
    const day = Number(datePicker.value.split('-')[2]);
    if (day < LAST_DAY){
      setDate(day+1);
      if (nameInput.value.trim()) fetchAndRender();
    }
  });
  datePicker.addEventListener('change', (e) => {
    const day = new Date(e.target.value).getDate();
    if (day >=1 && day <= LAST_DAY){
      setDate(day);
      if (nameInput.value.trim()) fetchAndRender();
    } else {
      // invalid selection for this month -> reset
      updateDateUI();
    }
  });
  searchBtn.addEventListener('click', () => fetchAndRender());
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchAndRender();
  });
}

function setDate(day){
  datePicker.value = `${YEAR}-${z(MONTH)}-${z(day)}`;
  updateDateUI();
}

function updateDateUI(){
  const day = new Date(datePicker.value).getDate();
  const dt = new Date(YEAR, MONTH-1, day);
  const wd = WEEKDAYS[dt.getDay()];
  dateTitleEl.textContent = `${MONTH}月${day}日(${wd})`;
  prevBtn.style.visibility = (day <= 1) ? 'hidden' : 'visible';
  nextBtn.style.visibility = (day >= LAST_DAY) ? 'hidden' : 'visible';
}

function showLoading(show){
  if (show){
    loadingArea.classList.remove('hidden');
    content.classList.add('hidden');
    statusMessage.textContent = '';
  } else {
    loadingArea.classList.add('hidden');
    content.classList.remove('hidden');
  }
}

// main fetch/render
async function fetchAndRender(){
  const name = nameInput.value.trim();
  if (!name){
    statusMessage.textContent = '名前を入力してねっ';
    return;
  }

  const day = new Date(datePicker.value).getDate();
  const dateStr = `${YEAR}/${z(MONTH)}/${z(day)}`; // yyyy/mm/dd

  showLoading(true);

  try {
    const res = await fetch(`${API_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(dateStr)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // lastUpdated: if server provided field use it; otherwise show retrieval time
    if (data.lastUpdated) {
      lastUpdatedEl.textContent = `最終更新: ${new Date(data.lastUpdated).toLocaleString('ja-JP')}`;
    } else {
      lastUpdatedEl.textContent = `最終取得: ${getTokyoNow().toLocaleString('ja-JP')}`;
    }
    updateStatusEl.textContent = data.updateStatus || '-';

    renderResults(data);
    statusMessage.textContent = '';
  } catch (err){
    statusMessage.textContent = `エラー: ${err.message}`;
    content.classList.add('hidden');
  } finally {
    setTimeout(()=> showLoading(false), 180);
  }
}

// render all sections
function renderResults(data){
  // participants: count of players with 半荘数 > 0
  const all = data.all || [];
  const played = all.filter(p => Number(p.半荘数) > 0);
  participantsEl.textContent = `${played.length}人`;

  // total games: maximum games any player had (as proxy)
  const totalGames = all.length ? Math.max(...all.map(p => (p.games||[]).length)) : 0;
  totalGamesEl.textContent = `${totalGames}半荘`;

  playerNoEl.textContent = data.no ? String(data.no).padStart(4,'0') : '0000';
  playerNameEl.textContent = data.name || '___';

  renderDailyRanking(data);   // 2x5 ranking -> shows "何位"
  renderScoreData(data);      // 2x5 summary: values with units
  renderBarChart(data);       // bar chart center 0
  renderGameCards(data);      // vertical cards
  renderPlacementAndPie(data);// placement table & pie
  // show content area
  content.classList.remove('hidden');
}

/* ----- 日別ランキング（2行×5列） ----- */
function renderDailyRanking(data){
  const headers = [
    "累計半荘数ランキング",
    "総スコアランキング",
    "最高スコアランキング",
    "平均スコアランキング",
    "平均着順ランキング"
  ];
  const list = (data.all || []).filter(p => Number(p.半荘数) > 0).map(p => Object.assign({}, p));

  function rankBy(key, higherIsBetter){
    if (!list.length) return null;
    const sorted = list.slice().sort((a,b) => {
      const va = (a[key] == null) ? ((key === '最高スコア') ? -Infinity : 0) : Number(a[key]);
      const vb = (b[key] == null) ? ((key === '最高スコア') ? -Infinity : 0) : Number(b[key]);
      if (va === vb){
        // tie-breaker: 総スコア 大きい方上位
        const sa = Number(a['総スコア']||0);
        const sb = Number(b['総スコア']||0);
        if (sb !== sa) return sb - sa;
        // stable final tie-breaker by name
        return (a.name || '').localeCompare(b.name || '');
      }
      return higherIsBetter ? (vb - va) : (va - vb);
    });
    const idx = sorted.findIndex(p => p.name === data.name);
    return idx >= 0 ? (idx + 1) : null;
  }

  const v1 = rankBy('半荘数', true);
  const v2 = rankBy('総スコア', true);
  const v3 = rankBy('最高スコア', true);
  const v4 = rankBy('平均スコア', true);
  const v5 = rankBy('平均着順', false);

  dailyRankEl.innerHTML = '';
  headers.forEach(h => {
    const d = document.createElement('div');
    d.className = 'header-cell';
    d.textContent = h;
    dailyRankEl.appendChild(d);
  });
  [v1,v2,v3,v4,v5].forEach(v => {
    const d = document.createElement('div');
    d.className = 'data-cell';
    d.textContent = (v == null) ? '-' : `${v}位`;
    dailyRankEl.appendChild(d);
  });
}

/* ----- 日別スコアデータ（2行×5列） ----- */
function renderScoreData(data){
  const headers = ["累計半荘数","総スコア","最高スコア","平均スコア","平均着順"];
  const s = data.summary || {};
  const values = [
    (s.半荘数 != null) ? `${Number(s.半荘数).toFixed(0)}半荘` : '-',
    (s.総スコア != null) ? `${Number(s.総スコア).toFixed(1)}pt` : '-',
    (s.最高スコア != null && s.最高スコア !== -Infinity) ? `${Number(s.最高スコア).toFixed(1)}pt` : '-',
    (s.平均スコア != null) ? `${Number(s.平均スコア).toFixed(3)}pt` : '-',
    (s.平均着順 != null) ? `${Number(s.平均着順).toFixed(3)}着` : '-'
  ];

  scoreDataEl.innerHTML = '';
  headers.forEach(h => {
    const d = document.createElement('div');
    d.className = 'header-cell';
    d.textContent = h;
    scoreDataEl.appendChild(d);
  });
  values.forEach(v => {
    const d = document.createElement('div');
    d.className = 'data-cell';
    d.textContent = v;
    scoreDataEl.appendChild(d);
  });
}

/* ----- 棒グラフ（中心0） ----- */
function renderBarChart(data){
  const games = (data.games || []).slice();
  if (!games.length){
    if (barChart){ barChart.destroy(); barChart = null; }
    barCtx.canvas.style.display = 'none';
    return;
  }
  games.sort((a,b) => (a.time||'').localeCompare(b.time||''));
  barCtx.canvas.style.display = 'block';
  const labels = games.map((g,i) => `①`.replace('①', String(i+1).padStart(2,'0')) + ' ' + (g.time?g.time.slice(0,5):'--:--'));
  const scores = games.map(g => Number(g.score) || 0);
  const maxAbs = Math.max(1, ...scores.map(s => Math.abs(s)));
  if (barChart) barChart.destroy();
  barChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'スコア',
        data: scores,
        backgroundColor: scores.map(s => s>=0 ? 'rgba(186,140,255,0.9)' : 'rgba(240,122,122,0.9)')
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: -maxAbs, max: maxAbs }
      },
      maintainAspectRatio: false
    }
  });
}

/* ----- ゲームカード（縦並びシンプル） ----- */
function renderGameCards(data){
  const games = (data.games || []).slice();
  gameListEl.innerHTML = '';
  if (!games.length){
    const el = document.createElement('div');
    el.className = 'game-card';
    el.textContent = 'この日のゲームはありません。';
    gameListEl.appendChild(el);
    return;
  }
  games.sort((a,b) => (a.time||'').localeCompare(b.time||''));
  games.forEach((g,i) => {
    const card = document.createElement('div');
    card.className = 'game-card';
    const time = g.time ? g.time.slice(0,5) : '--:--';
    const score = (g.score != null && !isNaN(g.score)) ? Number(g.score).toFixed(1) + 'pt' : '0.0pt';
    const rank = (g.rank != null && g.rank !== '') ? `${g.rank}着` : 'ー';
    card.innerHTML = `<h4>ゲーム${i+1}</h4>
      <div class="game-info">
        <span>${time}</span>
        <span>${score}</span>
        <span>${rank}</span>
      </div>`;
    gameListEl.appendChild(card);
  });
}

/* ----- 着順テーブル & 円グラフ ----- */
function renderPlacementAndPie(data){
  const games = (data.games || []).slice();
  const counts = { '1':0,'1.5':0,'2':0,'2.5':0,'3':0,'3.5':0,'4':0 };
  games.forEach(g => {
    if (g.rank == null) return;
    const key = String(g.rank);
    if (counts[key] !== undefined) counts[key]++;
    else {
      // if integer within 1..4
      if (Number.isInteger(g.rank) && g.rank >=1 && g.rank <=4) counts[String(g.rank)]++;
    }
  });

  // render 4x4 table
  placementTableEl.innerHTML = '';
  const tbl = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const trh1 = document.createElement('tr');
  ['1着の回数','2着の回数','3着の回数','4着の回数'].forEach(h => {
    const th = document.createElement('th'); th.textContent = h; trh1.appendChild(th);
  });
  const trc1 = document.createElement('tr');
  [counts['1'],counts['2'],counts['3'],counts['4']].forEach(c => {
    const td = document.createElement('td'); td.textContent = c; trc1.appendChild(td);
  });
  const trh2 = document.createElement('tr');
  ['1.5着の回数','2.5着の回数','3.5着の回数',''].forEach(h => {
    const th = document.createElement('th'); th.textContent = h; trh2.appendChild(th);
  });
  const trc2 = document.createElement('tr');
  [counts['1.5'],counts['2.5'],counts['3.5'],''].forEach(c => {
    const td = document.createElement('td'); td.textContent = (c === '' ? '' : c); trc2.appendChild(td);
  });

  thead.appendChild(trh1);
  tbody.appendChild(trc1);
  thead.appendChild(trh2);
  tbody.appendChild(trc2);
  tbl.appendChild(thead);
  tbl.appendChild(tbody);
  placementTableEl.appendChild(tbl);

  // pie chart
  const pieData = [
    counts['1']||0, counts['1.5']||0, counts['2']||0, counts['2.5']||0,
    counts['3']||0, counts['3.5']||0, counts['4']||0
  ];

  if (pieChart){ pieChart.destroy(); pieChart = null; }
  pieChart = new Chart(pieCtx, {
    type: 'pie',
    data: {
      labels: ['1着','1.5着','2着','2.5着','3着','3.5着','4着'],
      datasets: [{
        data: pieData,
        backgroundColor:[
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
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right'}}}
  });
}