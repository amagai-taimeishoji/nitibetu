// ========== 設定 (ここを実際のGAS公開URLに置き換えてください) ==========
const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // ← ここを変更
const YEAR = 2025;
const MONTH = 10; // 10月（固定）
const DAY_MIN = 1;
const DAY_MAX = 30;
const LOADING_DURATION_MS = 15000; // 15秒でMAX（アニメーション）
// =======================================================================

let barChart = null;
let pieChart = null;
let loadingStart = null;
let loadingRafId = null;

// ---- DOM ----
const nameInput = document.getElementById("name-input");
const dateSelect = document.getElementById("date-select");
const prevBtn = document.getElementById("prev-day");
const nextBtn = document.getElementById("next-day");
const searchBtn = document.getElementById("search-button");
const statusMsg = document.getElementById("status-message");
const loadingContainer = document.getElementById("loading-container");
const loadingFill = document.getElementById("loading-fill");
const loadingText = document.getElementById("loading-text");

const resultsDiv = document.getElementById("results");
const updateStatusDiv = document.getElementById("update-status");
const visitorCountDiv = document.getElementById("visitor-count");
const memberInfoDiv = document.getElementById("member-info");

const rankingTable = document.getElementById("ranking-table");
const scoredataTable = document.getElementById("scoredata-table");
const tenhanList = document.getElementById("tenhan-list");
const barCanvas = document.getElementById("bar-chart");
const rankCountTable = document.getElementById("rank-count-table");
const pieCanvas = document.getElementById("pie-chart");

// ---- 初期化 ----
initDateSelect();
setInitialDate();
attachEvents();

// ----------------- functions -----------------

function initDateSelect(){
  dateSelect.innerHTML = "";
  for(let d=DAY_MIN; d<=DAY_MAX; d++){
    const opt = document.createElement("option");
    const dt = new Date(YEAR, MONTH-1, d);
    const weekday = dt.toLocaleDateString("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" });
    opt.value = formatDateSlash(dt); // yyyy/MM/dd
    opt.textContent = `${MONTH}月${d}日 (${weekday})`;
    dateSelect.appendChild(opt);
  }
}

function setInitialDate(){
  // JST 現在時刻を取得
  const nowStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
  const nowJst = new Date(nowStr);
  let baseDate = new Date(nowJst);
  if (nowJst.getHours() < 20) {
    // 前日
    baseDate.setDate(nowJst.getDate() - 1);
  }
  // clamp into month range
  if (baseDate.getFullYear() !== YEAR || (baseDate.getMonth()+1) !== MONTH) {
    // out of target month -> default to first available (DAY_MIN)
    baseDate = new Date(YEAR, MONTH-1, DAY_MIN);
  }
  const val = formatDateSlash(baseDate);
  dateSelect.value = val;
  updateNavButtons();
}

function attachEvents(){
  prevBtn.addEventListener("click", ()=>{
    changeSelectedDay(-1);
    fetchAndRender(); // prev arrow triggers fetch
  });
  nextBtn.addEventListener("click", ()=>{
    changeSelectedDay(1);
    fetchAndRender(); // next arrow triggers fetch
  });
  dateSelect.addEventListener("change", ()=>{
    updateNavButtons();
    // spec: プルダウン変更時は fetch & 描画
    fetchAndRender();
  });
  searchBtn.addEventListener("click", ()=>{
    fetchAndRender();
  });
}

function changeSelectedDay(delta){
  const current = parseSelectedDay();
  let newDay = current + delta;
  if (newDay < DAY_MIN) newDay = DAY_MIN;
  if (newDay > DAY_MAX) newDay = DAY_MAX;
  const newDate = new Date(YEAR, MONTH-1, newDay);
  dateSelect.value = formatDateSlash(newDate);
  updateNavButtons();
}

function parseSelectedDay(){
  // dateSelect.value is yyyy/MM/dd
  const parts = dateSelect.value.split("/");
  return parseInt(parts[2], 10);
}

function updateNavButtons(){
  const day = parseSelectedDay();
  prevBtn.hidden = (day <= DAY_MIN);
  nextBtn.hidden = (day >= DAY_MAX);
}

// ---------- Loading animation (non-looping, 15s to MAX) ----------
function startLoading(){
  loadingContainer.style.display = "flex";
  loadingFill.style.width = "0%";
  loadingText.style.display = "block";
  statusMsg.textContent = "ロード、チュ…♡";
  loadingStart = performance.now();
  cancelAnimationFrame(loadingRafId);
  loadingRafId = requestAnimationFrame(loadingTick);
}
function loadingTick(now){
  const elapsed = now - loadingStart;
  const pct = Math.min(100, (elapsed / LOADING_DURATION_MS) * 100);
  loadingFill.style.width = pct + "%";
  if (pct < 100) {
    loadingRafId = requestAnimationFrame(loadingTick);
  } else {
    cancelAnimationFrame(loadingRafId);
  }
}
function stopLoading(){
  cancelAnimationFrame(loadingRafId);
  loadingFill.style.width = "100%";
  setTimeout(()=>{
    loadingContainer.style.display = "none";
    statusMsg.textContent = "";
  }, 250);
}

// ---------- Fetch & render ----------
async function fetchAndRender(){
  const name = nameInput.value.trim();
  if (!name) {
    statusMsg.textContent = "名前を入力してねっ";
    return;
  }
  const dateParam = dateSelect.value; // yyyy/MM/dd per spec
  // start loading
  startLoading();
  resultsDiv.style.display = "none";
  updateStatusDiv.textContent = "";
  visitorCountDiv.textContent = "";

  try {
    const url = `${API_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(dateParam)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      stopLoading();
      statusMsg.textContent = data.error;
      return;
    }

    // updateStatus
    updateStatusDiv.textContent = data.updateStatus || "";

    // 集計人数 (サーバは allStats を返す)
    const all = data.all || [];
    const uniqueCount = data.集計人数 || all.filter(p => p.half>0).length;
    visitorCountDiv.textContent = `集計人数: ${uniqueCount} 人`;

    // member info
    memberInfoDiv.textContent = `No. ${data.no || "不明"}   ${data.name}`;

    // 全員ランキング計算 (フロント)
    const rankMaps = buildAllRankMaps(all);

    // 日別ランキング表（1行:項目, 2行:順位(位)）
    const rankingRow = [
      formatRankValue(rankMaps.half[data.name]),
      formatRankValue(rankMaps.total[data.name]),
      formatRankValue(rankMaps.high[data.name]),
      formatRankValue(rankMaps.avg[data.name]),
      formatRankValue(rankMaps.avgRank[data.name])
    ];
    createTable("ranking-table", [
      ["累計半荘数\nランキング","総スコア\nランキング","最高スコア\nランキング","平均スコア\nランキング","平均着順\nランキング"],
      rankingRow
    ], 5);

    // 日別成績（数値表）
    const userSummary = data.summary || {};
    createTable("scoredata-table", [
      ["累計半荘数","総スコア","最高スコア","平均スコア","平均着順"],
      [
        userSummary.半荘数 != null ? `${userSummary.半荘数}半荘` : "データなし",
        userSummary.総スコア != null ? `${Number(userSummary.総スコア).toFixed(1)}pt` : "データなし",
        userSummary.最高スコア != null ? `${Number(userSummary.最高スコア).toFixed(1)}pt` : "データなし",
        userSummary.平均スコア != null ? `${Number(userSummary.平均スコア).toFixed(3)}pt` : "データなし",
        userSummary.平均着順 != null ? `${Number(userSummary.平均着順).toFixed(3)}位` : "データなし"
      ]
    ], 5);

    // ゲームリスト（時刻順）
    const games = (data.games || []).slice();
    const sortedGames = games.slice().sort((a,b)=>{
      // a.time like "16:40:00" or "" -> create Date
      const ta = parseTimeForSort(data.date, a.time);
      const tb = parseTimeForSort(data.date, b.time);
      return ta - tb;
    });
    renderGameList(sortedGames);

    // 棒グラフ
    createBarChart(sortedGames);

    // 着順カウント表と円グラフ
    const rankCounts = countRanks(sortedGames);
    createRankCountTable(rankCounts);
    createPieChart(rankCounts);

    // show results
    resultsDiv.style.display = "block";
    stopLoading();

  } catch (err) {
    stopLoading();
    console.error(err);
    statusMsg.textContent = `成績更新チュ♡今は見れません (${err.message})`;
  }
}

// ---------- Utilities ----------

function formatDateSlash(d){
  const y = d.getFullYear();
  const m = ('0'+(d.getMonth()+1)).slice(-2);
  const day = ('0'+d.getDate()).slice(-2);
  return `${y}/${m}/${day}`;
}

function parseTimeForSort(dateStr, timeStr){
  // dateStr "yyyy/MM/dd", timeStr "HH:mm:ss"
  if (!timeStr) return new Date(dateStr + "T00:00:00+09:00").getTime();
  const iso = dateStr.replace(/\//g,'-') + 'T' + timeStr + '+09:00';
  return new Date(iso).getTime();
}

// build rank maps (standard competition ranking; same value -> same rank; next rank = index+1)
function buildAllRankMaps(all){
  // all: array of {name, half, total, high, avg, avgRank}
  const copy = all.slice();

  function calc(key, asc=false){
    const arr = copy.map(a=>({name:a.name, val: a[key]==null ? (asc? Infinity : -Infinity) : a[key]}));
    arr.sort((x,y)=> asc ? x.val - y.val : y.val - x.val);
    const map = {};
    let prev = null;
    let lastRank = 0;
    for (let i=0;i<arr.length;i++){
      const it = arr[i];
      if (prev === it.val) {
        map[it.name] = lastRank;
      } else {
        lastRank = i+1;
        map[it.name] = lastRank;
        prev = it.val;
      }
    }
    return map;
  }

  return {
    half: calc("half", false),
    total: calc("total", false),
    high: calc("high", false),
    avg: calc("avg", false),
    avgRank: calc("avgRank", true) // 小さい方が上位
  };
}

function formatRankValue(v){
  return v == null ? "データなし" : `${v}位`;
}

// createTable: id, rows(array-of-arrays), cols
function createTable(id, rows, cols){
  const table = document.getElementById(id);
  table.innerHTML = "";
  table.style.gridTemplateColumns = `repeat(${cols}, 18vw)`;
  rows.forEach((row, rowIndex)=>{
    row.forEach(cell=>{
      const div = document.createElement("div");
      div.textContent = cell;
      div.className = rowIndex % 2 === 0 ? "header" : "data";
      if (!cell || cell.toString().trim()==="") div.classList.add("empty-cell");
      table.appendChild(div);
    });
  });
}

function renderGameList(games){
  tenhanList.innerHTML = "";
  if (!games || games.length === 0) {
    const div = document.createElement("div");
    div.className = "score-card";
    div.textContent = "スコアなし";
    tenhanList.appendChild(div);
    return;
  }
  games.forEach((g, idx)=>{
    const card = document.createElement("div");
    card.className = "score-card";
    const left = document.createElement("div");
    left.className = "card-left";
    left.innerHTML = `<strong>${idx+1}.</strong> <span>${g.time || "-"}</span>`;
    const right = document.createElement("div");
    right.innerHTML = `<span>${formatScoreForDisplay(g.score)}</span>　<span>${g.rank!=null? g.rank + "着":"着順なし"}</span>`;
    card.appendChild(left);
    card.appendChild(right);
    tenhanList.appendChild(card);
  });
}

function formatScoreForDisplay(s){
  if (s == null || isNaN(s)) return "データ不足";
  if (Math.abs(s - Math.round(s)) < 1e-6) return `${s}pt`;
  return `${Number(s).toFixed(1)}pt`;
}

// ---- Bar chart (center 0) ----
function createBarChart(games){
  if (barChart) barChart.destroy();
  const ctx = barCanvas.getContext("2d");
  const labels = games.map(g => g.time || "");
  const dataVals = games.map(g => Number(g.score || 0));
  if (dataVals.length === 0) {
    // clear canvas
    ctx.clearRect(0, 0, barCanvas.width, barCanvas.height);
    return;
  }
  const maxVal = Math.max(...dataVals);
  const minVal = Math.min(...dataVals);
  const maxAbs = Math.max(Math.abs(maxVal), Math.abs(minVal)) * 1.1 || 10;

  const bg = dataVals.map(v => v >= 0 ? "rgba(76,175,80,0.9)" : "rgba(244,67,54,0.9)");

  barChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "スコア",
        data: dataVals,
        backgroundColor: bg
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: -maxAbs,
          max: maxAbs,
          ticks: { stepSize: Math.ceil(maxAbs/5) }
        }
      }
    }
  });
}

// ---- Rank counts (1,1.5,2,2.5,3,3.5,4) ----
function countRanks(games){
  const keys = ["1","1.5","2","2.5","3","3.5","4"];
  const counts = {};
  keys.forEach(k => counts[k]=0);
  games.forEach(g=>{
    if (g.rank==null) return;
    const r = String(g.rank);
    if (counts[r]!==undefined) counts[r] += 1;
  });
  return counts;
}

function createRankCountTable(counts){
  const id = "rank-count-table";
  const table = document.getElementById(id);
  table.innerHTML = "";
  const cols = 4;
  table.style.gridTemplateColumns = `repeat(${cols}, 18vw)`;

  const row1 = ["1着の回数","2着の回数","3着の回数","4着の回数"];
  const row2 = [`${counts["1"]||0}回`, `${counts["2"]||0}回`, `${counts["3"]||0}回`, `${counts["4"]||0}回`];
  const row3 = ["1.5着の回数","2.5着の回数","3.5着の回数",""];
  const row4 = [`${counts["1.5"]||0}回`, `${counts["2.5"]||0}回`, `${counts["3.5"]||0}回`, ""];

  [row1,row2,row3,row4].forEach((r,ri)=>{
    r.forEach(cell=>{
      const d = document.createElement("div");
      d.textContent = cell;
      d.className = ri%2===0 ? "header" : "data";
      if (!cell || cell.toString().trim()==="") d.classList.add("empty-cell");
      table.appendChild(d);
    });
  });
}

function createPieChart(counts){
  if (pieChart) pieChart.destroy();
  const ctx = pieCanvas.getContext("2d");
  const labels = ["1着","1.5着","2着","2.5着","3着","3.5着","4着"];
  const dataArr = ["1","1.5","2","2.5","3","3.5","4"].map(k=>counts[k]||0);
  const total = dataArr.reduce((a,b)=>a+b,0);
  if (total === 0) {
    ctx.clearRect(0,0,pieCanvas.width,pieCanvas.height);
    return;
  }
  const colors = [
    "rgba(240,122,122,1)", // 1
    "rgba(180,180,180,1)", // 1.5 gray
    "rgba(240,217,109,1)", // 2
    "rgba(190,190,190,1)", // 2.5
    "rgba(109,194,122,1)", // 3
    "rgba(160,160,160,1)", // 3.5
    "rgba(109,158,217,1)"  // 4
  ];
  pieChart = new Chart(ctx, {
    type: "pie",
    data: { labels, datasets:[{ data: dataArr, backgroundColor: colors }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'left'}} }
  });
}