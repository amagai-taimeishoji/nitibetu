const API_URL = "https://script.google.com/macros/s/AKfycbwSKGnQQgHLZ1RmZ6cE1NKQE9o61813mx3SnuYRyOOnysOLDRmbmVjtzbXdPC4W7b4O/exec";

let barChartInstance = null;
let pieChartInstance = null;

const yearSelect = document.getElementById("year-select");
const monthSelect = document.getElementById("month-select");
const daySelect = document.getElementById("day-select");
const nameInput = document.getElementById("name-input");
const searchBtn = document.getElementById("search-button");
const status = document.getElementById("status-message");
const resultsDiv = document.getElementById("results");

// 年月日プルダウン初期化
const today = new Date();
for (let y=2025; y<=today.getFullYear()+1; y++) {
  const opt = document.createElement("option");
  opt.value = y;
  opt.textContent = y;
  yearSelect.appendChild(opt);
}
yearSelect.value = today.getFullYear();

for (let m=1; m<=12; m++) {
  const opt = document.createElement("option");
  opt.value = m;
  opt.textContent = `${m}月`;
  monthSelect.appendChild(opt);
}
monthSelect.value = today.getMonth()+1;

// 日はとりあえず1〜31
for (let d=1; d<=31; d++) {
  const opt = document.createElement("option");
  opt.value = d;
  opt.textContent = d;
  daySelect.appendChild(opt);
}
daySelect.value = today.getDate();

// 検索ボタン
searchBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const year = yearSelect.value;
  const month = monthSelect.value;
  const day = daySelect.value;

  if (!name) { status.textContent="名前を入力してねっ"; resultsDiv.style.display="none"; return; }

  status.textContent="ロード、チュ…♡";
  resultsDiv.style.display="none";

  try {
    const res = await fetch(`${API_URL}?name=${encodeURIComponent(name)}&year=${year}&month=${month}&date=${year}/${month}/${day}`);
    const data = await res.json();
    if(data.error){
      status.textContent=data.error;
      return;
    }

    status.textContent="";
    resultsDiv.style.display="block";

    document.getElementById("period").textContent=`集計日: ${data.date}`;
    document.getElementById("visitor-count").textContent=`集計人数: ${data.日別成績.半荘数} 人`;
    document.getElementById("member-info").textContent=`${name}`;

    // ランキング
    createTable("ranking-table",[
      ["半荘数","総スコア","最高スコア","平均スコア","平均着順"],
      [
        data.ランキング.半荘数ランキング || "データなし",
        data.ランキング.総スコアランキング || "データなし",
        data.ランキング.最高スコアランキング || "データなし",
        data.ランキング.平均スコアランキング || "データなし",
        data.ランキング.平均着順ランキング || "データなし"
      ]
    ],5);

    // 日別成績
    createTable("scoredata-table",[
      ["半荘数","総スコア","最高スコア","平均スコア","平均着順"],
      [
        `${data.日別成績.半荘数}半荘`,
        `${data.日別成績.総スコア.toFixed(1)}pt`,
        `${data.日別成績.最高スコア.toFixed(1)}pt`,
        `${data.日別成績.平均スコア.toFixed(3)}pt`,
        data.日別成績.平均着順 ? data.日別成績.平均着順.toFixed(3)+"位" : "データなし"
      ]
    ],5);

    // スコアデータ
    const labels = [];
    const scores = [];
    data.スコアデータ.forEach(g => {
      labels.push(g.time);
      scores.push(g.score);
    });
    createTable("tenhan-table",[
      ["時間","スコア"],
      data.スコアデータ.map(g => [`${g.time}`, `${g.score}pt`])
    ],2);
    createBarChart(scores, labels);

    // 円グラフ
    createPieChart(data.rankPieData);

  } catch(e){
    console.error(e);
    status.textContent=`エラー: ${e.message}`;
  }
});

function createTable(id, rows, cols){
  const table=document.getElementById(id);
  table.innerHTML="";
  table.style.gridTemplateColumns=`repeat(${cols}, 18vw)`;
  rows.forEach((row, i) => {
    row.forEach(cell => {
      const div=document.createElement("div");
      div.textContent=cell;
      div.className=i%2===0?"header":"data";
      if(!cell || cell.toString().trim()==="") div.classList.add("empty-cell");
      table.appendChild(div);
    });
  });
}

function createBarChart(scores, labels){
  const ctx=document.getElementById("bar-chart").getContext("2d");
  if(barChartInstance) barChartInstance.destroy();
  barChartInstance=new Chart(ctx,{
    type:"bar",
    data:{
      labels:labels,
      datasets:[{label:"スコア",data:scores, backgroundColor:"rgba(186,140,255,0.7)"}]
    },
    options:{responsive:true, maintainAspectRatio:true}
  });
}

function createPieChart(data){
  const ctx=document.getElementById("pie-chart").getContext("2d");
  if(pieChartInstance) pieChartInstance.destroy();
  pieChartInstance=new Chart(ctx,{
    type:"pie",
    data:{
      labels:["1着","1.5着","2着","2.5着","3着","3.5着","4着"],
      datasets:[{data:Object.values(data).map(v=>v*100), backgroundColor:[
        "rgba(240,122,122,1)","rgba(240,158,109,1)","rgba(240,217,109,1)",
        "rgba(181,217,109,1)","rgba(109,194,122,1)","rgba(109,194,181,1)","rgba(109,158,217,1)"]}]
    },
    options:{responsive:true, maintainAspectRatio:true}
  });
}
