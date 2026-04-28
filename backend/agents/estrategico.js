import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { getStrategicRecommendations, buildNetworkSummaryForAI } from '../services/analyzer.js';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export async function generateStrategicReport() {
  if (!config.anthropic.apiKey) {
    throw new Error('Falta ANTHROPIC_API_KEY en el entorno.');
  }

  const recommendations = getStrategicRecommendations();
  const networkSummary = buildNetworkSummaryForAI();

  const prompt = `Con base en estos datos de la red WiFi publica de Cali:

${networkSummary}

Y este analisis por zona:
${JSON.stringify(recommendations, null, 2)}

Genera un informe ejecutivo en espanol con:
1. Diagnostico general de la red (2-3 parrafos)
2. Top 3 zonas prioritarias para intervencion inmediata con justificacion
3. Recomendaciones de inversion (donde ampliar cobertura, donde hacer mantenimiento, donde evaluar costo-beneficio)
4. Indicadores clave a monitorear en los proximos 30 dias

Usa formato Markdown. Se directo y orientado a decision.`;

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    system:
      'Eres un consultor experto en redes de telecomunicaciones y politica publica digital para ciudades colombianas.',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 1200,
  });

  const textBlocks = (response.content || []).filter((block) => block.type === 'text');
  const report = textBlocks.map((block) => block.text).join('\n').trim();

  return {
    report,
    data: recommendations,
    generatedAt: new Date().toISOString(),
  };
}
