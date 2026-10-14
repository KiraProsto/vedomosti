// Клиент раздаётся тем же сервером (http://localhost:3000); при открытии файла напрямую — обращаемся к нему же
const API_URL = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';

const GRADE_OPTIONS = ['5', '4', '3', '2', 'н/я'];

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);

  return data;
}

// ---------- Справочники и дашборд ----------
const getDashboard = () => request('/dashboard');
const getSpecialities = () => request('/specialities');
const getSubjects = (groupId) => request(`/subjects${groupId ? `?group=${groupId}` : ''}`);
const getYears = () => request('/years');
const getSessions = () => request('/sessions');

// ---------- Группы ----------
const getGroups = (q = '') => request(`/groups?q=${encodeURIComponent(q)}`);
const getGroup = (id) => request(`/groups/${id}`);
const createGroup = (data) => request('/groups', { method: 'POST', body: data });
const updateGroup = (id, data) => request(`/groups/${id}`, { method: 'PUT', body: data });
const deleteGroup = (id) => request(`/groups/${id}`, { method: 'DELETE' });

// ---------- Студенты ----------
const getStudents = (groupId, q = '') => request(`/students/group/${groupId}?q=${encodeURIComponent(q)}`);
const searchStudents = (q) => request(`/students?q=${encodeURIComponent(q)}`);
const getStudent = (id) => request(`/students/${id}`);
const getHistory = (studentId) => request(`/students/${studentId}/history`);
const createStudent = (data) => request('/students', { method: 'POST', body: data });
const updateStudent = (id, data) => request(`/students/${id}`, { method: 'PUT', body: data });
const deleteStudent = (id) => request(`/students/${id}`, { method: 'DELETE' });

// ---------- Ведомости и оценки ----------
const getVedomosti = (groupId) => request(`/vedomosti${groupId ? `?group=${groupId}` : ''}`);
const getVedomost = (id) => request(`/vedomosti/${id}`);
const createVedomost = (data) => request('/vedomosti', { method: 'POST', body: data });
const deleteVedomost = (id) => request(`/vedomosti/${id}`, { method: 'DELETE' });
const saveGrades = (id, grades) => request(`/vedomosti/${id}/grades`, { method: 'PUT', body: { grades } });
const pdfUrl = (id) => `${API_URL}/reports/vedomost/${id}`;

// ---------- Утилиты интерфейса ----------
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fullName(s) {
  return [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(' ');
}

// Иванов И.И.
function shortName(s) {
  const initials = [s.first_name, s.middle_name].filter(Boolean).map((n) => `${n[0]}.`).join('');
  return `${s.last_name} ${initials}`;
}

function gradeClass(grade) {
  if (grade === 'н/я') return 'grade-absent';
  return grade ? `grade-${grade}` : 'grade-empty';
}

function gradeBadge(grade) {
  return `<span class="grade ${gradeClass(grade)}">${escapeHtml(grade || '—')}</span>`;
}

// items: [{ title, href }] — у последнего элемента href не нужен
function renderBreadcrumbs(items) {
  const el = document.getElementById('breadcrumbs');
  if (!el) return;

  el.innerHTML = items
    .map((item, i) =>
      i < items.length - 1 && item.href
        ? `<a href="${item.href}">${escapeHtml(item.title)}</a>`
        : `<span>${escapeHtml(item.title)}</span>`,
    )
    .join('<span class="sep">→</span>');
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function toast(message, type = 'success') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showError(err) {
  console.error(err);
  toast(err.message || 'Произошла ошибка', 'error');
}

function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function fillSelect(select, items, valueKey, textFn, placeholder) {
  select.innerHTML =
    (placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : '') +
    items.map((it) => `<option value="${it[valueKey]}">${escapeHtml(textFn(it))}</option>`).join('');
}

// Модальное окно с формой. fields: [{ name, label, type, options, required, value }]
// onSubmit(data) должен вернуть Promise; окно закрывается после успешного выполнения.
function openFormModal({ title, fields, submitText = 'Сохранить', onSubmit }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const inputs = fields
    .map((f) => {
      const id = `f_${f.name}`;
      const required = f.required ? 'required' : '';
      let control;
      if (f.type === 'select') {
        control = `<select id="${id}" name="${f.name}" ${required}>
            ${f.options
              .map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${escapeHtml(o.text)}</option>`)
              .join('')}
          </select>`;
      } else {
        const extra = f.type === 'number' ? `min="${f.min ?? ''}" max="${f.max ?? ''}"` : '';
        control = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" ${extra}
            value="${escapeHtml(f.value ?? '')}" ${required} />`;
      }
      return `<label for="${id}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>${control}`;
    })
    .join('');

  overlay.innerHTML = `
    <form class="modal" novalidate>
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button>
      </div>
      <div class="modal-body">${inputs}<p class="form-error" hidden></p></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-light" data-close>Отмена</button>
        <button type="submit" class="btn">${escapeHtml(submitText)}</button>
      </div>
    </form>`;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);

  const form = overlay.querySelector('form');
  const errorEl = overlay.querySelector('.form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    const missing = fields.find((f) => f.required && !String(data[f.name] || '').trim());
    if (missing) {
      errorEl.textContent = `Заполните поле «${missing.label}»`;
      errorEl.hidden = false;
      return;
    }

    const submitBtn = form.querySelector('[type=submit]');
    submitBtn.disabled = true;
    try {
      await onSubmit(data);
      close();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.body.appendChild(overlay);
  overlay.querySelector('input, select')?.focus();
}

// Подсвечивает активный пункт меню
document.addEventListener('DOMContentLoaded', () => {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.menu a').forEach((a) => {
    if (a.getAttribute('href') === page || (page === 'students.html' && a.getAttribute('href') === 'groups.html')) {
      a.classList.add('active');
    }
  });
});
