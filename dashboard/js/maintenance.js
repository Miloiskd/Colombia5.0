/* ============================================================
   maintenance.js – Lógica de la sección de mantenimiento
   ============================================================ */

const MAINT_COLORS = {
  CORRECTIVO: { bg: 'rgba(224, 87, 63, 0.85)',  border: '#e0573f' },
  PREDICTIVO: { bg: 'rgba(255, 154, 61, 0.85)', border: '#ff9a3d' },
  PREVENTIVO: { bg: 'rgba(30, 111, 120, 0.85)', border: '#1e6f78' },
  NORMAL:     { bg: 'rgba(185, 200, 143, 0.85)',border: '#7a9255' },
};

const MAINT_LABELS = {
  CORRECTIVO: 'Correctivo',
  PREDICTIVO: 'Predictivo',
  PREVENTIVO: 'Preventivo',
  NORMAL:     'Normal',
};

const URGENCY_CLASS = {
  CRITICA: 'maint-badge--correctivo',
  ALTA:    'maint-badge--predictivo',
  MEDIA:   'maint-badge--preventivo',
  BAJA:    'maint-badge--normal',
};

let donutChart = null;
let barChart = null;

// ── Renderizado de KPIs ──────────────────────────────────────
function renderMaintenanceKPIs(summary) {
  const ids = { CORRECTIVO: 'maintCorrectivo', PREDICTIVO: 'maintPredictivo', PREVENTIVO: 'maintPreventivo', NORMAL: 'maintNormal' };
  Object.entries(ids).forEach(([type, id]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = summary[type] ?? 0;
  });
}

// ── Donut chart ──────────────────────────────────────────────
function renderDonutChart(summary) {
  const ctx = document.getElementById('maintDonutChart');
  if (!ctx || !window.Chart) return;

  const types = ['CORRECTIVO', 'PREDICTIVO', 'PREVENTIVO', 'NORMAL'];
  const data   = types.map((t) => summary[t] ?? 0);
  const colors = types.map((t) => MAINT_COLORS[t].bg);
  const borders= types.map((t) => MAINT_COLORS[t].border);
  const labels = types.map((t) => MAINT_LABELS[t]);

  if (donutChart) donutChart.destroy();

  donutChart = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#0c1f24',
            font: { family: 'Alegreya Sans, sans-serif', size: 13 },
            padding: 16,
            boxWidth: 14,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw} AP${ctx.raw !== 1 ? 's' : ''}`,
          },
        },
      },
    },
  });
}

// ── Bar chart (score por AP) ─────────────────────────────────
function renderBarChart(aps) {
  const ctx = document.getElementById('maintBarChart');
  if (!ctx || !window.Chart) return;

  // Mostrar todos excepto los NORMAL con score 0 si hay muchos, máx 20
  const visible = aps
    .filter((a) => a.maintenance_type !== 'NORMAL' || a.score > 0)
    .slice(0, 20);

  const labels = visible.map((a) => a.ap_name.replace(/^0+/, '').replace(/_/g, ' '));
  const scores = visible.map((a) => a.score);
  const colors = visible.map((a) => MAINT_COLORS[a.maintenance_type]?.bg || '#ccc');
  const borders= visible.map((a) => MAINT_COLORS[a.maintenance_type]?.border || '#999');

  if (barChart) barChart.destroy();

  barChart = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Score de riesgo',
        data: scores,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          max: 12,
          grid: { color: 'rgba(12,31,36,0.08)' },
          ticks: { color: '#4a585b', font: { family: 'Alegreya Sans, sans-serif', size: 11 } },
          title: { display: true, text: 'Puntuación de riesgo', color: '#4a585b', font: { size: 11 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#0c1f24', font: { family: 'Alegreya Sans, sans-serif', size: 11 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => aps[items[0].dataIndex]?.ap_name || items[0].label,
            afterBody: (items) => {
              const ap = visible[items[0].dataIndex];
              if (!ap) return [];
              return [
                `Tipo: ${MAINT_LABELS[ap.maintenance_type]}`,
                `Caídas AP: ${ap.outages}`,
                `Tasa desc.: ${ap.avg_disc_rate}`,
                `Errores/h: ${ap.error_density}`,
              ];
            },
          },
        },
      },
    },
  });
}

// ── Tabla detallada ──────────────────────────────────────────
function escapeHtmlMaint(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMaintenanceTable(aps) {
  const body = document.getElementById('maintenanceTableBody');
  if (!body) return;

  if (!aps || !aps.length) {
    body.innerHTML = '<tr><td colspan="8">Sin datos</td></tr>';
    return;
  }

  body.innerHTML = aps
    .map((ap) => {
      const typeClass = `maint-badge maint-badge--${ap.maintenance_type.toLowerCase()}`;
      const statusClass = ap.status === 'online' ? 'ap-status--online' : ap.status === 'offline' ? 'ap-status--offline' : 'ap-status--dormant';
      return `
        <tr class="maint-row maint-row--${ap.maintenance_type.toLowerCase()}">
          <td><strong>${escapeHtmlMaint(ap.ap_name)}</strong></td>
          <td><span class="ap-status ${statusClass}">${escapeHtmlMaint(ap.status)}</span></td>
          <td><span class="${typeClass}">${MAINT_LABELS[ap.maintenance_type]}</span></td>
          <td class="maint-score">${ap.score}</td>
          <td>${ap.outages}</td>
          <td>${ap.avg_disc_rate}</td>
          <td>${ap.error_density}</td>
          <td class="maint-reason">${escapeHtmlMaint(ap.reason)}</td>
        </tr>`;
    })
    .join('');
}

// ── Función pública de inicialización ────────────────────────
window.initMaintenance = async function () {
  try {
    const data = await fetch('/api/maintenance').then((r) => r.json());
    if (!data || !data.aps) return;

    renderMaintenanceKPIs(data.summary);
    renderDonutChart(data.summary);
    renderBarChart(data.aps);
    renderMaintenanceTable(data.aps);
  } catch (err) {
    console.error('Error cargando mantenimiento:', err);
  }
};
