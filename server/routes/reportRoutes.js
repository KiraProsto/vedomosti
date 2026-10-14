const fs = require('fs');
const path = require('path');
const express = require('express');
const PDFDocument = require('pdfkit');

const router = express.Router();

const connectDB = require('../db');
const { loadVedomost } = require('./gradeRoutes');

const COLLEGE_NAME = 'Колледж информационных технологий и экономики';

const FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const FONT = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

const REPORTS_DIR = path.join(__dirname, '..', '..', 'reports');

const GRADE_WORDS = {
  5: 'отлично (5)',
  4: 'хорошо (4)',
  3: 'удовлетворительно (3)',
  2: 'неудовлетворительно (2)',
  'н/я': 'неявка',
};

function buildPdf(v) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.registerFont('regular', FONT);
  doc.registerFont('bold', FONT_BOLD);

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc.font('bold').fontSize(13).text(COLLEGE_NAME, { align: 'center' });
  doc.moveDown(0.8);
  doc.fontSize(16).text('ЭКЗАМЕНАЦИОННАЯ ВЕДОМОСТЬ', { align: 'center' });
  doc.moveDown(1);

  const info = [
    ['Специальность', `${v.speciality_code} ${v.speciality_name}`],
    ['Группа', `${v.group_name} (${v.course} курс, ${v.education_form.toLowerCase()} форма)`],
    ['Дисциплина', v.subject],
    ['Учебный год', v.year_name],
    ['Сессия', v.session_name],
  ];
  for (const [label, value] of info) {
    doc.font('bold').fontSize(11).text(`${label}: `, { continued: true });
    doc.font('regular').text(value);
  }
  doc.moveDown(1);

  // Таблица: № | ФИО студента | Оценка | Подпись
  const cols = [30, 255, 135, width - 30 - 255 - 135];
  const rowH = 22;
  let y = doc.y;

  const drawRow = (cells, bold) => {
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    let x = left;
    cells.forEach((text, i) => {
      if (bold) doc.rect(x, y, cols[i], rowH).fillAndStroke('#efe4d8', '#5c4033');
      else doc.rect(x, y, cols[i], rowH).stroke('#5c4033');
      doc.fillColor('#000').font(bold ? 'bold' : 'regular').fontSize(10)
        .text(text, x + 5, y + 6, { width: cols[i] - 10, lineBreak: false, ellipsis: true });
      x += cols[i];
    });
    y += rowH;
  };

  drawRow(['№', 'Фамилия, имя, отчество', 'Оценка', 'Подпись'], true);
  v.grades.forEach((g, i) => {
    const fio = [g.last_name, g.first_name, g.middle_name].filter(Boolean).join(' ');
    drawRow([String(i + 1), fio, GRADE_WORDS[g.grade] || '', ''], false);
  });

  doc.x = left;
  doc.y = y + 15;
  if (doc.y > doc.page.height - 230) doc.addPage();

  const s = v.stats;
  doc.font('bold').fontSize(11).text('Итоги:', left);
  doc.font('regular').fontSize(10);
  doc.text(`«Отлично» — ${s[5]};  «хорошо» — ${s[4]};  «удовлетворительно» — ${s[3]};  «неудовлетворительно» — ${s[2]};  неявка — ${s.absent}.`);
  doc.text(`Всего студентов — ${s.total}.  Средний балл — ${s.average ?? '—'}.`);
  doc.text(`Абсолютная успеваемость — ${s.absolute}%.  Качественная успеваемость — ${s.quality}%.`);

  doc.moveDown(2.5);
  doc.fontSize(11);
  const signY = doc.y;
  doc.text('Преподаватель  ____________________  /  ______________________________ /', left, signY);
  doc.fontSize(8).fillColor('#555');
  doc.text('(подпись)', left + 130, signY + 16, { lineBreak: false });
  doc.text('(Ф.И.О.)', left + 300, signY + 16, { lineBreak: false });
  doc.fillColor('#000').fontSize(11);
  doc.x = left;
  doc.y = signY + 45;
  doc.text('Дата проведения экзамена  «____» ________________ 20____ г.', left);
  doc.moveDown(2);
  doc.text('Заведующий отделением  ____________________', left);

  doc.end();
  return doc;
}

router.get('/vedomost/:id', async (req, res) => {
  const db = await connectDB();

  const vedomost = await loadVedomost(db, req.params.id);
  if (!vedomost) return res.status(404).json({ error: 'Ведомость не найдена' });

  const doc = buildPdf(vedomost);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  await new Promise((resolve) => doc.on('end', resolve));
  const pdf = Buffer.concat(chunks);

  const filename = `Ведомость_${vedomost.group_name}_${vedomost.subject}_${vedomost.year_name}_${vedomost.session_name}.pdf`
    .replace(/[\\/:*?"<>|\s]+/g, '_');

  // Копия сохраняется в папку reports/
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_DIR, filename), pdf);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="vedomost_${vedomost.id}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.send(pdf);
});

module.exports = router;
