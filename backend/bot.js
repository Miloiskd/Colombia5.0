import 'dotenv/config';
import { Telegraf, session } from 'telegraf';
import { loadAllData } from './services/dataLoader.js';
import { askConversationalAgent } from './agents/conversacional.js';
import { initOperativeAgent } from './agents/operativo.js';
import { generateWorkOrders, getOfflineAPs, getAPEventRanking } from './services/analyzer.js';
import { generateStrategicReport } from './agents/estrategico.js';
import { config } from './config.js';

const bot = new Telegraf(config.telegram.token);

bot.use(session());

bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = { history: [] };
  return next();
});

function stripMarkdown(text) {
  let value = String(text || '');

  value = value.replace(/```([\s\S]*?)```/g, '$1');
  value = value.replace(/`([^`]+)`/g, '$1');
  value = value.replace(/\*\*([^*]+)\*\*/g, '$1');
  value = value.replace(/\*([^*]+)\*/g, '$1');
  value = value.replace(/__([^_]+)__/g, '$1');
  value = value.replace(/_([^_]+)_/g, '$1');
  value = value.replace(/^\s{0,3}#+\s?/gm, '');
  value = value.replace(/^\s*>\s?/gm, '');
  value = value.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  value = value.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  return value.trim();
}

function sendPlain(ctx, text) {
  return ctx.reply(stripMarkdown(text));
}

bot.command('start', (ctx) => {
  sendPlain(
    ctx,
    `Bienvenido al Agente WiFi Inteligente - Cali\n\n` +
      `Puedo ayudarte con:\n` +
      `/estado - Estado actual de todos los APs\n` +
      `/ordenes - Ordenes de trabajo priorizadas\n` +
      `/ranking - APs con mas eventos\n` +
      `/estrategia - Informe estrategico de inversion\n` +
      `/ayuda - Lista de comandos\n\n` +
      `O escribeme una pregunta en lenguaje natural:\n` +
      `"Que AP tiene peor rendimiento esta semana?"\n` +
      `"Cuantos clientes estan conectados a Hormiguero?"`
  );
});

bot.command('estado', (ctx) => {
  const offline = getOfflineAPs();
  if (offline.length === 0) {
    return sendPlain(ctx, 'Todos los APs estan en linea. Sin alertas activas.');
  }

  const msg = offline
    .map((ap) => `${ap.status === 'offline' ? '[CRITICO]' : '[ALTO]'} ${ap.ap_name} - ${String(ap.status).toUpperCase()}`)
    .join('\n');
  sendPlain(ctx, `APs con problemas:\n\n${msg}`);
});

bot.command('ordenes', (ctx) => {
  const orders = generateWorkOrders().slice(0, 5);
  if (orders.length === 0) return sendPlain(ctx, 'No hay ordenes de trabajo activas.');

  const msg = orders
    .map(
      (o, i) =>
        `${i + 1}. [${o.priority}] ${o.ap_name}\n` +
        `Problema: ${o.issue}\n` +
        `Accion: ${o.action}\n` +
        `Usuarios afectados: ${o.estimated_users_affected}`
    )
    .join('\n\n');
  sendPlain(ctx, `Ordenes de Trabajo Priorizadas:\n\n${msg}`);
});

bot.command('ranking', (ctx) => {
  const ranking = getAPEventRanking().slice(0, 8);
  const msg = ranking.map((ap, i) => `${i + 1}. ${ap.ap_name}: ${ap.total_events} eventos`).join('\n');
  sendPlain(ctx, `Ranking de APs por eventos:\n\n${msg}`);
});

bot.command('estrategia', async (ctx) => {
  const thinking = await sendPlain(ctx, 'Generando informe estrategico con IA...');
  try {
    const { report } = await generateStrategicReport();
    const chunks = splitMessage(stripMarkdown(report), 4000);
    for (const chunk of chunks) {
      await sendPlain(ctx, chunk);
    }
  } catch (err) {
    sendPlain(ctx, 'Error generando el informe: ' + err.message);
  } finally {
    if (thinking) {
      // No-op placeholder to avoid unused variable warnings
    }
  }
});

bot.command('ayuda', (ctx) => {
  sendPlain(
    ctx,
    `Comandos disponibles:\n` +
      `/start - Bienvenida\n` +
      `/estado - APs offline o dormant\n` +
      `/ordenes - Ordenes de trabajo\n` +
      `/ranking - APs por actividad\n` +
      `/estrategia - Informe de inversion (IA)\n` +
      `/ayuda - Este menu\n\n` +
      `Preguntas libres: escribe tu pregunta en espanol.`
  );
});

bot.on('text', async (ctx) => {
  const question = ctx.message.text;
  if (question.startsWith('/')) return;

  ctx.sendChatAction('typing');
  try {
    const answer = await askConversationalAgent(question, ctx.session.history);

    ctx.session.history.push({ role: 'user', content: question });
    ctx.session.history.push({ role: 'assistant', content: answer });
    if (ctx.session.history.length > 12) ctx.session.history = ctx.session.history.slice(-12);

    await sendPlain(ctx, answer);
  } catch (err) {
    sendPlain(ctx, 'Error al procesar tu pregunta. Intenta de nuevo.');
    console.error(err);
  }
});

function splitMessage(text, maxLength) {
  const chunks = [];
  let remaining = text || '';

  while (remaining.length > maxLength) {
    let i = remaining.lastIndexOf('\n', maxLength);
    if (i === -1) i = maxLength;
    chunks.push(remaining.slice(0, i));
    remaining = remaining.slice(i);
  }

  if (remaining.length) chunks.push(remaining);
  return chunks;
}

loadAllData()
  .then(() => {
    initOperativeAgent(bot);
    bot.launch();
    console.log('Bot de Telegram iniciado');
    console.log('Agente operativo activo - revisando anomalias cada 5 minutos');

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  })
  .catch((err) => {
    console.error('Error iniciando el bot:', err);
    process.exit(1);
  });
