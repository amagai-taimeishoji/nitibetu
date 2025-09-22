const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // GASの公開URLを設定
const MIN_DATE = "2025-10-01";
const MAX_DATE = "2025-10-30";

// 初期設定
window.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  let initDate = new Date(today);
  if (today.getHours() < 20) initDate.setDate(today.getDate() - 1);

  const dateInput = document.getElementById("dateInput");
  dateInput.min = MIN_DATE;
  dateInput.max = MAX_DATE;
  dateInput.value = formatDate(initDate);

  document.getElementById("searchBtn").addEventListener("click", search);
  document.getElementById("prevBtn").addEventListener("click", () => shiftDate(-1));
  document.getElementById("nextBtn").addEventListener("click", () => shiftDate(1));

  updateNavButtons();
});

// 日付フォーマット
function formatDate(d) {
  return d.toISOString().split("T")[0];
}

// 前日・翌日
function shiftDate(offset) {
  const dateInput = document.getElementById("dateInput");
  let d = new Date(dateInput.value);
  d.setDate(d.getDate() + offset);
  dateInput.value = formatDate(d);
  updateNavButtons();
  search();
}

// ナビゲーションボタン制御
function updateNavButtons() {
  const dateInput = document.getElementById("dateInput");
  document.getElementById("prevBtn").style.display =
    dateInput.value === MIN_DATE ? "none" : "inline-block";
  document.getElementById("nextBtn").style.display =
    dateInput.value === MAX_DATE ? "none" : "inline-block";
}

// 検索処理
async function search() {
  const name = document.getElementById("nameInput").value.trim();
  const date = document.getElementById("dateInput").value.replace(/-/g, "/");
  if (!name) return alert("名前を入力してください");

  document.getElementById("loading").style.display = "block";
  document.getElementById("resultArea").style.display = "none";

  try {
    const res = await fetch(`${SCRIPT_URL}?name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}`);
    const data = await res.json();
    renderAll(data);
  } catch (err) {
    alert("エラー: " + err.message);
  } finally {
    document.getElementById("loading").style.display = "none";
    document.getElementById("resultArea").style.display = "block";
  }
}

// 表示レンダリング
function renderAll(data) {
  // 更新状況
  document.getElementById("updateStatus").textContent = data.updateStatus || "";

  // 集計人数・総ゲーム数
  document.getElementById("totalPlayers").textContent = data.all.length;
  document.getElementById("totalGames").textContent =
    data.all.reduce((sum, p) => sum + (p.半荘数 || 0), 0);

  // ランキング
  renderRankingTable(data);

  // スコアデータ
  renderScoreTable(data);

  // ゲームリスト & グラフ
  renderGames(data);

  // 着順データ
  renderRankData(data);
}

// ランキング表
function renderRankingTable(data) {
  const categories = [
    ["累計半荘数", "半荘数"],
    ["総スコア", "総スコア"],
    ["最高スコア", "最高スコア"],
    ["平均スコア", "平均スコア"],
    ["平均着順", "平均着順"]
  ];
  const table = document.getElementById("dailyRankingTable");
  table.innerHTML = "";
  let tr1 = document.createElement("tr");
  let tr2 = document.createElement("tr");

  categories.forEach(([label, key]) => {
    let th = document.createElement("th");
    th.textContent = label + "ランキング";
    tr1.appendChild(th);

    let td = document.createElement("td");
    td.textContent = getRank(data.all, data.name, key, key === "平均着順" ? "asc" : "desc") + "位";
    tr2.appendChild(td);
  });

  table.appendChild(tr1);
  table.appendChild(tr2);
}

// 順位計算
function getRank(all, name, key, order = "desc") {
  let arr = [...all].sort((a, b) => {
    let va = a[key] || 0, vb = b[key] || 0;
    return order === "asc" ? va - vb : vb - va;
  });
  return arr.findIndex(p => p.name === name) + 1;
}

// スコアデータ表
function renderScoreTable(data) {
  const categories = [
    ["累計半荘数", "半荘数", "半荘"],
    ["総スコア", "総スコア", "pt"],
    ["最高スコア", "最高スコア", "pt"],
    ["平均スコア", "平均スコア", "pt"],
    ["平均着順", "平均着順", "着"]
  ];
  const table = document.getElementById("dailyScoreTable");
  table.innerHTML = "";
  let tr1 = document.createElement("tr");
  let tr2 = document.createElement("tr");

  categories.forEach(([label, key, unit]) => {
    let th = document.createElement("th");
    th.textContent = label;
    tr1.appendChild(th);

    let td = document.createElement("td");
    td.textContent = (data.summary[key] || 0).toFixed(3).replace(/\.000$/, "") + unit;
    tr2.appendChild(td);
  });

  table.appendChild(tr1);
  table.appendChild(tr2);
}

// ゲームデータ
function renderGames(data) {
  const ul = document.getElementById("gameList");
  ul.innerHTML = "";
  data.games.forEach((g, i) => {
    let li = document.createElement("li");
    li.textContent = `${i + 1}. ${g.time || ""}  ${g.score}pt  ${g.rank}着`;
    ul.appendChild(li);
  });

  const ctx = document.getElementById("scoreChart").getContext("2d");
  if (window.scoreChart) window.scoreChart.destroy();
  window.scoreChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.games.map((g, i) => `#${i + 1}`),
      datasets: [{
        label: "スコア",
        data: data.games.map(g => g.score),
        backgroundColor: data.games.map(g => g.score >= 0 ? "#66ccff" : "#ff9999")
      }]
    },
    options: {
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

// 着順データ
function renderRankData(data) {
  const counts = {};
  data.games.forEach(g => {
    if (!g.rank) return;
    counts[g.rank] = (counts[g.rank] || 0) + 1;
  });

  const table = document.getElementById("rankCountTable");
  table.innerHTML = "";
  let row1 = document.createElement("tr");
  let row2 = document.createElement("tr");
  ["1着","2着","3着","4着"].forEach((t, i) => {
    row1.appendChild(Object.assign(document.createElement("th"), {textContent: t+"の回数"}));
    row2.appendChild(Object.assign(document.createElement("td"), {textContent: (counts[i+1]||0)+"回"}));
  });
  table.appendChild(row1);
  table.appendChild(row2);

  let row3 = document.createElement("tr");
  let row4 = document.createElement("tr");
  ["1.5着","2.5着","3.5着"].forEach((t, i) => {
    let val = counts[i+1.5] || 0;
    row3.appendChild(Object.assign(document.createElement("th"), {textContent: t+"の回数"}));
    row4.appendChild(Object.assign(document.createElement("td"), {textContent: val+"回"}));
  });
  table.appendChild(row3);
  table.appendChild(row4);

  const ctx = document.getElementById("rankPie").getContext("2d");
  if (window.rankPie) window.rankPie.destroy();
  window.rankPie = new Chart(ctx, {
    type: "pie",
    data: {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ["#ff9999","#66ccff","#99ff99","#ffcc66","#ccccff","#ffccff","#99cccc"]
      }]
    }
  });
}