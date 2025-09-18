// =====================
// スプレッドシートID設定
// =====================
const SPREADSHEET_ID = "https://script.google.com/macros/s/AKfycbyTsGKw1iVwcxk2Ri4InCJwtdJuYijKb8G2D8fLpWdfyKaPpcSL4MvkW_7J2g5sQRfw/exec"; 

// Webアプリ用
function doGet(e) {
  const name = e.parameter.name;
  const year = e.parameter.year;
  const month = e.parameter.month;
  const dateStr = e.parameter.date; // "2025/10/18" 形式

  if (!name || !year || !month || !dateStr) {
    return ContentService.createTextOutput(JSON.stringify({error:"パラメータ不足"})).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetName = `${year}年${month}月入力`;
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("指定した月のシートが存在しません");

    // B列：名前（8:1017）
    const names = sheet.getRange("B8:B1017").getValues().flat();
    const rowIndex = names.findIndex(n => n === name);
    if (rowIndex === -1) throw new Error("名前が見つかりません");

    const lastCol = sheet.getLastColumn();

    // 1行目:日付、2行目:開始時刻
    const headerDates = sheet.getRange(1,3,1,lastCol-2).getValues()[0];
    const startTimes = sheet.getRange(2,3,1,lastCol-2).getValues()[0];

    // 8:1017行 スコア
    const scoresData = sheet.getRange(8,3,1010,lastCol-2).getValues();

    // 1024:1032 着順
    const rankRows = sheet.getRange(1024,3,9,lastCol-2).getValues();

    // 対象日付列を抽出
    const targetCols = [];
    headerDates.forEach((d,colIdx)=>{
      if(!d) return;
      const dStr = Utilities.formatDate(new Date(d), Session.getScriptTimeZone(), "yyyy/MM/dd");
      if(dStr === dateStr) targetCols.push(colIdx);
    });
    if(targetCols.length===0) throw new Error("その日のゲームは存在しません");

    // 名前1人分のゲームデータ
    const games = targetCols.map(c=>{
      const score = scoresData[rowIndex][c];
      const time = startTimes[c] ? Utilities.formatDate(new Date(startTimes[c]), Session.getScriptTimeZone(), "HH:mm:ss") : "";
      return {time, score};
    });

    // 日別成績
    const halfCount = games.length;
    const totalScore = games.reduce((a,b)=>a+b.score,0);
    const highestScore = Math.max(...games.map(g=>g.score));
    const avgScore = totalScore / halfCount;

    // 平均着順
    const personRanks = [];
    targetCols.forEach(c=>{
      for(let r=0;r<rankRows.length;r+=2){
        const rank = rankRows[r][c];
        const rankName = rankRows[r+1][c];
        if(rankName===name && typeof rank==="number") personRanks.push(rank);
      }
    });
    const avgRank = personRanks.length>0 ? personRanks.reduce((a,b)=>a+b,0)/personRanks.length : null;

    // 全員分ランキング
    const allStats = names.map((n,idx)=>{
      const personScores = targetCols.map(c=>scoresData[idx][c]||0);
      const half = personScores.filter(s=>s!==0).length;
      const total = personScores.reduce((a,b)=>a+b,0);
      const high = Math.max(...personScores);
      const avg = half>0 ? total/half : 0;

      const ranks = targetCols.map(c=>{
        for(let r=0;r<rankRows.length;r+=2){
          if(rankRows[r+1][c]===n) return rankRows[r][c];
        }
        return null;
      }).filter(x=>x!==null);
      const avgR = ranks.length>0? ranks.reduce((a,b)=>a+b,0)/ranks.length : null;
      return {name:n, half, total, high, avg, avgRank: avgR};
    });

    function calcRank(statArr,key){
      const sorted = [...statArr].sort((a,b)=>b[key]-a[key]);
      const rankMap={};
      sorted.forEach((p,i)=>rankMap[p.name]=i+1);
      return rankMap[name] || null;
    }

    const rankings = {
      半荘数ランキング: calcRank(allStats,"half"),
      総スコアランキング: calcRank(allStats,"total"),
      最高スコアランキング: calcRank(allStats,"high"),
      平均スコアランキング: calcRank(allStats,"avg"),
      平均着順ランキング: calcRank(allStats,"avgRank")
    };

    // 円グラフ用着順
    const rankCounts = {"1着率":0,"1.5着率":0,"2着率":0,"2.5着率":0,"3着率":0,"3.5着率":0,"4着率":0};
    personRanks.forEach(r=>{
      if(r===1) rankCounts["1着率"]+=1;
      else if(r===1.5) rankCounts["1.5着率"]+=1;
      else if(r===2) rankCounts["2着率"]+=1;
      else if(r===2.5) rankCounts["2.5着率"]+=1;
      else if(r===3) rankCounts["3着率"]+=1;
      else if(r===3.5) rankCounts["3.5着率"]+=1;
      else if(r===4) rankCounts["4着率"]+=1;
    });
    const totalRanks = personRanks.length || 1;
    for(const k in rankCounts) rankCounts[k] /= totalRanks;

    const result = {
      year, month, date: dateStr, name,
      日別成績:{
        半荘数: halfCount,
        総スコア: totalScore,
        最高スコア: highestScore,
        平均スコア: parseFloat(avgScore.toFixed(3)),
        平均着順: avgRank ? parseFloat(avgRank.toFixed(3)) : null
      },
      ランキング: rankings,
      スコアデータ: games,
      rankPieData: rankCounts
    };

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);

  } catch(err){
    return ContentService.createTextOutput(JSON.stringify({error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}
