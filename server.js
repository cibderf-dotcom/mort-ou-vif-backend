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
// ADMIN - REGENERATE COMMENTS
// =========================

function generateComment(score, seed) {
  function hash(n) {
    let h = 0;
    const str = String(n);
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  const h = hash(seed);

  if (score <= 50) {
    const c = [
      "Même en cliquant au hasard tu fais mieux.",
      "Performance audacieuse… dans le mauvais sens.",
      "On dirait un test de bug.",
      "T’as tenté quelque chose. Mauvaise idée.",
      "Le chaos, mais organisé.",
      "Même le hasard te bat."
    ];
    return c[h % c.length];
  }

  if (score <= 75) {
    const c = [
      "Y avait un plan… abandonné en route.",
      "Pas loin. Mais clairement pas dedans.",
      "Encourageant, mais pas rassurant.",
      "On sent l’effort. Vraiment.",
      "C’est moyen… mais assumé.",
      "Encore un cran à passer."
    ];
    return c[h % c.length];
  }

  if (score <= 90) {
    const c = [
      "Là ça devient solide.",
      "Tu maîtrises le sujet.",
      "Respectable, clairement.",
      "On commence à parler performance.",
      "Propre. Rien à redire.",
      "Tu fais le job."
    ];
    return c[h % c.length];
  }

  if (score <= 95) {
    const c = [
      "Très solide. Presque inquiétant.",
      "On frôle l’élite.",
      "Propre, maîtrisé.",
      "Ça commence à devenir sérieux.",
      "Niveau élevé confirmé.",
      "Tu fais clairement la différence."
    ];
    return c[h % c.length];
  }

  if (score <= 100) {
    const c = [
      "Là on parle d’excellence.",
      "Quasi irréprochable.",
      "Tu surclasses clairement.",
      "C’est du haut niveau.",
      "Très peu de marge d’erreur.",
      "Performance chirurgicale.",
      "On va vérifier les logs, par principe.",
      "Statistiquement très douteux.",
      "Le jeu commence à se poser des questions.",
      "Même le hasard hésite."
    ];
    return c[h % c.length];
  }

  if (score <= 120) {
    const c = [
      "Très au-dessus du lot.",
      "Performance dominante.",
      "Tu écrases clairement.",
      "Niveau élite confirmé.",
      "Le jeu commence à ne plus suivre.",
      "C’est propre. Trop propre."
    ];
    return c[h % c.length];
  }

  if (score <= 150) {
    const c = [
      "Là c’est indécent.",
      "Domination totale.",
      "Tu casses complètement l’équilibrage.",
      "Statistiquement très improbable.",
      "On va vérifier les logs, par principe.",
      "Le jeu doute sérieusement."
    ];
    return c[h % c.length];
  }

  const c = [
    "Score illégal dans 12 pays.",
    "Même le jeu abandonne.",
    "On ne peut plus expliquer ça.",
    "Le serveur transpire fortement.",
    "Y a clairement un problème… mais pas chez toi.",
    "C’est violent. Gratuitement.",
    "On arrête là ou tu continues ?",
    "Même le hasard refuse d’intervenir.",
    "Plus rien n’a de sens.",
    "On dépasse le cadre du jeu."
  ];
  return c[h % c.length];
}

app.post('/admin/regenerate-comments', async (req, res) => {

  try {

    if (DB_TYPE === 'postgres') {

      const result = await pgPool.query(`
        SELECT id, score, cartes
        FROM scores
        WHERE deleted = false
      `);

      console.log("[REGEN] total =", result.rows.length);

      for (const s of result.rows) {

        const seed = `${s.score}_${s.cartes || 0}_${s.id}`;

        const comment = generateComment(s.score, seed);

        await pgPool.query(`
          UPDATE scores
          SET comment = $1
          WHERE id = $2
        `, [comment, s.id]);

      }

      return res.json({ ok: true, updated: result.rows.length });
    }

    return res.status(400).send("postgres only");

  } catch (e) {
    console.error("[REGEN] error", e);
    return res.status(500).json({ error: e.message });
  }
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

  if(!TOKEN){
    console.error("[TELEGRAM] TOKEN missing");
    return;
  }

  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ chat_id:chatId, text:message })
  });
}

app.post("/api/bug", async (req, res) => {
  const msg = req.body.message;

  if (!msg || typeof msg !== "string") {
    return res.status(400).json({ error: "invalid" });
  }

  try {
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!CHAT_ID) {
      console.error("[BUG] CHAT_ID missing");
      return res.status(500).json({ error: "config" });
    }

    await sendTelegramRaw(CHAT_ID, msg);

    res.json({ ok: true });

  } catch (e) {
    console.error("[BUG] send error", e);
    res.status(500).json({ error: "send_failed" });
  }
});


// =========================
// BACKUP SQL (POSTGRES ONLY)
// =========================

app.get('/backup.sql', async (req, res) => {

  if (DB_TYPE !== 'postgres') {
    return res.status(400).send("Postgres only");
  }

  try {
    console.log("[BACKUP] start");

    const result = await pgPool.query("SELECT * FROM scores ORDER BY id");

    let sql = "";

    // STRUCTURE
    sql += `DROP TABLE IF EXISTS scores;
DROP TABLE IF EXISTS maintenance;

CREATE TABLE IF NOT EXISTS maintenance (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  start INTEGER,
  duration INTEGER,
  lastPing INTEGER,
  ended BOOLEAN DEFAULT true
);

INSERT INTO maintenance (id,start,duration,lastPing,ended)
VALUES (1,NULL,NULL,NULL,true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS scores (
  id SERIAL PRIMARY KEY,
  pseudo TEXT,
  score INTEGER,
  cartes INTEGER DEFAULT 0,
  stars INTEGER DEFAULT 0,
  comment TEXT DEFAULT '',
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  mode TEXT DEFAULT 'chrono',
  deleted BOOLEAN DEFAULT false,
  signature TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signature ON scores(signature);
`;

    // DATA
    for (const row of result.rows) {

      const esc = (v) => {
        if (v === null || v === undefined) return "NULL";
        return `'${String(v).replace(/'/g, "''")}'`;
      };

      sql += `INSERT INTO scores (id,pseudo,score,cartes,stars,comment,date,mode,deleted,signature) VALUES(`
        + `${row.id},`
        + `${esc(row.pseudo)},`
        + `${row.score},`
        + `${row.cartes || 0},`
        + `${row.stars || 0},`
        + `${esc(row.comment || '')},`
        + `${esc(row.date)},`
        + `${esc(row.mode)},`
        + `${row.deleted ? 'true' : 'false'},`
        + `${esc(row.signature)}`
        + `);\n`;
    }

    // SEQUENCE
    sql += `\nSELECT setval('scores_id_seq', (SELECT MAX(id) FROM scores));\n`;

    console.log("[BACKUP] generated lines =", result.rows.length);

    res.setHeader('Content-Type', 'text/plain');
    res.send(sql);

  } catch (e) {
    console.error("[BACKUP] error", e);
    res.status(500).send(e.message);
  }
});

// =========================
// SERVER
// =========================

app.listen(PORT, '0.0.0.0', ()=>{
  console.log("Server running on port", PORT);
});
