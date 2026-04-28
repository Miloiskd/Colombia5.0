let workersCache = [];
let reportsCache = [];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setRole(role) {
  const body = document.body;
  body.dataset.role = role;
  localStorage.setItem('urbanetRole', role);

  document.querySelectorAll('.role-switch__btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.roleTarget === role);
  });
}

function initRoleSwitch() {
  const savedRole = localStorage.getItem('urbanetRole') || 'admin';
  setRole(savedRole);

  document.querySelectorAll('.role-switch__btn').forEach((btn) => {
    btn.addEventListener('click', () => setRole(btn.dataset.roleTarget));
  });
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Error en la solicitud');
  }

  return response.json();
}

async function loadWorkers() {
  const data = await fetchJSON('/api/workers');
  workersCache = Array.isArray(data.workers) ? data.workers : [];
  renderWorkers();
}

async function loadReports() {
  const data = await fetchJSON('/api/reports');
  reportsCache = Array.isArray(data.reports) ? data.reports : [];
  renderReports();
}

function parseSkills(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalize(text) {
  return String(text || '').toLowerCase();
}

function scoreWorker(worker, report) {
  const description = normalize(report.description);
  const matches = [];

  (worker.skills || []).forEach((skill) => {
    const token = normalize(skill);
    if (token && description.includes(token)) {
      matches.push(skill);
    }
  });

  let score = matches.length * 2;
  if (normalize(worker.availability) === 'disponible') score += 1;
  score += Math.min(worker.yearsExperience || 0, 10) * 0.1;

  return { score, matches };
}

function getSuggestedWorker(report) {
  if (!workersCache.length) return null;

  const scored = workersCache.map((worker) => {
    const { score, matches } = scoreWorker(worker, report);
    return { worker, score, matches };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score > 0 ? scored[0] : scored[0] || null;
}

function renderReports() {
  const container = document.getElementById('reportsAdminList');
  if (!container) return;

  if (!reportsCache.length) {
    container.innerHTML = '<p class="panel-note">No hay reportes registrados.</p>';
    return;
  }

  const workersById = new Map(workersCache.map((worker) => [worker.id, worker]));

  container.innerHTML = reportsCache
    .map((report) => {
      const assigned = workersById.get(report.assignedWorkerId) || null;
      const suggestion = getSuggestedWorker(report);
      const suggestionText = suggestion
        ? `${escapeHtml(suggestion.worker.name)} (${escapeHtml((suggestion.matches || []).join(', ') || 'sin match')})`
        : 'Sin sugerencia';

      const options = workersCache
        .map((worker) => {
          const label = `${worker.name} - ${worker.role}`;
          const selected = report.assignedWorkerId === worker.id ? 'selected' : '';
          return `<option value="${worker.id}" ${selected}>${escapeHtml(label)}</option>`;
        })
        .join('');

      const createdAt = report.createdAt
        ? new Date(report.createdAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
        : '';

      return `
        <article class="report-item" data-report-id="${report.id}">
          <div class="report-item__header">
            <strong>${escapeHtml(report.reporter)}</strong>
            <span class="report-item__meta">${escapeHtml(createdAt)}</span>
          </div>
          <p>${escapeHtml(report.description)}</p>
          <div class="report-item__meta">Ubicacion: ${report.lat}, ${report.lng}</div>
          <div class="report-item__meta">Asignado: ${assigned ? escapeHtml(assigned.name) : 'Sin asignar'}</div>
          <div class="report-item__meta">Sugerido: ${suggestionText}</div>
          <div class="report-item__actions">
            <select data-report-select>
              <option value="">Seleccionar trabajador</option>
              ${options}
            </select>
            <button class="btn" data-action="assign-report">Asignar</button>
            <button class="btn btn--ghost" data-action="assign-suggested" data-suggested-id="${
              suggestion ? suggestion.worker.id : ''
            }">Asignar sugerido</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderWorkers() {
  const container = document.getElementById('workersList');
  if (!container) return;

  if (!workersCache.length) {
    container.innerHTML = '<p class="panel-note">No hay trabajadores registrados.</p>';
    return;
  }

  container.innerHTML = workersCache
    .map((worker) => {
      const skills = (worker.skills || []).join(', ');
      return `
        <article class="worker-item" data-worker-id="${worker.id}">
          <strong>${escapeHtml(worker.name)}</strong>
          <div class="worker-item__meta">${escapeHtml(worker.role)} | ${worker.yearsExperience} anos</div>
          <div class="worker-item__meta">Disponibilidad: ${escapeHtml(worker.availability)}</div>
          <div class="worker-item__meta">Aptitudes: ${escapeHtml(skills || 'Sin aptitudes')}
          </div>
          <div class="worker-item__actions">
            <button class="btn btn--ghost" data-action="edit-worker">Editar</button>
            <button class="btn btn--ghost" data-action="delete-worker">Eliminar</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function resetWorkerForm() {
  document.getElementById('workerId').value = '';
  document.getElementById('workerName').value = '';
  document.getElementById('workerRole').value = '';
  document.getElementById('workerYears').value = '';
  document.getElementById('workerAvailability').value = 'disponible';
  document.getElementById('workerSkills').value = '';
  document.getElementById('workerStatus').textContent = '';
}

async function handleWorkerFormSubmit(event) {
  event.preventDefault();
  const status = document.getElementById('workerStatus');

  const workerId = document.getElementById('workerId').value.trim();
  const payload = {
    name: document.getElementById('workerName').value,
    role: document.getElementById('workerRole').value,
    yearsExperience: Number(document.getElementById('workerYears').value),
    availability: document.getElementById('workerAvailability').value,
    skills: parseSkills(document.getElementById('workerSkills').value),
  };

  try {
    if (workerId) {
      await fetchJSON(`/api/workers/${workerId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      status.textContent = 'Trabajador actualizado.';
    } else {
      await fetchJSON('/api/workers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      status.textContent = 'Trabajador creado.';
    }

    resetWorkerForm();
    await loadWorkers();
    await loadReports();
  } catch (err) {
    status.textContent = 'No se pudo guardar el trabajador.';
  }
}

function handleWorkerListClick(event) {
  const action = event.target.dataset.action;
  const workerEl = event.target.closest('.worker-item');
  if (!action || !workerEl) return;

  const workerId = workerEl.dataset.workerId;
  const worker = workersCache.find((item) => item.id === workerId);
  if (!worker) return;

  if (action === 'edit-worker') {
    document.getElementById('workerId').value = worker.id;
    document.getElementById('workerName').value = worker.name;
    document.getElementById('workerRole').value = worker.role;
    document.getElementById('workerYears').value = worker.yearsExperience;
    document.getElementById('workerAvailability').value = worker.availability;
    document.getElementById('workerSkills').value = (worker.skills || []).join(', ');
    document.getElementById('workerStatus').textContent = 'Editando trabajador.';
  }

  if (action === 'delete-worker') {
    fetchJSON(`/api/workers/${workerId}`, { method: 'DELETE' })
      .then(async () => {
        await loadWorkers();
        await loadReports();
      })
      .catch(() => {
        document.getElementById('workerStatus').textContent = 'No se pudo eliminar.';
      });
  }
}

async function assignReport(reportId, workerId) {
  await fetchJSON(`/api/reports/${reportId}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ workerId }),
  });
}

function handleReportListClick(event) {
  const reportEl = event.target.closest('.report-item');
  if (!reportEl) return;
  const action = event.target.dataset.action;
  if (!action) return;

  const reportId = reportEl.dataset.reportId;
  const select = reportEl.querySelector('[data-report-select]');

  if (action === 'assign-report') {
    const workerId = select ? select.value : '';
    if (!workerId) return;
    assignReport(reportId, workerId)
      .then(loadReports)
      .catch(() => {});
  }

  if (action === 'assign-suggested') {
    const suggestedId = event.target.dataset.suggestedId;
    if (!suggestedId) return;
    assignReport(reportId, suggestedId)
      .then(loadReports)
      .catch(() => {});
  }
}

function initAdmin() {
  const workerForm = document.getElementById('workerForm');
  const workerReset = document.getElementById('workerReset');
  const workersList = document.getElementById('workersList');
  const reportsList = document.getElementById('reportsAdminList');

  if (workerForm) workerForm.addEventListener('submit', handleWorkerFormSubmit);
  if (workerReset) workerReset.addEventListener('click', resetWorkerForm);
  if (workersList) workersList.addEventListener('click', handleWorkerListClick);
  if (reportsList) reportsList.addEventListener('click', handleReportListClick);

  if (reportsList || workersList) {
    loadWorkers().then(loadReports).catch(() => {});
  }

  document.addEventListener('reports:updated', () => {
    if (reportsList) loadReports().catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initRoleSwitch();
  initAdmin();
});
