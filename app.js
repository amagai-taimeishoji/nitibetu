let barChartInstance = null;
let pieChartInstance = null;

const API_URL = "https://script.google.com/macros/s/AKfycbxq6zDK7Dkcmew5dHvj6bVr0kJLWnT0Ef75NEW6UASAU2gYWMt4Yr4eMKUAU28cOrSQ/exec"; // ここにGAS URL

const nameInput = document.getElementById("name-input");
const dateInput = document.getElementById("date-input");
const prevBtn = document.getElementById("prev-day");
const nextBtn = document.getElementById("next-day");
const updateStatusEl = document.getElementById("update-status");

const visitorCountEl = document.getElementById("visitor-count");
const totalGamesEl = document.getElementById("total-games");
const memberInfoEl = document.getElementById("member-info");

const rankingTable = document.getElementById("ranking-table");
const scoredataTable = document.getElementById("scoredata-table");
const gamesList = document.getElementById("games-list");
const rankCountTable = document.getElementById("rank-count-table");

const loadingContainer = document.getElementById("loading-container");

const today = new Date();
let currentDate = new Date();
if (today.getHours() < 20) {
  currentDate.setDate(today.getDate() - 1);
}
dateInput.value = currentDate.toISOString().split("T")[0];

function setButtonState() {
  const d = new Date(dateInput.value);
  prevBtn.disabled = d.getDate() === 1;
  nextBtn.disabled = d.getDate() === 30;
}

setButtonState();

prevBtn.addEventListener("click",()=>{ changeDate(-1); });
nextBtn.addEventListener("click",()=>{ changeDate(1); });
dateInput.addEventListener("change",()=>{ loadData(); });

function changeDate(offset){
  const d = new Date(dateInput.value);
  d.setDate(d.getDate() + offset);
  dateInput.value = d.toISOString().split("T")[0];
  setButtonState();
  loadData();
}

async function loadData(){
  const name = nameInput.value.trim();
  if(!name) return;

  loadingContainer.style.display = "flex";

  try{
    const res = await fetch(`${API_URL}?name=${encodeURIComponent(name)}&date=${dateInput.value}`);
    if(!res.ok) throw new Error(res.statusText);
    const data = await res.json();

    updateStatusEl.textContent = data.updateStatus || "";

    visitorCountEl.textContent = `集計人数: ${data.all.length}人`;
    totalGamesEl.textContent = `総ゲーム数: ${data.summary?.半荘数||0}半荘`;

    memberInfoEl.textContent = `No. ${String(data.no||"0000").padStart(4,"0")} ${data.name}`;

    // ランキング
    createTable(rankingTable,[["累計半荘数","総スコア","最高スコア","平均スコア","平均着順"],
      [getRank(data.all,"半荘数",data.name),
       getRank(data.all,"総スコア",data.name),
       getRank(data.all,"最高スコア",data.name),
       getRank(data.all,"平均スコア",data.name),
       getRank(data.all,"平均着順",data.name)]]);

    // スコアデータ
    createTable(scoredataTable,[["累計半荘数","総スコア","最高スコア","平均スコア","平均着順"],
      [
        `${data.summary?.半荘数||0}半荘`,
        `${(data.summary?.総スコア||0).toFixed(1)}pt`,
        `${(data.summary?.最高スコア||0).toFixed(1)}pt`,
        `${(data.summary?.平均スコア||0).toFixed(3)}pt`,
        `${(data.summary?.平均着順||0).toFixed(3)}位`
      ]
    ]);

    // 棒グラフ
    createBarChart(data.games.map(g=>g.score));

    // ゲームリスト
    gamesList.innerHTML = "";
    data.games.sort((a,b)=>a.time.localeCompare(b.time)).forEach((g,i)=>{
      const div = document.createElement("div");
      div.textContent = `${i+1}️⃣ ${g.time} ${g.score.toFixed(1)}pt ${g.rank}着`;
      gamesList.appendChild(div);
    });

    // 着順テーブル
    createTable(rankCountTable,[["1着","2着","3着","4着"],
      [data.rankCounts?.["1"]||0,data.rankCounts?.["2"]||0,data.rankCounts?.["3"]||0,data.rankCounts?.["4"]||0],
      ["1.5着","2.5着","3.5着",""],
      [data.rankCounts?.["1.5"]||0,data.rankCounts?.["2.5"]||0,data.rankCounts?.["3.5"]||0,""]]);

    // 円グラフ
    createPieChart(data.rankCounts);

  }catch(e){
    console.error(e);
    alert("読み込みエラー");
  }finally{
    loadingContainer.style.display = "none";
  }
}

// 汎用テーブル作成
function createTable(container,rowArray){
  container.innerHTML = "";
  container.style.gridTemplateColumns = `repeat(${rowArray[0].length}, 18vw)`;
  rowArray.forEach((row,rIndex)=>{
    row.forEach(cell=>{
      const div=document.createElement("div");
      div.textContent = cell;
      div.className = rIndex===0?"header":"data";
      container.appendChild(div);
    });
  });
}

// all からランキング取得
function getRank(all,key,name){
  const sorted = [...all].sort((a,b)=>{
    if(key==="平均着順") return a[key]-b[key];
    return b[key]-a[key];
  });
  return sorted.findIndex(x=>x.name===name)+1;
}

// 棒グラフ
function createBarChart(scores){
  const ctx = document.getElementById("bar-chart").getContext("2d");
  if(barChartInstance) barChartInstance.destroy();
  barChartInstance = new Chart(ctx,{
    type:"bar",
    data:{
      labels:scores.map((_,i)=>i+1),
      datasets:[{
        label:"スコア",
        data:scores,
        backgroundColor:scores.map(s=>s>=0?"#4caf50":"#f44336")
      }]
    },
    options:{
      responsive:true,
      animation:false,
      scales:{
        y:{beginAtZero:true}
      }
    }
  });
}

// 円グラフ
function createPieChart(rankCounts){
  const ctx = document.getElementById("pie-chart").getContext("2d");
  if(pieChartInstance) pieChartInstance.destroy();
  pieChartInstance = new Chart(ctx,{
    type:"pie",
    data:{
      labels:["1着","2着","3着","4着"],
      datasets:[{
        data:[
          rankCounts?.["1"]||0,
          rankCounts?.["2"]||0,
          rankCounts?.["3"]||0,
          rankCounts?.["4"]||0
        ],
        backgroundColor:["#4caf50","#2196f3","#ff9800","#f44336"]
      }]
    },
    options:{
      responsive:true,
      animation:false
    }
  });
}

// 初期ロード
loadData();