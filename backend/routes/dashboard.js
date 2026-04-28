import { Router } from 'express';
import { getDashboardStats, generateWorkOrders } from '../services/analyzer.js';
import { generateStrategicReport } from '../agents/estrategico.js';
import { askConversationalAgent } from '../agents/conversacional.js';

const router = Router();

router.get('/stats', (req, res) => {
  try {
    res.json(getDashboardStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/work-orders', (req, res) => {
  res.json(generateWorkOrders());
});

router.get('/strategic-report', async (req, res) => {
  try {
    const report = await generateStrategicReport();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ask', async (req, res) => {
  const { question, history = [] } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Se requiere el campo "question"' });

  try {
    const answer = await askConversationalAgent(question, history);
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
