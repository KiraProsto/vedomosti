const express = require('express');
const router = express.Router();

const connectDB = require('../db');

router.get('/faculties', async (req, res) => {
  const db = await connectDB();

  const faculties = await db.all('SELECT * FROM KI_DA_faculties ORDER BY name');

  res.json(faculties);
});

router.get('/specialities', async (req, res) => {
  const db = await connectDB();

  const specialities = await db.all(`
        SELECT sp.*, f.name AS faculty_name
        FROM KI_DA_specialities sp
        JOIN KI_DA_faculties f ON f.id = sp.faculty_id
        ORDER BY sp.code
    `);

  res.json(specialities);
});

// ?group=ID — дисциплины специальности этой группы
router.get('/subjects', async (req, res) => {
  const db = await connectDB();

  const subjects = req.query.group
    ? await db.all(
        `
        SELECT sub.*
        FROM KI_DA_subjects sub
        JOIN KI_DA_groups g ON g.speciality_id = sub.speciality_id
        WHERE g.id = ?
        ORDER BY sub.name
    `,
        [req.query.group],
      )
    : await db.all('SELECT * FROM KI_DA_subjects ORDER BY name');

  res.json(subjects);
});

router.get('/years', async (req, res) => {
  const db = await connectDB();

  res.json(await db.all('SELECT * FROM KI_DA_years ORDER BY year_name'));
});

router.get('/sessions', async (req, res) => {
  const db = await connectDB();

  res.json(await db.all('SELECT * FROM KI_DA_sessions ORDER BY id'));
});

// Данные для дашборда на главной странице
router.get('/dashboard', async (req, res) => {
  const db = await connectDB();

  const stats = await db.get(`
        SELECT
            (SELECT COUNT(*) FROM KI_DA_groups) AS groups,
            (SELECT COUNT(*) FROM KI_DA_students) AS students,
            (SELECT COUNT(*) FROM KI_DA_vedomosti) AS vedomosti,
            (SELECT ROUND(AVG(CAST(grade AS INTEGER)), 2)
             FROM KI_DA_grades
             WHERE grade IN ('5', '4', '3', '2')) AS average
    `);

  const recent = await db.all(`
        SELECT v.id, g.name AS group_name, sub.name AS subject,
               y.year_name, ses.session_name
        FROM KI_DA_vedomosti v
        JOIN KI_DA_groups g ON g.id = v.group_id
        JOIN KI_DA_subjects sub ON sub.id = v.subject_id
        JOIN KI_DA_years y ON y.id = v.year_id
        JOIN KI_DA_sessions ses ON ses.id = v.session_id
        ORDER BY v.id DESC
        LIMIT 5
    `);

  res.json({ ...stats, recent });
});

module.exports = router;
