import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { buildNetworkSummaryForAI } from '../services/analyzer.js';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `Eres un agente de inteligencia de red para las Zonas WiFi Publicas de Cali, Colombia.
Tu trabajo es analizar datos operativos reales y responder preguntas de tecnicos, supervisores y funcionarios de la Alcaldia.

Reglas:
- Responde siempre en espanol.
- Se conciso pero tecnico cuando sea necesario.
- Fundamenta cada respuesta en los datos proporcionados; nunca inventes cifras.
- Si la pregunta es sobre una accion (ej. "que hago con X AP?"), da una recomendacion operativa clara.
- Evita emojis y relleno.
- Cuando menciones tasas de desconexion, expresalas en porcentaje.`;

export async function askConversationalAgent(userQuestion, conversationHistory = []) {
  if (!config.anthropic.apiKey) {
    throw new Error('Falta ANTHROPIC_API_KEY en el entorno.');
  }

  const networkContext = buildNetworkSummaryForAI();
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];
  const sanitizedHistory = history
    .slice(-6)
    .filter((item) => item && item.role && item.content)
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content),
    }));

  const messages = [
    ...sanitizedHistory,
    {
      role: 'user',
      content: `Datos actuales de la red:\n\n${networkContext}\n\nPregunta: ${userQuestion}`,
    },
  ];

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    system: SYSTEM_PROMPT,
    messages,
    temperature: 0.3,
    max_tokens: 600,
  });

  const textBlocks = (response.content || []).filter((block) => block.type === 'text');
  return textBlocks.map((block) => block.text).join('\n').trim();
}
