async function loadDashboard() {
  try {
    const data = await getDashboard();

    document.getElementById('statGroups').textContent = data.groups;
    document.getElementById('statStudents').textContent = data.students;
    document.getElementById('statVedomosti').textContent = data.vedomosti;
    document.getElementById('statAverage').textContent =
      data.average !== null ? Number(data.average).toFixed(2) : '—';

    const recent = document.getElementById('recent');
    recent.innerHTML = data.recent.length
      ? data.recent
          .map(
            (v) => `
            <div class="list-item">
              <div>
                <a href="vedomost.html?id=${v.id}">${escapeHtml(v.subject)}</a><br />
                <small>${escapeHtml(v.group_name)} · ${escapeHtml(v.year_name)} · ${escapeHtml(v.session_name)} сессия</small>
              </div>
            </div>`,
          )
          .join('')
      : '<p class="empty">Ведомостей пока нет</p>';
  } catch (err) {
    showError(err);
  }
}

const runSearch = debounce(async (q) => {
  const box = document.getElementById('searchResults');
  if (!q.trim()) {
    box.innerHTML = '';
    return;
  }
  try {
    const students = await searchStudents(q);
    box.innerHTML = students.length
      ? students
          .map(
            (s) => `
            <div class="list-item">
              <a href="student.html?id=${s.id}">${escapeHtml(fullName(s))}</a>
              <small>${escapeHtml(s.group_name)}</small>
            </div>`,
          )
          .join('')
      : '<p class="empty">Ничего не найдено</p>';
  } catch (err) {
    showError(err);
  }
});

document.getElementById('studentSearch').addEventListener('input', (e) => runSearch(e.target.value));

loadDashboard();
