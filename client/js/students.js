const groupId = getParam('group');

let group = null;
let allGroups = [];

async function loadGroup() {
  if (!groupId) {
    window.location.href = 'groups.html';
    return;
  }

  try {
    group = await getGroup(groupId);
  } catch (err) {
    document.querySelector('main').innerHTML = `<p class="empty">${escapeHtml(err.message)}. <a href="groups.html">К списку групп</a></p>`;
    return;
  }

  document.title = `Группа ${group.name}`;
  document.getElementById('groupTitle').textContent = `Группа ${group.name}`;
  document.getElementById('groupInfo').textContent =
    `${group.speciality_code} ${group.speciality_name} · ${group.course} курс · ${group.education_form} форма`;
  document.getElementById('newVedomostLink').href = `vedomost.html?group=${group.id}`;

  renderBreadcrumbs([
    { title: 'Главная', href: 'index.html' },
    { title: 'Группы', href: 'groups.html' },
    { title: group.name },
  ]);

  loadStudents();
  loadVedomosti();
}

async function loadStudents() {
  const q = document.getElementById('studentSearch').value;
  const container = document.getElementById('students');

  try {
    const students = await getStudents(groupId, q);

    if (!students.length) {
      container.innerHTML = `<tr><td colspan="3" class="empty">${q ? 'Студенты не найдены' : 'В группе пока нет студентов'}</td></tr>`;
      return;
    }

    container.innerHTML = students
      .map(
        (student, i) => `
        <tr>
          <td class="num">${i + 1}</td>
          <td><a href="student.html?id=${student.id}">${escapeHtml(fullName(student))}</a></td>
          <td class="actions">
            <button class="btn btn-light btn-sm" data-edit="${student.id}">Изменить</button>
            <button class="btn btn-danger btn-sm" data-delete="${student.id}">Удалить</button>
          </td>
        </tr>`,
      )
      .join('');

    container.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openStudentForm(students.find((s) => s.id == btn.dataset.edit)));
    });
    container.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => removeStudent(students.find((s) => s.id == btn.dataset.delete)));
    });
  } catch (err) {
    showError(err);
  }
}

async function loadVedomosti() {
  const container = document.getElementById('vedomosti');

  try {
    const vedomosti = await getVedomosti(groupId);

    if (!vedomosti.length) {
      container.innerHTML = '<p class="empty">Ведомостей для группы пока нет</p>';
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Учебный год</th><th>Сессия</th><th>Предмет</th><th></th></tr>
          </thead>
          <tbody>
            ${vedomosti
              .map(
                (v) => `
                <tr>
                  <td>${escapeHtml(v.year_name)}</td>
                  <td>${escapeHtml(v.session_name)}</td>
                  <td>${escapeHtml(v.subject)}</td>
                  <td class="actions"><a class="btn btn-sm" href="vedomost.html?id=${v.id}">Открыть</a></td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    showError(err);
  }
}

function openStudentForm(student) {
  openFormModal({
    title: student ? 'Данные студента' : 'Новый студент',
    submitText: student ? 'Сохранить' : 'Добавить',
    fields: [
      { name: 'last_name', label: 'Фамилия', required: true, value: student?.last_name },
      { name: 'first_name', label: 'Имя', required: true, value: student?.first_name },
      { name: 'middle_name', label: 'Отчество', value: student?.middle_name },
      {
        name: 'group_id',
        label: 'Группа',
        type: 'select',
        required: true,
        value: student?.group_id ?? groupId,
        options: allGroups.map((g) => ({ value: g.id, text: g.name })),
      },
    ],
    onSubmit: async (data) => {
      if (student) await updateStudent(student.id, data);
      else await createStudent(data);
      toast(student ? 'Данные студента сохранены' : 'Студент добавлен');
      loadStudents();
    },
  });
}

async function removeStudent(student) {
  if (!confirm(`Удалить студента ${fullName(student)}?\n\nВсе его оценки также будут удалены.`)) return;

  try {
    await deleteStudent(student.id);
    toast('Студент удалён');
    loadStudents();
  } catch (err) {
    showError(err);
  }
}

document.getElementById('studentSearch').addEventListener('input', debounce(loadStudents));
document.getElementById('addStudentBtn').addEventListener('click', () => openStudentForm(null));

getGroups()
  .then((data) => (allGroups = data))
  .catch(showError);

loadGroup();
