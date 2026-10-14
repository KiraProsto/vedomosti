const EDUCATION_FORMS = ['Очная', 'Заочная', 'Очно-заочная'];

let specialities = [];

renderBreadcrumbs([{ title: 'Главная', href: 'index.html' }, { title: 'Группы' }]);

async function renderGroups() {
  const q = document.getElementById('groupSearch').value;
  const container = document.getElementById('groups');

  try {
    const groups = await getGroups(q);

    document.getElementById('groupsCount').textContent = `Найдено групп: ${groups.length}`;

    if (!groups.length) {
      container.innerHTML = `<p class="empty">${q ? 'Группы не найдены' : 'Групп пока нет — добавьте первую'}</p>`;
      return;
    }

    container.innerHTML = groups
      .map(
        (group) => `
        <div class="card hoverable">
          <h3>${escapeHtml(group.name)}</h3>
          <p class="meta">${escapeHtml(group.speciality_code)} ${escapeHtml(group.speciality_name)}</p>
          <p class="meta">Курс: <b>${group.course}</b> · ${escapeHtml(group.education_form)} форма</p>
          <p class="meta">Студентов: <b>${group.students_count}</b></p>
          <div class="card-actions">
            <a href="students.html?group=${group.id}" class="btn btn-sm">Открыть</a>
            <button class="btn btn-light btn-sm" data-edit="${group.id}">Изменить</button>
            <button class="btn btn-danger btn-sm" data-delete="${group.id}">Удалить</button>
          </div>
        </div>`,
      )
      .join('');

    container.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openGroupForm(groups.find((g) => g.id == btn.dataset.edit)));
    });
    container.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => removeGroup(groups.find((g) => g.id == btn.dataset.delete)));
    });
  } catch (err) {
    showError(err);
  }
}

function openGroupForm(group) {
  openFormModal({
    title: group ? `Группа ${group.name}` : 'Новая группа',
    submitText: group ? 'Сохранить' : 'Добавить',
    fields: [
      { name: 'name', label: 'Название группы', required: true, value: group?.name },
      {
        name: 'speciality_id',
        label: 'Специальность',
        type: 'select',
        required: true,
        value: group?.speciality_id,
        options: specialities.map((s) => ({ value: s.id, text: `${s.code} ${s.name}` })),
      },
      { name: 'course', label: 'Курс', type: 'number', min: 1, max: 5, required: true, value: group?.course ?? 1 },
      {
        name: 'education_form',
        label: 'Форма обучения',
        type: 'select',
        required: true,
        value: group?.education_form,
        options: EDUCATION_FORMS.map((f) => ({ value: f, text: f })),
      },
    ],
    onSubmit: async (data) => {
      if (group) await updateGroup(group.id, data);
      else await createGroup(data);
      toast(group ? 'Группа сохранена' : 'Группа добавлена');
      renderGroups();
    },
  });
}

async function removeGroup(group) {
  const ok = confirm(
    `Удалить группу ${group.name}?\n\nВместе с ней будут удалены все студенты группы, её ведомости и оценки.`,
  );
  if (!ok) return;

  try {
    await deleteGroup(group.id);
    toast('Группа удалена');
    renderGroups();
  } catch (err) {
    showError(err);
  }
}

document.getElementById('groupSearch').addEventListener('input', debounce(renderGroups));
document.getElementById('addGroupBtn').addEventListener('click', () => openGroupForm(null));

getSpecialities()
  .then((data) => (specialities = data))
  .catch(showError);

renderGroups();
