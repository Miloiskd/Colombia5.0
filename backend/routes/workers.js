import { Router } from 'express';
import { randomUUID } from 'crypto';
import { addWorker, deleteWorker, listWorkers, updateWorker } from '../services/workersStore.js';

const router = Router();

function sanitizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function parseSkills(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

router.get('/workers', async (req, res) => {
  try {
    const workers = await listWorkers();
    res.json({ workers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/workers', async (req, res) => {
  const { name, role, yearsExperience, availability, skills } = req.body || {};

  const nameClean = sanitizeText(name, 120);
  const roleClean = sanitizeText(role, 120);
  const years = Number(yearsExperience);
  const availabilityClean = sanitizeText(availability, 40) || 'disponible';
  const skillsClean = parseSkills(skills);

  if (!nameClean) return res.status(400).json({ error: 'Campo "name" requerido.' });
  if (!roleClean) return res.status(400).json({ error: 'Campo "role" requerido.' });
  if (!Number.isFinite(years) || years < 0) return res.status(400).json({ error: 'YearsExperience invalido.' });

  const worker = {
    id: randomUUID(),
    name: nameClean,
    role: roleClean,
    yearsExperience: Math.round(years),
    availability: availabilityClean,
    skills: skillsClean,
    createdAt: new Date().toISOString(),
  };

  try {
    const saved = await addWorker(worker);
    res.status(201).json({ worker: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/workers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, role, yearsExperience, availability, skills } = req.body || {};

  const updates = {
    name: sanitizeText(name, 120),
    role: sanitizeText(role, 120),
    availability: sanitizeText(availability, 40),
    skills: parseSkills(skills),
  };

  const years = Number(yearsExperience);
  if (!Number.isFinite(years) || years < 0) return res.status(400).json({ error: 'YearsExperience invalido.' });
  updates.yearsExperience = Math.round(years);

  try {
    const updated = await updateWorker(id, updates);
    if (!updated) return res.status(404).json({ error: 'Trabajador no encontrado.' });
    res.json({ worker: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/workers/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const removed = await deleteWorker(id);
    if (!removed) return res.status(404).json({ error: 'Trabajador no encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
