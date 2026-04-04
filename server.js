const express = require('express');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT,
    score INTEGER,
    cartes INTEGER,
    stars INTEGER,
    comment TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    count INTEGER
  )`);

  db.run(`INSERT OR IGNORE INTO visits (id, count) VALUES (1, 0)`);

  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT,
    message TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Ajout colonnes si besoin (safe)
  db.run("ALTER TABLE scores ADD COLUMN cartes INTEGER", ()=>{});
  db.run("ALTER TABLE scores ADD COLUMN stars INTEGER", ()=>{});
  db.run("ALTER TABLE scores ADD COLUMN comment TEXT", ()=>{});
});

// =========================
// ROUTES
// =========================

// Ajouter score
app.post('/api/score', (req, res) => {
  const { pseudo, score, cartes, stars, comment } = req.body;

  if (!pseudo || typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  const stmt = db.prepare(`
    INSERT INTO scores (pseudo, score, cartes, stars, comment)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    pseudo.substring(0, 20),
    score,
    cartes || 0,
    stars || 0,
    comment || ""
  );

  stmt.finalize();

  res.json({ success: true });
});

// Récupérer scores
app.get('/api/scores', (req, res) => {
  db.all(`
    SELECT pseudo, score, cartes, stars, comment, date
    FROM scores
    ORDER BY score DESC
    LIMIT 50
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Reset avec scores de démo
app.post('/api/reset-demo', (req, res) => {

  const demoScores = [
    {
      pseudo: "Lucky Luke",
      score: 120,
      cartes: 10,
      stars: 3,
      comment: "L’homme qui tire plus vite que son ombre",
      date: "2024-01-15"
    },
    {
      pseudo: "Billy the Kid",
      score: 95,
      cartes: 9,
      stars: 2,
      comment: "Hors-la-loi légendaire du Far West",
      date: "2024-02-02"
    },
    {
      pseudo: "Calamity Jane",
      score: 80,
      cartes: 8,
});
