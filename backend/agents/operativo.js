import cron from 'node-cron';
import { getOfflineAPs, getHighDisconnectionAPs } from '../services/analyzer.js';
import { config } from '../config.js';

let telegramBot = null;

export function initOperativeAgent(bot) {
  telegramBot = bot;

  cron.schedule('*/5 * * * *', async () => {
    await checkForAlerts();
  });

  console.log('Agente operativo iniciado. Revisa cada 5 minutos.');
}

async function checkForAlerts() {
  try {
    const offlineAPs = getOfflineAPs();
    const highDisconn = getHighDisconnectionAPs(1, config.alerts.disconnectionRateThreshold);

    const alerts = [];

    offlineAPs.forEach((ap) => {
      const status = String(ap.status || '').toLowerCase();
      if (status === 'offline') {
        alerts.push({
          level: 'CRITICO',
          message: `AP *${ap.ap_name}* esta OFFLINE.\nIP: ${ap.local_ip}\nAccion: enviar tecnico de campo de inmediato.`,
        });
      } else {
        alerts.push({
          level: 'ADVERTENCIA',
          message: `AP *${ap.ap_name}* en estado DORMANT.\nPosible corte de energia o problema de enlace.`,
        });
      }
    });

    highDisconn.forEach((row) => {
      const rate = (Number.parseFloat(row.disconnection_rate) || 0) * 100;
      alerts.push({
        level: 'ALTO',
        message: `AP *${row.ap_name}* - tasa de desconexion: ${rate.toFixed(0)}%\nHora: ${row.timestamp_hour}\nClientes afectados: ${row.unique_clients}`,
      });
    });

    for (const alert of alerts) {
      await sendTelegramAlert(alert);
    }
  } catch (err) {
    console.error('Error en agente operativo:', err.message);
  }
}

async function sendTelegramAlert(alert) {
  if (!telegramBot || !config.telegram.adminChatId) return;
  const text = `[${alert.level}]\n\n${alert.message}\n\n${new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
  })}`;
  await telegramBot.telegram.sendMessage(config.telegram.adminChatId, text);
}

export { checkForAlerts };
