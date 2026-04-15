const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const DB_TYPE = process.env.DB_TYPE || 'sqlite';

let pgPool = null;

if (DB_TYPE === 'postgres') {

  if(!process.env.DATABASE_URL){
    console.error("[DB] DATABASE_URL manquant");
    process.exit(1); // stop propre
  }

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  console.log("[DB] PostgreSQL mode actif");
} else {
  console.log("[DB] SQLite mode actif");
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const ENV = (process.env.APP_ENV || process.env.NODE_ENV || "UNKNOWN").toUpperCase();

const BACKEND_PROD = process.env.BACKEND_PROD;
const BACKEND_PREPROD = process.env.BACKEND_PREPROD;

// =========================
// TIME PARIS (AJOUT)
// =========================
function nowParis(){
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', 'T');
}

const db = new sqlite3.Database('/var/data/db.sqlite');

db.serialize(function () {

  db.run(`CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT,
    score INTEGER,
    cartes INTEGER DEFAULT 0,
    stars INTEGER DEFAULT 0,
    comment TEXT DEFAULT '',
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    mode TEXT DEFAULT 'chrono',
    deleted INTEGER DEFAULT 0,
    signature TEXT
  )`);

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_signature ON scores(signature)`);

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

app.get('/api/scores', async (req,res)=>{

  if(DB_TYPE === 'postgres'){
    try{
      console.log("[PG] GET /api/scores");

      const result = await pgPool.query(
        "SELECT * FROM scores WHERE deleted = false ORDER BY score DESC LIMIT 50"
      );

      console.log("[PG] rows =", result.rows.length);

      return res.json(result.rows);

    }catch(e){
      console.error("[PG] error", e);
      return res.status(500).json({ error: e.message });
    }
  }

  // SQLite fallback (inchangé)
  db.all("SELECT * FROM scores WHERE deleted = 0 ORDER BY score DESC LIMIT 50", [], (err, rows)=>{
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });

});

app.post('/api/scores', async (req,res)=>{

  const s = req.body;

  console.log("[POST SCORE]", s);

  if(!s || !s.pseudo || s.score === undefined){
    console.warn("[POST SCORE] invalid payload");
    return res.status(400).json({error:"invalid"});
  }

  const signature = [
    s.pseudo,
    s.score,
    s.cartes || 0,
    s.stars || 0,
    s.mode || "chrono"
  ].join("|");

  // =========================
  // POSTGRESQL
  // =========================
  if(DB_TYPE === 'postgres'){
    try{

      const existing = await pgPool.query(
        "SELECT id, deleted FROM scores WHERE signature = $1",
        [signature]
      );

      if(existing.rows.length > 0){
        const row = existing.rows[0];

        if(row.deleted){
          console.log("[PG] restoring id=", row.id);

          await pgPool.query(
            "UPDATE scores SET deleted = false WHERE id = $1",
            [row.id]
          );

          return res.json({ok:true, restored:true});

        } else {
          console.log("[PG] duplicate ignored id=", row.id);
          return res.json({ok:true, duplicate:true});
        }
      }

      const result = await pgPool.query(
        `INSERT INTO scores 
        (pseudo, score, cartes, stars, comment, date, mode, deleted, signature)
        VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8)
        RETURNING id`,
        [
          s.pseudo,
          s.score,
          s.cartes || 0,
          s.stars || 0,
          s.comment || '',
          s.date || nowParis(),
          s.mode || "chrono",
          signature
        ]
      );

      console.log("[PG] inserted id=", result.rows[0].id);

      return res.json({ok:true, id: result.rows[0].id});

    }catch(e){
      console.error("[PG] insert error", e);
      return res.status(500).json({error:e.message});
    }
  }

  // =========================
  // SQLITE (fallback inchangé)
  // =========================
  db.get(
    "SELECT id, deleted FROM scores WHERE signature = ?",
    [signature],
    (err, row) => {

      if(err){
        console.error("[POST SCORE] select error", err);
        return res.status(500).json({error:err.message});
      }

      if(row){
        if(row.deleted){
          db.run(
            "UPDATE scores SET deleted = 0 WHERE id = ?",
            [row.id],
            function(e){
              if(e) return res.status(500).json({error:e.message});
              return res.json({ok:true, restored:true});
            }
          );
        } else {
          return res.json({ok:true, duplicate:true});
        }
        return;
      }

      db.run(
        "INSERT INTO scores (pseudo, score, cartes, stars, date, mode, signature) VALUES (?,?,?,?,?,?,?)",
        [
          s.pseudo,
          s.score,
          s.cartes || 0,
          s.stars || 0,
          s.date || nowParis(),
          s.mode || "chrono",
          signature
        ],
        function(err){
          if(err){
            return res.status(500).json({error:err.message});
          }
          res.json({ok:true, id:this.lastID});
        }
      );

    }
  );

});

// =========================
// DELETE (soft)
// =========================

app.delete('/api/score/:id', (req, res) => {

  const id = req.params.id;

  console.log("[DELETE SCORE] id =", id);

  db.run("UPDATE scores SET deleted = 1 WHERE id = ?", [id], function(err){

    if(err){
      console.error("[DELETE SCORE] error", err);
      return res.status(500).json({ error: err.message });
    }

    console.log("[DELETE SCORE] soft deleted =", this.changes);

    res.json({ ok:true, deleted:this.changes });
  });

});

// =========================
// RESTORE (optionnel)
// =========================

app.post('/api/score/:id/restore', (req,res)=>{
  db.run("UPDATE scores SET deleted = 0 WHERE id = ?", [req.params.id], function(err){
    if(err) return res.status(500).json({ error: err.message });
    res.json({ ok:true });
  });
});

app.get('/api/hof/count', (req,res)=>{
  db.get("SELECT COUNT(DISTINCT pseudo) as count FROM scores WHERE deleted = 0", [], (err,row)=>{
    if(err) return res.status(500).json({ error: err.message });
    res.json({ count: row.count || 0 });
  });
});

// =========================
// RAZ
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
      ["Doc Holliday", 92, 40, 2, "zen", "Rapide comme l'éclair"],
      ["Calamity Jane", 88, 35, 2, "chrono", "Toujours solide"],
      ["Matt", 91, 52, 3, "zen", "Merci pour les tests"],
      ["Matt", 99, 117, 5, "zen", "Shériff de la ville (mais a testé la triche)"],
      ["Vivi", 89, 22, 1, "chrono", "Belle remontée"]
    ];

    let inserted = 0;

    demo.forEach((d) => {

      const signature = [
        d[0],
        d[1],
        d[2],
        d[3],
        d[4]
      ].join("|");

      db.run(
        "INSERT INTO scores (pseudo, score, cartes, stars, mode, comment, signature) VALUES (?,?,?,?,?,?,?)",
        [d[0], d[1], d[2], d[3], d[4], d[5], signature],
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
// TELEGRAM
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

// =========================
// SERVER
// =========================

app.listen(PORT, '0.0.0.0', ()=>{
  console.log("Server running on port", PORT);
});
