import { Router } from 'express';
import { randomUUID } from 'crypto';
import { addReport, assignReport, listReports } from '../services/reportsStore.js';
import { generarSolucionFalla } from '../agents/solucionFalla.js';

const router = Router();

function sanitizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

router.get('/reports', async (req, res) => {
  try {
    const reports = await listReports();
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reports', async (req, res) => {
  const { reporter, description, lat, lng } = req.body || {};

  const reporterClean = sanitizeText(reporter, 80);
  const descriptionClean = sanitizeText(description, 500);
  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!reporterClean) return res.status(400).json({ error: 'Campo "reporter" requerido.' });
  if (!descriptionClean) return res.status(400).json({ error: 'Campo "description" requerido.' });
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ error: 'Coordenadas invalidas.' });
  }

  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return res.status(400).json({ error: 'Coordenadas fuera de rango.' });
  }

  const report = {
    id: randomUUID(),
    reporter: reporterClean,
    description: descriptionClean,
    lat: Number(latNum.toFixed(6)),
    lng: Number(lngNum.toFixed(6)),
    createdAt: new Date().toISOString(),
    status: 'open',
    assignedWorkerId: null,
    assignedAt: null,
  };

  try {
    const saved = await addReport(report);
    res.status(201).json({ report: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/reports/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { workerId } = req.body || {};

  if (workerId !== null && workerId !== undefined && String(workerId).trim() === '') {
    return res.status(400).json({ error: 'WorkerId invalido.' });
  }

  try {
    const updated = await assignReport(id, workerId || null);
    if (!updated) return res.status(404).json({ error: 'Reporte no encontrado.' });
    res.json({ report: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reports/:id/solucion', async (req, res) => {
  const { id } = req.params;
  const reports = await listReports().catch(() => []);
  const report = reports.find((r) => r.id === id);
  if (!report) return res.status(404).json({ error: 'Reporte no encontrado.' });

  try {
    const solucion = await generarSolucionFalla(report.description);
    res.json({ solucion });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar la solucion.' });
  }
});

export default router;
