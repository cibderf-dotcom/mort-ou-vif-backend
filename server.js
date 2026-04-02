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

// Routes

// Score
app.post('/api/score', (req, res) => {
  const { pseudo, score } = req.body;

  if (!pseudo || typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  const stmt = db.prepare("INSERT INTO scores (pseudo, score) VALUES (?, ?)");
  stmt.run(pseudo.substring(0, 20), score);
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

// Reviews
app.post('/api/review', (req, res) => {
  const { pseudo, message } = req.body;

  if (!pseudo || !message || message.length > 300) {
    return res.status(400).json({ error: 'Invalid data' });
  }

  const stmt = db.prepare("INSERT INTO reviews (pseudo, message) VALUES (?, ?)");
  stmt.run(pseudo.substring(0, 20), message.substring(0, 300));
  stmt.finalize();

  res.json({ success: true });
});

app.get('/api/reviews', (req, res) => {
  db.all("SELECT pseudo, message, date FROM reviews ORDER BY date DESC LIMIT 50", [], (err, rows) => {
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
