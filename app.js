/* script.js
   - 完全仕様を反映したフロント実装
   - updateStatus はサーバーの文字列をそのまま表示
   - 日付プルダウンは10月1日〜10月30日（初期は東京20時ルール）
   - 検索／◀️▶️／日付変更で fetch & ローディング表示
   - 名前入力だけでは fetch しない
   - all 配列は可変人数に対応してランキングを計算
*/

/* ====== 設定 ====== */
// Google Apps Script の公開 URL（あなたのデプロイ済みURLを指定済み）
const GAS_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec";

// 月ごと固定（ここは月ごとにコピーして変更運用してください）
const YEAR = 2025;
const MONTH = 10;
const LAST_DAY = 30; // 10月は30日扱い（仕様どおり）

/* ====== DOM 要素取得 ====== */
const nameInput      = document.getElementById('nameInput');
const searchBtn      = document.getElementById('searchBtn');
const datePicker     = document.getElementById('datePicker');
const prevDayBtn     = document.getElementById('prevDay');
const nextDayBtn     = document.getElementById('nextDay');
const updateStatusEl = document.getElementById('updateStatus');

const loaderArea     = document.getElementById('loader');
const loadingBar     = document.getElementById('loadingBar');
const resultsSection = document.getElementById('results');
const statusMsg      = document.getElementById('statusMsg');

const participantCountEl = document.getElementById('participantCount');
const totalGamesEl       = document.getElementById('totalGames');
const playerNoEl         = document.getElementById('playerNo');
const playerNameEl       = document.getElementById('playerName');

const dailyRankingEl = document.getElementById('dailyRanking');
const dailyScoresEl  = document.getElementById('dailyScores');
const gameListEl     = document.getElementById('gameList');
const scoreBarCanvas = document.getElementById('scoreBarChart');
const rankCountsEl   = document.getElementById('rankCounts');
const rankPieCanvas  = document.getElementById('rankPieChart');

/* Chart インスタンスを保持 */
let barChartInstance = null;
let pieChartInstance = null;

/* ====== ヘルパー ====== */
const WEEK = ['日','月','火','水','木','金','土'];
const pad = n => String(n).padStart(2,'0');

/* 東京時刻取得（環境に依存しない表示用） */
function tokyoNow(){
  return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Tokyo'}));
}

/* 日付ラベル: 10月1日(水) の形式 */
function dateLabel(year, month, day){
  const d = new Date(year, month-1, day);
  return `${d.getMonth()+1}月${d.getDate()}日(${WEEK[d.getDay()]})`;
}

/* GAS に渡す日付文字列 "YYYY/MM/DD" */
function gasDateStr(year, month, day){
  return `${year}/${pad(month)}/${pad(day)}`;
}

/* ====== 日付プルダウン 初期化 ====== */
function initDatePicker(){
  datePicker.innerHTML = '';
  for(let d=1; d<=LAST_DAY; d++){
    const opt = document.createElement('option');
    opt.value = gasDateStr(YEAR,MONTH,d);
    opt.textContent = dateLabel(YEAR,MONTH,d);
    datePicker.appendChild(opt);
  }
  // 初期日は東京時間 20 時ルール
  const t = tokyoNow();
  let day = t.getDate();
  if (t.getHours() < 20) day = day - 1;
  if (day < 1) day = 1;
  if (day > LAST_DAY) day = LAST_DAY;
  // 選択可能範囲に clamp
  const idx = Math.max(0, Math.min(LAST_DAY-1, day-1));
  datePicker.selectedIndex = idx;
  updatePrevNextVisibility();
}

/* prev/next 表示更新 */
function updatePrevNextVisibility(){
  const idx = datePicker.selectedIndex;
  prevDayBtn.style.display = idx <= 0 ? 'none' : 'inline-block';
  nextDayBtn.style.display = idx >= datePicker.options.length-1 ? 'none' : 'inline-block';
}

/* ====== ローディング制御（15秒で満杯） ====== */
let loadingTimer = null;
function startLoading(){
  // 表示
  loaderArea.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  statusMsg.textContent = '';

  // バー幅を 0 -> 100% に 15 秒で遷移
  loadingBar.style.transition = 'width 15s linear';
  loadingBar.style.width = '100%';

  // safety timer: 16 秒で注意表示
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(()=>{
    loadingBar.style.transition = '';
    loadingBar.style.width = '100%';
    // 途中で止まった時のメッセージ（任意）
    statusMsg.textContent = '読み込みが長いです…';
  }, 16000);
}

function stopLoading(){
  clearTimeout(loadingTimer);
  // 滑らかに満杯にしてから短時間で非表示
  loadingBar.style.transition = 'width 0.2s linear';
  loadingBar.style.width = '100%';
  setTimeout(()=>{
    loaderArea.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    // リセット
    loadingBar.style.transition = '';
    loadingBar.style.width = '0%';
  }, 240);
}

/* ====== データ取得 ====== */
/* showLoad: true -> 表示する（検索／prev/next／date change のとき） */
async function fetchFromGAS(showLoad=true){
  const name = nameInput.value.trim();
  const date = datePicker.value;
  if (!name){
    statusMsg.textContent = '名前を入力してねっ';
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
  } catch(err) {
    console.error(err);
    statusMsg.textContent = `読み込みエラー: ${err.message}`;
    return null;
  } finally {
    if (showLoad) stopLoading();
  }
}

/* ====== 順位計算 ======
   all: サーバーの all 配列（可変人数）
   targetName: 表示対象の名前
   戦略:
     - 指標ごとにソートして、targetName のインデックスを順位にする
     - 平均着順のみ「小さいほうが上」、それ以外は「大きいほうが上」
     - 同値時の安定化: 総スコア（大きいほう）で分け、さらに名前で安定化
*/
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
        // tie-breaker: 総スコア（降順） -> 名前
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

/* ====== 総ゲーム数計算（その日のユニークな時間数） ====== */
function computeTotalGames(all, targetDate){
  const times = new Set();
  (all || []).forEach(p=>{
    (p.games || []).forEach(g=>{
      if(!g || !g.time) return;
      // g.date may be "2025/10/01" - compare exactly
      const d = (g.date || '').replace(/-/g,'/');
      if (d === targetDate) times.add(g.time);
    });
  });
  return times.size;
}

/* ====== 着順カウント（1,1.5,2,2.5,3,3.5,4） ====== */
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

/* ====== 描画: 2行5列テーブル生成 ====== */
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

/* ====== 棒グラフ作成 (中心0、正負色分け) ====== */
function createBarChart(games){
  // games: [{time, score, rank}, ...] (時系列順)
  const labels = games.map(g => g.time ? g.time.slice(0,5) : '');
  const dataScores = games.map(g => Number(g.score||0));
  // y bounds symmetric around 0
  const maxAbs = Math.max(1, ...dataScores.map(n=>Math.abs(n)));
  const bound = Math.ceil(maxAbs * 1.1);

  if (barChartInstance) barChartInstance.destroy();
  const ctx = scoreBarCanvas.getContext('2d');
  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'スコア',
        data: dataScores,
        backgroundColor: dataScores.map(v => v >= 0 ? '#4caf50' : '#f44336')
      }]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins:{legend:{display:false}},
      scales: {
        y: { min: -bound, max: bound, ticks:{ stepSize: Math.ceil(bound/5) } },
      }
    }
  });
}

/* ====== 円グラフ作成（1,1.5,2,2.5,3,3.5,4 の順） ====== */
function createPieChart(counts){
  const labels = ['1着','1.5着','2着','2.5着','3着','3.5着','4着'];
  const data = labels.map(l=>{
    const key = l.replace('着',''); // '1','1.5',...
    return counts[key] || 0;
  });
  if (pieChartInstance) pieChartInstance.destroy();
  const ctx = rankPieCanvas.getContext('2d');
  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          "#f06262","#f4a261","#f4e266","#b5e36b","#6dd07a","#6ad0c7","#6b8be6"
        ]
      }]
    },
    options:{
      animation:false,
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{position:'right'}}
    }
  });
}

/* ====== メイン描画 ====== */
function renderAll(data){
  if (!data) return;

  // updateStatus: サーバー返却文字列をそのまま表示
  updateStatusEl.textContent = data.updateStatus || '';

  // プレイヤー情報
  playerNoEl.textContent = data.no != null ? String(data.no).padStart(4,'0') : '----';
  playerNameEl.textContent = data.name || '';

  // all 配列（可変）と games
  const all = Array.isArray(data.all) ? data.all : [];
  const games = Array.isArray(data.games) ? data.games.slice().sort((a,b)=>(a.time||'').localeCompare(b.time||'')) : [];

  // 集計人数（その日のゲームがあった人の数）と総ゲーム数
  const participants = all.filter(p=>Number(p.半荘数) > 0);
  participantCountEl.textContent = `${participants.length}`;
  totalGamesEl.textContent = `${computeTotalGames(all, datePicker.value)}半荘`;

  // 日別ランキング（その人の順位のみ、5項目）
  const ranks = computeRanks(all, data.name);
  buildTwoRowTable(dailyRankingEl,
    ['累計半荘数ランキング','総スコアランキング','最高スコアランキング','平均スコアランキング','平均着順ランキング'],
    [ranks['半荘数'], ranks['総スコア'], ranks['最高スコア'], ranks['平均スコア'], ranks['平均着順']]
  );

  // 日別スコアデータ（2行5列）
  const s = data.summary || {};
  const values = [
    s.半荘数 != null ? `${Number(s.半荘数).toFixed(0)}半荘` : 'データ不足',
    s.総スコア != null ? `${Number(s.総スコア).toFixed(1)}pt` : 'データ不足',
    (s.最高スコア != null && s.最高スコア !== -Infinity) ? `${Number(s.最高スコア).toFixed(1)}pt` : 'データ不足',
    s.平均スコア != null ? `${Number(s.平均スコア).toFixed(3)}pt` : 'データ不足',
    s.平均着順 != null ? `${Number(s.平均着順).toFixed(3)}着` : 'データ不足'
  ];
  buildTwoRowTable(dailyScoresEl, ['累計半荘数','総スコア','最高スコア','平均スコア','平均着順'], values);

  // ゲームリスト（カード表示）
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

  // 棒グラフ（中心0）
  createBarChart(games);

  // 着順表 & 円グラフ（7項目）
  const counts = countPlacements(games);
  // テーブル描画（4列 + 3列空ありで整形）
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

  // 結果エリアを表示
  resultsSection.classList.remove('hidden');
}

/* ====== イベント登録 ====== */
document.addEventListener('DOMContentLoaded', () => {
  initDatePicker();

  // 検索ボタン：名前入力があるときのみ fetch（ローディングあり）
  searchBtn.addEventListener('click', async () => {
    if (!nameInput.value.trim()){
      statusMsg.textContent = '名前を入力してねっ';
      return;
    }
    statusMsg.textContent = '';
    const data = await fetchFromGAS(true);
    if (data) renderAll(data);
  });

  // ◀️▶️：選択を移動して fetch（ローディングあり）
  prevDayBtn.addEventListener('click', async () => {
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
  nextDayBtn.addEventListener('click', async () => {
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

  // 日付プルダウン変更：fetch（ローディングあり）
  datePicker.addEventListener('change', async () => {
    updatePrevNextVisibility();
    if (nameInput.value.trim()){
      const data = await fetchFromGAS(true);
      if (data) renderAll(data);
    }
  });

  // 名前入力だけでは fetch しない（仕様）
  nameInput.addEventListener('input', () => {
    statusMsg.textContent = '';
    // 何もしない（検索ボタンで fetch）
  });

  // 初期は結果非表示（updateStatus は空）
  resultsSection.classList.add('hidden');
});

/* ====== end of file ====== */