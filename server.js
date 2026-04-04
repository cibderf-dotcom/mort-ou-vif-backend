const express = require('express');
    if (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }

    res.json(rows);
  });
});

// Reset demo (CORRIGÉ)
app.post('/api/reset-demo', (req, res) => {

  const demoScores = [
    ["Lucky Luke", 120, 10, 3, "L’homme qui tire plus vite que son ombre", "2024-01-15"],
    ["Billy the Kid", 95, 9, 2, "Hors-la-loi légendaire du Far West", "2024-02-02"],
    ["Calamity Jane", 80, 8, 2, "Aventurière emblématique", "2024-03-10"]
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

      demoScores.forEach((row) => {
        stmt.run(
          row[0],
          row[1],
          row[2],
          row[3],
          row[4],
          row[5]
        );
      });

      stmt.finalize((err) => {

        if (err) {
          console.error(err);
          return res.status(500).json({ error: err.message });
        }

        res.json({ success: true, count: demoScores.length });
      });

    });

  });

});

// Compteur visites
app.get('/api/visit', (req, res) => {

  db.run("UPDATE visits SET count = count + 1 WHERE id = 1", () => {

    db.get("SELECT count FROM visits WHERE id = 1", (err, row) => {

      if (err) return res.status(500).json({ error: err.message });

      res.json({ count: row.count });

    });

  });
});

// Avis
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
// START SERVER
// =========================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
