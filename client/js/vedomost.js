const vedomostId = getParam('id');

// ---------- Список ведомостей и создание новой ----------

async function initListView() {
  document.getElementById('listView').hidden = false;
  renderBreadcrumbs([{ title: 'Главная', href: 'index.html' }, { title: 'Ведомости' }]);

  const presetGroup = getParam('group');
  const groupSelect = document.getElementById('cGroup');
  const subjectSelect = document.getElementById('cSubject');
  const filterSelect = document.getElementById('filterGroup');

  try {
    const [groups, years, sessions] = await Promise.all([getGroups(), getYears(), getSessions()]);

    fillSelect(groupSelect, groups, 'id', (g) => g.name, 'Выберите группу');
    fillSelect(document.getElementById('cYear'), years, 'id', (y) => y.year_name);
    fillSelect(document.getElementById('cSession'), sessions, 'id', (s) => s.session_name);
    fillSelect(filterSelect, groups, 'id', (g) => `Группа ${g.name}`, 'Все группы');

    // По умолчанию — последний учебный год
    if (years.length) document.getElementById('cYear').value = years[years.length - 1].id;

    if (presetGroup) {
      groupSelect.value = presetGroup;
      filterSelect.value = presetGroup;
      const group = groups.find((g) => g.id == presetGroup);
      if (group) {
        renderBreadcrumbs([
          { title: 'Главная', href: 'index.html' },
          { title: 'Группы', href: 'groups.html' },
          { title: group.name, href: `students.html?group=${group.id}` },
          { title: 'Новая ведомость' },
        ]);
      }
    }
  } catch (err) {
    showError(err);
  }

  async function loadSubjects() {
    if (!groupSelect.value) {
      fillSelect(subjectSelect, [], 'id', () => '', 'Сначала выберите группу');
      return;
    }
    const subjects = await getSubjects(groupSelect.value).catch(showError);
    fillSelect(subjectSelect, subjects || [], 'id', (s) => s.name, 'Выберите предмет');
  }

  groupSelect.addEventListener('change', loadSubjects);
  filterSelect.addEventListener('change', () => loadList(filterSelect.value));
  await loadSubjects();
  loadList(filterSelect.value);

  document.getElementById('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('createError');
    const data = {
      group_id: groupSelect.value,
      subject_id: subjectSelect.value,
      year_id: document.getElementById('cYear').value,
      session_id: document.getElementById('cSession').value,
    };

    if (Object.values(data).some((v) => !v)) {
      errorEl.textContent = 'Выберите группу, предмет, учебный год и сессию';
      errorEl.hidden = false;
      return;
    }

    try {
      const result = await createVedomost(data);
      window.location.href = `vedomost.html?id=${result.id}${result.existed ? '&existed=1' : ''}`;
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

async function loadList(groupId) {
  const tbody = document.getElementById('vedomostiList');

  try {
    const list = await getVedomosti(groupId);

    tbody.innerHTML = list.length
      ? list
          .map(
            (v) => `
            <tr>
              <td>${escapeHtml(v.year_name)}</td>
              <td>${escapeHtml(v.session_name)}</td>
              <td><a href="students.html?group=${v.group_id}">${escapeHtml(v.group_name)}</a></td>
              <td>${escapeHtml(v.subject)}</td>
              <td class="actions"><a class="btn btn-sm" href="vedomost.html?id=${v.id}">Открыть</a></td>
            </tr>`,
          )
          .join('')
      : '<tr><td colspan="5" class="empty">Ведомостей нет</td></tr>';
  } catch (err) {
    showError(err);
  }
}

// ---------- Просмотр и редактирование ведомости ----------

let vedomost = null;
// student_id → новая оценка (только изменённые)
const changes = new Map();

async function initVedomostView() {
  document.getElementById('vedomostView').hidden = false;

  try {
    vedomost = await getVedomost(vedomostId);
  } catch (err) {
    document.querySelector('main').innerHTML = `<p class="empty">${escapeHtml(err.message)}. <a href="vedomost.html">К списку ведомостей</a></p>`;
    return;
  }

  if (getParam('existed')) toast('Такая ведомость уже существует — открыта она');

  document.title = `Ведомость: ${vedomost.subject}, ${vedomost.group_name}`;

  renderBreadcrumbs([
    { title: 'Главная', href: 'index.html' },
    { title: 'Группы', href: 'groups.html' },
    { title: vedomost.group_name, href: `students.html?group=${vedomost.group_id}` },
    { title: `${vedomost.subject} (${vedomost.year_name}, ${vedomost.session_name.toLowerCase()})` },
  ]);

  document.getElementById('vTitle').textContent = `Экзаменационная ведомость: ${vedomost.subject}`;
  document.getElementById('vInfo').innerHTML = [
    ['Группа', `<a href="students.html?group=${vedomost.group_id}">${escapeHtml(vedomost.group_name)}</a>`],
    ['Специальность', escapeHtml(`${vedomost.speciality_code} ${vedomost.speciality_name}`)],
    ['Предмет', escapeHtml(vedomost.subject)],
    ['Учебный год', escapeHtml(vedomost.year_name)],
    ['Сессия', escapeHtml(vedomost.session_name)],
  ]
    .map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`)
    .join('');

  renderGrades();
}

function currentGrade(item) {
  return changes.has(item.student_id) ? changes.get(item.student_id) : item.grade || '';
}

function renderGrades() {
  const tbody = document.getElementById('vedomost');

  if (!vedomost.grades.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">В группе нет студентов</td></tr>';
    renderStats();
    return;
  }

  tbody.innerHTML = vedomost.grades
    .map((item, i) => {
      const value = currentGrade(item);
      const options = ['', ...GRADE_OPTIONS]
        .map((g) => `<option value="${g}" ${g === value ? 'selected' : ''}>${g === '' ? '—' : g === 'н/я' ? 'неявка' : g}</option>`)
        .join('');
      return `
        <tr>
          <td class="num">${i + 1}</td>
          <td><a href="student.html?id=${item.student_id}">${escapeHtml(fullName(item))}</a></td>
          <td>
            <select data-student="${item.student_id}" class="${changes.has(item.student_id) ? 'changed' : ''}" aria-label="Оценка">
              ${options}
            </select>
          </td>
        </tr>`;
    })
    .join('');

  tbody.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', () => {
      const studentId = Number(select.dataset.student);
      const original = vedomost.grades.find((g) => g.student_id === studentId).grade || '';

      if (select.value === original) changes.delete(studentId);
      else changes.set(studentId, select.value);

      select.classList.toggle('changed', changes.has(studentId));
      updateDirtyState();
      renderStats();
    });
  });

  updateDirtyState();
  renderStats();
}

function updateDirtyState() {
  document.getElementById('saveBtn').disabled = changes.size === 0;
  document.getElementById('unsaved').hidden = changes.size === 0;
}

// Статистика пересчитывается сразу при изменении оценок
function computeStats() {
  const s = { 5: 0, 4: 0, 3: 0, 2: 0, absent: 0, empty: 0, total: vedomost.grades.length };

  vedomost.grades.forEach((item) => {
    const g = currentGrade(item);
    if (g === 'н/я') s.absent++;
    else if (g) s[g]++;
    else s.empty++;
  });

  const percent = (n) => (s.total ? Math.round((n / s.total) * 1000) / 10 : 0);
  s.absolute = percent(s[5] + s[4] + s[3]);
  s.quality = percent(s[5] + s[4]);

  const graded = s[5] + s[4] + s[3] + s[2];
  s.average = graded ? (s[5] * 5 + s[4] * 4 + s[3] * 3 + s[2] * 2) / graded : null;

  return s;
}

function renderStats() {
  const s = computeStats();

  const row = (label, value) => `<div class="stat-row"><span>${label}</span><b>${value}</b></div>`;
  const bar = (label, value) => `
    <div class="bar-label"><span>${label}</span><b>${value}%</b></div>
    <div class="bar"><span style="width: ${value}%"></span></div>`;

  document.getElementById('stats').innerHTML = `
    <h3>Статистика</h3>
    ${row(`Оценка ${gradeBadge('5')}`, s[5])}
    ${row(`Оценка ${gradeBadge('4')}`, s[4])}
    ${row(`Оценка ${gradeBadge('3')}`, s[3])}
    ${row(`Оценка ${gradeBadge('2')}`, s[2])}
    ${row(`Неявки ${gradeBadge('н/я')}`, s.absent)}
    ${s.empty ? row('Не выставлено', s.empty) : ''}
    ${row('Всего студентов', s.total)}
    ${row('Средний балл', s.average !== null ? s.average.toFixed(2) : '—')}
    <div class="progress">
      ${bar('Абсолютная успеваемость', s.absolute)}
      ${bar('Качественная успеваемость', s.quality)}
    </div>
    <p class="meta">Абсолютная = (5 + 4 + 3) / всего × 100%<br />Качественная = (5 + 4) / всего × 100%</p>`;
}

async function save() {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;

  try {
    const grades = [...changes].map(([student_id, grade]) => ({ student_id, grade: grade || null }));
    const updated = await saveGrades(vedomostId, grades);
    vedomost.grades = updated.grades;
    changes.clear();
    renderGrades();
    toast('Оценки сохранены');
  } catch (err) {
    showError(err);
    updateDirtyState();
  }
}

document.getElementById('saveBtn').addEventListener('click', save);

document.getElementById('printBtn').addEventListener('click', async () => {
  if (changes.size) {
    if (!confirm('Есть несохранённые оценки. Сохранить их перед формированием PDF?')) return;
    await save();
    if (changes.size) return;
  }
  window.location.href = pdfUrl(vedomostId);
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  if (!confirm('Удалить ведомость вместе со всеми оценками?')) return;

  try {
    await deleteVedomost(vedomostId);
    changes.clear();
    window.location.href = `students.html?group=${vedomost.group_id}`;
  } catch (err) {
    showError(err);
  }
});

window.addEventListener('beforeunload', (e) => {
  if (changes.size) e.preventDefault();
});

if (vedomostId) initVedomostView();
else initListView();
