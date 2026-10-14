const studentId = getParam('id');

async function loadStudent() {
  if (!studentId) {
    window.location.href = 'groups.html';
    return;
  }

  let student;
  try {
    student = await getStudent(studentId);
  } catch (err) {
    document.querySelector('main').innerHTML = `<p class="empty">${escapeHtml(err.message)}. <a href="groups.html">К списку групп</a></p>`;
    return;
  }

  document.title = shortName(student);

  renderBreadcrumbs([
    { title: 'Главная', href: 'index.html' },
    { title: 'Группы', href: 'groups.html' },
    { title: student.group_name, href: `students.html?group=${student.group_id}` },
    { title: shortName(student) },
  ]);

  const history = await getHistory(studentId).catch((err) => {
    showError(err);
    return { average: null, years: [] };
  });

  document.getElementById('studentInfo').innerHTML = `
    <div>
      <h2>${escapeHtml(fullName(student))}</h2>
      <p class="meta">
        Группа <a href="students.html?group=${student.group_id}">${escapeHtml(student.group_name)}</a>
        · ${student.course} курс · ${escapeHtml(student.education_form)} форма
      </p>
      <p class="meta">${escapeHtml(student.speciality_code)} ${escapeHtml(student.speciality_name)}</p>
    </div>
    <div class="stat">
      <div class="label">Средний балл</div>
      <div class="value">${history.average !== null ? history.average.toFixed(2) : '—'}</div>
    </div>`;

  renderHistory(history.years);
}

// Учебный год → Сессия → Предмет — Оценка
function renderHistory(years) {
  const container = document.getElementById('history');

  if (!years.length) {
    container.innerHTML = '<p class="empty card">Оценок пока нет</p>';
    return;
  }

  container.innerHTML = years
    .map(
      (year) => `
      <section class="year-block">
        <h3>${escapeHtml(year.year_name)} учебный год</h3>
        <div class="year-body">
          ${year.sessions
            .map(
              (session) => `
              <div class="session-block">
                <h4>${escapeHtml(session.session_name)} сессия</h4>
                ${session.subjects
                  .map(
                    (s) => `
                    <div class="subject-row">
                      <a href="vedomost.html?id=${s.vedomost_id}">${escapeHtml(s.subject)}</a>
                      ${gradeBadge(s.grade)}
                    </div>`,
                  )
                  .join('')}
              </div>`,
            )
            .join('')}
        </div>
      </section>`,
    )
    .join('');
}

loadStudent();
