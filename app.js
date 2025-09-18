const API_URL = "https://script.google.com/macros/s/AKfycbxemord3DscGoR00gVdOWLtq28_26Hv6ejWIE8vhqNgjiQmEExKueZj-z3o4zJ-k_Zy/exec";

let barChartInstance = null;
let pieChartInstance = null;

document.getElementById("search-button").addEventListener("click", async()=>{
  const name = document.getElementById("name-input").value.trim();
  const dateInput = document.getElementById("date-input").value; // yyyy-mm-dd
  const status = document.getElementById("status-message");
  const results = document.getElementById("results");

  if(!name || !dateInput){
    status.textContent="日付と名前を入力してねっ";
    results.style.display="none";
    return;
  }

  status.textContent="ロード、チュ…♡";
  results.style.display="none";

  // 日付を「yyyy年M月d日」に変換
  const dateObj = new Date(dateInput);
  const dateStr = `${dateObj.getFullYear()}年${dateObj.getMonth()+1}月${dateObj.getDate()}日`;

  try {
    const res = await fetch(`${API_URL}?name=${encodeURIComponent(name)}&year=${dateObj.getFullYear()}&month=${dateObj.getMonth()+1}&date=${encodeURIComponent(dateStr)}`);
    if(!res.ok) throw new Error(`HTTPエラー ${res.status}`);
    const data = await res.json();
    if(data.error){
      status.textContent = data.error;
      return;
    }

    status.textContent="";
    results.style.display="block";

    // 日付・名前
    document.getElementById("date-display").textContent = data.date;
    document.getElementById("member-info").textContent = data.name;

    // 日別成績
    createTable("stats-table",[
      ["半荘数","総スコア","最高スコア","平均スコア","平均着順"],
      [
        data.日別成績.半荘数,
        data.日別成績.総スコア,
        data.日別成績.最高スコア,
        data.日別成績.平均スコア,
        data.日別成績.平均着順
      ]
    ],5);

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

    // スコアデータ
    const scoreRows = data.スコアデータ.map(g=>[g.time, g.score]);
    createTable("score-table",[["時間","スコア"], ...scoreRows],2);

    // 棒グラフ
    createBarChart(data.スコアデータ);

    // 円グラフ
    createPieChart(data.rankPieData);

  }catch(err){
    console.error(err);
    status.textContent=`成績更新チュ♡今は見れません (${err.message})`;
  }
});

// 汎用テーブル作成
function createTable(id, rows, cols){
  const table = document.getElementById(id);
  table.innerHTML="";
  table.style.gridTemplateColumns = `repeat(${cols}, auto)`;
  rows.forEach(row=>{
    row.forEach(cell=>{
      const div = document.createElement("div");
      div.textContent = cell;
      table.appendChild(div);
    });
  });
}

// 棒グラフ
function createBarChart(scores){
  const ctx = document.getElementById("bar-chart").getContext("2d");
  if(barChartInstance) barChartInstance.destroy();
  const labels = scores.map(g=>g.time);
  const dataValues = scores.map(g=>g.score);
  barChartInstance = new Chart(ctx,{
    type:"bar",
    data:{labels, datasets:[{label:"スコア", data:dataValues, backgroundColor:"rgba(186,140,255,0.7)"}]},
    options:{responsive:true, maintainAspectRatio:true}
  });
}

// 円グラフ
function createPieChart(data){
  const ctx = document.getElementById("pie-chart").getContext("2d");
  if(pieChartInstance) pieChartInstance.destroy();
  pieChartInstance = new Chart(ctx,{
    type:"pie",
    data:{
      labels:Object.keys(data),
      datasets:[{data:Object.values(data), backgroundColor:[
        "rgba(240,122,122,1)","rgba(240,158,109,1)","rgba(240,217,109,1)",
        "rgba(181,217,109,1)","rgba(109,194,122,1)","rgba(109,194,181,1)","rgba(109,158,217,1)"]}]
    },
    options:{responsive:true, maintainAspectRatio:true}
  });
}





