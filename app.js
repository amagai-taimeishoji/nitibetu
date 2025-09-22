// -------------------------
// Google Script の URL
// -------------------------
const GAS_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // ここをあなたの URL に置き換える

// -------------------------
// DOM 要素取得
// -------------------------
const nameInput = document.getElementById("nameInput");
const searchBtn = document.getElementById("searchBtn");
const dateSelect = document.getElementById("dateSelect");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const updateStatusEl = document.getElementById("updateStatus");
const loadingEl = document.getElementById("loading");

// 各表示用の要素
const rankingTable = document.getElementById("rankingTable");
const scoreTable = document.getElementById("scoreTable");
const gameListEl = document.getElementById("gameList");
const barChartEl = document.getElementById("barChart");
const orderTable = document.getElementById("orderTable");
const pieChartEl = document.getElementById("pieChart");

// -------------------------
// 日付プルダウン初期化（10月1日〜30日、曜日固定）
// -------------------------
const weekdays = ["(火)","(水)","(木)","(金)","(土)","(日)","(月)"]; // 例、固定
for (let i = 1; i <= 30; i++) {
  const option = document.createElement("option");
  const dayOfWeek = weekdays[(i-1) % 7];
  option.value = `2025/10/${i.toString().padStart(2,"0")}`;
  option.textContent = `10月${i}${dayOfWeek}`;
  dateSelect.appendChild(option);
}

// -------------------------
// ローディング表示
// -------------------------
function showLoading() {
  loadingEl.style.display = "block";
}

function hideLoading() {
  loadingEl.style.display = "none";
}

// -------------------------
// データ取得関数
// -------------------------
async function fetchData() {
  const name = nameInput.value.trim();
  const date = dateSelect.value;

  if (!name) return;

  showLoading();
  try {
    const res = await fetch(`${GAS_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}`);
    const data = await res.json();
    hideLoading();
    renderData(data);
  } catch (err) {
    hideLoading();
    alert("データ取得エラー：" + err.message);
  }
}

// -------------------------
// データ描画関数
// -------------------------
function renderData(data) {
  // -------------------------
  // 更新状況
  // -------------------------
  updateStatusEl.textContent = data.updateStatus || "";

  // -------------------------
  // 日別ランキング（5項目）その人の順位のみ
  // -------------------------
  const rankingFields = [
    { key: "半荘数", title: "累計半荘数ランキング" },
    { key: "総スコア", title: "総スコアランキング" },
    { key: "最高スコア", title: "最高スコアランキング" },
    { key: "平均スコア", title: "平均スコアランキング" },
    { key: "平均着順", title: "平均着順ランキング" }
  ];

  // ランキング計算
  const rankings = {};
  rankingFields.forEach(f => {
    const arr = data.all.slice();
    if (f.key === "平均着順") {
      arr.sort((a,b) => a[f.key] - b[f.key]); // 小さい方が上位
    } else {
      arr.sort((a,b) => b[f.key] - a[f.key]); // 大きい方が上位
    }
    const index = arr.findIndex(p => p.name === data.name);
    rankings[f.key] = index >= 0 ? index + 1 : "-";
  });

  // ランキング表描画
  rankingTable.innerHTML = "";
  const tr1 = document.createElement("tr");
  const tr2 = document.createElement("tr");
  rankingFields.forEach(f => {
    const th = document.createElement("th");
    th.textContent = f.title;
    tr1.appendChild(th);
    const td = document.createElement("td");
    td.textContent = rankings[f.key];
    tr2.appendChild(td);
  });
  rankingTable.appendChild(tr1);
  rankingTable.appendChild(tr2);

  // -------------------------
  // 日別スコアデータ表（5項目）
  // -------------------------
  scoreTable.innerHTML = "";
  const tr3 = document.createElement("tr");
  const tr4 = document.createElement("tr");
  rankingFields.forEach(f => {
    const th = document.createElement("th");
    th.textContent = f.key;
    tr3.appendChild(th);
    const td = document.createElement("td");
    const val = data.summary[f.key];
    if (f.key === "半荘数") td.textContent = val + "半荘";
    else if (f.key === "総スコア" || f.key === "最高スコア") td.textContent = val.toFixed(1) + "pt";
    else td.textContent = val.toFixed(3) + (f.key==="平均着順"?"着":"pt");
    tr4.appendChild(td);
  });
  scoreTable.appendChild(tr3);
  scoreTable.appendChild(tr4);

  // -------------------------
  // ゲームリスト（時系列）
  // -------------------------
  gameListEl.innerHTML = "";
  const sortedGames = data.games.slice().sort((a,b) => a.time.localeCompare(b.time));
  sortedGames.forEach((g,i) => {
    const div = document.createElement("div");
    div.className = "gameCard";
    div.textContent = `${i+1}  ${g.time}  ${g.score.toFixed(1)}pt  ${g.rank}着`;
    gameListEl.appendChild(div);
  });

  // -------------------------
  // 棒グラフ（中心0）
  // -------------------------
  renderBarChart(sortedGames);

  // -------------------------
  // 着順データ表と円グラフ
  // -------------------------
  renderOrderTableAndPie(data.games);
}

// -------------------------
// 棒グラフ描画
// -------------------------
function renderBarChart(games) {
  barChartEl.innerHTML = "";
  const max = Math.max(...games.map(g=>Math.abs(g.score)),1);
  games.forEach(g => {
    const div = document.createElement("div");
    div.className = "bar";
    const h = (Math.abs(g.score)/max)*100;
    div.style.height = h + "%";
    div.style.backgroundColor = g.score >=0 ? "green":"red";
    barChartEl.appendChild(div);
  });
}

// -------------------------
// 着順表と円グラフ描画
// -------------------------
function renderOrderTableAndPie(games) {
  const counts = {
    "1":0,"2":0,"3":0,"4":0,
    "1.5":0,"2.5":0,"3.5":0
  };
  games.forEach(g=>{ counts[g.rank]+=1; });
  // テーブル
  orderTable.innerHTML="";
  const tr1 = document.createElement("tr");
  ["1着","2着","3着","4着"].forEach(t=>{
    const th = document.createElement("th");
    th.textContent = t;
    tr1.appendChild(th);
  });
  const tr2 = document.createElement("tr");
  ["1","2","3","4"].forEach(r=>{
    const td = document.createElement("td");
    td.textContent = counts[r];
    tr2.appendChild(td);
  });
  const tr3 = document.createElement("tr");
  ["1.5着","2.5着","3.5着"].forEach(t=>{
    const th = document.createElement("th");
    th.textContent = t;
    tr3.appendChild(th);
  });
  const tr4 = document.createElement("tr");
  ["1.5","2.5","3.5"].forEach(r=>{
    const td = document.createElement("td");
    td.textContent = counts[r];
    tr4.appendChild(td);
  });
  orderTable.appendChild(tr1);
  orderTable.appendChild(tr2);
  orderTable.appendChild(tr3);
  orderTable.appendChild(tr4);

  // 円グラフ（簡易）
  pieChartEl.innerHTML="";
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  Object.keys(counts).forEach(k=>{
    const div = document.createElement("div");
    div.className="pieSegment";
    div.style.flex = counts[k]/total;
    div.style.backgroundColor = k.includes(".5") ? "#888" : "#555";
    pieChartEl.appendChild(div);
  });
}

// -------------------------
// イベント
// -------------------------
searchBtn.addEventListener("click", fetchData);
prevBtn.addEventListener("click",()=>{
  const cur = dateSelect.selectedIndex;
  if(cur>0){
    dateSelect.selectedIndex = cur-1;
    fetchData();
  }
});
nextBtn.addEventListener("click",()=>{
  const cur = dateSelect.selectedIndex;
  if(cur<dateSelect.options.length-1){
    dateSelect.selectedIndex = cur+1;
    fetchData();
  }
});
dateSelect.addEventListener("change", fetchData);