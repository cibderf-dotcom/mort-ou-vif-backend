const express = require('express');
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

// Reset demo scores
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

    db.run("DELETE FROM scores", function(err){
      if (err) return res.status(500).json({ error: err.message });

      const stmt = db.prepare(`
        INSERT INTO scores (pseudo, score, cartes, stars, comment, date)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      demoScores.forEach(s => {
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
        if (err) return res.status(500).json({ error: err.message });

        res.json({ success: true, count: demoScores.length });
      });
    });

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
app.get('/api/reviews', (req, res) => {
  db.all("SELECT pseudo, message, date FROM reviews ORDER BY date DESC LIMIT 50", [], (err, rows) => {
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
