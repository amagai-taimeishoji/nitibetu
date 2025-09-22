/*
  script.js
  - 使い方:
    1) このファイル先頭の API_URL をあなたの GAS のデプロイ URL に置き換える
    2) 月ごとに YEAR, MONTH, LAST_DAY を変更してコピー運用する（今回は 2025/10/30 を設定）
  - 挙動:
    ・名前入力だけでは fetch しない（検索ボタン押下で fetch）
    ・検索ボタン / ◀️▶️ / 日付プルダウン変更 はローディング表示ありで fetch
    ・updateStatus は返ってきた文字列をそのまま表示
*/

// ====== 必ず差し替えてください ======
const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec";
// 月ごとの固定値（ここは月毎にコピーして変える）
const YEAR = 2025;
const MONTH = 10;
const LAST_DAY = 30;
// ===================================

/* --- DOM 要素 --- */
const nameInput = document.getElementById('nameInput');
const searchBtn = document.getElementById('searchBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
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

/* --- ヘルパー関数 --- */
const pad = n => String(n).padStart(2, '0');
const WEEK = ['日','月','火','水','木','金','土'];

// 東京現在時刻（ローカル環境に依存しないため toLocaleString with Asia/Tokyo を使用）
function tokyoNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}

// 日付ラベル（例: 10月1日(水)）
function labelForOption(year, month, day) {
  const d = new Date(year, month - 1, day);
  return `${d.getMonth()+1}月${d.getDate()}日(${WEEK[d.getDay()]})`;
}

// GAS に渡す形式は "YYYY/MM/DD"（このまま doGet の normalizeDate と合う）
function makeGASDateISO(year, month, day) {
  return `${year}/${pad(month)}/${pad(day)}`;
}

/* --- 日付プルダウン初期化（固定：1〜LAST_DAY、表示は 10月1日(水) 形式、value は YYYY/MM/DD） --- */
function initDatePicker() {
  datePicker.innerHTML = '';
  for (let d = 1; d <= LAST_DAY; d++) {
    const opt = document.createElement('option');
    opt.value = makeGASDateISO(YEAR, MONTH, d); // "2025/10/01"
    opt.textContent = labelForOption(YEAR, MONTH, d);
    datePicker.appendChild(opt);
  }
}

/* --- prev/next 表示（1日は◀️非表示、最終日は▶️非表示） --- */
function updatePrevNextVisibility() {
  const idx = datePicker.selectedIndex;
  // 1日のとき prev を非表示
  prevBtn.style.display = (idx <= 0) ? 'none' : 'inline-block';
  nextBtn.style.display = (idx >= datePicker.options.length - 1) ? 'none' : 'inline-block';
}

/* --- ローディング制御（15秒で満杯に到達するアニメーション） --- */
let loadingTimeout = null;
function startLoading() {
  loadingArea.classList.remove('hidden');
  resultsSection.classList.add('hidden');

  // 15秒で幅を 100% にする（CSS transition を使う）
  loadingBar.style.transition = 'width 15s linear';
  loadingBar.style.width = '100%';
  loadingText.textContent = 'ロード…チュ♡';

  // safety: 16秒経過で注意表示
  clearTimeout(loadingTimeout);
  loadingTimeout = setTimeout(() => {
    loadingBar.style.transition = '';
    loadingBar.style.width = '100%';
    loadingText.textContent = '読み込みが遅いです…';
  }, 16000);
}

function endLoading() {
  clearTimeout(loadingTimeout);
  // すばやく満杯にして非表示（滑らかに）
  loadingBar.style.transition = 'width 0.25s linear';
  loadingBar.style.width = '100%';
  setTimeout(() => {
    loadingArea.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    // リセットバー
    loadingBar.style.transition = '';
    loadingBar.style.width = '0%';
    loadingText.textContent = 'ロード…チュ♡';
  }, 250);
}

/* --- GAS からデータを取得 --- */
async function fetchFromGAS(name, gasDate) {
  // gasDate is "YYYY/MM/DD" as required by your GAS
  const url = `${API_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(gasDate)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

/* --- all 配列から、その人の5項目の順位を計算して返す --- 
     戻り値: { 半荘数: "3位", 総スコア: "2位", 最高スコア: "データなし", 平均スコア: "1位", 平均着順: "4位" }
*/
function computeRanksFromAll(all, targetName) {
  const participants = (all || []).filter(p => Number(p.半荘数) > 0);

  const metrics = [
    { key: '半荘数', higherBetter: true },
    { key: '総スコア', higherBetter: true },
    { key: '最高スコア', higherBetter: true },
    { key: '平均スコア', higherBetter: true },
    { key: '平均着順', higherBetter: false } // これは「小さい方が上」
  ];

  const out = {};
  metrics.forEach(({ key, higherBetter }) => {
    if (!participants.length) {
      out[key] = 'データなし';
      return;
    }
    const sorted = participants.slice().sort((a,b) => {
      const va = a[key] == null ? (key==='最高スコア' ? -Infinity : 0) : Number(a[key]);
      const vb = b[key] == null ? (key==='最高スコア' ? -Infinity : 0) : Number(b[key]);
      if (va === vb) {
        // 同率は総スコア（降順）で差をつける、最終的に名前で安定ソート
        const sa = Number(a['総スコア']||0);
        const sb = Number(b['総スコア']||0);
        if (sb !== sa) return sb - sa;
        return (a.name||'').localeCompare(b.name||'');
      }
      return higherBetter ? (vb - va) : (va - vb);
    });
    const idx = sorted.findIndex(p => p.name === targetName);
    out[key] = idx >= 0 ? `${idx+1}位` : 'データなし';
  });
  return out;
}

/* --- 総ゲーム数（その日のユニークな時間の数） --- */
function computeTotalGames(all, targetGasDate) {
  // targetGasDate: "YYYY/MM/DD"
  const times = new Set();
  (all || []).forEach(p => {
    (p.games || []).forEach(g => {
      if (!g || !g.time) return;
      // g.date may be "2025/10/01" - compare to targetGasDate
      const gDate = (g.date || '').replace(/-/g,'/');
      if (gDate.indexOf(targetGasDate) === 0) times.add(g.time);
    });
  });
  return times.size;
}

/* --- 着順の回数を数える（1着, 1.5着, 2着,...4着） --- */
function countPlacements(games) {
  const keys = ['1着','1.5着','2着','2.5着','3着','3.5着','4着'];
  const counts = {};
  keys.forEach(k => counts[k] = 0);
  (games || []).forEach(g => {
    if (g == null || g.rank == null) return;
    const k = `${g.rank}着`;
    if (counts[k] !== undefined) counts[k] += 1;
  });
  return counts;
}

/* --- 2行5列の表を生成 --- */
function buildTwoRowGrid(container, headers, values) {
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${headers.length}, 1fr)`;
  headers.forEach(h => {
    const div = document.createElement('div');
    div.className = 'header';
    div.textContent = h;
    container.appendChild(div);
  });
  values.forEach(v => {
    const div = document.createElement('div');
    div.className = 'data';
    div.textContent = v;
    container.appendChild(div);
  });
}

/* --- 棒グラフ（中心0、プラス=緑系、マイナス=赤系） --- */
function createBarChart(scores, labels) {
  const ctx = barCanvas.getContext('2d');
  if (barChartInstance) barChartInstance.destroy();
  const absMax = Math.max(1, ...scores.map(s => Math.abs(Number(s)||0)));
  const bound = Math.ceil(absMax * 1.1);
  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'スコア',
        data: scores,
        backgroundColor: scores.map(s => (Number(s) >= 0 ? '#4caf50' : '#f44336'))
      }]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: -bound, max: bound }
      }
    }
  });
}

/* --- 円グラフ（着順割合） --- */
function createPieChart(counts) {
  const labels = ['1着','1.5着','2着','2.5着','3着','3.5着','4着'];
  const data = labels.map(l => counts[l] || 0);
  const ctx = pieCanvas.getContext('2d');
  if (pieChartInstance) pieChartInstance.destroy();
  pieChartInstance = new Chart(ctx, {
    type: 'pie',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: [
      "rgba(240,122,122,1)","rgba(240,158,109,1)","rgba(240,217,109,1)",
      "rgba(181,217,109,1)","rgba(109,194,122,1)","rgba(109,194,181,1)","rgba(109,158,217,1)"
    ]}]},
    options: { animation:false, responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right'}} }
  });
}

/* --- メイン処理：fetchして描画 --- */
async function loadAndRender(showLoading = true) {
  const name = nameInput.value.trim();
  if (!name) {
    statusMessage.textContent = '名前を入力してねっ';
    return;
  }
  statusMessage.textContent = '';

  const gasDate = datePicker.value; // YYYY/MM/DD
  if (!gasDate) {
    statusMessage.textContent = '日付を選んでね';
    return;
  }

  if (showLoading) startLoading();

  try {
    const data = await fetchFromGAS(name, gasDate);

    // updateStatus をそのまま表示（検索前は空欄）
    updateStatusEl.textContent = data.updateStatus || '';

    // all 配列（ランキング計算用）
    const all = data.all || [];

    // 集計人数（その日のゲームがあった人の数）
    const participants = all.filter(p => Number(p.半荘数) > 0);
    participantCountEl.textContent = `${participants.length}人`;

    // 総ゲーム数（ユニーク時間）
    totalGamesEl.textContent = `${computeTotalGames(all, gasDate)}半荘`;

    // プレイヤー情報
    playerNoEl.textContent = data.no != null ? String(data.no).padStart(4,'0') : '----';
    playerNameEl.textContent = data.name || name;

    // 日別ランキング（2行5列） — 「その人の順位のみ」表示する
    const ranks = computeRanksFromAll(all, data.name);
    buildTwoRowGrid(rankingTable,
      ['累計半荘数ランキング','総スコアランキング','最高スコアランキング','平均スコアランキング','平均着順ランキング'],
      [ranks['半荘数'], ranks['総スコア'], ranks['最高スコア'], ranks['平均スコア'], ranks['平均着順']]
    );

    // 日別スコアデータ（数値表示）
    const s = data.summary || {};
    const values = [
      s.半荘数 != null ? `${Number(s.半荘数).toFixed(0)}半荘` : 'データ不足',
      s.総スコア != null ? `${Number(s.総スコア).toFixed(1)}pt` : 'データ不足',
      (s.最高スコア != null && s.最高スコア !== -Infinity) ? `${Number(s.最高スコア).toFixed(1)}pt` : 'データ不足',
      s.平均スコア != null ? `${Number(s.平均スコア).toFixed(3)}pt` : 'データ不足',
      s.平均着順 != null ? `${Number(s.平均着順).toFixed(3)}着` : 'データ不足'
    ];
    buildTwoRowGrid(scoreTable,
      ['累計半荘数','総スコア','最高スコア','平均スコア','平均着順'],
      values
    );

    // ゲームリスト（時系列順）＋棒グラフ
    gamesList.innerHTML = '';
    const games = (data.games || []).slice().sort((a,b) => (a.time||'').localeCompare(b.time||''));
    if (!games.length) {
      const n = document.createElement('div');
      n.className = 'game-card';
      n.textContent = 'この日のゲームはありません。';
      gamesList.appendChild(n);
      if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
    } else {
      const scores = [];
      const labels = [];
      games.forEach((g,i) => {
        const card = document.createElement('div');
        card.className = 'game-card';
        const left = document.createElement('div'); left.className = 'time'; left.textContent = `${pad(i+1)} ${g.time ? g.time.slice(0,5) : '--:--'}`;
        const right = document.createElement('div'); right.className = 'score';
        const sc = (g.score == null) ? 0 : Number(g.score);
        const sig = sc > 0 ? '+' : '';
        right.textContent = `${sig}${sc.toFixed(1)}pt　${g.rank != null ? g.rank + '着' : ''}`;
        card.appendChild(left); card.appendChild(right);
        gamesList.appendChild(card);

        scores.push(sc);
        labels.push(g.time ? g.time.slice(0,5) : `#${i+1}`);
      });
      // 棒グラフ作成
      createBarChart(scores, labels);
    }

    // 着順テーブル & 円グラフ
    const counts = countPlacements(games);
    placementTable.innerHTML = '';
    const table = document.createElement('table');
    const tr1 = document.createElement('tr');
    ['1着の回数','2着の回数','3着の回数','4着の回数'].forEach(h => { const th=document.createElement('th'); th.textContent=h; tr1.appendChild(th);});
    table.appendChild(tr1);
    const tr2 = document.createElement('tr');
    ['1着','2着','3着','4着'].forEach(k => { const td=document.createElement('td'); td.textContent = counts[k]||0; tr2.appendChild(td);});
    table.appendChild(tr2);
    const tr3 = document.createElement('tr');
    ['1.5着の回数','2.5着の回数','3.5着の回数',''].forEach(h => { const th=document.createElement('th'); th.textContent=h; tr3.appendChild(th);});
    table.appendChild(tr3);
    const tr4 = document.createElement('tr');
    ['1.5着','2.5着','3.5着',''].forEach(k => { const td=document.createElement('td'); td.textContent = k ? (counts[k]||0) : ''; tr4.appendChild(td);});
    table.appendChild(tr4);
    placementTable.appendChild(table);

    createPieChart(counts);

    // 成功時はステータスメッセージクリア
    statusMessage.textContent = '';

  } catch (err) {
    console.error(err);
    statusMessage.textContent = `読み込みエラー: ${err.message}`;
  } finally {
    if (showLoading) endLoading();
  }
}

/* --- イベント設定 --- */
document.addEventListener('DOMContentLoaded', () => {
  // 日付セレクトを初期化（10/1〜10/30）
  initDatePicker();

  // 初期日付: 東京時間で 20:00 以前なら前日、それ以降は当日（ただし月の範囲内で clamp）
  const t = tokyoNow();
  let day = t.getDate();
  if (t.getHours() < 20) day = day - 1;
  if (day < 1) day = 1;
  if (day > LAST_DAY) day = LAST_DAY;
  const initialValue = makeGASDateISO(YEAR, MONTH, day);
  // 初期選択（もし該当オプションがあるなら選択）
  const opt = Array.from(datePicker.options).find(o => o.value === initialValue);
  if (opt) datePicker.value = initialValue;
  updatePrevNextVisibility();

  // 検索ボタンクリック：ローディングありで fetch
  searchBtn.addEventListener('click', () => {
    if (!nameInput.value.trim()) { statusMessage.textContent = '名前を入力してねっ'; return; }
    statusMessage.textContent = '';
    loadAndRender(true);
  });

  // prev / next：選択を移動してローディングあり
  prevBtn.addEventListener('click', () => {
    const idx = datePicker.selectedIndex;
    if (idx > 0) {
      datePicker.selectedIndex = idx - 1;
      updatePrevNextVisibility();
      if (nameInput.value.trim()) loadAndRender(true);
    }
  });
  nextBtn.addEventListener('click', () => {
    const idx = datePicker.selectedIndex;
    if (idx < datePicker.options.length - 1) {
      datePicker.selectedIndex = idx + 1;
      updatePrevNextVisibility();
      if (nameInput.value.trim()) loadAndRender(true);
    }
  });

  // 日付プルダウン変更：ローディングありで fetch
  datePicker.addEventListener('change', () => {
    updatePrevNextVisibility();
    if (nameInput.value.trim()) loadAndRender(true);
  });

  // 名前入力時は fetch しない（指定どおり）
  nameInput.addEventListener('input', () => {
    // 何もしない
  });

  // 初期は結果非表示、更新状況のみタイトル（updateStatusEl は空のまま）
  resultsSection.classList.add('hidden');
});