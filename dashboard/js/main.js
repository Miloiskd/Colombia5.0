const chatHistory = [];

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdownToHtml(text) {
  const raw = String(text || '');
  if (window.marked && window.DOMPurify) {
    const html = window.marked.parse(raw, { gfm: true, breaks: true });
    return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }
  return escapeHtml(raw).replace(/\n/g, '<br>');
}

function updateSummary(summary) {
  if (!summary) return;

  setText('kpiTotalAps', summary.total_aps);
  setText('kpiOnlineAps', summary.online_aps);
  setText('kpiOfflineAps', summary.offline_aps);
  setText('kpiDormantAps', summary.dormant_aps);
  setText('kpiTotalClients', summary.total_clients);
  setText('kpiUsageGb', summary.total_usage_gb);

  setText('offlineApsMini', summary.offline_aps);
  setText('dormantApsMini', summary.dormant_aps);
  setText('totalEventsMini', summary.total_events);

  let status = 'Estable';
  if (summary.offline_aps > 0) status = 'Atencion inmediata';
  else if (summary.dormant_aps > 0) status = 'Vigilancia activa';
  setText('networkStatus', status);

  const now = new Date();
  setText('lastUpdated', now.toLocaleString('es-CO', { timeZone: 'America/Bogota' }));
}

function renderRanking(ranking) {
  const body = document.getElementById('rankingBody');
  if (!body) return;

  const rows = Array.isArray(ranking) ? ranking.slice(0, 10) : [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="3">Sin datos</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${row.ap_name}</td>
        <td>${row.total_events}</td>
      </tr>
    `
    )
    .join('');
}

function renderWorkOrders(orders) {
  const container = document.getElementById('workOrdersList');
  if (!container) return;

  const rows = Array.isArray(orders) ? orders.slice(0, 6) : [];
  if (!rows.length) {
    container.innerHTML = '<p class="panel-note">No hay ordenes activas.</p>';
    return;
  }

  container.innerHTML = rows
    .map((order) => {
      const priorityClass = window.getPriorityClass(order.priority);
      return `
        <article class="work-order">
          <div class="work-order__header">
            <span class="${priorityClass}">${order.priority}</span>
            <strong>${order.ap_name}</strong>
          </div>
          <p>${order.issue}</p>
          <div class="work-order__meta">Accion: ${order.action}</div>
          <div class="work-order__meta">Usuarios afectados: ${order.estimated_users_affected}</div>
        </article>
      `;
    })
    .join('');
}

function renderRecommendations(recommendations) {
  const container = document.getElementById('recommendationsList');
  if (!container) return;

  const rows = Array.isArray(recommendations) ? recommendations.slice(0, 8) : [];
  if (!rows.length) {
    container.innerHTML = '<p class="panel-note">No hay recomendaciones disponibles.</p>';
    return;
  }

  container.innerHTML = rows
    .map((item) => {
      const tagClass = window.getRecommendationTagClass(item.type);
      return `
        <article class="recommendation">
          <span class="${tagClass}">${item.type}</span>
          <strong>${item.zone}</strong>
          <p>${item.recommendation}</p>
          <div class="work-order__meta">Clientes: ${item.clients}</div>
          <div class="work-order__meta">Uso total (MB): ${item.total_usage_mb}</div>
          <div class="work-order__meta">Desconexion promedio: ${item.avg_disconnection_rate}%</div>
        </article>
      `;
    })
    .join('');
}

function appendChatMessage(role, text) {
  const log = document.getElementById('chatLog');
  if (!log) return;

  const div = document.createElement('div');
  div.className = `chat-message chat-message--${role}`;
  const content = document.createElement('div');
  content.className = 'chat-message__content';
  if (role === 'assistant') {
    content.innerHTML = renderMarkdownToHtml(text);
  } else {
    content.textContent = text;
  }
  div.appendChild(content);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('chatInput');
  const status = document.getElementById('chatStatus');

  if (!input) return;
  const question = input.value.trim();
  if (!question) return;

  input.value = '';
  appendChatMessage('user', question);

  try {
    status.textContent = 'Enviando...';
    const payload = { question, history: chatHistory.slice(-6) };
    const data = await fetchJSON('/api/ask', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const answer = data.answer || 'Sin respuesta.';
    appendChatMessage('assistant', answer);

    chatHistory.push({ role: 'user', content: question });
    chatHistory.push({ role: 'assistant', content: answer });
    status.textContent = '';
  } catch (err) {
    status.textContent = 'No se pudo enviar la pregunta.';
  }
}

async function handleGenerateReport() {
  const output = document.getElementById('strategicReport');
  const button = document.getElementById('generateReportBtn');
  if (!output || !button) return;

  button.disabled = true;
  output.textContent = 'Generando informe...';

  try {
    const data = await fetchJSON('/api/strategic-report');
    output.textContent = data.report || 'No se pudo generar el informe.';
  } catch (err) {
    output.textContent = 'No se pudo generar el informe.';
  } finally {
    button.disabled = false;
  }
}

async function loadDashboard() {
  try {
    const stats = await fetchJSON('/api/stats');
    updateSummary(stats.summary);
    renderRanking(stats.apEventRanking);
    renderWorkOrders(stats.workOrders);
    renderRecommendations(stats.strategicRecommendations);
    window.updateTrendChart(stats.hourlyTrend || []);
  } catch (err) {
    setText('networkStatus', 'Sin datos');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const chartCanvas = document.getElementById('trendChart');
  if (chartCanvas && window.initTrendChart) {
    window.initTrendChart(chartCanvas.getContext('2d'));
  }

  const chatForm = document.getElementById('chatForm');
  if (chatForm) chatForm.addEventListener('submit', handleChatSubmit);

  const reportButton = document.getElementById('generateReportBtn');
  if (reportButton) reportButton.addEventListener('click', handleGenerateReport);

  loadDashboard();
  setInterval(loadDashboard, 60000);
});
