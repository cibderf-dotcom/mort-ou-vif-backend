const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./db.sqlite');

// Init DB
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT,
    score INTEGER,
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
});

db.run(`CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT,
  score INTEGER,
  cartes INTEGER,
  stars INTEGER,
  comment TEXT,
  date DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run("ALTER TABLE scores ADD COLUMN cartes INTEGER");
db.run("ALTER TABLE scores ADD COLUMN stars INTEGER");
db.run("ALTER TABLE scores ADD COLUMN comment TEXT");

// Routes

// Score
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

app.get('/api/scores', (req, res) => {
  db.all("SELECT pseudo, score, date FROM scores ORDER BY score DESC LIMIT 50", [], (err, rows) => {
    res.json(rows);
  });
});

// Visits
app.get('/api/visit', (req, res) => {
  db.run("UPDATE visits SET count = count + 1 WHERE id = 1", () => {
    db.get("SELECT count FROM visits WHERE id = 1", (err, row) => {
      res.json({ count: row.count });
    });
  });
});

app.post("/api/reset-demo", (req, res) => {

  const demoScores = [
    {
      pseudo: "Lucky Luke",
      score: 120,
      cartes: 10,
      stars: 3,
      date: "2024-01-15",
      comment: "L’homme qui tire plus vite que son ombre"
    },
    {
      pseudo: "Billy the Kid",
      score: 95,
      cartes: 9,
      stars: 2,
      date: "2024-02-02",
      comment: "Hors-la-loi légendaire du Far West"
    },
    {
      pseudo: "Calamity Jane",
      score: 80,
      cartes: 8,
      stars: 2,
      date: "2024-03-10",
      comment: "Aventurière emblématique"
    }
  ];

  scores.length = 0;
  scores.push(...demoScores);

  res.json({ success: true, count: scores.length });
});

app.get('/api/reviews', (req, res) => {
  db.all("SELECT pseudo, message, date FROM reviews ORDER BY date DESC LIMIT 50", [], (err, rows) => {
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
