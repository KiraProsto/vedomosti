const path = require('path');
const express = require('express');
const cors = require('cors');

const connectDB = require('./db');
const facultyRoutes = require('./routes/facultyRoutes');
const groupRoutes = require('./routes/groupRoutes');
const studentRoutes = require('./routes/studentRoutes');
const gradeRoutes = require('./routes/gradeRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Справочники (факультеты, специальности, дисциплины, годы, сессии) и дашборд
app.use('/api', facultyRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/vedomosti', gradeRoutes);
app.use('/api/reports', reportRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Не найдено' });
});

app.use(express.static(path.join(__dirname, '..', 'client')));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({ error: 'Нарушение ограничений базы данных' });
  }
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
  });
});
