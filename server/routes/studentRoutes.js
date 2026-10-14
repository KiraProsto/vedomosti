const express = require('express');
const router = express.Router();

const connectDB = require('../db');

// LIKE в SQLite не различает регистр только для латиницы, поэтому ищем в JS
function matchFio(student, q) {
  const fio = `${student.last_name} ${student.first_name} ${student.middle_name || ''}`.toLowerCase();
  return q.split(/\s+/).every((part) => fio.includes(part));
}

function validate(body) {
  const { group_id, last_name, first_name } = body;

  if (!group_id) return 'Не указана группа';
  if (!last_name || !String(last_name).trim()) return 'Введите фамилию';
  if (!first_name || !String(first_name).trim()) return 'Введите имя';
  return null;
}

// Поиск студентов по ФИО по всему колледжу: ?q=
router.get('/', async (req, res) => {
  const db = await connectDB();

  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json([]);

  const students = await db.all(`
        SELECT s.*, g.name AS group_name
        FROM KI_DA_students s
        JOIN KI_DA_groups g ON g.id = s.group_id
        ORDER BY s.last_name, s.first_name
    `);

  res.json(students.filter((s) => matchFio(s, q)).slice(0, 30));
});

// Студенты группы, ?q= — поиск по ФИО
router.get('/group/:id', async (req, res) => {
  const db = await connectDB();

  const q = (req.query.q || '').trim().toLowerCase();
  const students = await db.all(
    `
        SELECT s.*
        FROM KI_DA_students s
        WHERE s.group_id = ?
        ORDER BY s.last_name, s.first_name, s.middle_name
    `,
    [req.params.id],
  );

  res.json(students.filter((s) => matchFio(s, q)));
});

router.get('/:id', async (req, res) => {
  const db = await connectDB();

  const student = await db.get(
    `
        SELECT s.*, g.name AS group_name, g.course, g.education_form,
               sp.code AS speciality_code, sp.name AS speciality_name
        FROM KI_DA_students s
        JOIN KI_DA_groups g ON g.id = s.group_id
        JOIN KI_DA_specialities sp ON sp.id = g.speciality_id
        WHERE s.id = ?
    `,
    [req.params.id],
  );

  if (!student) return res.status(404).json({ error: 'Студент не найден' });

  res.json(student);
});

// История оценок: Учебный год → Сессия → Предмет — Оценка
router.get('/:id/history', async (req, res) => {
  const db = await connectDB();

  const rows = await db.all(
    `
        SELECT
            v.id AS vedomost_id,
            sub.name AS subject,
            y.year_name,
            ses.id AS session_id,
            ses.session_name,
            gr.grade
        FROM KI_DA_grades gr
        JOIN KI_DA_vedomosti v ON v.id = gr.vedomost_id
        JOIN KI_DA_subjects sub ON sub.id = v.subject_id
        JOIN KI_DA_years y ON y.id = v.year_id
        JOIN KI_DA_sessions ses ON ses.id = v.session_id
        WHERE gr.student_id = ?
        ORDER BY y.year_name, ses.id, sub.name
    `,
    [req.params.id],
  );

  const years = [];
  for (const row of rows) {
    let year = years.find((y) => y.year_name === row.year_name);
    if (!year) {
      year = { year_name: row.year_name, sessions: [] };
      years.push(year);
    }
    let session = year.sessions.find((s) => s.session_name === row.session_name);
    if (!session) {
      session = { session_name: row.session_name, subjects: [] };
      year.sessions.push(session);
    }
    session.subjects.push({ vedomost_id: row.vedomost_id, subject: row.subject, grade: row.grade });
  }

  const numeric = rows.filter((r) => ['5', '4', '3', '2'].includes(r.grade)).map((r) => Number(r.grade));
  const average = numeric.length
    ? Math.round((numeric.reduce((a, b) => a + b, 0) / numeric.length) * 100) / 100
    : null;

  res.json({ average, years });
});

router.post('/', async (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });

  const db = await connectDB();
  const { group_id, last_name, first_name, middle_name } = req.body;

  const result = await db.run(
    `
        INSERT INTO KI_DA_students (group_id, last_name, first_name, middle_name)
        VALUES (?, ?, ?, ?)
    `,
    [group_id, last_name.trim(), first_name.trim(), (middle_name || '').trim()],
  );

  res.status(201).json({ id: result.lastID });
});

router.put('/:id', async (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });

  const db = await connectDB();
  const { group_id, last_name, first_name, middle_name } = req.body;

  const result = await db.run(
    `
        UPDATE KI_DA_students
        SET group_id = ?, last_name = ?, first_name = ?, middle_name = ?
        WHERE id = ?
    `,
    [group_id, last_name.trim(), first_name.trim(), (middle_name || '').trim(), req.params.id],
  );

  if (!result.changes) return res.status(404).json({ error: 'Студент не найден' });

  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  const db = await connectDB();

  const result = await db.run('DELETE FROM KI_DA_students WHERE id = ?', [req.params.id]);

  if (!result.changes) return res.status(404).json({ error: 'Студент не найден' });

  res.json({ success: true });
});

module.exports = router;
