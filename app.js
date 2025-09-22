/* script.js - 修正版
   - 日付プルダウンの "オプションなし" 問題を解消
   - DOM 要素取得を確実に（DOMContentLoaded 内で取得）
   - dateSelect / datePicker の ID 揺れに対応
   - 既存の仕様（ローディング / fetch / 描画）は維持
*/

/* ====== 設定 ====== */
const GAS_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec";
const YEAR = 2025;
const MONTH = 10;
const LAST_DAY = 30; // 月ごとにコピーして変更してください

/* ====== 変数（後で DOM を代入） ====== */
let nameInput, searchBtn, datePicker, prevDayBtn, nextDayBtn, updateStatusEl;
let loaderArea, loadingBar, resultsSection, statusMsg;
let participantCountEl, totalGamesEl, playerNoEl, playerNameEl;
let dailyRankingEl, dailyScoresEl, gameListEl, scoreBarCanvas, rankCountsEl, rankPieCanvas;

/* Chart インスタンス */
let barChartInstance = null;
let pieChartInstance = null;

/* ====== 定数 ====== */
const WEEK = ['日','月','火','水','木','金','土'];
const pad = n => String(n).padStart(2,'0');
function tokyoNow(){ return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Tokyo'})); }
function dateLabel(year, month, day){
  const d = new Date(year, month-1, day);
  return `${d.getMonth()+1}月${d.getDate()}日(${WEEK[d.getDay()]})`;
}
function gasDateStr(year, month, day){
  return `${year}/${pad(month)}/${pad(day)}`;
}

/* ====== 日付プルダウン 初期化 ====== */
function initDatePicker(){
  if (!datePicker) {
    console.warn("datePicker が見つかりません（initDatePicker で）。");
    return;
  }

  datePicker.innerHTML = '';
  for(let d=1; d<=LAST_DAY; d++){
    const opt = document.createElement('option');
    opt.value = gasDateStr(YEAR, MONTH, d);
    opt.textContent = dateLabel(YEAR, MONTH, d);
    datePicker.appendChild(opt);
  }

  // 初期日は東京時間20時ルール
  const now = tokyoNow();
  let day = now.getDate();
  if (now.getHours() < 20) day = day - 1;
  if (day < 1) day = 1;
  if (day > LAST_DAY) day = LAST_DAY;
  const idx = Math.max(0, Math.min(LAST_DAY-1, day-1));
  datePicker.selectedIndex = idx;

  console.log(`datePicker 初期化: selectedIndex=${idx}`);
}
function updatePrevNextVisibility(){
  if (!datePicker || !prevDayBtn || !nextDayBtn) return;
  const idx = datePicker.selectedIndex;
  prevDayBtn.style.display = idx <= 0 ? 'none' : 'inline-block';
  nextDayBtn.style.display = idx >= datePicker.options.length-1 ? 'none' : 'inline-block';
}

/* ====== ローディング制御（15秒で満杯） ====== */
let loadingTimer = null;
function startLoading(){
  if (!loaderArea || !loadingBar) return;
  loaderArea.classList.remove('hidden');
  if (resultsSection) resultsSection.classList.add('hidden');
  if (statusMsg) statusMsg.textContent = '';

  loadingBar.style.transition = 'width 15s linear';
  loadingBar.style.width = '100%';

  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(()=>{
    loadingBar.style.transition = '';
    loadingBar.style.width = '100%';
    if (statusMsg) statusMsg.textContent = '読み込みが長いです…';
  }, 16000);
}

function stopLoading(){
  clearTimeout(loadingTimer);
  if (!loadingBar) return;
  loadingBar.style.transition = 'width 0.2s linear';
  loadingBar.style.width = '100%';
  setTimeout(()=>{
    if (loaderArea) loaderArea.classList.add('hidden');
    if (resultsSection) resultsSection.classList.remove('hidden');
    loadingBar.style.transition = '';
    loadingBar.style.width = '0%';
  }, 240);
}

/* ====== データ取得 ====== */
async function fetchFromGAS(showLoad=true){
  if (!nameInput || !datePicker) return null;
  const name = nameInput.value.trim();
  const date = datePicker.value;
  if (!name){
    if (statusMsg) statusMsg.textContent = '名前を入力してねっ';
    return null;
  }

  if (showLoad) startLoading();
  try {
    const url = `${GAS_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  } catch(err){
    console.error('fetchFromGAS error:', err);
    if (statusMsg) statusMsg.textContent = `読み込みエラー: ${err.message}`;
    return null;
  } finally {
    if (showLoad) stopLoading();
  }
}

/* ====== 計算・描画ユーティリティ（既存ロジック） ====== */
function computeRanks(all, targetName){
  const fields = [
    {key:'半荘数', higherBetter:true},
    {key:'総スコア', higherBetter:true},
    {key:'最高スコア', higherBetter:true},
    {key:'平均スコア', higherBetter:true},
    {key:'平均着順', higherBetter:false}
  ];
  const ranks = {};
  const participants = Array.isArray(all) ? all : [];
  fields.forEach(f=>{
    const arr = participants.slice();
    arr.sort((a,b)=>{
      const va = (a[f.key] == null) ? (f.key==='最高スコア' ? -Infinity : 0) : Number(a[f.key]);
      const vb = (b[f.key] == null) ? (f.key==='最高スコア' ? -Infinity : 0) : Number(b[f.key]);
      if (va === vb){
        const sa = Number(a['総スコア'] || 0);
        const sb = Number(b['総スコア'] || 0);
        if (sb !== sa) return sb - sa;
        return String(a.name || '').localeCompare(String(b.name || ''));
      }
      return f.higherBetter ? (vb - va) : (va - vb);
    });
    const idx = arr.findIndex(p => p.name === targetName);
    ranks[f.key] = idx >= 0 ? `${idx+1}位` : 'データなし';
  });
  return ranks;
}

function computeTotalGames(all, targetDate){
  const times = new Set();
  (all || []).forEach(p=>{
    (p.games || []).forEach(g=>{
      if(!g || !g.time) return;
      const d = (g.date || '').replace(/-/g,'/');
      if (d === targetDate) times.add(g.time);
    });
  });
  return times.size;
}

function countPlacements(games){
  const keys = ['1','1.5','2','2.5','3','3.5','4'];
  const out = {};
  keys.forEach(k=>out[k]=0);
  (games || []).forEach(g=>{
    if (g == null || g.rank == null) return;
    const k = String(g.rank);
    if (out[k] !== undefined) out[k] += 1;
  });
  return out;
}

function buildTwoRowTable(container, headers, values){
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${headers.length}, 1fr)`;
  headers.forEach(h=>{
    const div = document.createElement('div');
    div.className = 'header';
    div.textContent = h;
    container.appendChild(div);
  });
  values.forEach(v=>{
    const div = document.createElement('div');
    div.className = 'data';
    div.textContent = v;
    container.appendChild(div);
  });
}

/* ====== グラフ描画 ====== */
function createBarChart(games){
  const labels = games.map(g => g.time ? g.time.slice(0,5) : '');
  const dataScores = games.map(g => Number(g.score||0));
  const maxAbs = Math.max(1, ...dataScores.map(n=>Math.abs(n)));
  const bound = Math.ceil(maxAbs * 1.1);

  if (barChartInstance) barChartInstance.destroy();
  const ctx = scoreBarCanvas.getContext('2d');
  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label:'スコア', data: dataScores, backgroundColor: dataScores.map(v=>v>=0? '#4caf50':'#f44336') }] },
    options: {
      animation:false, responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ y:{ min:-bound, max:bound, ticks:{ stepSize: Math.ceil(bound/5) } } }
    }
  });
}

function createPieChart(counts){
  const labels = ['1着','1.5着','2着','2.5着','3着','3.5着','4着'];
  const data = labels.map(l=> counts[l.replace('着','')] || 0 );
  if (pieChartInstance) pieChartInstance.destroy();
  const ctx = rankPieCanvas.getContext('2d');
  pieChartInstance = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor: ["#f06262","#f4a261","#f4e266","#b5e36b","#6dd07a","#6ad0c7","#6b8be6"] }]},
    options:{ animation:false, responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right'}} }
  });
}

/* ====== メイン描画 ====== */
function renderAll(data){
  if (!data) return;
  if (updateStatusEl) updateStatusEl.textContent = data.updateStatus || '';

  if (playerNoEl) playerNoEl.textContent = data.no != null ? String(data.no).padStart(4,'0') : '----';
  if (playerNameEl) playerNameEl.textContent = data.name || '';

  const all = Array.isArray(data.all) ? data.all : [];
  const games = Array.isArray(data.games) ? data.games.slice().sort((a,b)=>(a.time||'').localeCompare(b.time||'')) : [];

  if (participantCountEl) participantCountEl.textContent = `${all.filter(p=>Number(p.半荘数) > 0).length}`;
  if (totalGamesEl) totalGamesEl.textContent = `${computeTotalGames(all, datePicker ? datePicker.value : '')}半荘`;

  const ranks = computeRanks(all, data.name);
  buildTwoRowTable(dailyRankingEl,
    ['累計半荘数ランキング','総スコアランキング','最高スコアランキング','平均スコアランキング','平均着順ランキング'],
    [ranks['半荘数'], ranks['総スコア'], ranks['最高スコア'], ranks['平均スコア'], ranks['平均着順']]
  );

  const s = data.summary || {};
  const values = [
    s.半荘数 != null ? `${Number(s.半荘数).toFixed(0)}半荘` : 'データ不足',
    s.総スコア != null ? `${Number(s.総スコア).toFixed(1)}pt` : 'データ不足',
    (s.最高スコア != null && s.最高スコア !== -Infinity) ? `${Number(s.最高スコア).toFixed(1)}pt` : 'データ不足',
    s.平均スコア != null ? `${Number(s.平均スコア).toFixed(3)}pt` : 'データ不足',
    s.平均着順 != null ? `${Number(s.平均着順).toFixed(3)}着` : 'データ不足'
  ];
  buildTwoRowTable(dailyScoresEl, ['累計半荘数','総スコア','最高スコア','平均スコア','平均着順'], values);

  gameListEl.innerHTML = '';
  if (!games.length){
    const n = document.createElement('div'); n.className='game-card'; n.textContent = 'この日のゲームはありません。';
    gameListEl.appendChild(n);
  } else {
    games.forEach((g, i) => {
      const card = document.createElement('div'); card.className='game-card';
      const left = document.createElement('div'); left.className='time'; left.textContent = `${i+1} ${g.time ? g.time.slice(0,5) : '--:--'}`;
      const right = document.createElement('div'); right.className='score';
      const sc = (g.score == null) ? 0 : Number(g.score);
      right.textContent = `${(sc>0?'+':'')}${sc.toFixed(1)}pt　${g.rank != null ? `${g.rank}着` : ''}`;
      card.appendChild(left); card.appendChild(right);
      gameListEl.appendChild(card);
    });
  }

  createBarChart(games);

  const counts = countPlacements(games);
  rankCountsEl.innerHTML = '';
  const table = document.createElement('table');
  const tr1 = document.createElement('tr');
  ['1着の回数','2着の回数','3着の回数','4着の回数'].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; tr1.appendChild(th); });
  table.appendChild(tr1);
  const tr2 = document.createElement('tr');
  ['1','2','3','4'].forEach(k=>{ const td=document.createElement('td'); td.textContent = counts[k] || 0; tr2.appendChild(td); });
  table.appendChild(tr2);
  const tr3 = document.createElement('tr');
  ['1.5着の回数','2.5着の回数','3.5着の回数',''].forEach(h=>{ const th=document.createElement('th'); th.textContent=h; tr3.appendChild(th); });
  table.appendChild(tr3);
  const tr4 = document.createElement('tr');
  ['1.5','2.5','3.5',''].forEach(k=>{ const td=document.createElement('td'); td.textContent = k ? (counts[k]||0) : ''; tr4.appendChild(td); });
  table.appendChild(tr4);
  rankCountsEl.appendChild(table);

  createPieChart(counts);

  if (resultsSection) resultsSection.classList.remove('hidden');
}

/* ====== イベント登録（DOMContentLoaded 内で DOM を取得） ====== */
document.addEventListener('DOMContentLoaded', () => {
  // DOM 要素取得（ID 名の揺れに柔軟に対応）
  nameInput      = document.getElementById('nameInput');
  searchBtn      = document.getElementById('searchBtn');
  datePicker     = document.getElementById('datePicker') || document.getElementById('dateSelect') || null;
  prevDayBtn     = document.getElementById('prevDay') || document.getElementById('prevDayBtn') || null;
  nextDayBtn     = document.getElementById('nextDay') || document.getElementById('nextBtn') || null;
  updateStatusEl = document.getElementById('updateStatus');

  loaderArea     = document.getElementById('loader');
  loadingBar     = document.getElementById('loadingBar');
  resultsSection = document.getElementById('results');
  statusMsg      = document.getElementById('statusMsg');

  participantCountEl = document.getElementById('participantCount');
  totalGamesEl       = document.getElementById('totalGames');
  playerNoEl         = document.getElementById('playerNo');
  playerNameEl       = document.getElementById('playerName');

  dailyRankingEl = document.getElementById('dailyRanking');
  dailyScoresEl  = document.getElementById('dailyScores');
  gameListEl     = document.getElementById('gameList');
  scoreBarCanvas = document.getElementById('scoreBarChart');
  rankCountsEl   = document.getElementById('rankCounts');
  rankPieCanvas  = document.getElementById('rankPieChart');

  // 存在チェックのログ（デバッグ用）
  if (!datePicker) console.error('datePicker が見つかりません。HTML の id を確認してください（datePicker または dateSelect）。');
  if (!nameInput) console.error('nameInput が見つかりません。');
  if (!searchBtn) console.error('searchBtn が見つかりません。');

  // 日付プルダウン初期化
  initDatePicker();

  // 検索ボタン
  if (searchBtn) {
    searchBtn.addEventListener('click', async () => {
      if (!nameInput.value.trim()){
        if (statusMsg) statusMsg.textContent = '名前を入力してねっ';
        return;
      }
      if (statusMsg) statusMsg.textContent = '';
      const data = await fetchFromGAS(true);
      if (data) renderAll(data);
    });
  }

  // ◀️▶️
  if (prevDayBtn) prevDayBtn.addEventListener('click', async () => {
    if (!datePicker) return;
    const idx = datePicker.selectedIndex;
    if (idx > 0){
      datePicker.selectedIndex = idx - 1;
      updatePrevNextVisibility();
      if (nameInput.value.trim()){
        const data = await fetchFromGAS(true);
        if (data) renderAll(data);
      }
    }
  });
  if (nextDayBtn) nextDayBtn.addEventListener('click', async () => {
    if (!datePicker) return;
    const idx = datePicker.selectedIndex;
    if (idx < datePicker.options.length - 1){
      datePicker.selectedIndex = idx + 1;
      updatePrevNextVisibility();
      if (nameInput.value.trim()){
        const data = await fetchFromGAS(true);
        if (data) renderAll(data);
      }
    }
  });

  // 日付プルダウン変更
  if (datePicker) datePicker.addEventListener('change', async () => {
    updatePrevNextVisibility();
    if (nameInput.value.trim()){
      const data = await fetchFromGAS(true);
      if (data) renderAll(data);
    }
  });

  // 名前入力時は fetch しない（仕様）
  if (nameInput) nameInput.addEventListener('input', ()=> {
    if (statusMsg) statusMsg.textContent = '';
  });

  // 初期表示
  if (resultsSection) resultsSection.classList.add('hidden');
});