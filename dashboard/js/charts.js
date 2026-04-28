let trendChart = null;

function formatHourLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const hours = String(date.getHours()).padStart(2, '0');
  return `${hours}:00`;
}

window.initTrendChart = (ctx) => {
  if (!ctx || !window.Chart) return;

  window.Chart.defaults.color = '#334649';
  window.Chart.defaults.font.family = 'Alegreya Sans, sans-serif';

  trendChart = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Conexiones',
          data: [],
          borderColor: '#1e6f78',
          backgroundColor: 'rgba(30, 111, 120, 0.18)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
        },
        {
          label: 'Desconexiones',
          data: [],
          borderColor: '#e0573f',
          backgroundColor: 'rgba(224, 87, 63, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            color: 'rgba(12, 31, 36, 0.08)',
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(12, 31, 36, 0.08)',
          },
        },
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
          },
        },
      },
    },
  });
};

window.updateTrendChart = (rows = []) => {
  if (!trendChart) return;

  const safeRows = Array.isArray(rows) ? rows : [];
  trendChart.data.labels = safeRows.map((row) => formatHourLabel(row.hour));
  trendChart.data.datasets[0].data = safeRows.map((row) => row.connections || 0);
  trendChart.data.datasets[1].data = safeRows.map((row) => row.disconnections || 0);
  trendChart.update();
};
