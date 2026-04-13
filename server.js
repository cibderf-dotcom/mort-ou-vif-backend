const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const ENV = (process.env.APP_ENV || process.env.NODE_ENV || "UNKNOWN").toUpperCase();

const BACKEND_PROD = process.env.BACKEND_PROD;
const BACKEND_PREPROD = process.env.BACKEND_PREPROD;

const db = new sqlite3.Database('./db.sqlite');

db.serialize(function () {

  db.run(`CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT,
    score INTEGER,
    cartes INTEGER DEFAULT 0,
    stars INTEGER DEFAULT 0,
    comment TEXT DEFAULT '',
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    mode TEXT DEFAULT 'chrono'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS maintenance (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    start INTEGER,
    duration INTEGER,
    lastPing INTEGER,
    ended INTEGER DEFAULT 1
  )`);

  db.run(`INSERT OR IGNORE INTO maintenance (id, ended) VALUES (1, 1)`);
});

// =========================
// ROUTES SCORES
// =========================

app.get('/api/scores', (req,res)=>{
  db.all("SELECT * FROM scores ORDER BY score DESC LIMIT 50", [], (err, rows)=>{
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/scores', (req,res)=>{

  const s = req.body;

  console.log("[POST SCORE]", s);

  if(!s || !s.pseudo || s.score === undefined){
    console.warn("[POST SCORE] invalid payload");
    return res.status(400).json({error:"invalid"});
  }

  db.run(
    "INSERT INTO scores (pseudo, score, cartes, stars, date, mode) VALUES (?,?,?,?,?,?)",
    [
      s.pseudo,
      s.score,
      s.cartes || 0,
      s.stars || 0,
      s.date || new Date().toISOString(),
      s.mode || "chrono"
    ],
    function(err){
      if(err){
        console.error("[POST SCORE] DB error", err);
        return res.status(500).json({error:err.message});
      }

      console.log("[POST SCORE] inserted id=", this.lastID);

      try{

        const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        const msg =
`Nouveau score [${ENV}]
${s.date || new Date().toISOString()}
${s.pseudo}
Score: ${s.score}
Cartes: ${s.cartes || 0}
Étoiles: ${s.stars || 0}
Mode: ${s.mode || "chrono"}`;

        console.log("[TELEGRAM] sending score", msg);

       sendTelegramRaw(CHAT_ID, msg).catch(e => {
  console.error("[TELEGRAM] async error", e);
});

      }catch(e){
        console.error("[TELEGRAM] error", e);
      }

      res.json({ok:true, id:this.lastID});
    }
  );

});

app.get('/api/hof/count', (req,res)=>{
  db.get("SELECT COUNT(DISTINCT pseudo) as count FROM scores", [], (err,row)=>{
    if(err) return res.status(500).json({ error: err.message });
    res.json({ count: row.count || 0 });
  });
});

// =========================
// 🔥 RAZ
// =========================

app.post('/api/raz', (req, res)=>{

  console.log("[RAZ] request");

  db.run("DELETE FROM scores", function(err){

    if(err){
      console.error("[RAZ] delete error", err);
      return res.status(500).send("error");
    }

    console.log("[RAZ] table cleared, deleted =", this.changes);

    const demo = [
      ["Doc Holliday", 92, 40, 0, "zen"],
      ["Calamity Jane", 88, 35, 0, "chrono"],
      ["Matt", 91, 52, 0, "zen"],
      ["Vivi", 89, 22, 1, "chrono"]
    ];

    let inserted = 0;

    demo.forEach((d) => {

      db.run(
        "INSERT INTO scores (pseudo, score, cartes, stars, mode) VALUES (?,?,?,?,?)",
        d,
        function(err){

          if(err){
            console.error("[RAZ] insert error", err);
            return;
          }

          inserted++;

          console.log("[RAZ] inserted id=", this.lastID);

          if(inserted === demo.length){

            db.get("SELECT COUNT(*) as count FROM scores", [], function(e,row){

              if(e){
                console.error("[RAZ] count error", e);
                return res.status(500).send("error");
              }

              console.log("[RAZ] final count =", row.count);

              return res.send("OK");
            });

          }

        }
      );

    });

  });

});

// =========================
// MAINTENANCE
// =========================

app.get('/api/maintenance-status', (req,res)=>{

  db.get("SELECT * FROM maintenance WHERE id=1", [], (err,row)=>{

    if(err) return res.status(500).json({ error: err.message });

    if(!row || !row.start || row.ended){
      return res.json({ active:false });
    }

    const now = Date.now();
    const remaining = row.duration - (now - row.start);

    if(remaining <= 0 && !row.ended){

      db.run("UPDATE maintenance SET ended=1 WHERE id=1");

      sendMaintenanceEndChoices();

      return res.json({ active:false });
    }

    res.json({
      active:true,
      start:row.start,
      duration:row.duration,
      remaining: remaining > 0 ? remaining : 0
    });

  });

});

// =========================
// TELEGRAM HELPERS
// =========================

async function sendTelegramRaw(chatId, message){
  console.log("[TELEGRAM][ENV RAW]", {
    APP_ENV: process.env.APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
    ENV
  });
console.log("[TELEGRAM][FINAL TAG]", `[${ENV}]`);
  const TOKEN = process.env.TELEGRAM_TOKEN;
  if(!TOKEN) return;

  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ chat_id:chatId, text:message })
  });
}

async function sendTelegramWithKeyboard(chatId, text, keyboard){

  const TOKEN = process.env.TELEGRAM_TOKEN;

  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      chat_id:chatId,
      text,
      reply_markup:{ inline_keyboard:keyboard }
    })
  });
}

async function sendMaintenanceEndChoices(){

  const TOKEN = process.env.TELEGRAM_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: `[${ENV}] Maintenance terminée. Action ?`,
      reply_markup:{
        inline_keyboard:[
          [
            { text:"🔁 Relancer la maintenance", callback_data:"restart_"+ENV },
            { text:"🌐 Réactiver le site", callback_data:"resume_"+ENV }
          ]
        ]
      }
    })
  });
}

// =========================
// SERVER
// =========================

app.listen(PORT, '0.0.0.0', ()=>{
  console.log("Server running on port", PORT);
});
