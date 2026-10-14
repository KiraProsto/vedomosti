const express = require('express');
const router = express.Router();

const connectDB = require('../db');

const GROUP_SELECT = `
    SELECT
        g.*,
        sp.code AS speciality_code,
        sp.name AS speciality_name,
        (SELECT COUNT(*) FROM KI_DA_students s WHERE s.group_id = g.id) AS students_count
    FROM KI_DA_groups g
    JOIN KI_DA_specialities sp ON sp.id = g.speciality_id
`;

function validate(body) {
  const { speciality_id, name, course, education_form } = body;
  const courseNum = Number(course);

  if (!speciality_id) return 'Выберите специальность';
  if (!name || !String(name).trim()) return 'Введите название группы';
  if (!Number.isInteger(courseNum) || courseNum < 1 || courseNum > 5) return 'Курс должен быть от 1 до 5';
  if (!education_form || !String(education_form).trim()) return 'Укажите форму обучения';
  return null;
}

// ?q= — поиск по названию
router.get('/', async (req, res) => {
  const db = await connectDB();

  // LIKE в SQLite не различает регистр только для латиницы, поэтому фильтруем в JS
  const q = (req.query.q || '').trim().toLowerCase();
  const groups = await db.all(`${GROUP_SELECT} ORDER BY g.course, g.name`);

  res.json(groups.filter((g) => g.name.toLowerCase().includes(q)));
});

router.get('/:id', async (req, res) => {
  const db = await connectDB();

  const group = await db.get(`${GROUP_SELECT} WHERE g.id = ?`, [req.params.id]);

  if (!group) return res.status(404).json({ error: 'Группа не найдена' });

  res.json(group);
});

router.post('/', async (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });

  const db = await connectDB();
  const { speciality_id, name, course, education_form } = req.body;

  const result = await db.run(
    `
        INSERT INTO KI_DA_groups (speciality_id, name, course, education_form)
        VALUES (?, ?, ?, ?)
    `,
    [speciality_id, name.trim(), course, education_form.trim()],
  );

  res.status(201).json({ id: result.lastID });
});

router.put('/:id', async (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).json({ error });

  const db = await connectDB();
  const { speciality_id, name, course, education_form } = req.body;

  const result = await db.run(
    `
        UPDATE KI_DA_groups
        SET speciality_id = ?, name = ?, course = ?, education_form = ?
        WHERE id = ?
    `,
    [speciality_id, name.trim(), course, education_form.trim(), req.params.id],
  );

  if (!result.changes) return res.status(404).json({ error: 'Группа не найдена' });

  res.json({ success: true });
});

// Студенты, ведомости и оценки группы удаляются каскадно
router.delete('/:id', async (req, res) => {
  const db = await connectDB();

  const result = await db.run('DELETE FROM KI_DA_groups WHERE id = ?', [req.params.id]);

  if (!result.changes) return res.status(404).json({ error: 'Группа не найдена' });

  res.json({ success: true });
});

module.exports = router;
