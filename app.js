const API_URL = "https://script.google.com/macros/s/AKfycbwSKGnQQgHLZ1RmZ6cE1NKQE9o61813mx3SnuYRyOOnysOLDRmbmVjtzbXdPC4W7b4O/exec"; // デプロイしたGAS WebアプリのURL

const yearSelect = document.getElementById("year-select");
const monthSelect = document.getElementById("month-select");
const daySelect = document.getElementById("day-select");
const current = new Date();
for(let y=2025;y<=current.getFullYear()+1;y++){
  const opt = document.createElement("option"); opt.value=y; opt.textContent=y; yearSelect.appendChild(opt);
}
yearSelect.value = current.getFullYear();
for(let m=1;m<=12;m++){
  const opt = document.createElement("option"); opt.value=m; opt.textContent=`${m}月`; monthSelect.appendChild(opt);
}
monthSelect.value = current.getMonth()+1;

function populateDays(){
  daySelect.innerHTML = "";
  const y = Number(yearSelect.value);
  const m = Number(monthSelect.value);
  const lastDay = new Date(y,m,0).getDate();
  for(let d=1;d<=lastDay;d++){
    const opt = document.createElement("option"); opt.value=d; opt.textContent=`${d}日`; daySelect.appendChild(opt);
  }
  daySelect.value = current.getDate();
}
yearSelect.addEventListener("change",populateDays);
monthSelect.addEventListener("change",populateDays);
populateDays();

let barChartInstance = null;
let pieChartInstance = null;

document.getElementById("search-button").addEventListener("click", async ()=>{
  const name = document.getElementById("name-input").value.trim();
  const year = yearSelect.value;
  const month = monthSelect.value;
  const day = daySelect.value;
  const status = document.getElementById("status-message");
  const results = document.getElementById("results");

  if(!name){ status.textContent="名前を入力してねっ"; results.style.display="none"; return; }

  status.textContent="ロード、チュ…♡"; results.style.display="none";

  try{
    const res = await fetch(`${API_URL}?name=${encodeURIComponent(name)}&year=${year}&month=${month}&date=${year}/${month}/${day}`);
    const data = await res.json();
    if(data.error){ status.textContent=data.error; return; }

    status.textContent=""; results.style.display="block";

    // 集計期間と人数
    document.getElementById("period").textContent=`日付: ${data.date}`;
    document.getElementById("visitor-count").textContent=`集計人数: ${data.ランキング ? Object.keys(data.ランキング).length : "不明"} 人`;
    document.getElementById("member-info").textContent=`No. ?   ${data.name}`;

    // ランキング
    createTable("ranking-table",[
      ["半荘数","総スコア","最高スコア","平均スコア","平均着順"],
      [
        data.ランキング.半荘数ランキング,
        data.ランキング.総スコアランキング,
        data.ランキング.最高スコアランキング,
        data.ランキング.平均スコアランキング,
        data.ランキング.平均着順ランキング
      ]
    ],5);

    // 日別成績
    createTable("score-summary-table",[
      ["半荘数","総スコア","最高スコア","平均スコア","平均着順"],
      [
        `${data.日別成績.半荘数}半荘`,
        `${data.日別成績.総スコア}pt`,
        `${data.日別成績.最高スコア}pt`,
        `${data.日別成績.平均スコア.toFixed(3)}pt`,
        data.日別成績.平均着順 ? data.日別成績.平均着順.toFixed(3)+"位" : "なし"
      ]
    ],5);

    // スコアデータ
    const scoreRows = [["時刻","スコア"]];
    data.スコアデータ.forEach(g=>{
      scoreRows.push([g.time, g.score]);
    });
    createTable("scoredata-table",scoreRows,2);

    // 棒グラフ
    const scoresForChart = data.スコアデータ.map(g=>g.score);
    createBarChart(scoresForChart);

    // 円グラフ
    createPieChart(data.rankPieData);

  }catch(e){
    status.textContent=`エラー: ${e.message}`;
  }
});

function createTable(id,rows,cols){
  const table = document.getElementById(id);
  table.innerHTML="";
  table.style.gridTemplateColumns=`repeat(${cols},18vw)`;
  rows.forEach((row,rowIndex)=>{
    row.forEach(cell=>{
      const div=document.createElement("div");
      div.textContent = cell;
      div.className = rowIndex===0 ? "header" : "data";
      if(!cell||cell.toString().trim()==="") div.classList.add("empty-cell");
      table.appendChild(div);
    });
  });
}

function createBarChart(scores){
  const ctx = document.getElementById("bar-chart").getContext("2d");
  if(barChartInstance) barChartInstance.destroy();
  barChartInstance = new Chart(ctx,{
    type:"bar",
    data:{labels:scores.map((_,i)=>i+1), datasets:[{label:"スコア", data:scores, backgroundColor:"rgba(186,140,255,0.7)"}]},
    options:{responsive:true, maintainAspectRatio:true}
  });
}

function createPieChart(data){
  const ctx = document.getElementById("pie-chart").getContext("2d");
  if(pieChartInstance) pieChartInstance.destroy();
  pieChartInstance = new Chart(ctx,{
    type:"pie",
    data:{
      labels:["1着率","1.5着率","2着率","2.5着率","3着率","3.5着率","4着率"],
      datasets:[{data:Object.values(data), backgroundColor:["#FF6384","#FF9F40","#FFCD56","#4BC0C0","#36A2EB","#9966FF","#C9CBCF"]}]
    },
    options:{responsive:true, maintainAspectRatio:true}
  });
}

