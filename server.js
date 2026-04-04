const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

// Sécurité runtime (évite crash silencieux)
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./db.sqlite');

// =========================
// INIT DB (FULL + SAFE)
// =========================

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pseudo TEXT,
      score INTEGER,
      cartes INTEGER DEFAULT 0,
      stars INTEGER DEFAULT 0,
      comment TEXT DEFAULT '',
      date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      count INTEGER
    )
  `);

  db.run(`INSERT OR IGNORE INTO visits (id, count) VALUES (1, 0)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pseudo TEXT,
      message TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

});

// =========================
// ROUTES
// =========================

// ➜ Ajouter un score
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


// ➜ Récupérer les scores
app.get('/api/scores', (req, res) => {

  db.all(`
    SELECT pseudo, score, cartes, stars, comment, date
    FROM scores
    ORDER BY score DESC
    LIMIT 50
  `, [], (err, rows) => {

    if (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }

    res.json(rows);
  });

});


// ➜ Reset avec scores de démo (FULL DATA)
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
      stars: 2,
      comment: "Aventurière emblématique",
      date: "2024-03-10"
    }
  ];

  db.serialize(() => {

    db.run("DELETE FROM scores", (err) => {

      if (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
      }

      const stmt = db.prepare(`
        INSERT INTO scores (pseudo, score, cartes, stars, comment, date)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      demoScores.forEach((s) => {
        stmt.run(
          s.pseudo,
          s.score,
          s.cartes,
          s.stars,
          s.comment,
          s.date
        );
      });

      stmt.finalize((err) => {

        if (err) {
          console.error(err);
          return res.status(500).json({ error: err.message });
        }

        res.json({
          success: true,
          count: demoScores.length
        });

      });

    });

  });

});


// ➜ Compteur de visites
app.get('/api/visit', (req, res) => {

  db.run("UPDATE visits SET count = count + 1 WHERE id = 1", () => {

    db.get("SELECT count FROM visits WHERE id = 1", (err, row) => {

      if (err) return res.status(500).json({ error: err.message });

      res.json({ count: row.count });

    });

  });

});


// ➜ Avis utilisateurs
app.get('/api/reviews', (req, res) => {

  db.all(`
    SELECT pseudo, message, date
    FROM reviews
    ORDER BY date DESC
    LIMIT 50
  `, [], (err, rows) => {

    if (err) return res.status(500).json({ error: err.message });

    res.json(rows);
  });

});


// =========================
// START SERVER (RENDER OK)
// =========================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
