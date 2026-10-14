const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, 'database', 'vedomosti.db');

// Допустимые оценки. 'н/я' — неявка.
const GRADES = ['5', '4', '3', '2', 'н/я'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS KI_DA_faculties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS KI_DA_specialities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    faculty_id INTEGER NOT NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    FOREIGN KEY (faculty_id) REFERENCES KI_DA_faculties(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS KI_DA_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    speciality_id INTEGER NOT NULL,
    name VARCHAR(50) NOT NULL,
    course INTEGER NOT NULL,
    education_form VARCHAR(30) NOT NULL,
    FOREIGN KEY (speciality_id) REFERENCES KI_DA_specialities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS KI_DA_students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    FOREIGN KEY (group_id) REFERENCES KI_DA_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS KI_DA_subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    speciality_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    FOREIGN KEY (speciality_id) REFERENCES KI_DA_specialities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS KI_DA_years (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year_name VARCHAR(20) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS KI_DA_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS KI_DA_vedomosti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    year_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    UNIQUE (group_id, subject_id, year_id, session_id),
    FOREIGN KEY (group_id) REFERENCES KI_DA_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES KI_DA_subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (year_id) REFERENCES KI_DA_years(id),
    FOREIGN KEY (session_id) REFERENCES KI_DA_sessions(id)
);

CREATE TABLE IF NOT EXISTS KI_DA_grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vedomost_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    grade VARCHAR(5) CHECK (grade IS NULL OR grade IN ('5', '4', '3', '2', 'н/я')),
    UNIQUE (vedomost_id, student_id),
    FOREIGN KEY (vedomost_id) REFERENCES KI_DA_vedomosti(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES KI_DA_students(id) ON DELETE CASCADE
);
`;

// Справочник отделений, специальностей и дисциплин.
// Синхронизируется с базой при каждом запуске сервера: недостающее добавляется,
// существующее обновляется (специальность ищется по названию или коду), группы и оценки не затрагиваются.
const REFERENCE = [
  {
    code: '09.00.00',
    name: 'Технико-информационное отделение',
    specialities: [
      {
        code: '09.02.06',
        name: 'Сетевое и системное администрирование',
        subjects: [
          'Компьютерные сети',
          'Операционные системы',
          'Администрирование Linux',
          'Информационная безопасность',
          'Математика',
        ],
      },
      {
        code: '09.02.07',
        name: 'Информационные системы и программирование',
        subjects: [
          'Программирование',
          'Базы данных',
          'Операционные системы',
          'Компьютерные сети',
          'JavaScript',
          'Математика',
          'Английский язык',
        ],
      },
    ],
  },
  {
    code: '15.00.00',
    name: 'Отделение промышленного оборудования и холодильных установок',
    specialities: [
      {
        code: '15.02.06',
        name: 'Холодильно-компрессорные машины и установки',
        subjects: [
          'Техническая механика',
          'Инженерная графика',
          'Электротехника и электроника',
          'Термодинамика и теплопередача',
          'Холодильные машины и установки',
        ],
      },
      {
        code: '15.02.17',
        name: 'Промышленное оборудование',
        subjects: [
          'Техническая механика',
          'Инженерная графика',
          'Материаловедение',
          'Электротехника и электроника',
          'Монтаж и ремонт промышленного оборудования',
        ],
      },
    ],
  },
  {
    code: '19.00.00',
    name: 'Отделение пищевых технологий',
    specialities: [
      {
        code: '19.02.11',
        name: 'Технология продукции общественного питания',
        subjects: [
          'Микробиология, санитария и гигиена',
          'Физиология питания',
          'Товароведение продовольственных товаров',
          'Технология приготовления блюд',
          'Организация обслуживания',
        ],
      },
      {
        code: '', // код в исходных данных не указан
        name: 'Технология хлеба, кондитерских изделий и напитков',
        subjects: [
          'Микробиология, санитария и гигиена',
          'Технология хлеба и хлебобулочных изделий',
          'Технология кондитерских изделий',
          'Технология напитков',
          'Технологическое оборудование',
        ],
      },
    ],
  },
  {
    code: '38.00.00',
    name: 'Экономико-бухгалтерское отделение',
    specialities: [
      {
        code: '38.02.01',
        name: 'Экономика и бухгалтерский учёт',
        subjects: [
          'Бухгалтерский учёт',
          'Экономика организации',
          'Налоги и налогообложение',
          'Статистика',
          'Математика',
        ],
      },
    ],
  },
  {
    code: '43.00.00',
    name: 'Отделение гостиничного дела и сервиса',
    specialities: [
      {
        code: '43.02.11',
        name: 'Гостиничное дело',
        subjects: [
          'Менеджмент в гостиничном деле',
          'Организация обслуживания гостей',
          'Бронирование гостиничных услуг',
          'Экономика организации',
          'Иностранный язык',
        ],
      },
    ],
  },
];

const YEARS = ['2023-2024', '2024-2025', '2025-2026'];
const SESSIONS = ['Зимняя', 'Летняя'];

let dbPromise = null;

// Одно соединение на всё приложение
function connectDB() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      await db.exec('PRAGMA foreign_keys = ON;');

      const { count } = await db.get(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'KI_DA_groups'",
      );
      const isNew = count === 0;

      await db.exec(SCHEMA);
      await syncReference(db);
      if (isNew) await seed(db);
      return db;
    })();
  }
  return dbPromise;
}

async function syncReference(db) {
  await db.exec('BEGIN');
  try {
    const facultyIds = [];

    for (const faculty of REFERENCE) {
      let row = await db.get('SELECT id FROM KI_DA_faculties WHERE code = ?', [
        faculty.code,
      ]);
      if (row) {
        await db.run('UPDATE KI_DA_faculties SET name = ? WHERE id = ?', [
          faculty.name,
          row.id,
        ]);
      } else {
        row = {
          id: (
            await db.run(
              'INSERT INTO KI_DA_faculties (code, name) VALUES (?, ?)',
              [faculty.code, faculty.name],
            )
          ).lastID,
        };
      }
      facultyIds.push(row.id);

      for (const spec of faculty.specialities) {
        let specRow = await db.get(
          "SELECT id FROM KI_DA_specialities WHERE name = ? OR (code = ? AND code <> '')",
          [spec.name, spec.code],
        );
        if (specRow) {
          await db.run(
            'UPDATE KI_DA_specialities SET faculty_id = ?, code = ?, name = ? WHERE id = ?',
            [row.id, spec.code, spec.name, specRow.id],
          );
        } else {
          specRow = {
            id: (
              await db.run(
                'INSERT INTO KI_DA_specialities (faculty_id, code, name) VALUES (?, ?, ?)',
                [row.id, spec.code, spec.name],
              )
            ).lastID,
          };
        }

        for (const subject of spec.subjects) {
          await db.run(
            `INSERT INTO KI_DA_subjects (speciality_id, name)
             SELECT ?, ? WHERE NOT EXISTS (
                 SELECT 1 FROM KI_DA_subjects WHERE speciality_id = ? AND name = ?
             )`,
            [specRow.id, subject, specRow.id, subject],
          );
        }
      }
    }

    // Старые отделения, которых нет в справочнике и к которым не привязаны специальности
    await db.run(
      `DELETE FROM KI_DA_faculties
       WHERE id NOT IN (${facultyIds.map(() => '?').join(',')})
         AND id NOT IN (SELECT faculty_id FROM KI_DA_specialities)`,
      facultyIds,
    );

    for (const y of YEARS)
      await db.run('INSERT OR IGNORE INTO KI_DA_years (year_name) VALUES (?)', [
        y,
      ]);
    for (const s of SESSIONS)
      await db.run(
        'INSERT OR IGNORE INTO KI_DA_sessions (session_name) VALUES (?)',
        [s],
      );

    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

// Демонстрационные группы, студенты и ведомости — только при создании новой базы
async function seed(db) {
  await db.exec('BEGIN');
  try {
    const specId = async (code) =>
      (await db.get('SELECT id FROM KI_DA_specialities WHERE code = ?', [code]))
        .id;
    const isp = await specId('09.02.07');
    const ksk = await specId('09.02.06');
    const buh = await specId('38.02.01');

    const subjectIds = {};
    for (const id of [isp, ksk, buh]) {
      subjectIds[id] = (
        await db.all(
          'SELECT id FROM KI_DA_subjects WHERE speciality_id = ? ORDER BY id',
          [id],
        )
      ).map((r) => r.id);
    }

    const yearIds = (
      await db.all('SELECT id FROM KI_DA_years ORDER BY year_name')
    ).map((r) => r.id);
    const sessionIds = (
      await db.all('SELECT id FROM KI_DA_sessions ORDER BY id')
    ).map((r) => r.id);

    const lastNames = [
      ['Иванов', 'Иванова'],
      ['Петров', 'Петрова'],
      ['Смирнов', 'Смирнова'],
      ['Кузнецов', 'Кузнецова'],
      ['Соколов', 'Соколова'],
      ['Попов', 'Попова'],
      ['Лебедев', 'Лебедева'],
      ['Козлов', 'Козлова'],
      ['Новиков', 'Новикова'],
      ['Морозов', 'Морозова'],
      ['Волков', 'Волкова'],
      ['Фёдоров', 'Фёдорова'],
    ];
    const male = [
      'Иван',
      'Алексей',
      'Дмитрий',
      'Максим',
      'Артём',
      'Никита',
      'Егор',
    ];
    const female = [
      'Анна',
      'Мария',
      'Дарья',
      'Екатерина',
      'Полина',
      'Софья',
      'Алина',
    ];
    const patr = [
      ['Иванович', 'Ивановна'],
      ['Сергеевич', 'Сергеевна'],
      ['Андреевич', 'Андреевна'],
      ['Петрович', 'Петровна'],
      ['Олегович', 'Олеговна'],
      ['Викторович', 'Викторовна'],
    ];

    // Детерминированный генератор, чтобы демо-данные были одинаковыми
    let rnd = 42;
    const random = () =>
      (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = (arr) => arr[Math.floor(random() * arr.length)];
    const randomGrade = () => {
      const r = random();
      if (r < 0.35) return '5';
      if (r < 0.7) return '4';
      if (r < 0.88) return '3';
      if (r < 0.95) return '2';
      return 'н/я';
    };

    // course — текущий курс; по нему считаем, сколько лет группа уже учится
    const groups = [
      { name: '4ИСПВ1', spec: isp, course: 3, form: 'Очная' },
      { name: '4ИСПВ2', spec: isp, course: 3, form: 'Очная' },
      { name: '2ИСП1', spec: isp, course: 2, form: 'Очная' },
      { name: '3СА1', spec: ksk, course: 3, form: 'Очная' },
      { name: '1БУ1', spec: buh, course: 1, form: 'Заочная' },
    ];

    for (const g of groups) {
      const gr = await db.run(
        'INSERT INTO KI_DA_groups (speciality_id, name, course, education_form) VALUES (?, ?, ?, ?)',
        [g.spec, g.name, g.course, g.form],
      );

      const studentIds = [];
      const used = new Set();
      while (studentIds.length < 8) {
        const sex = random() < 0.5 ? 0 : 1;
        const ln = pick(lastNames)[sex];
        const fn = pick(sex ? female : male);
        const key = ln + fn;
        if (used.has(key)) continue;
        used.add(key);
        const st = await db.run(
          'INSERT INTO KI_DA_students (group_id, last_name, first_name, middle_name) VALUES (?, ?, ?, ?)',
          [gr.lastID, ln, fn, pick(patr)[sex]],
        );
        studentIds.push(st.lastID);
      }

      const subj = subjectIds[g.spec];
      const years = yearIds.slice(yearIds.length - g.course);
      let offset = 0;
      for (const yearId of years) {
        for (const sessionId of sessionIds) {
          // Летняя сессия текущего учебного года ещё не наступила
          if (
            yearId === yearIds[yearIds.length - 1] &&
            sessionId === sessionIds[1]
          )
            continue;
          for (let i = 0; i < 3; i++) {
            const subjectId = subj[(offset + i) % subj.length];
            const v = await db.run(
              'INSERT OR IGNORE INTO KI_DA_vedomosti (group_id, subject_id, year_id, session_id) VALUES (?, ?, ?, ?)',
              [gr.lastID, subjectId, yearId, sessionId],
            );
            if (!v.changes) continue;
            for (const studentId of studentIds) {
              await db.run(
                'INSERT INTO KI_DA_grades (vedomost_id, student_id, grade) VALUES (?, ?, ?)',
                [v.lastID, studentId, randomGrade()],
              );
            }
          }
          offset += 2;
        }
      }
    }

    await db.exec('COMMIT');
    console.log('База данных заполнена демонстрационными данными');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = connectDB;
module.exports.GRADES = GRADES;
