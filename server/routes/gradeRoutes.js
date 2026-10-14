const express = require('express');
const router = express.Router();

const connectDB = require('../db');
const { GRADES } = require('../db');

const VEDOMOST_SELECT = `
    SELECT
        v.*,
        g.name AS group_name,
        g.course,
        g.education_form,
        sp.code AS speciality_code,
        sp.name AS speciality_name,
        sub.name AS subject,
        y.year_name,
        ses.session_name
    FROM KI_DA_vedomosti v
    JOIN KI_DA_groups g ON g.id = v.group_id
    JOIN KI_DA_specialities sp ON sp.id = g.speciality_id
    JOIN KI_DA_subjects sub ON sub.id = v.subject_id
    JOIN KI_DA_years y ON y.id = v.year_id
    JOIN KI_DA_sessions ses ON ses.id = v.session_id
`;

// Статистика ведомости. Проценты считаются от общего числа студентов.
function computeStats(grades) {
  const stats = { 5: 0, 4: 0, 3: 0, 2: 0, absent: 0, empty: 0, total: grades.length };

  for (const { grade } of grades) {
    if (grade === 'н/я') stats.absent++;
    else if (grade in stats) stats[grade]++;
    else stats.empty++;
  }

  const percent = (n) => (stats.total ? Math.round((n / stats.total) * 1000) / 10 : 0);
  stats.absolute = percent(stats[5] + stats[4] + stats[3]);
  stats.quality = percent(stats[5] + stats[4]);

  const graded = stats[5] + stats[4] + stats[3] + stats[2];
  stats.average = graded
    ? Math.round(((stats[5] * 5 + stats[4] * 4 + stats[3] * 3 + stats[2] * 2) / graded) * 100) / 100
    : null;

  return stats;
}

// Ведомость с оценками. Студенты, добавленные в группу позже, получают пустую строку.
async function loadVedomost(db, id) {
  const vedomost = await db.get(`${VEDOMOST_SELECT} WHERE v.id = ?`, [id]);
  if (!vedomost) return null;

  await db.run(
    `
        INSERT OR IGNORE INTO KI_DA_grades (vedomost_id, student_id, grade)
        SELECT ?, s.id, NULL
        FROM KI_DA_students s
        WHERE s.group_id = ?
    `,
    [id, vedomost.group_id],
  );

  const grades = await db.all(
    `
        SELECT
            g.id,
            g.grade,
            s.id AS student_id,
            s.last_name,
            s.first_name,
            s.middle_name
        FROM KI_DA_grades g
        JOIN KI_DA_students s ON s.id = g.student_id
        WHERE g.vedomost_id = ?
        ORDER BY s.last_name, s.first_name, s.middle_name
    `,
    [id],
  );

  return { ...vedomost, grades, stats: computeStats(grades) };
}

// ?group=ID — ведомости группы
router.get('/', async (req, res) => {
  const db = await connectDB();

  const params = [];
  let where = '';
  if (req.query.group) {
    where = 'WHERE v.group_id = ?';
    params.push(req.query.group);
  }

  const vedomosti = await db.all(
    `${VEDOMOST_SELECT}
        ${where}
        ORDER BY y.year_name DESC, ses.id DESC, g.name, sub.name`,
    params,
  );

  res.json(vedomosti);
});

router.get('/:id', async (req, res) => {
  const db = await connectDB();

  const vedomost = await loadVedomost(db, req.params.id);

  if (!vedomost) return res.status(404).json({ error: 'Ведомость не найдена' });

  res.json(vedomost);
});

// Создание ведомости. Если такая уже есть — возвращаем существующую.
router.post('/', async (req, res) => {
  const db = await connectDB();
  const { group_id, subject_id, year_id, session_id } = req.body;

  if (!group_id || !subject_id || !year_id || !session_id) {
    return res.status(400).json({ error: 'Выберите группу, предмет, учебный год и сессию' });
  }

  const existing = await db.get(
    `
        SELECT id FROM KI_DA_vedomosti
        WHERE group_id = ? AND subject_id = ? AND year_id = ? AND session_id = ?
    `,
    [group_id, subject_id, year_id, session_id],
  );

  if (existing) return res.json({ id: existing.id, existed: true });

  const result = await db.run(
    `
        INSERT INTO KI_DA_vedomosti (group_id, subject_id, year_id, session_id)
        VALUES (?, ?, ?, ?)
    `,
    [group_id, subject_id, year_id, session_id],
  );

  res.status(201).json({ id: result.lastID, existed: false });
});

// Сохранение оценок: { grades: [{ student_id, grade }] }, grade = '5'..'2' | 'н/я' | null
router.put('/:id/grades', async (req, res) => {
  const db = await connectDB();
  const grades = req.body.grades;

  if (!Array.isArray(grades)) return res.status(400).json({ error: 'Неверный формат данных' });

  for (const item of grades) {
    if (item.grade !== null && item.grade !== '' && !GRADES.includes(String(item.grade))) {
      return res.status(400).json({ error: `Недопустимая оценка: ${item.grade}` });
    }
  }

  const vedomost = await db.get('SELECT id FROM KI_DA_vedomosti WHERE id = ?', [req.params.id]);
  if (!vedomost) return res.status(404).json({ error: 'Ведомость не найдена' });

  await db.exec('BEGIN');
  try {
    for (const { student_id, grade } of grades) {
      await db.run(
        `
            INSERT INTO KI_DA_grades (vedomost_id, student_id, grade)
            VALUES (?, ?, ?)
            ON CONFLICT (vedomost_id, student_id) DO UPDATE SET grade = excluded.grade
        `,
        [req.params.id, student_id, grade === '' || grade === null ? null : String(grade)],
      );
    }
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }

  res.json(await loadVedomost(db, req.params.id));
});

router.delete('/:id', async (req, res) => {
  const db = await connectDB();

  const result = await db.run('DELETE FROM KI_DA_vedomosti WHERE id = ?', [req.params.id]);

  if (!result.changes) return res.status(404).json({ error: 'Ведомость не найдена' });

  res.json({ success: true });
});

module.exports = router;
module.exports.loadVedomost = loadVedomost;
