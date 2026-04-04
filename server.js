const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./db.sqlite');

// =========================
// INIT DB
// =========================

db.serialize(function () {
db.run("ALTER TABLE scores ADD COLUMN cartes INTEGER DEFAULT 0", function(){});
db.run("ALTER TABLE scores ADD COLUMN stars INTEGER DEFAULT 0", function(){});
db.run("ALTER TABLE scores ADD COLUMN comment TEXT DEFAULT ''", function(){});
  db.run(
    "CREATE TABLE IF NOT EXISTS scores (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "pseudo TEXT," +
    "score INTEGER," +
    "cartes INTEGER DEFAULT 0," +
    "stars INTEGER DEFAULT 0," +
    "comment TEXT DEFAULT ''," +
    "date DATETIME DEFAULT CURRENT_TIMESTAMP" +
    ")"
  );

  db.run(
    "CREATE TABLE IF NOT EXISTS visits (" +
    "id INTEGER PRIMARY KEY CHECK (id = 1)," +
    "count INTEGER" +
    ")"
  );

  db.run("INSERT OR IGNORE INTO visits (id, count) VALUES (1, 0)");

  db.run(
    "CREATE TABLE IF NOT EXISTS reviews (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "pseudo TEXT," +
    "message TEXT," +
    "date DATETIME DEFAULT CURRENT_TIMESTAMP" +
    ")"
  );

});

// =========================
// ROUTES
// =========================

// Health check
app.get('/', function (req, res) {
  res.send('OK');
});

// Add score
app.post('/api/score', function (req, res) {

  var pseudo = req.body.pseudo;
  var score = req.body.score;
  var cartes = req.body.cartes || 0;
  var stars = req.body.stars || 0;
  var comment = req.body.comment || "";

  if (!pseudo || typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  var stmt = db.prepare(
    "INSERT INTO scores (pseudo, score, cartes, stars, comment) VALUES (?, ?, ?, ?, ?)"
  );

  stmt.run(pseudo.substring(0, 20), score, cartes, stars, comment);
  stmt.finalize();

  res.json({ success: true });
});

// Get scores
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

// Reset demo (CORRIGÉ)
app.post('/api/reset-demo', function (req, res) {

  var demoScores = [
    ["Lucky Luke", 120, 10, 3, "L’homme qui tire plus vite que son ombre", "2024-01-15"],
    ["Billy the Kid", 95, 9, 2, "Hors-la-loi légendaire du Far West", "2024-02-02"],
    ["Calamity Jane", 80, 8, 2, "Aventurière emblématique", "2024-03-10"]
  ];

  db.serialize(function () {

    db.run("DELETE FROM scores", function (err) {

      if (err) return res.status(500).json({ error: err.message });

      var stmt = db.prepare(
        "INSERT INTO scores (pseudo, score, cartes, stars, comment, date) VALUES (?, ?, ?, ?, ?, ?)"
      );

      demoScores.forEach(function (row) {
        stmt.run(row[0], row[1], row[2], row[3], row[4], row[5]);
      });

      stmt.finalize(function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, count: demoScores.length });
      });

    });

  });

});

// Visits
app.get('/api/visit', function (req, res) {

  db.run("UPDATE visits SET count = count + 1 WHERE id = 1", function () {
    db.get("SELECT count FROM visits WHERE id = 1", function (err, row) {
      res.json({ count: row.count });
    });
  });

});

// Reviews
app.get('/api/reviews', function (req, res) {

  db.all(
    "SELECT pseudo, message, date FROM reviews ORDER BY date DESC LIMIT 50",
    [],
    function (err, rows) {
      res.json(rows);
    }
  );

});

// START
app.listen(PORT, '0.0.0.0', function () {
  console.log('Server running on port ' + PORT);
});
