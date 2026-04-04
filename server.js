const express = require('express');
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

// Reset démo
app.post('/api/reset-demo', (req, res) => {

  const demoScores = [
    ["Lucky Luke", 120, 10, 3, "L’homme qui tire plus vite que son ombre", "2024-01-15"],
    ["Billy the Kid", 95, 9, 2, "Hors-la-loi légendaire du Far West", "2024-02-02"],
    ["Calamity Jane", 80, 8, 2, "Aventurière emblématique", "2024-03-10"]
  ];

  db.serialize(() => {

    db.run("DELETE FROM scores", (err) => {
      if (err) return res.status(500).json({ error: err.message });

      const stmt = db.prepare(`
        INSERT INTO scores (pseudo, score, cartes, stars, comment, date)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      demoScores.forEach(row => {
        stmt.run(row);
      });

      stmt.finalize((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, count: demoScores.length });
      });

    });

  });

});

// Compteur visites
app.get('/api/visit', (req, res) => {
  db.run("UPDATE visits SET count = count + 1 WHERE id = 1", () => {
    db.get("SELECT count FROM visits WHERE id = 1", (err, row) => {
      res.json({ count: row.count });
    });
  });
});

// Avis
app.get('/api/reviews', (req, res) => {
  db.all("SELECT pseudo, message, date FROM reviews ORDER BY date DESC LIMIT 50", [], (err, rows) => {
    res.json(rows);
  });
});

// =========================
// START SERVER (RENDER SAFE)
// =========================

app.listen(PORT, '0.0.0.0', () => {
  console.log("Server running on port " + PORT);
});
