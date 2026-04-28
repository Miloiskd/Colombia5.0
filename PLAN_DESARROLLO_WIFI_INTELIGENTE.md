# 🛜 Zonas WiFi Inteligentes — Plan de Desarrollo para Agente IA

> Stack: Node.js · Express · Telegraf · Claude API (Anthropic) · Chart.js  
> Datos: CSV reales de Cisco Meraki (Hackathon Colombia 50)

---

## 📁 Estructura del Proyecto

```
wifi-inteligente/
├── backend/
│   ├── server.js                  # Servidor Express principal
│   ├── bot.js                     # Entry point del bot de Telegram
│   ├── config.js                  # Variables de entorno y configuración
│   │
│   ├── data/                      # Copiar aquí los CSV del repositorio
│   │   ├── access_points_curated.csv
│   │   ├── ap_hourly_metrics_curated.csv
│   │   ├── clients_curated.csv
│   │   └── network_events_curated.csv
│   │
│   ├── services/
│   │   ├── dataLoader.js          # Carga y cacheo de CSVs en memoria
│   │   └── analyzer.js            # Lógica de análisis de datos pura
│   │
│   ├── agents/
│   │   ├── operativo.js           # Agente: detecta anomalías y genera alertas
│   │   ├── conversacional.js      # Agente: responde preguntas en lenguaje natural
│   │   └── estrategico.js         # Agente: recomendaciones de inversión
│   │
│   ├── routes/
│   │   ├── dashboard.js           # Endpoints REST para el dashboard
│   │   └── alerts.js              # Endpoints de alertas y órdenes de trabajo
│   │
│   └── package.json
│
├── dashboard/
│   ├── index.html                 # Dashboard principal
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── main.js                # Inicialización y polling
│       ├── charts.js              # Gráficas con Chart.js
│       └── alerts.js              # Panel de alertas en tiempo real
│
└── .env                           # Variables de entorno (NO subir a Git)
```

---

## ⚙️ Variables de Entorno (`.env`)

```env
# Claude (Anthropic)
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-3-5-sonnet-20240620

# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ADMIN_CHAT_ID=...   # Chat ID del grupo/canal de alertas operativas

# Servidor
PORT=3000
NODE_ENV=development

# Configuración de alertas
ALERT_DISCONNECTION_RATE_THRESHOLD=0.8   # Alerta si >80% desconexiones
ALERT_OFFLINE_CHECK_INTERVAL_MS=300000   # Revisar APs offline cada 5 min
```

---

## 📦 `package.json`

```json
{
  "name": "wifi-inteligente",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "bot": "node bot.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "telegraf": "^4.16.3",
    "@anthropic-ai/sdk": "^0.32.1",
    "csv-parse": "^5.5.5",
    "dotenv": "^16.3.1",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

---

## 🔧 `backend/config.js`

```javascript
import "dotenv/config";

export const config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620",
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
      parseFloat(process.env.ALERT_DISCONNECTION_RATE_THRESHOLD) || 0.8,
    checkIntervalMs:
      parseInt(process.env.ALERT_OFFLINE_CHECK_INTERVAL_MS) || 300000,
  },
};
```

---

## 📂 `backend/services/dataLoader.js`

**Responsabilidad:** Cargar los 4 CSV una sola vez al arrancar y exponerlos en memoria. Proveer función de recarga.

```javascript
import { createReadStream } from "fs";
import { parse } from "csv-parse";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

// Cache en memoria
let cache = {
  accessPoints: [],
  hourlyMetrics: [],
  clients: [],
  networkEvents: [],
  loadedAt: null,
};

async function loadCSV(filename) {
  return new Promise((resolve, reject) => {
    const records = [];
    createReadStream(path.join(DATA_DIR, filename))
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on("data", (row) => records.push(row))
      .on("end", () => resolve(records))
      .on("error", reject);
  });
}

export async function loadAllData() {
  const [accessPoints, hourlyMetrics, clients, networkEvents] =
    await Promise.all([
      loadCSV("access_points_curated.csv"),
      loadCSV("ap_hourly_metrics_curated.csv"),
      loadCSV("clients_curated.csv"),
      loadCSV("network_events_curated.csv"),
    ]);

  cache = {
    accessPoints,
    hourlyMetrics,
    clients,
    networkEvents,
    loadedAt: new Date(),
  };
  console.log(
    `✅ Datos cargados: ${accessPoints.length} APs, ${networkEvents.length} eventos, ${clients.length} clientes`,
  );
  return cache;
}

export function getData() {
  if (!cache.loadedAt)
    throw new Error("Datos no cargados aún. Llamar loadAllData() primero.");
  return cache;
}
```

---

## 🔍 `backend/services/analyzer.js`

**Responsabilidad:** Funciones puras de análisis sobre los datos. Sin IA, solo lógica de datos. Estas funciones alimentan a los 3 agentes.

```javascript
import { getData } from "./dataLoader.js";

// --- AGENTE OPERATIVO ---

/**
 * Retorna lista de APs offline o dormant con tiempo estimado caído.
 */
export function getOfflineAPs() {
  const { accessPoints } = getData();
  return accessPoints
    .filter((ap) => ap.status === "offline" || ap.status === "dormant")
    .map((ap) => ({
      ap_name: ap.ap_name,
      status: ap.status,
      mac: ap.mac,
      local_ip: ap.local_ip,
    }));
}

/**
 * Detecta APs con disconnection_rate alto en las últimas N horas.
 * @param {number} lastHours - Ventana temporal a revisar
 * @param {number} threshold - Umbral de tasa de desconexión (0-1)
 */
export function getHighDisconnectionAPs(lastHours = 24, threshold = 0.8) {
  const { hourlyMetrics } = getData();
  const cutoff = new Date(Date.now() - lastHours * 60 * 60 * 1000);

  return hourlyMetrics
    .filter((row) => {
      const ts = new Date(row.timestamp_hour);
      return ts >= cutoff && parseFloat(row.disconnection_rate) >= threshold;
    })
    .sort(
      (a, b) =>
        parseFloat(b.disconnection_rate) - parseFloat(a.disconnection_rate),
    );
}

/**
 * Retorna el ranking de APs por total de eventos (indicador de inestabilidad o alta demanda).
 */
export function getAPEventRanking() {
  const { hourlyMetrics } = getData();
  const totals = {};
  hourlyMetrics.forEach((row) => {
    totals[row.ap_name] =
      (totals[row.ap_name] || 0) + parseInt(row.total_events || 0);
  });
  return Object.entries(totals)
    .sort(([, a], [, b]) => b - a)
    .map(([ap_name, total_events]) => ({ ap_name, total_events }));
}

/**
 * Genera órdenes de trabajo priorizadas basadas en severidad.
 * Prioridad: offline > alta tasa desconexión > dormant
 */
export function generateWorkOrders() {
  const offline = getOfflineAPs();
  const highDisconnection = getHighDisconnectionAPs(48, 0.8);
  const orders = [];

  offline.forEach((ap) => {
    orders.push({
      priority: ap.status === "offline" ? "CRÍTICO" : "ALTO",
      ap_name: ap.ap_name,
      issue:
        ap.status === "offline"
          ? "AP completamente fuera de línea"
          : "AP en estado dormant (posible fallo de energía)",
      action:
        "Visita técnica de campo. Verificar alimentación eléctrica, enlace de red y estado físico del equipo.",
      estimated_users_affected: getUsersAffectedByAP(ap.ap_name),
    });
  });

  const alreadyIncluded = new Set(offline.map((ap) => ap.ap_name));
  highDisconnection.forEach((row) => {
    if (!alreadyIncluded.has(row.ap_name)) {
      orders.push({
        priority: "MEDIO",
        ap_name: row.ap_name,
        issue: `Tasa de desconexión: ${(parseFloat(row.disconnection_rate) * 100).toFixed(0)}%`,
        action:
          "Revisar configuración de canal, interferencia RF y capacidad del AP.",
        estimated_users_affected: getUsersAffectedByAP(row.ap_name),
      });
      alreadyIncluded.add(row.ap_name);
    }
  });

  return orders.sort((a, b) => {
    const p = { CRÍTICO: 0, ALTO: 1, MEDIO: 2, BAJO: 3 };
    return p[a.priority] - p[b.priority];
  });
}

function getUsersAffectedByAP(apName) {
  const { clients } = getData();
  return clients.filter((c) => c.ap_name === apName).length;
}

// --- AGENTE CONVERSACIONAL (contexto para Claude) ---

/**
 * Construye un resumen compacto del estado actual de la red
 * para incluirlo como contexto en el prompt de Claude.
 */
export function buildNetworkSummaryForAI() {
  const { accessPoints, clients, hourlyMetrics, networkEvents } = getData();

  const offlineAPs = accessPoints.filter((ap) => ap.status !== "online");
  const totalClients = clients.length;
  const totalUsageMB = clients.reduce(
    (sum, c) => sum + parseFloat(c.usage_mb || 0),
    0,
  );

  // Top 5 APs por eventos
  const apEventRank = getAPEventRanking().slice(0, 5);

  // Top clientes por uso
  const topClients = [...clients]
    .sort((a, b) => parseFloat(b.usage_mb) - parseFloat(a.usage_mb))
    .slice(0, 5)
    .map((c) => ({
      ap: c.ap_name,
      usage_mb: parseFloat(c.usage_mb).toFixed(1),
      device: c.device_type,
    }));

  // Tasa de desconexión promedio
  const avgDisconnRate =
    hourlyMetrics.reduce(
      (sum, r) => sum + parseFloat(r.disconnection_rate || 0),
      0,
    ) / hourlyMetrics.length;

  return `
## Estado actual de la red WiFi Pública de Cali
- Total APs: ${accessPoints.length} | Online: ${accessPoints.filter((a) => a.status === "online").length} | Fuera de línea/dormant: ${offlineAPs.length}
- APs con problemas: ${offlineAPs.map((a) => `${a.ap_name} (${a.status})`).join(", ")}
- Clientes registrados: ${totalClients}
- Consumo total de datos: ${(totalUsageMB / 1024).toFixed(1)} GB
- Tasa promedio de desconexión: ${(avgDisconnRate * 100).toFixed(1)}%
- Total eventos registrados: ${networkEvents.length}
- Rango temporal: 20 Mar 2026 – 28 Abr 2026

## APs con más actividad (posible inestabilidad o alta demanda):
${apEventRank.map((a, i) => `${i + 1}. ${a.ap_name}: ${a.total_events} eventos`).join("\n")}

## Top 5 clientes por consumo:
${topClients.map((c) => `- ${c.device} en ${c.ap}: ${c.usage_mb} MB`).join("\n")}

## Órdenes de trabajo activas:
${generateWorkOrders()
  .map((o) => `- [${o.priority}] ${o.ap_name}: ${o.issue}`)
  .join("\n")}
  `.trim();
}

// --- AGENTE ESTRATÉGICO ---

/**
 * Genera recomendaciones de inversión basadas en uso, inestabilidad y cobertura.
 */
export function getStrategicRecommendations() {
  const { accessPoints, clients, hourlyMetrics } = getData();

  // Uso promedio por zona
  const usageByZone = {};
  clients.forEach((c) => {
    const zone = c.ap_name?.split("-")[0] || "desconocida";
    if (!usageByZone[zone]) usageByZone[zone] = { totalMB: 0, clients: 0 };
    usageByZone[zone].totalMB += parseFloat(c.usage_mb || 0);
    usageByZone[zone].clients += 1;
  });

  // Inestabilidad por zona
  const instabilityByZone = {};
  hourlyMetrics.forEach((row) => {
    const zone = row.ap_name?.split("-")[0] || "desconocida";
    if (!instabilityByZone[zone])
      instabilityByZone[zone] = { totalRate: 0, count: 0 };
    instabilityByZone[zone].totalRate += parseFloat(
      row.disconnection_rate || 0,
    );
    instabilityByZone[zone].count += 1;
  });

  const recommendations = Object.keys(usageByZone).map((zone) => {
    const usage = usageByZone[zone];
    const instab = instabilityByZone[zone] || { totalRate: 0, count: 1 };
    const avgRate = instab.totalRate / instab.count;
    const apStatus =
      accessPoints.find((a) => a.ap_name.startsWith(zone))?.status || "unknown";

    let recommendation = "";
    let type = "";

    if (apStatus === "offline") {
      recommendation =
        "Restauración urgente del servicio. AP completamente caído.";
      type = "RESTAURAR";
    } else if (avgRate > 0.7 && usage.clients > 5) {
      recommendation =
        "Alta demanda con inestabilidad. Considerar segundo AP o upgrade de hardware.";
      type = "AMPLIAR";
    } else if (usage.totalMB > 3000) {
      recommendation =
        "Zona de alto consumo. Priorizar en plan de mantenimiento preventivo.";
      type = "MANTENER";
    } else if (usage.clients < 3) {
      recommendation =
        "Zona de bajo uso. Evaluar costo-beneficio de la operación continua.";
      type = "EVALUAR";
    } else {
      recommendation = "Operación estable. Monitoreo rutinario.";
      type = "MONITOREAR";
    }

    return {
      zone,
      type,
      recommendation,
      clients: usage.clients,
      total_usage_mb: Math.round(usage.totalMB),
      avg_disconnection_rate: Math.round(avgRate * 100),
      ap_status: apStatus,
    };
  });

  return recommendations.sort((a, b) => {
    const p = {
      RESTAURAR: 0,
      AMPLIAR: 1,
      MANTENER: 2,
      EVALUAR: 3,
      MONITOREAR: 4,
    };
    return p[a.type] - p[b.type];
  });
}

// --- DATOS PARA DASHBOARD ---

export function getDashboardStats() {
  const { accessPoints, clients, networkEvents, hourlyMetrics } = getData();
  return {
    summary: {
      total_aps: accessPoints.length,
      online_aps: accessPoints.filter((a) => a.status === "online").length,
      offline_aps: accessPoints.filter((a) => a.status === "offline").length,
      dormant_aps: accessPoints.filter((a) => a.status === "dormant").length,
      total_clients: clients.length,
      total_events: networkEvents.length,
      total_usage_gb: (
        clients.reduce((s, c) => s + parseFloat(c.usage_mb || 0), 0) / 1024
      ).toFixed(2),
    },
    apEventRanking: getAPEventRanking(),
    workOrders: generateWorkOrders(),
    strategicRecommendations: getStrategicRecommendations(),
    hourlyTrend: getHourlyTrendLast24h(),
  };
}

function getHourlyTrendLast24h() {
  const { hourlyMetrics } = getData();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return hourlyMetrics
    .filter((r) => new Date(r.timestamp_hour) >= cutoff)
    .sort((a, b) => new Date(a.timestamp_hour) - new Date(b.timestamp_hour))
    .map((r) => ({
      hour: r.timestamp_hour,
      connections: parseInt(r.total_connections || 0),
      disconnections: parseInt(r.total_disconnections || 0),
      unique_clients: parseInt(r.unique_clients || 0),
    }));
}
```

---

## 🤖 `backend/agents/operativo.js`

**Responsabilidad:** Monitoreo continuo con `node-cron`. Detecta anomalías y las publica via Telegram.

```javascript
import cron from "node-cron";
import {
  getOfflineAPs,
  getHighDisconnectionAPs,
  generateWorkOrders,
} from "../services/analyzer.js";
import { config } from "../config.js";

let telegramBot = null; // Se inyecta desde bot.js

export function initOperativeAgent(bot) {
  telegramBot = bot;

  // Revisar estado cada 5 minutos
  cron.schedule("*/5 * * * *", async () => {
    await checkForAlerts();
  });

  console.log("🤖 Agente Operativo iniciado — revisando cada 5 minutos");
}

async function checkForAlerts() {
  try {
    const offlineAPs = getOfflineAPs();
    const highDisconn = getHighDisconnectionAPs(
      1,
      config.alerts.disconnectionRateThreshold,
    );

    const alerts = [];

    offlineAPs.forEach((ap) => {
      if (ap.status === "offline") {
        alerts.push({
          level: "🔴 CRÍTICO",
          message: `AP *${ap.ap_name}* está completamente OFFLINE.\nIP: ${ap.local_ip}\nAcción: Despachar técnico de campo inmediatamente.`,
        });
      } else {
        alerts.push({
          level: "🟡 ADVERTENCIA",
          message: `AP *${ap.ap_name}* en estado DORMANT.\nPosible corte de energía o problema de enlace.`,
        });
      }
    });

    highDisconn.forEach((row) => {
      const rate = (parseFloat(row.disconnection_rate) * 100).toFixed(0);
      alerts.push({
        level: "🟠 ALTO",
        message: `AP *${row.ap_name}* — tasa de desconexión: ${rate}%\nHora: ${row.timestamp_hour}\nClientes afectados: ${row.unique_clients}`,
      });
    });

    for (const alert of alerts) {
      await sendTelegramAlert(alert);
    }
  } catch (err) {
    console.error("Error en Agente Operativo:", err.message);
  }
}

async function sendTelegramAlert(alert) {
  if (!telegramBot || !config.telegram.adminChatId) return;
  const text = `${alert.level}\n\n${alert.message}\n\n_${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}_`;
  await telegramBot.telegram.sendMessage(config.telegram.adminChatId, text, {
    parse_mode: "Markdown",
  });
}

export { checkForAlerts };
```

---

## 💬 `backend/agents/conversacional.js`

**Responsabilidad:** Recibe una pregunta en lenguaje natural, inyecta el contexto de datos y llama a Claude (Anthropic).

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { buildNetworkSummaryForAI } from "../services/analyzer.js";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `Eres un agente de inteligencia de red para las Zonas WiFi Públicas de Cali, Colombia. 
Tu trabajo es analizar datos operativos reales y responder preguntas de técnicos, supervisores y funcionarios de la Alcaldía.

Reglas:
- Responde siempre en español.
- Sé conciso pero técnico cuando sea necesario.
- Fundamenta cada respuesta en los datos proporcionados — nunca inventes cifras.
- Si la pregunta es sobre una acción (ej. "¿qué hago con X AP?"), da una recomendación operativa clara.
- Usa emojis con moderación para facilitar la lectura en Telegram.
- Cuando menciones tasas de desconexión, exprésalas en porcentaje.`;

/**
 * Responde una pregunta usando Claude con contexto de datos reales.
 * @param {string} userQuestion - Pregunta en lenguaje natural
 * @param {Array} conversationHistory - Historial previo [{role, content}]
 * @returns {string} Respuesta del agente
 */
export async function askConversationalAgent(
  userQuestion,
  conversationHistory = [],
) {
  const networkContext = buildNetworkSummaryForAI();

  const messages = [
    ...conversationHistory.slice(-6),
    {
      role: "user",
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

  return response.content?.[0]?.text || "";
}
```

---

## 📊 `backend/agents/estrategico.js`

**Responsabilidad:** Genera un informe estratégico narrativo usando Claude (Anthropic) + análisis de datos.

```javascript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import {
  getStrategicRecommendations,
  buildNetworkSummaryForAI,
} from "../services/analyzer.js";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

/**
 * Genera un informe estratégico completo con recomendaciones de inversión.
 */
export async function generateStrategicReport() {
  const recommendations = getStrategicRecommendations();
  const networkSummary = buildNetworkSummaryForAI();

  const prompt = `Con base en estos datos de la red WiFi pública de Cali:

${networkSummary}

Y este análisis por zona:
${JSON.stringify(recommendations, null, 2)}

Genera un informe ejecutivo en español con:
1. **Diagnóstico general** de la red (2-3 párrafos)
2. **Top 3 zonas prioritarias** para intervención inmediata con justificación
3. **Recomendaciones de inversión** (dónde ampliar cobertura, dónde hacer mantenimiento, dónde evaluar costo-beneficio)
4. **Indicadores clave a monitorear** en los próximos 30 días

Usa formato Markdown. Sé directo y orientado a decisión.`;

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    system:
      "Eres un consultor experto en redes de telecomunicaciones y politica publica digital para ciudades colombianas.",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 1200,
  });

  return {
    report: response.content?.[0]?.text || "",
    data: recommendations,
    generatedAt: new Date().toISOString(),
  };
}
```

---

## 🌐 `backend/routes/dashboard.js`

```javascript
import { Router } from "express";
import { getDashboardStats } from "../services/analyzer.js";
import { generateStrategicReport } from "../agents/estrategico.js";
import { askConversationalAgent } from "../agents/conversacional.js";
import { generateWorkOrders } from "../services/analyzer.js";

const router = Router();

// GET /api/stats — Resumen general para el dashboard
router.get("/stats", (req, res) => {
  try {
    res.json(getDashboardStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work-orders — Órdenes de trabajo priorizadas
router.get("/work-orders", (req, res) => {
  res.json(generateWorkOrders());
});

// GET /api/strategic-report — Informe estrategico (llama a Claude)
router.get("/strategic-report", async (req, res) => {
  try {
    const report = await generateStrategicReport();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ask — Pregunta al agente conversacional
router.post("/ask", async (req, res) => {
  const { question, history = [] } = req.body;
  if (!question)
    return res.status(400).json({ error: 'Se requiere el campo "question"' });
  try {
    const answer = await askConversationalAgent(question, history);
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

---

## 🚀 `backend/server.js`

```javascript
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { loadAllData } from "./services/dataLoader.js";
import dashboardRoutes from "./routes/dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

// Servir el dashboard estático
app.use(express.static(path.join(__dirname, "../dashboard")));

// Rutas API
app.use("/api", dashboardRoutes);

// Iniciar
const PORT = process.env.PORT || 3000;

loadAllData()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}/index.html`);
      console.log(`🔗 API: http://localhost:${PORT}/api/stats`);
    });
  })
  .catch((err) => {
    console.error("Error cargando datos:", err);
    process.exit(1);
  });
```

---

## 📱 `backend/bot.js`

```javascript
import "dotenv/config";
import { Telegraf, session } from "telegraf";
import { loadAllData } from "./services/dataLoader.js";
import { askConversationalAgent } from "./agents/conversacional.js";
import { initOperativeAgent } from "./agents/operativo.js";
import {
  generateWorkOrders,
  getOfflineAPs,
  getAPEventRanking,
} from "./services/analyzer.js";
import { generateStrategicReport } from "./agents/estrategico.js";
import { config } from "./config.js";

const bot = new Telegraf(config.telegram.token);
bot.use(session());

// Middleware: inicializar sesión de conversación
bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = { history: [] };
  return next();
});

// ─── COMANDOS ───────────────────────────────────────────────

bot.command("start", (ctx) => {
  ctx.replyWithMarkdown(`
👋 *Bienvenido al Agente WiFi Inteligente — Cali*

Soy tu asistente para monitorear las Zonas WiFi Públicas. Puedo ayudarte con:

📊 /estado — Estado actual de todos los APs
🔧 /ordenes — Órdenes de trabajo priorizadas
📈 /ranking — APs con más eventos
🗺 /estrategia — Informe estratégico de inversión
❓ /ayuda — Lista de comandos

O simplemente *escríbeme una pregunta* en lenguaje natural:
_"¿Cuál AP tiene peor rendimiento esta semana?"_
_"¿Cuántos clientes están conectados a Hormiguero?"_
  `);
});

bot.command("estado", (ctx) => {
  const offline = getOfflineAPs();
  if (offline.length === 0) {
    return ctx.reply("✅ Todos los APs están en línea. Sin alertas activas.");
  }
  const msg = offline
    .map(
      (ap) =>
        `${ap.status === "offline" ? "🔴" : "🟡"} *${ap.ap_name}* — ${ap.status.toUpperCase()}`,
    )
    .join("\n");
  ctx.replyWithMarkdown(`*⚠️ APs con problemas:*\n\n${msg}`);
});

bot.command("ordenes", (ctx) => {
  const orders = generateWorkOrders().slice(0, 5);
  if (orders.length === 0)
    return ctx.reply("✅ No hay órdenes de trabajo activas.");
  const msg = orders
    .map(
      (o, i) =>
        `*${i + 1}. [${o.priority}] ${o.ap_name}*\n📋 ${o.issue}\n🔧 ${o.action}\n👥 Usuarios afectados: ${o.estimated_users_affected}`,
    )
    .join("\n\n");
  ctx.replyWithMarkdown(`*📋 Órdenes de Trabajo Priorizadas:*\n\n${msg}`);
});

bot.command("ranking", (ctx) => {
  const ranking = getAPEventRanking().slice(0, 8);
  const msg = ranking
    .map((ap, i) => `${i + 1}. *${ap.ap_name}*: ${ap.total_events} eventos`)
    .join("\n");
  ctx.replyWithMarkdown(`*📈 Ranking de APs por eventos:*\n\n${msg}`);
});

bot.command("estrategia", async (ctx) => {
  const thinking = await ctx.reply(
    "⏳ Generando informe estratégico con IA...",
  );
  try {
    const { report } = await generateStrategicReport();
    // Telegram tiene límite de 4096 caracteres por mensaje
    const chunks = splitMessage(report, 4000);
    for (const chunk of chunks) {
      await ctx.replyWithMarkdown(chunk);
    }
  } catch (err) {
    ctx.reply("❌ Error generando el informe: " + err.message);
  }
});

bot.command("ayuda", (ctx) => {
  ctx.replyWithMarkdown(`
*Comandos disponibles:*
/start — Bienvenida
/estado — APs offline o dormant
/ordenes — Órdenes de trabajo
/ranking — APs por actividad
/estrategia — Informe de inversión (IA)
/ayuda — Este menú

💬 *Preguntas libres:* simplemente escribe tu pregunta en español.
  `);
});

// ─── MENSAJE DE TEXTO LIBRE (Agente Conversacional) ─────────

bot.on("text", async (ctx) => {
  const question = ctx.message.text;
  if (question.startsWith("/")) return; // ignorar comandos desconocidos

  const typing = ctx.sendChatAction("typing");
  try {
    const answer = await askConversationalAgent(question, ctx.session.history);

    // Guardar historial para contexto multi-turno
    ctx.session.history.push({ role: "user", content: question });
    ctx.session.history.push({ role: "assistant", content: answer });
    if (ctx.session.history.length > 12)
      ctx.session.history = ctx.session.history.slice(-12);

    await ctx.replyWithMarkdown(answer);
  } catch (err) {
    ctx.reply("❌ Error al procesar tu pregunta. Intenta de nuevo.");
    console.error(err);
  }
});

// ─── INICIO ─────────────────────────────────────────────────

function splitMessage(text, maxLength) {
  const chunks = [];
  while (text.length > maxLength) {
    let i = text.lastIndexOf("\n", maxLength);
    if (i === -1) i = maxLength;
    chunks.push(text.slice(0, i));
    text = text.slice(i);
  }
  chunks.push(text);
  return chunks;
}

loadAllData()
  .then(() => {
    initOperativeAgent(bot);
    bot.launch();
    console.log("🤖 Bot de Telegram iniciado");
    console.log(
      "🔍 Agente Operativo activo — revisando anomalías cada 5 minutos",
    );

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  })
  .catch((err) => {
    console.error("Error iniciando el bot:", err);
    process.exit(1);
  });
```

---

## 📊 `dashboard/index.html`

El dashboard consume el API REST en `/api/`. Construirlo con:

- **Chart.js** (CDN) para gráficas
- **Fetch API** para llamar los endpoints
- Polling cada 60 segundos para actualizar datos
- Secciones: Resumen KPIs · Ranking de APs · Órdenes de trabajo · Chat con el agente

```html
<!-- Estructura base sugerida -->
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>WiFi Inteligente — Cali</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="css/style.css" />
  </head>
  <body>
    <!-- 1. KPI Cards: Total APs · Online · Offline · Clientes · GB consumidos -->
    <!-- 2. Gráfica: Conexiones vs Desconexiones últimas 24h (Chart.js Line) -->
    <!-- 3. Tabla: Ranking de APs por eventos -->
    <!-- 4. Panel: Órdenes de trabajo activas con prioridad coloreada -->
    <!-- 5. Chat: Input + historial de preguntas al agente conversacional -->
    <!-- 6. Sección: Recomendaciones estratégicas por zona -->
    <script src="js/main.js"></script>
  </body>
</html>
```

---

## 🗓️ Orden de Implementación Sugerido

| Paso      | Qué implementar                                    | Tiempo estimado |
| --------- | -------------------------------------------------- | --------------- |
| 1         | `package.json` + `.env` + `config.js`              | 5 min           |
| 2         | `dataLoader.js` — cargar los 4 CSV                 | 15 min          |
| 3         | `analyzer.js` — funciones de análisis              | 30 min          |
| 4         | `server.js` + `routes/dashboard.js`                | 20 min          |
| 5         | `agents/conversacional.js` + probar con `/api/ask` | 20 min          |
| 6         | `bot.js` — comandos básicos + texto libre          | 30 min          |
| 7         | `agents/operativo.js` — cron de alertas            | 20 min          |
| 8         | `agents/estrategico.js` — informe con IA           | 20 min          |
| 9         | `dashboard/` — HTML + Chart.js                     | 60 min          |
| **Total** |                                                    | **~3.5 horas**  |

---

## 🧪 Pruebas Rápidas

```bash
# 1. Instalar dependencias
cd backend && npm install

# 2. Probar API
curl http://localhost:3000/api/stats
curl http://localhost:3000/api/work-orders

# 3. Probar agente conversacional
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "¿Cuál es el AP con peor rendimiento esta semana?"}'

# 4. Levantar bot de Telegram por separado
node backend/bot.js
```

---

## ⚠️ Notas importantes para el agente de IA

1. **Los CSV no tienen año en algunos campos** — el README indica que se normalizaron a 2026.
2. **`connectivity_history`** en `access_points_curated.csv` es un string con timestamps concatenados. Para parsearla, dividir por comas y extraer pares (fecha, código_estado).
3. **`usage_mb`** ya viene convertido a MB (el original era en bytes).
4. **`disconnection_rate`** puede ser `NaN` si no hubo conexiones en esa hora — manejar con `parseFloat() || 0`.
5. **`072_Hormiguero_AP1`** tiene 2,278 eventos vs ~600 del segundo AP — es el caso de uso más llamativo para demos.
6. El agente operativo corre en el **mismo proceso que el bot** para poder acceder a la instancia de Telegraf.
7. Para la hackathon, el agente estratégico puede correr **on-demand** (botón en dashboard o comando `/estrategia`) para no consumir tokens en cada request.
