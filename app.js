const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // GASデプロイURLを入れる
let currentDate = null;
let currentMonth = null;

// チャート保持
let scoreChartInstance = null;
let rankPieChartInstance = null;

// 初期処理
window.onload = () => {
  const today = new Date();
  currentMonth = today.getMonth(); // 月を保存
  // 初期日付は20時まで前日、それ以降は当日
  if (today.getHours() < 20) today.setDate(today.getDate() - 1);
  currentDate = formatDate(today);

  document.getElementById("dateInput").value = currentDate;
  updateNavButtons();

  document.getElementById("searchBtn").addEventListener("click", fetchData);
  document.getElementById("prevDay").addEventListener("click", () => changeDate(-1));
  document.getElementById("nextDay").addEventListener("click", () => changeDate(1));
};

function fetchData() {
  const name = document.getElementById("nameInput").value.trim();
  if (!name) {
    alert("名前を入力してください");
    return;
  }
  const date = document.getElementById("dateInput").value;

  showLoading(true);

  fetch(`${API_URL}?name=${encodeURIComponent(name)}&date=${date}`)
    .then(res => res.json())
    .then(data => {
      showLoading(false);
      renderData(data);
    })
    .catch(err => {
      showLoading(false);
      alert("データ取得エラー: " + err.message);
    });
}

function renderData(data) {
  // 更新状況
  document.getElementById("updateStatus").textContent = data.updateStatus;

  // 集計情報
  document.getElementById("totalPlayers").textContent = data.all.length;
  document.getElementById("totalGames").textContent =
    data.all.reduce((sum, p) => sum + p.半荘数, 0);

  // ランキング
  renderRanking(data);

  // スコアサマリー
  renderScoreSummary(data);

  // ゲームと棒グラフ
  renderGames(data);

  // 着順データ
  renderRankData(data);
}

function renderRanking(data) {
  const rankingTable = document.getElementById("rankingTable");
  rankingTable.innerHTML = `
    <tr>
      <th>累計半荘数ランキング</th>
      <th>総スコアランキング</th>
      <th>最高スコアランキング</th>
      <th>平均スコアランキング</th>
      <th>平均着順ランキング</th>
    </tr>
    <tr>
      <td>${getRank(data, "半荘数")}位</td>
      <td>${getRank(data, "総スコア")}位</td>
      <td>${getRank(data, "最高スコア")}位</td>
      <td>${getRank(data, "平均スコア")}位</td>
      <td>${getRank(data, "平均着順", true)}位</td>
    </tr>`;
}

function getRank(data, key, smallerIsBetter = false) {
  const arr = data.all.filter(p => p.半荘数 > 0);
  arr.sort((a, b) =>
    smallerIsBetter ? a[key] - b[key] : b[key] - a[key]
  );
  const idx = arr.findIndex(p => p.name === data.name);
  return idx >= 0 ? idx + 1 : "-";
}

function renderScoreSummary(data) {
  const s = data.summary;
  const table = document.getElementById("scoreSummaryTable");
  table.innerHTML = `
    <tr>
      <th>累計半荘数</th>
      <th>総スコア</th>
      <th>最高スコア</th>
      <th>平均スコア</th>
      <th>平均着順</th>
    </tr>
    <tr>
      <td>${s.半荘数} 半荘</td>
      <td>${s.総スコア.toFixed(1)} pt</td>
      <td>${s.最高スコア.toFixed(1)} pt</td>
      <td>${s.平均スコア.toFixed(3)} pt</td>
      <td>${s.平均着順.toFixed(3)} 着</td>
    </tr>`;
}

function renderGames(data) {
  const list = document.getElementById("gamesList");
  list.innerHTML = "";
  data.games.sort((a, b) => a.time.localeCompare(b.time));
  data.games.forEach((g, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1} ${g.time} ${g.score}pt ${g.rank}着`;
    list.appendChild(li);
  });

  // 棒グラフ
  const ctx = document.getElementById("scoreChart").getContext("2d");
  if (scoreChartInstance) scoreChartInstance.destroy();
  scoreChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.games.map((g, i) => `${i + 1}`),
      datasets: [{
        label: "スコア",
        data: data.games.map(g => g.score),
        backgroundColor: "#4CAF50"
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderRankData(data) {
  const counts = {1:0,2:0,3:0,4:0,"1.5":0,"2.5":0,"3.5":0};
  data.games.forEach(g => {
    if (counts[g.rank] !== undefined) counts[g.rank]++;
  });

  const table = document.getElementById("rankCountTable");
  table.innerHTML = `
    <tr><th>1着の回数</th><th>2着の回数</th><th>3着の回数</th><th>4着の回数</th></tr>
    <tr><td>${counts[1]}</td><td>${counts[2]}</td><td>${counts[3]}</td><td>${counts[4]}</td></tr>
    <tr><th>1.5着の回数</th><th>2.5着の回数</th><th>3.5着の回数</th><th></th></tr>
    <tr><td>${counts["1.5"]}</td><td>${counts["2.5"]}</td><td>${counts["3.5"]}</td><td></td></tr>
  `;

  const ctx = document.getElementById("rankPieChart").getContext("2d");
  if (rankPieChartInstance) rankPieChartInstance.destroy();
  rankPieChartInstance = new Chart(ctx, {
    type: "pie",
    data: {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ["#ff6666","#66b3ff","#99ff99","#ffcc99","#c266ff","#ff99c2","#66ffcc"]
      }]
    }
  });
}

function changeDate(offset) {
  const d = new Date(document.getElementById("dateInput").value);
  d.setDate(d.getDate() + offset);
  if (d.getMonth() !== currentMonth) return; // 月を跨がない
  document.getElementById("dateInput").value = formatDate(d);
  updateNavButtons();
  fetchData();
}

function updateNavButtons() {
  const d = new Date(document.getElementById("dateInput").value);
  const prevBtn = document.getElementById("prevDay");
  const nextBtn = document.getElementById("nextDay");

  prevBtn.style.display = d.getDate() === 1 ? "none" : "inline-block";
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  nextBtn.style.display = d.getDate() === lastDay ? "none" : "inline-block";
}

function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "block" : "none";
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const day = ("0" + d.getDate()).slice(-2);
  return `${y}-${m}-${day}`;
}