import 'dotenv/config';

export const config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620',
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
  },
  server: {
    port: process.env.PORT || 3000,
  },
  alerts: {
    disconnectionRateThreshold:
      Number.parseFloat(process.env.ALERT_DISCONNECTION_RATE_THRESHOLD) || 0.8,
    checkIntervalMs:
      Number.parseInt(process.env.ALERT_OFFLINE_CHECK_INTERVAL_MS, 10) || 300000,
  },
};
