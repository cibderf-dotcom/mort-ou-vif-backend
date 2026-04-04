const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./db.sqlite');

// INIT DB

db.serialize(function () {

  db.run("CREATE TABLE IF NOT EXISTS scores (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "pseudo TEXT," +
    "score INTEGER," +
    "cartes INTEGER DEFAULT 0," +
    "stars INTEGER DEFAULT 0," +
    "comment TEXT DEFAULT ''," +
    "date DATETIME DEFAULT CURRENT_TIMESTAMP" +
  ")");

  db.run("CREATE TABLE IF NOT EXISTS visits (" +
    "id INTEGER PRIMARY KEY CHECK (id = 1)," +
    "count INTEGER" +
  ")");

  db.run("INSERT OR IGNORE INTO visits (id, count) VALUES (1, 0)");

  db.run("CREATE TABLE IF NOT EXISTS reviews (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "pseudo TEXT," +
    "message TEXT," +
    "date DATETIME DEFAULT CURRENT_TIMESTAMP" +
  ")");

});

// HEALTH CHECK
app.get('/', function (req, res) {
  res.send('OK');
});

// ADD SCORE
app.post('/api/score', function (req, res) {

  const pseudo = req.body.pseudo;
  const score = req.body.score;
  const cartes = req.body.cartes || 0;
  const stars = req.body.stars || 0;
  const comment = req.body.comment || "";

  if (!pseudo || typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  const stmt = db.prepare(
    "INSERT INTO scores (pseudo, score, cartes, stars, comment) VALUES (?, ?, ?, ?, ?)"
  );

  stmt.run(pseudo.substring(0, 20), score, cartes, stars, comment);

  stmt.finalize();

  res.json({ success: true });
});

// GET SCORES
app.get('/api/scores', function (req, res) {

  db.all(
    "SELECT pseudo, score, cartes, stars, comment, date FROM scores ORDER BY score DESC LIMIT 50",
    [],
    function (err, rows) {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );

});

// RESET DEMO
app.post('/api/reset-demo', function (req, res) {

  const demoScores = [
    ["Lucky Luke", 120, 10, 3, "L’homme qui tire plus vite que son ombre", "2024-01-15"],
    ["Billy the Kid", 95, 9, 2, "Hors-la-loi légendaire du Far West", "2024-02-02"],
    ["Calamity Jane", 80, 8, 2, "Aventurière emblématique", "2024-03-10"]
  ];
});
