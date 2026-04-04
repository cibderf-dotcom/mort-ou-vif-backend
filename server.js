const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./db.sqlite');

// INIT DB

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT,
    score INTEGER,
    cartes INTEGER DEFAULT 0,
    stars INTEGER DEFAULT 0,
    comment TEXT DEFAULT "",
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

// ROUTES

app.post('/api/score', (req, res) => {
  const { pseudo, score, cartes, stars, comment } = req.body;

  if (!pseudo || typeof score !== 'number' || score < 0) {
    return res.status(400).json({ error: 'Invalid data' });
  }
});
