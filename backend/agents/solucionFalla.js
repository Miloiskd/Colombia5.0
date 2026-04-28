import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `Eres un experto tecnico en redes WiFi publicas urbanas de Cali, Colombia.
Cuando recibes la descripcion de una falla reportada por un ciudadano o tecnico en campo, tu tarea es generar un diagnostico rapido y accionable en formato JSON estricto.

REGLAS:
- Responde SIEMPRE en espanol.
- Responde UNICAMENTE con un objeto JSON valido, sin texto adicional, sin markdown, sin bloques de codigo.
- El JSON debe tener exactamente estos campos:
  {
    "tipo_falla": "string corto (max 6 palabras)",
    "causa_probable": "string (max 25 palabras)",
    "urgencia": "ALTA | MEDIA | BAJA",
    "tiempo_estimado": "string (ej: 30 min, 2 horas, 1 dia)",
    "pasos": ["paso 1", "paso 2", "paso 3"],
    "herramientas": ["herramienta 1", "herramienta 2"],
    "consejo": "string (max 20 palabras, tip rapido para el tecnico)"
  }
- Los pasos deben ser entre 3 y 5, concretos y ordenados.
- Las herramientas deben ser entre 2 y 4 items.`;

export async function generarSolucionFalla(description) {
  if (!config.anthropic.apiKey) {
    throw new Error('Falta ANTHROPIC_API_KEY en el entorno.');
  }

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Descripcion de la falla: "${description}"`,
      },
    ],
    temperature: 0.2,
    max_tokens: 400,
  });

  const raw = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return JSON.parse(raw);
}
