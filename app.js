// ---------------- Config (必ず変更する) ----------------
const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; //その月の exec URLに置き換え
const YEAR = 2025;
const MONTH = 10;
const DAY_MIN = 1;
const DAY_MAX = 30;
const LOADING_DURATION_MS = 15000; // 15秒でMAX
// -------------------------------------------------------

/* globals */
let barChartInstance = null;
let pieChartInstance = null;
let loadingStart = null;
let loadingRaf = null;

/* DOM */
const updateStatusEl = document.getElementById("update-status");
const visitorCountEl = document.getElementById("visitor-count");
const memberInfoEl = document.getElementById("member-info");
const nameInput = document.getElementById("name-input");
const dateSelect = document.getElementById("date-select");
const prevBtn = document.getElementById("prev-day");
const nextBtn = document.getElementById("next-day");
const searchBtn = document.getElementById("search-button");
const loadingArea = document.getElementById("loading-area");
const loadingFill = document.getElementById("loading-fill");
const loadingText = document.getElementById("loading-text");
const resultsSection = document.getElementById("results");

const rankingTable = document.getElementById("ranking-table");
const scoredataTable = document.getElementById("scoredata-table");
const tenhanList = document.getElementById("tenhan-list");
const barCanvas = document.getElementById("bar-chart");
const rankCountTable = document.getElementById("rank-count-table");
const pieCanvas = document.getElementById("pie-chart");

/* init */
populateDateDropdown(YEAR, MONTH);
setInitialDate();
attachEvents();

/* ========== UI / Init ========== */
function populateDateDropdown(year, month) {
  dateSelect.innerHTML = "";
  const weekdays = ["日","月","火","水","木","金","土"];
  const last = Math.min(new Date(year, month, 0).getDate(), DAY_MAX);
  for (let d = DAY_MIN; d <= last; d++) {
    const option = document.createElement("option");
    const dt = new Date(year, month - 1, d);
    option.value = `${year}/${String(month).padStart(2,"0")}/${String(d).padStart(2,"0")}`;
    option.textContent = `${month}/${d} (${weekdays[dt.getDay()]})`;
    dateSelect.appendChild(option);
  }
}

function setInitialDate(){
  // JST現在（文字列経由でタイムゾーンを合わせる）
  const nowStr = new Date().toLocaleString("en-US",{ timeZone: "Asia/Tokyo" });
  const nowJst = new Date(nowStr);
  let base = new Date(nowJst);
  if (nowJst.getHours() < 20) base.setDate(nowJst.getDate() - 1);
  if (base.getFullYear() !== YEAR || base.getMonth()+1 !== MONTH) base = new Date(YEAR, MONTH-1, DAY_MIN);
  dateSelect.value = `${YEAR}/${String(MONTH).padStart(2,"0")}/${String(base.getDate()).padStart(2,"0")}`;
  updateNavButtons();
}

function attachEvents(){
  searchBtn.addEventListener("click", ()=> fetchAndRender({ triggeredBy:"search" }));
  dateSelect.addEventListener("change", ()=> fetchAndRender({ triggeredBy:"select" }));
  prevBtn.addEventListener("click", ()=> { changeSelectedDay(-1); fetchAndRender({ triggeredBy:"nav" }); });
  nextBtn.addEventListener("click", ()=> { changeSelectedDay(1); fetchAndRender({ triggeredBy:"nav" }); });
  nameInput.addEventListener("keydown", (e)=> { if (e.key === "Enter") fetchAndRender({ triggeredBy:"search" }); });
}

function changeSelectedDay(delta){
  const current = parseSelectedDay();
  let target = current + delta;
  const last = Math.min(new Date(YEAR, MONTH, 0).getDate(), DAY_MAX);
  if (target < DAY_MIN) target = DAY_MIN;
  if (target > last) target = last;
  dateSelect.value = `${YEAR}/${String(MONTH).padStart(2,"0")}/${String(target).padStart(2,"0")}`;
  updateNavButtons();
}
function parseSelectedDay(){ return parseInt(dateSelect.value.split("/")[2], 10); }
function updateNavButtons(){
  const day = parseSelectedDay();
  prevBtn.hidden = (day <= DAY_MIN);
  const last = Math.min(new Date(YEAR, MONTH, 0).getDate(), DAY_MAX);
  nextBtn.hidden = (day >= last);
}

/* ========== Loading animation (15s, non-looping) ========== */
function startLoading(){
  // show loading UI
  loadingArea.style.display = "flex";
  loadingFill.style.width = "0%";
  loadingText.style.display = "block";
  // set update-status to loading label
  updateStatusEl.textContent = "読み込みチュ…♡";
  // start RAF based timer
  loadingStart = performance.now();
  cancelAnimationFrame(loadingRaf);
  loadingRaf = requestAnimationFrame(loadingTick);
}
function loadingTick(now){
  const elapsed = now - loadingStart;
  const pct = Math.min(100, (elapsed / LOADING_DURATION_MS) * 100);
  loadingFill.style.width = pct + "%";
  if (pct < 100) {
    loadingRaf = requestAnimationFrame(loadingTick);
  } else {
    cancelAnimationFrame(loadingRaf);
  }
}
function stopLoading(){
  cancelAnimationFrame(loadingRaf);
  loadingFill.style.width = "100%";
  setTimeout(()=>{
    loadingArea.style.display = "none";
    loadingFill.style.width = "0%";
    loadingText.style.display = "none";
  }, 220);
}

/* ========== Fetch & Render ========== */
async function fetchAndRender({ triggeredBy="search" } = {}){
  const name = nameInput.value.trim();
  if (!name) { alert("名前を入力してねっ"); return; }
  const dateParam = dateSelect.value; // yyyy/MM/dd

  // start loading
  startLoading();
  resultsSection.style.display = "none";

  try {
    const url = `${API_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(dateParam)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      stopLoading();
      updateStatusEl.textContent = data.error;
      return;
    }

    // server-provided status goes into update-status (after load)
    updateStatusEl.textContent = data.updateStatus || "ー";

    // visitor & member
    const all = data.all || data.allStats || [];
    const uniqueCount = (data.集計人数 != null) ? data.集計人数 : all.filter(p => p.half>0).length;
    visitorCountEl.textContent = `集計人数: ${uniqueCount} 人`;
    memberInfoEl.textContent = `No. ${data.no || "不明"}   ${data.name || ""}`;

    // ranking maps
    const rankMaps = buildAllRankMaps(all);

    // ranking (user only)
    const ranksRow = [
      formatRankValue(rankMaps.half[data.name]),
      formatRankValue(rankMaps.total[data.name]),
      formatRankValue(rankMaps.high[data.name]),
      formatRankValue(rankMaps.avg[data.name]),
      formatRankValue(rankMaps.avgRank[data.name])
    ];
    createTable("ranking-table", [
      ["累計半荘数\nランキング","総スコア\nランキング","最高スコア\nランキング","平均スコア\nランキング","平均着順\nランキング"],
      ranksRow
    ], 5);

    // score summary
    const s = data.summary || {};
    createTable("scoredata-table",[["累計半荘数","総スコア","最高スコア","平均スコア","平均着順"],[
      s.半荘数!=null ? `${s.半荘数}半荘` : "データなし",
      s.総スコア!=null ? `${Number(s.総スコア).toFixed(1)}pt` : "データなし",
      s.最高スコア!=null ? `${Number(s.最高スコア).toFixed(1)}pt` : "データなし",
      s.平均スコア!=null ? `${Number(s.平均スコア).toFixed(3)}pt` : "データなし",
      s.平均着順!=null ? `${Number(s.平均着順).toFixed(3)}位` : "データなし"
    ]],5);

    // games sorted by time
    const games = (data.games || []).slice().sort((a,b) => parseTimeForSort(data.date,a.time) - parseTimeForSort(data.date,b.time));
    renderGameList(games);

    // charts
    createBarChart(games);
    const rankCounts = countRanks(games);
    createRankCountTable(rankCounts);
    createPieChart(rankCounts);

    resultsSection.style.display = "block";
    stopLoading();
  } catch (err) {
    stopLoading();
    updateStatusEl.textContent = `成績更新チュ♡今は見れません (${err.message})`;
    console.error(err);
  }
}

/* ========== Helpers (tables, charts, ranking) ========== */

function parseTimeForSort(dateStr, timeStr){
  if (!timeStr) return new Date(dateStr.replace(/\//g,'-') + 'T00:00:00+09:00').getTime();
  return new Date(dateStr.replace(/\//g,'-') + 'T' + timeStr + '+09:00').getTime();
}

function buildAllRankMaps(all){
  const arr = all.slice();
  function calc(key, asc=false){
    const tmp = arr.map(a=>({name:a.name, val:(a[key]==null ? (asc? Infinity : -Infinity) : a[key])}));
    tmp.sort((x,y)=> asc ? x.val - y.val : y.val - x.val);
    const map = {};
    let prev = null, lastRank = 0;
    for (let i=0;i<tmp.length;i++){
      const it = tmp[i];
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
    avgRank: calc("avgRank", true)
  };
}

function formatRankValue(v){ return v == null ? "データなし" : `${v}位`; }

function createTable(id, rows, cols){
  const table = document.getElementById(id);
  table.innerHTML = "";
  table.style.gridTemplateColumns = `repeat(${cols}, 18vw)`;
  rows.forEach((row,rowIndex)=>{
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
    const d = document.createElement("div");
    d.className = "score-card";
    d.textContent = "スコアなし";
    tenhanList.appendChild(d);
    return;
  }
  games.forEach((g,i)=>{
    const card = document.createElement("div");
    card.className = "score-card";
    const left = document.createElement("div");
    left.className = "card-left";
    left.innerHTML = `<strong>${i+1}.</strong> <span style="min-width:60px;display:inline-block">${g.time || "-"}</span>`;
    const right = document.createElement("div");
    const scoreStr = (g.score==null || isNaN(g.score)) ? "データ不足" : `${Number(g.score).toFixed(Math.abs(g.score - Math.round(g.score))<1e-6 ? 0 : 1)}pt`;
    right.innerHTML = `<span>${scoreStr}</span>&nbsp;&nbsp;<span>${g.rank!=null ? g.rank + "着":"着順なし"}</span>`;
    card.appendChild(left);
    card.appendChild(right);
    tenhanList.appendChild(card);
  });
}

/* bar chart (center 0), CSS fixes the size; Chart.js animation disabled */
function createBarChart(games) {
  // games: [{time: "HH:mm:ss", score: Number, rank: ...}, ...] を期待（既存コードのまま）
  if (barChartInstance) barChartInstance.destroy();
  const ctx = barCanvas.getContext("2d");

  // 値配列（左＝古い、右＝最新）
  const values = (games || []).map(g => {
    const v = Number(g && g.score);
    return isFinite(v) ? v : 0;
  });

  // ラベルは時刻（空なら空文字）
  const labels = (games || []).map(g => g && g.time ? g.time : "");

  if (values.length === 0) {
    // 描画領域クリア（データ無し）
    ctx.clearRect(0, 0, barCanvas.width, barCanvas.height);
    return;
  }

  // canvas 実際の表示幅を使ってラベル数の上限を決める（1ラベルあたりの幅目安）
  const canvasWidth = barCanvas.clientWidth || barCanvas.parentElement.clientWidth || 600;
  const approxPxPerLabel = 48; // 調整可：この数値が小さいとラベル多め表示
  const maxTicks = Math.max(3, Math.floor(canvasWidth / approxPxPerLabel));
  // step: 何個おきにラベルを出すか
  const step = Math.max(1, Math.ceil(values.length / maxTicks));

  // 右端（最新）を黄色で強調。その他は正=緑、負=赤
  const backgroundColors = values.map((v, i) => {
    if (i === values.length - 1) return "rgba(255,206,86,0.95)"; // 最新＝黄色
    return v >= 0 ? "rgba(76,175,80,0.9)" : "rgba(244,67,54,0.9)";
  });
  const borderColors = values.map((v, i) => {
    if (i === values.length - 1) return "rgba(200,160,50,1)";
    return v >= 0 ? "rgba(56,142,60,1)" : "rgba(211,47,47,1)";
  });

  // 縦軸は最大絶対値に合わせて±表示
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const baseMaxAbs = Math.max(Math.abs(rawMax), Math.abs(rawMin));
  const SAFE_MIN = 10; // 全て0のときの最小レンジ（必要なら小さくする）
  const maxAbs = Math.max(baseMaxAbs, SAFE_MIN) * 1.10; // 余裕10%

  // 棒の最大幅：表示幅と棒数から自動算出（極端に多いと小さく）
  const calcMaxBarThickness = Math.max(6, Math.min(60, Math.floor(canvasWidth / Math.max(3, values.length) * 0.8)));

  barChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "スコア",
        data: values,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
        maxBarThickness: calcMaxBarThickness,
        // categoryPercentage / barPercentage で見た目調整
        categoryPercentage: 0.8,
        barPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // CSS側で高さ固定
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const v = ctx.raw;
              // 小数１桁で表示（整数なら小数なし）
              const isInt = Math.abs(v - Math.round(v)) < 1e-9;
              return ` ${isInt ? String(Math.round(v)) : v.toFixed(1)}pt`;
            }
          }
        }
      },
      layout: { padding: { top: 8, bottom: 8 } },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            autoSkip: false,
            callback: function(value, index) {
              // index を使って間引き（step個おきに表示）
              return (index % step === 0) ? this.getLabelForValue(value) : "";
            },
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          min: -maxAbs,
          max: maxAbs,
          ticks: {
            // ステップは適当に割る（5分割を目安）
            stepSize: Math.ceil(maxAbs / 5)
          },
          grid: { drawBorder: false }
        }
      }
    }
  });
}


function createPieCha

/* rank counts */
function countRanks(games){
  const keys = ["1","1.5","2","2.5","3","3.5","4"];
  const cnt = {}; keys.forEach(k=>cnt[k]=0);
  games.forEach(g=>{ if (g.rank==null) return; const key = String(g.rank); if (cnt[key]!==undefined) cnt[key]++; });
  return cnt;
}
function createRankCountTable(counts){
  const id="rank-count-table"; const table=document.getElementById(id); table.innerHTML="";
  const cols=4; table.style.gridTemplateColumns = `repeat(${cols}, 18vw)`;
  const row1=["1着の回数","2着の回数","3着の回数","4着の回数"];
  const row2=[`${counts["1"]||0}回`,`${counts["2"]||0}回`,`${counts["3"]||0}回`,`${counts["4"]||0}回`];
  const row3=["1.5着の回数","2.5着の回数","3.5着の回数",""];
  const row4=[`${counts["1.5"]||0}回`,`${counts["2.5"]||0}回`,`${counts["3.5"]||0}回`,""];
  [row1,row2,row3,row4].forEach((r,ri)=> r.forEach(cell=>{
    const d=document.createElement("div"); d.textContent=cell; d.className = ri%2===0 ? "header":"data";
    if (!cell||cell.toString().trim()==="") d.classList.add("empty-cell"); table.appendChild(d);
  }));
}
function createPieChart(counts) {
  if (pieChartInstance) pieChartInstance.destroy();
  const ctx = pieCanvas.getContext("2d");

  const keys = ["1","1.5","2","2.5","3","3.5","4"];
  const values = keys.map(k => Number(counts?.[k] || 0));
  const total = values.reduce((a,b) => a+b, 0);

  // データが空なら 100%「データなし」
  const isEmpty = total === 0;
  const safeData = isEmpty ? [100] : values.map(v => v / total * 100);
  const safeLabels = isEmpty ? ["データなし"] :
    ["1着","1.5着","2着","2.5着","3着","3.5着","4着"];
  const colors = isEmpty
    ? ["rgba(200,200,200,0.8)"]
    : [
      "rgba(240,122,122,1)",
      "rgba(160,160,160,1)",
      "rgba(240,217,109,1)",
      "rgba(190,190,190,1)",
      "rgba(109,194,122,1)",
      "rgba(140,140,140,1)",
      "rgba(109,158,217,1)"
    ];

  pieChartInstance = new Chart(ctx, {
    type: "pie",
    data: {
      labels: safeLabels,
      datasets: [{ data: safeData, backgroundColor: colors }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { position: "left" },
        tooltip: {
          callbacks: {
            label: ctx => isEmpty
              ? "データなし"
              : `${ctx.label}: ${ctx.raw.toFixed(1)}%`
          }
        }
      }
    }
  });
}