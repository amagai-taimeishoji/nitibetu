
const API_URL = "https://script.google.com/macros/s/AKfycbyOSqhXbaUfuCRmgjSPSYyWUHucACWuBNUv1p5ncynkiY-FmpSCJPgwHzhDfA3yEsHS/exec";

// 初期UI要素
const yearSelect = document.getElementById("year-select");
const monthSelect = document.getElementById("month-select");
const daySelect = document.getElementById("day-select");
const nameInput = document.getElementById("name-input");
const searchButton = document.getElementById("search-button");
const status = document.getElementById("status-message");
const results = document.getElementById("results");

const today = new Date();
for (let y = 2025; y <= today.getFullYear() + 2; y++) {
  const o = document.createElement("option"); o.value = y; o.textContent = y; yearSelect.appendChild(o);
}
yearSelect.value = today.getFullYear();
for (let m = 1; m <= 12; m++) {
  const o = document.createElement("option"); o.value = m; o.textContent = m + "月"; monthSelect.appendChild(o);
}
monthSelect.value = today.getMonth() + 1;
populateDays();
yearSelect.addEventListener("change", populateDays);
monthSelect.addEventListener("change", populateDays);

function populateDays(){
  daySelect.innerHTML = "";
  const y = Number(yearSelect.value);
  const m = Number(monthSelect.value);
  const last = new Date(y, m, 0).getDate();
  for (let d=1; d<=last; d++){
    const o = document.createElement("option"); o.value = d; o.textContent = d + "日"; daySelect.appendChild(o);
  }
  daySelect.value = today.getDate();
}

// チャートインスタンス
let barChart = null;
let pieChart = null;

searchButton.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name) { status.textContent = "名前を入力してねっ"; results.style.display = "none"; return; }

  const year = yearSelect.value, month = monthSelect.value, day = daySelect.value;
  status.textContent = "ロード、チュ…♡";
  results.style.display = "none";

  try {
    const url = `${API_URL}?name=${encodeURIComponent(name)}&year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}&day=${encodeURIComponent(day)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15秒タイムアウト
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("HTTPエラー " + res.status);
    const data = await res.json();
    if (data.error) {
      status.textContent = data.error;
      return;
    }

    // 表示
    status.textContent = "";
    results.style.display = "block";
    document.getElementById("period").textContent = `日付: ${data.date}`;
    document.getElementById("visitor-count").textContent = `集計人数: ${data.集計人数} 人`;
    document.getElementById("member-info").textContent = `No. -   ${data.name}`;

    // ランキングテーブル（2行5列）
    createGrid("ranking-table", [
      ["半荘数ランキング","総スコアランキング","最高スコアランキング","平均スコアランキング","平均着順ランキング"],
      [
        data.ランキング.半荘数ランキング ?? "データなし",
        data.ランキング.総スコアランキング ?? "データなし",
        data.ランキング.最高スコアランキング ?? "データなし",
        data.ランキング.平均スコアランキング ?? "データなし",
        data.ランキング.平均着順ランキング ?? "データなし"
      ]
    ], 5);

    // 日別成績（2行5列）
    const jd = data.日別成績;
    createGrid("score-summary", [
      ["半荘数","総スコア","最高スコア","平均スコア","平均着順"],
      [
        jd.半荘数 ? `${jd.半荘数}半荘` : "データなし",
        typeof jd.総スコア === "number" ? `${jd.総スコア.toFixed(1)}pt` : "データなし",
        typeof jd.最高スコア === "number" ? `${jd.最高スコア.toFixed(1)}pt` : "データなし",
        typeof jd.平均スコア === "number" ? `${jd.平均スコア.toFixed(3)}pt` : "データなし",
        typeof jd.平均着順 === "number" ? `${jd.平均着順.toFixed(3)}位` : "データなし"
      ]
    ],5);

    // スコアデータ（時間順に左→右。上限10件を表示）
    const scoreRows = [["時間","スコア","着順"]];
    const scoresForChart = [];
    const labelsForChart = [];
    data.スコアデータ.slice(0, 10).forEach(g=>{
      scoreRows.push([g.time || ""," ( " + (typeof g.score === "number" ? g.score.toFixed(1) + "pt":"データなし") + " )", g.rank!==undefined && g.rank!==null ? `着順 ${g.rank}` : "着順不明"]);
      labelsForChart.push(g.time || "");
      scoresForChart.push(typeof g.score === "number" ? g.score : 0);
    });
    createGrid("score-list", scoreRows, 3);

    // 棒グラフ
    createBarChart(scoresForChart, labelsForChart);

    // 着順回数テーブル（4列4行: 1,2,3,4 と 1.5,2.5,3.5）
    // 表示は簡易版（空セル非表示）
    createGrid("rank-count-table", [
      ["1着の回数","2着の回数","3着の回数","4着の回数"],
      [
        `${Math.round((data.rankPieData["1着率"]||0) * (data.日別成績.半荘数||1))}回`,
        `${Math.round((data.rankPieData["2着率"]||0) * (data.日別成績.半荘数||1))}回`,
        `${Math.round((data.rankPieData["3着率"]||0) * (data.日別成績.半荘数||1))}回`,
        `${Math.round((data.rankPieData["4着率"]||0) * (data.日別成績.半荘数||1))}回`
      ],
      ["1.5着の回数","2.5着の回数","3.5着の回数",""],
      [
        `${Math.round((data.rankPieData["1.5着率"]||0) * (data.日別成績.半荘数||1))}回`,
        `${Math.round((data.rankPieData["2.5着率"]||0) * (data.日別成績.半荘数||1))}回`,
        `${Math.round((data.rankPieData["3.5着率"]||0) * (data.日別成績.半荘数||1))}回`,
        ""
      ]
    ],4);

    // 円グラフ
    createPieChart(data.rankPieData);

  } catch (err) {
    console.error(err);
    if (err.name === "AbortError") status.textContent = "タイムアウトしました（ネットワークが遅いかGASが重いです）";
    else status.textContent = `ロード失敗: ${err.message || err}`;
  }
});

function createGrid(id, rows, cols) {
  const cont = document.getElementById(id);
  cont.innerHTML = "";
  cont.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 16vw))`;
  rows.forEach((row, ri) => {
    // row can be 1D or array-of-arrays for many rows
    if (!Array.isArray(row)) return;
    row.forEach(cell => {
      const div = document.createElement("div");
      div.textContent = (cell === null || cell === undefined) ? "" : cell;
      div.className = ri === 0 ? "header" : "data";
      if (!cell || cell.toString().trim() === "") div.classList.add("empty-cell");
      cont.appendChild(div);
    });
  });
}

function createBarChart(values, labels) {
  const ctx = document.getElementById("bar-chart").getContext("2d");
  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels.length ? labels : values.map((_,i)=>i+1), datasets: [{ label: 'スコア', data: values, backgroundColor: 'rgba(186,140,255,0.8)' }] },
    options: { responsive:true, maintainAspectRatio:false }
  });
}

function createPieChart(pieData) {
  const ctx = document.getElementById("pie-chart").getContext("2d");
  if (pieChart) pieChart.destroy();
  const labels = ["1着率","1.5着率","2着率","2.5着率","3着率","3.5着率","4着率"];
  const values = labels.map(l => (pieData && pieData[l]) ? pieData[l]*100 : 0);
  pieChart = new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data: values, backgroundColor: ["#f06","#f9a","#fc6","#6c9","#39a","#96f","#c9c"] }] },
    options: { responsive:true, maintainAspectRatio:false }
  });
}

