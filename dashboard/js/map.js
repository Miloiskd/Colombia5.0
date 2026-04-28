let reportsMap = null;
let reportsLayer = null;

const DEFAULT_CENTER = [3.4516, -76.532];
const DEFAULT_ZOOM = 12;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setStatus(text, isError = false) {
  const status = document.getElementById('reportStatus');
  if (!status) return;
  status.textContent = text;
  status.style.color = isError ? '#b1493b' : '';
}

function setCoords(lat, lng) {
  const latInput = document.getElementById('latInput');
  const lngInput = document.getElementById('lngInput');
  if (latInput) latInput.value = lat.toFixed(6);
  if (lngInput) lngInput.value = lng.toFixed(6);
}

function formatReportPopup(report) {
  const reporter = escapeHtml(report.reporter || 'Anonimo');
  const description = escapeHtml(report.description || 'Sin descripcion');
  const createdAt = report.createdAt ? new Date(report.createdAt) : null;
  const createdDate = createdAt
    ? createdAt.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Sin fecha';
  const createdTime = createdAt
    ? createdAt.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
    : '';

  return `
    <strong style="font-size:0.95em">${reporter}</strong><br />
    <span style="font-size:0.88em;color:#444">${description}</span><br />
    <hr style="margin:4px 0;border:none;border-top:1px solid #ddd" />
    <span style="font-size:0.8em;color:#666">&#128197; ${escapeHtml(createdDate)}&nbsp;&nbsp;&#128336; ${escapeHtml(createdTime)}</span>
  `;
}

function addReportMarker(report) {
  if (!reportsLayer || !report) return;
  const marker = window.L.marker([report.lat, report.lng]);
  marker.bindPopup(formatReportPopup(report));
  marker.addTo(reportsLayer);
}

async function fetchReports() {
  const response = await fetch('/api/reports');
  if (!response.ok) throw new Error('No se pudo cargar los reportes.');
  const data = await response.json();
  return Array.isArray(data.reports) ? data.reports : [];
}

async function submitReport(payload) {
  const response = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'No se pudo guardar el reporte.');
  }

  const data = await response.json();
  return data.report;
}

async function loadReports() {
  if (!reportsLayer) return;
  try {
    const reports = await fetchReports();
    reportsLayer.clearLayers();

    reports.forEach((report) => addReportMarker(report));

    if (reports.length) {
      const bounds = reports.map((report) => [report.lat, report.lng]);
      reportsMap.fitBounds(bounds, { padding: [30, 30] });
    } else {
      reportsMap.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }

    document.dispatchEvent(new CustomEvent('reports:updated', { detail: { reports } }));
  } catch (err) {
    setStatus('No se pudieron cargar los reportes.', true);
  }
}

function initMap() {
  const mapElement = document.getElementById('reportsMap');
  if (!mapElement || !window.L) return;

  reportsMap = window.L.map('reportsMap', { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(reportsMap);

  reportsLayer = window.L.layerGroup().addTo(reportsMap);

  reportsMap.on('click', (event) => {
    const { lat, lng } = event.latlng;
    setCoords(lat, lng);
  });
}

function setupReportForm() {
  const form = document.getElementById('reportForm');
  const useLocationBtn = document.getElementById('useLocationBtn');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Enviando reporte...');

    const reporter = document.getElementById('reporterInput')?.value || '';
    const description = document.getElementById('descriptionInput')?.value || '';
    const lat = Number(document.getElementById('latInput')?.value);
    const lng = Number(document.getElementById('lngInput')?.value);

    try {
      const report = await submitReport({ reporter, description, lat, lng });
      addReportMarker(report);
      reportsMap.setView([report.lat, report.lng], 15);
      form.reset();
      setStatus('Reporte enviado. Generando solucion con IA...');

      document.dispatchEvent(new CustomEvent('reports:updated', { detail: { report } }));

      await mostrarSolucion(report.id);
      setStatus('');
    } catch (err) {
      setStatus('No se pudo enviar el reporte.', true);
    }
  });

  if (useLocationBtn) {
    useLocationBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        setStatus('Geolocalizacion no disponible.', true);
        return;
      }

      setStatus('Obteniendo ubicacion...');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCoords(latitude, longitude);
          if (reportsMap) reportsMap.setView([latitude, longitude], 15);
          setStatus('Ubicacion detectada.');
        },
        () => {
          setStatus('No se pudo obtener la ubicacion.', true);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }
}

async function mostrarSolucion(reportId) {
  const panel = document.getElementById('solucionPanel');
  if (!panel) return;

  try {
    const res = await fetch(`/api/reports/${reportId}/solucion`, { method: 'POST' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const s = data.solucion;

    document.getElementById('solucionTipo').textContent = s.tipo_falla || '';
    document.getElementById('solucionCausa').textContent = s.causa_probable || '';
    document.getElementById('solucionTiempo').textContent = s.tiempo_estimado || '';
    document.getElementById('solucionConsejo').textContent = s.consejo || '';

    const urgEl = document.getElementById('solucionUrgencia');
    urgEl.textContent = s.urgencia || '';
    urgEl.className = `solucion-urgencia solucion-urgencia--${(s.urgencia || '').toLowerCase()}`;

    const pasosEl = document.getElementById('solucionPasos');
    pasosEl.innerHTML = (s.pasos || []).map((p) => `<li>${escapeHtml(p)}</li>`).join('');

    const herrEl = document.getElementById('solucionHerramientas');
    herrEl.innerHTML = (s.herramientas || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');

    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    // Si falla la IA, no bloqueamos al usuario
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupReportForm();
  window.refreshReportsMap = loadReports;

  // Dar un tick para que el navegador calcule dimensiones reales antes de pintar el mapa
  setTimeout(() => {
    if (reportsMap) reportsMap.invalidateSize();
    loadReports();
  }, 100);
});
