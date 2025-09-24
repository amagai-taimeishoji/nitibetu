// ---------------- Config (必ず変更する) ----------------
const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // ← ここをあなたのGAS exec URLに
const YEAR = 2025;
const MONTH = 10;
const DAY_MIN = 1;
const DAY_MAX = 30;
const LOADING_DURATION_MS = 20000; // 15秒でMAX
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
  loadingArea.style.display = "flex";
  loadingFill.style.width = "0%";
  loadingText.style.display = "block";
  updateStatusEl.textContent = "読み込みチュ…♡";
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
    // 100%到達時、自動で stopLoading を呼ぶ（要望対応）
    stopLoading();
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

    // --- normalize 'all' so we always have english keys (half,total,high,avg,avgRank) ---
    const rawAll = data.all || [];
    const normalizedAll = rawAll.map(item => {
      const half = Number(item["半荘数"] ?? item.half ?? (Array.isArray(item.games) ? item.games.length : 0)) || 0;
      const total = Number(item["総スコア"] ?? item.total ?? 0) || 0;
      const high = Number(item["最高スコア"] ?? item.high ?? 0) || 0;
      const avg = Number(item["平均スコア"] ?? item.avg ?? (half ? total/half : 0)) || 0;
      // 平均着順は null もありうる -> preserve null if not present
      const avgRankRaw = (item["平均着順"] ?? item.avgRank ?? item["平均着順"]);
      const avgRank = (avgRankRaw === undefined || avgRankRaw === null || avgRankRaw === "") ? null : Number(avgRankRaw);
      return { name: item.name, half, total, high, avg, avgRank, raw: item };
    });

    // 集計人数（当日のゲームデータがある人の人数）
    const uniqueCount = normalizedAll.filter(p => p.half > 0).length;
    visitorCountEl.textContent = `集計人数: ${uniqueCount} 人`;
    memberInfoEl.textContent = `No. ${data.no || "不明"}   ${data.name || ""}`;

    // ranking maps (use normalizedAll)
    const rankMaps = buildAllRankMaps(normalizedAll);

    // ranking (user only) - safe lookup
    const userName = data.name || name;
    const ranksRow = [
      formatRankValue(rankMaps.half[userName]),
      formatRankValue(rankMaps.total[userName]),
      formatRankValue(rankMaps.high[userName]),
      formatRankValue(rankMaps.avg[userName]),
      formatRankValue(rankMaps.avgRank[userName])
    ];
    createTable("ranking-table", [
      ["累計半荘数\nランキング","総スコア\nランキング","最高スコア\nランキング","平均スコア\nランキング","平均着順\nランキング"],
      ranksRow
    ], 5);

    // score summary (data.summary may already be fine)
    const s = data.summary || {};
    createTable("scoredata-table",[["累計半荘数","総スコア","最高スコア","平均スコア","平均着順"],[
      s.半荘数!=null ? `${s.半荘数}半荘` : (s.half!=null ? `${s.half}半荘` : "データなし"),
      s.総スコア!=null ? `${Number(s.総スコア).toFixed(1)}pt` : (s.total!=null ? `${Number(s.total).toFixed(1)}pt` : "データなし"),
      s.最高スコア!=null ? `${Number(s.最高スコア).toFixed(1)}pt` : (s.high!=null ? `${Number(s.high).toFixed(1)}pt` : "データなし"),
      s.平均スコア!=null ? `${Number(s.平均スコア).toFixed(3)}pt` : (s.avg!=null ? `${Number(s.avg).toFixed(3)}pt` : "データなし"),
      s.平均着順!=null ? `${Number(s.平均着順).toFixed(3)}位` : (s.avgRank!=null ? `${Number(s.avgRank).toFixed(3)}位` : "データなし")
    ]],5);

    // games sorted by time (data.games is user's games)
    const games = (data.games || []).slice().sort((a,b) => parseTimeForSort(data.date,a.time) - parseTimeForSort(data.date,b.time));
    renderGameList(games);

    // charts - use user's games for bar & pie
    createBarChart(games);
    const rankCounts = countRanks(games); // returns object with keys "1","1.5",...
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
  // dateStr "yyyy/MM/dd", timeStr "HH:mm:ss" or ""
  if (!timeStr) return new Date(dateStr.replace(/\//g,'-') + 'T00:00:00+09:00').getTime();
  // ensure two-digit hour/min/sec
  return new Date(dateStr.replace(/\//g,'-') + 'T' + timeStr + '+09:00').getTime();
}

// buildAllRankMaps expects normalizedAll entries {name, half, total, high, avg, avgRank}
function buildAllRankMaps(arr){
  const list = arr.slice();
  function calc(key, asc=false){
    const tmp = list.map(a=>{
      let v = a[key];
      if (v === null || v === undefined || isNaN(Number(v))) {
        v = asc ? Infinity : -Infinity; // missing values go to the end
      } else {
        v = Number(v);
      }
      return { name: a.name, val: v };
    });
    tmp.sort((x,y)=> asc ? x.val - y.val : y.val - x.val);
    const map = {};
    let prev = null, lastRank = 0;
    for (let i=0;i<tmp.length;i++){
      const it = tmp[i];
      if (prev !== null && it.val === prev) {
        // same value as previous -> same rank
        map[it.name] = lastRank;
      } else {
        lastRank = i + 1;
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

/* bar chart (center 0) */
function createBarChart(games){
  if (barChartInstance) barChartInstance.destroy();
  const ctx = barCanvas.getContext("2d");
  const labels = games.map(g => g.time || "");
  const values = games.map(g => Number(g.score || 0));
  const maxVal = values.length ? Math.max(...values) : 0;
  const minVal = values.length ? Math.min(...values) : 0;
  let maxAbs = Math.max(Math.abs(maxVal), Math.abs(minVal));
  if (maxAbs <= 0) maxAbs = 10; // 最低表示レンジ
  // 色 - 最右が最新（配列は時間昇順なので最後が最新）
  const bg = values.map((_, i) =>
    i === values.length - 1 ? "rgba(255, 206, 86, 0.95)" : "rgba(186, 140, 255, 0.7)"
  );

  barChartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: 'スコア', data: values, backgroundColor: bg }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: -maxAbs * 1.1,
          max: maxAbs * 1.1,
          ticks: { stepSize: Math.ceil((maxAbs*1.1) / 5) }
        }
      }
    }
  });
}

/* rank counts from user's games */
function countRanks(games){
  const keys = ["1","1.5","2","2.5","3","3.5","4"];
  const cnt = {}; keys.forEach(k=>cnt[k]=0);
  games.forEach(g=>{
    if (g.rank==null) return;
    const key = String(g.rank);
    if (cnt[key]!==undefined) cnt[key] += 1;
  });
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

/* pie chart: show 'データなし' slice when total===0 */
function createPieChart(counts){
  const pieCanvas = document.getElementById("pie-chart");
  if (!pieCanvas) {
    console.error("pieCanvas not found!");
    return;
  }
  const ctx = pieCanvas.getContext("2d");
  
  const keys = ["1","1.5","2","2.5","3","3.5","4"];
  const dataArr = keys.map(k => counts[k] || 0);
  const total = dataArr.reduce((a,b)=>a+b,0);

  if (pieChartInstance) {
    pieChartInstance.destroy();
  }

  const colors = [
    "rgba(240,122,122,1)",
    "rgba(240,158,109,1)",
    "rgba(240,217,109,1)",
    "rgba(181,217,109,1)",
    "rgba(109,194,122,1)",
    "rgba(109,194,181,1)",
    "rgba(109,158,217,1)"
  ];

  pieChartInstance = new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["1着","1.5着","2着","2.5着","3着","3.5着","4着"],
      datasets: [{
        data: dataArr,
        backgroundColor: colors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          position: " right",
          labels: { boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: function(context){
              const value = context.raw || 0;
              const pct = total ? ((value / total) * 100).toFixed(1) : 0;
              return `${context.label}: ${value}回 (${pct}%)`;
            }
          }
        }
      }
    }
  });
}