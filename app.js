/* script.js
   - 動作ルール：
     ・名前入力（input）だけでは fetch しない（ロードしない）
     ・検索ボタン押下 / ◀️・▶️押下 / 日付プルダウン変更 → ローディング表示ありで fetch & 描画
   - 使い方：API_URL をその月の GAS Web アプリ URL に差し替え、YEAR/MONTH/LAST_DAY を月ごとにセットしてください
*/

/* ===== 設定（ここを必ず差し替える） ===== */
const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // ← あなたの GAS 公開 URL
const YEAR = 2025;   // 対象年（毎月差し替え）
const MONTH = 10;    // 対象月（1〜12）
const LAST_DAY = 30; // その月の最終日（例: 30）
/* ======================================== */

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
// 0埋め
const pad = n => String(n).padStart(2, '0');

// 東京現在時刻を取得（タイムゾーン補正）
function tokyoNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}

// YYYY-MM-DD -> GAS 用 YYYY/MM/DD
function toGASDate(iso) {
  return iso.replace(/-/g, '/');
}

// 日付表示: 例 "10月1日(水)"
const WEEK = ['日','月','火','水','木','金','土'];
function labelForOption(iso) {
  const d = new Date(iso);
  return `${d.getMonth()+1}月${d.getDate()}日(${WEEK[d.getDay()]})`;
}

/* --- 日付セレクト生成 --- */
function initDateSelect() {
  datePicker.innerHTML = '';
  for (let d = 1; d <= LAST_DAY; d++) {
    const dt = new Date(YEAR, MONTH - 1, d);
    const opt = document.createElement('option');
    opt.value = dt.toISOString().slice(0,10); // YYYY-MM-DD
    opt.textContent = labelForOption(opt.value); // 10月1日(水)
    datePicker.appendChild(opt);
  }
}

/* --- 初期日付（東京20:00ルール） --- */
function initialDateISO() {
  const t = tokyoNow();
  let day = t.getDate();
  if (t.getHours() < 20) day = day - 1;
  if (day < 1) day = 1;
  if (day > LAST_DAY) day = LAST_DAY;
  const dt = new Date(YEAR, MONTH - 1, day);
  return dt.toISOString().slice(0,10);
}

/* --- prev/next ボタン制御 --- */
function updatePrevNextState() {
  const idx = datePicker.selectedIndex;
  prevBtn.disabled = (idx <= 0);
  nextBtn.disabled = (idx >= datePicker.options.length - 1);
}

/* --- ローディング制御（15秒で満杯） --- */
let loadingTimeout = null;
function startLoading() {
  loadingArea.classList.remove('hidden');
  resultsSection.classList.add('hidden');

  // 15秒で幅を 100% にする
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
    // リセット
    loadingBar.style.transition = '';
    loadingBar.style.width = '0%';
    loadingText.textContent = 'ロード…チュ♡';
  }, 250);
}

/* --- GAS からデータを取得 --- */
async function fetchFromGAS(name, isoDate) {
  const gasDate = toGASDate(isoDate); // yyyy/mm/dd
  const url = `${API_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(gasDate)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/* --- all 配列からランキングを計算 --- */
/* 戻り値: { '半荘数': '1位' or 'データなし', ... } */
function computeRanks(all, targetName) {
  // 参加者 = 半荘数 > 0 の人（その日のゲームがあった人）
  const participants = (all || []).filter(p => Number(p.半荘数) > 0);

  const keys = [
    { key: '半荘数', higher: true },
    { key: '総スコア', higher: true },
    { key: '最高スコア', higher: true },
    { key: '平均スコア', higher: true },
    { key: '平均着順', higher: false }
  ];

  const out = {};
  keys.forEach(({ key, higher }) => {
    if (!participants.length) {
      out[key] = 'データなし';
      return;
    }
    const sorted = participants.slice().sort((a,b) => {
      const va = a[key] == null ? (key==='最高スコア' ? -Infinity : 0) : Number(a[key]);
      const vb = b[key] == null ? (key==='最高スコア' ? -Infinity : 0) : Number(b[key]);
      if (va === vb) {
        // 同点時は総スコアで判定（降順）
        const sa = Number(a['総スコア'] || 0);
        const sb = Number(b['総スコア'] || 0);
        if (sb !== sa) return sb - sa;
        return (a.name || '').localeCompare(b.name || '');
      }
      return higher ? (vb - va) : (va - vb);
    });
    const idx = sorted.findIndex(p => p.name === targetName);
    out[key] = idx >= 0 ? `${idx+1}位` : 'データなし';
  });
  return out;
}

/* --- ユニークなゲーム数（同一時間を一回と数える） --- */
function computeTotalGames(all, targetDateISO) {
  const set = new Set();
  (all || []).forEach(p => {
    (p.games || []).forEach(g => {
      if (!g || !g.time) return;
      if (g.date && g.date.indexOf(targetDateISO.replace(/-/g,'/')) === 0) {
        set.add(g.time); // 同じ時間は同一ゲームとみなす
      } else {
        // g.date が "2025/10/01" 形式なら比較
        const d = g.date ? g.date.replace(/-/g,'/') : '';
        if (d && d.indexOf(targetDateISO.replace(/-/g,'/')) === 0) set.add(g.time);
      }
    });
  });
  return set.size;
}

/* --- 着順カウント（1着,1.5着,...4着） --- */
function countPlacements(games) {
  const keys = ['1着','1.5着','2着','2.5着','3着','3.5着','4着'];
  const counts = {};
  keys.forEach(k => counts[k] = 0);
  (games || []).forEach(g => {
    if (g == null || g.rank == null) return;
    // rank が 1, 1.5, 2 ... として与えられる想定
    const key = `${g.rank}着`;
    if (counts[key] !== undefined) counts[key] += 1;
  });
  return counts;
}

/* --- 表作成ユーティリティ（2行×5列） --- */
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

/* --- 棒グラフ作成（0を中心に表示） --- */
function createBarChart(scores, labels) {
  const ctx = barCanvas.getContext('2d');
  if (barChartInstance) barChartInstance.destroy();
  const maxV = scores.length ? Math.max(...scores.map(s => Math.abs(Number(s)||0))) : 1;
  const bound = Math.ceil(maxV * 1.1);
  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'スコア',
        data: scores,
        backgroundColor: scores.map(s => (Number(s) >= 0 ? '#66ccff' : '#ff9999'))
      }]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: -bound,
          max: bound
        }
      }
    }
  });
}

/* --- 円グラフ作成（着順割合） --- */
function createPieChart(counts) {
  const labels = ['1着','1.5着','2着','2.5着','3着','3.5着','4着'];
  const data = labels.map(l => counts[l] || 0);
  const ctx = pieCanvas.getContext('2d');
  if (pieChartInstance) pieChartInstance.destroy();
  pieChartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
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
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right' } }
    }
  });
}

/* --- 実際の描画処理（fetch 後に呼ぶ） --- */
async function loadAndRender(showLoading = true) {
  const name = nameInput.value.trim();
  if (!name) {
    statusMessage.textContent = '名前を入力してねっ';
    return;
  }
  statusMessage.textContent = '';

  const iso = datePicker.value; // YYYY-MM-DD
  if (showLoading) startLoading();

  try {
    // GAS からデータ取得
    const data = await fetchFromGAS(name, iso);

    // 更新状況: サーバーの文字列をそのまま表示
    updateStatusEl.textContent = data.updateStatus || '';

    // participant count (ゲームがあった人数)
    const all = data.all || [];
    const participants = all.filter(p => Number(p.半荘数) > 0);
    participantCountEl.textContent = `${participants.length}人`;

    // 総ゲーム数 (ユニークな時間)
    totalGamesEl.textContent = `${computeTotalGames(all, iso)}半荘`;

    // プレイヤー情報（No / 名前）
    playerNoEl.textContent = data.no != null ? String(data.no).padStart(4,'0') : '----';
    playerNameEl.textContent = data.name || name;

    // 日別ランキング（5項目）
    const ranks = computeRanks(all, data.name);
    buildTwoRowGrid(rankingTable,
      ['累計半荘数','総スコア','最高スコア','平均スコア','平均着順'],
      [ranks['半荘数'], ranks['総スコア'], ranks['最高スコア'], ranks['平均スコア'], ranks['平均着順']]
    );

    // 日別スコアデータ（2行5列、単位付き）
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

    // ゲームリスト（時系列）
    gamesList.innerHTML = '';
    const games = (data.games || []).slice().sort((a,b) => (a.time||'').localeCompare(b.time||''));
    if (!games.length) {
      const div = document.createElement('div');
      div.className = 'game-card';
      div.textContent = 'この日のゲームはありません。';
      gamesList.appendChild(div);
      if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null; }
    } else {
      const scores = [];
      const labels = [];
      games.forEach((g, i) => {
        const card = document.createElement('div');
        card.className = 'game-card';
        const timeEl = document.createElement('div');
        timeEl.className = 'time';
        timeEl.textContent = `${pad(i+1)} ${g.time ? g.time.slice(0,5) : '--:--'}`;
        const scoreEl = document.createElement('div');
        scoreEl.className = 'score';
        const scoreNum = (g.score == null) ? 0 : Number(g.score);
        const sig = (scoreNum > 0) ? '+' : '';
        scoreEl.textContent = `${sig}${scoreNum.toFixed(1)}pt　${g.rank != null ? g.rank + '着' : ''}`;
        card.appendChild(timeEl);
        card.appendChild(scoreEl);
        gamesList.appendChild(card);

        scores.push(scoreNum);
        labels.push(g.time ? g.time.slice(0,5) : `#${i+1}`);
      });

      // 棒グラフを作成（中心 0）
      createBarChart(scores, labels);
    }

    // 着順データと円グラフ
    const counts = countPlacements(games);
    // テーブルの作成
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

    // 円グラフ
    createPieChart(counts);

  } catch (err) {
    console.error(err);
    statusMessage.textContent = `読み込みエラー: ${err.message}`;
    // エラー時は表示をクリア
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

/* --- イベント設定 --- */
document.addEventListener('DOMContentLoaded', () => {
  // 日付選択初期化
  initDateSelect();

  // 初期日付（東京20:00ルール）
  const initISO = initialDateISO();
  datePicker.value = initISO;
  updatePrevNextState();

  // 検索ボタン：ロードありで fetch
  searchBtn.addEventListener('click', () => {
    if (!nameInput.value.trim()) {
      statusMessage.textContent = '名前を入力してねっ';
      return;
    }
    statusMessage.textContent = '';
    loadAndRender(true);
  });

  // prev / next：選択を移動してロードあり
  prevBtn.addEventListener('click', () => {
    const idx = datePicker.selectedIndex;
    if (idx > 0) {
      datePicker.selectedIndex = idx - 1;
      updatePrevNextState();
      if (nameInput.value.trim()) loadAndRender(true);
    }
  });
  nextBtn.addEventListener('click', () => {
    const idx = datePicker.selectedIndex;
    if (idx < datePicker.options.length - 1) {
      datePicker.selectedIndex = idx + 1;
      updatePrevNextState();
      if (nameInput.value.trim()) loadAndRender(true);
    }
  });

  // 日付プルダウン変更：ロードありで fetch
  datePicker.addEventListener('change', () => {
    updatePrevNextState();
    if (nameInput.value.trim()) loadAndRender(true);
  });

  // 名前入力時は fetch しない（ロードしない）
  nameInput.addEventListener('input', () => {
    // 何もしない（指定どおり）
  });

  // 初期は結果非表示
  resultsSection.classList.add('hidden');
});