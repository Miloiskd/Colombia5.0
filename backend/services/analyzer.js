import { getData } from './dataLoader.js';

function toFloat(value) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

function toInt(value) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : 0;
}

export function getOfflineAPs() {
  const { accessPoints } = getData();
  return accessPoints
    .filter((ap) => {
      const status = String(ap.status || '').toLowerCase();
      return status === 'offline' || status === 'dormant';
    })
    .map((ap) => ({
      ap_name: ap.ap_name,
      status: ap.status,
      mac: ap.mac,
      local_ip: ap.local_ip,
    }));
}

export function getHighDisconnectionAPs(lastHours = 24, threshold = 0.8) {
  const { hourlyMetrics } = getData();
  const cutoff = new Date(Date.now() - lastHours * 60 * 60 * 1000);

  return hourlyMetrics
    .filter((row) => {
      const ts = new Date(row.timestamp_hour);
      return ts >= cutoff && toFloat(row.disconnection_rate) >= threshold;
    })
    .sort((a, b) => toFloat(b.disconnection_rate) - toFloat(a.disconnection_rate));
}

export function getAPEventRanking() {
  const { hourlyMetrics } = getData();
  const totals = {};

  hourlyMetrics.forEach((row) => {
    totals[row.ap_name] = (totals[row.ap_name] || 0) + toInt(row.total_events);
  });

  return Object.entries(totals)
    .sort(([, a], [, b]) => b - a)
    .map(([ap_name, total_events]) => ({ ap_name, total_events }));
}

export function generateWorkOrders() {
  const offline = getOfflineAPs();
  const highDisconnection = getHighDisconnectionAPs(48, 0.8);
  const orders = [];

  offline.forEach((ap) => {
    const status = String(ap.status || '').toLowerCase();
    const isOffline = status === 'offline';

    orders.push({
      priority: isOffline ? 'CRITICO' : 'ALTO',
      ap_name: ap.ap_name,
      issue: isOffline
        ? 'AP completamente fuera de linea'
        : 'AP en estado dormant (posible fallo de energia)',
      action:
        'Visita tecnica de campo. Verificar alimentacion electrica, enlace de red y estado fisico del equipo.',
      estimated_users_affected: getUsersAffectedByAP(ap.ap_name),
    });
  });

  const alreadyIncluded = new Set(offline.map((ap) => ap.ap_name));
  highDisconnection.forEach((row) => {
    if (!alreadyIncluded.has(row.ap_name)) {
      orders.push({
        priority: 'MEDIO',
        ap_name: row.ap_name,
        issue: `Tasa de desconexion: ${(toFloat(row.disconnection_rate) * 100).toFixed(0)}%`,
        action: 'Revisar configuracion de canal, interferencia RF y capacidad del AP.',
        estimated_users_affected: getUsersAffectedByAP(row.ap_name),
      });
      alreadyIncluded.add(row.ap_name);
    }
  });

  return orders.sort((a, b) => {
    const p = { CRITICO: 0, ALTO: 1, MEDIO: 2, BAJO: 3 };
    return p[a.priority] - p[b.priority];
  });
}

function getUsersAffectedByAP(apName) {
  const { clients } = getData();
  return clients.filter((c) => c.ap_name === apName).length;
}

export function buildNetworkSummaryForAI() {
  const { accessPoints, clients, hourlyMetrics, networkEvents } = getData();

  const offlineAPs = accessPoints.filter((ap) => String(ap.status).toLowerCase() !== 'online');
  const totalClients = clients.length;
  const totalUsageMB = clients.reduce((sum, c) => sum + toFloat(c.usage_mb), 0);

  const apEventRank = getAPEventRanking().slice(0, 5);

  const topClients = [...clients]
    .sort((a, b) => toFloat(b.usage_mb) - toFloat(a.usage_mb))
    .slice(0, 5)
    .map((c) => ({
      ap: c.ap_name,
      usage_mb: toFloat(c.usage_mb).toFixed(1),
      device: c.device_type,
    }));

  const avgDisconnRate = hourlyMetrics.length
    ? hourlyMetrics.reduce((sum, r) => sum + toFloat(r.disconnection_rate), 0) / hourlyMetrics.length
    : 0;

  const offlineList = offlineAPs.length
    ? offlineAPs.map((a) => `${a.ap_name} (${a.status})`).join(', ')
    : 'ninguno';

  return `
## Estado actual de la red WiFi Publica de Cali
- Total APs: ${accessPoints.length} | Online: ${accessPoints.filter((a) => String(a.status).toLowerCase() === 'online').length} | Fuera de linea/dormant: ${offlineAPs.length}
- APs con problemas: ${offlineList}
- Clientes registrados: ${totalClients}
- Consumo total de datos: ${(totalUsageMB / 1024).toFixed(1)} GB
- Tasa promedio de desconexion: ${(avgDisconnRate * 100).toFixed(1)}%
- Total eventos registrados: ${networkEvents.length}
- Rango temporal: 20 Mar 2026 - 28 Abr 2026

## APs con mas actividad (posible inestabilidad o alta demanda):
${apEventRank.map((a, i) => `${i + 1}. ${a.ap_name}: ${a.total_events} eventos`).join('\n')}

## Top 5 clientes por consumo:
${topClients.map((c) => `- ${c.device} en ${c.ap}: ${c.usage_mb} MB`).join('\n')}

## Ordenes de trabajo activas:
${generateWorkOrders().map((o) => `- [${o.priority}] ${o.ap_name}: ${o.issue}`).join('\n')}
  `.trim();
}

export function getStrategicRecommendations() {
  const { accessPoints, clients, hourlyMetrics } = getData();

  const usageByZone = {};
  clients.forEach((c) => {
    const zone = c.ap_name?.split('-')[0] || 'desconocida';
    if (!usageByZone[zone]) usageByZone[zone] = { totalMB: 0, clients: 0 };
    usageByZone[zone].totalMB += toFloat(c.usage_mb);
    usageByZone[zone].clients += 1;
  });

  const instabilityByZone = {};
  hourlyMetrics.forEach((row) => {
    const zone = row.ap_name?.split('-')[0] || 'desconocida';
    if (!instabilityByZone[zone]) instabilityByZone[zone] = { totalRate: 0, count: 0 };
    instabilityByZone[zone].totalRate += toFloat(row.disconnection_rate);
    instabilityByZone[zone].count += 1;
  });

  const recommendations = Object.keys(usageByZone).map((zone) => {
    const usage = usageByZone[zone];
    const instab = instabilityByZone[zone] || { totalRate: 0, count: 1 };
    const avgRate = instab.totalRate / instab.count;
    const apStatus = accessPoints.find((a) => a.ap_name?.startsWith(zone))?.status || 'unknown';

    let recommendation = '';
    let type = '';

    if (String(apStatus).toLowerCase() === 'offline') {
      recommendation = 'Restauracion urgente del servicio. AP completamente caido.';
      type = 'RESTAURAR';
    } else if (avgRate > 0.7 && usage.clients > 5) {
      recommendation = 'Alta demanda con inestabilidad. Considerar segundo AP o upgrade de hardware.';
      type = 'AMPLIAR';
    } else if (usage.totalMB > 3000) {
      recommendation = 'Zona de alto consumo. Priorizar en plan de mantenimiento preventivo.';
      type = 'MANTENER';
    } else if (usage.clients < 3) {
      recommendation = 'Zona de bajo uso. Evaluar costo-beneficio de la operacion continua.';
      type = 'EVALUAR';
    } else {
      recommendation = 'Operacion estable. Monitoreo rutinario.';
      type = 'MONITOREAR';
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
    const p = { RESTAURAR: 0, AMPLIAR: 1, MANTENER: 2, EVALUAR: 3, MONITOREAR: 4 };
    return p[a.type] - p[b.type];
  });
}

export function getMaintenanceAnalysis() {
  const { accessPoints, hourlyMetrics, networkEvents } = getData();

  // --- Métricas por AP desde hourlyMetrics ---
  const metricsByAP = {};
  hourlyMetrics.forEach((row) => {
    const ap = row.ap_name;
    if (!metricsByAP[ap]) metricsByAP[ap] = { discRates: [], hours: 0 };
    metricsByAP[ap].discRates.push(toFloat(row.disconnection_rate));
    metricsByAP[ap].hours += 1;
  });

  // --- Errores de cliente por AP desde networkEvents ---
  const clientErrorsByAP = {};
  networkEvents.forEach((row) => {
    const detail = String(row.event_detail || '').toLowerCase();
    const type = String(row.event_type || '').toLowerCase();
    if (detail.includes('not responding') || type.includes('deauth')) {
      clientErrorsByAP[row.ap_name] = (clientErrorsByAP[row.ap_name] || 0) + 1;
    }
  });

  // --- Análisis de outages desde connectivity_history ---
  function countOutages(history) {
    const parts = String(history || '').split(',');
    return parts.filter((p) => p.trim() === '0').length;
  }

  // --- Clasificación por AP ---
  const results = accessPoints.map((ap) => {
    const status = String(ap.status || '').toLowerCase();
    const outages = countOutages(ap.connectivity_history);
    const metrics = metricsByAP[ap.ap_name] || { discRates: [0], hours: 1 };
    const avgDiscRate =
      metrics.discRates.reduce((s, v) => s + v, 0) / Math.max(metrics.discRates.length, 1);
    const clientErrors = clientErrorsByAP[ap.ap_name] || 0;
    const errorDensity = clientErrors / Math.max(metrics.hours, 1);

    // Mantenimiento CORRECTIVO directo (AP caído)
    if (status === 'offline') {
      return {
        ap_name: ap.ap_name,
        status: ap.status,
        maintenance_type: 'CORRECTIVO',
        urgency: 'CRITICA',
        score: 10,
        outages,
        avg_disc_rate: Math.round(avgDiscRate * 100) / 100,
        client_errors: clientErrors,
        error_density: Math.round(errorDensity * 100) / 100,
        reason: 'AP completamente fuera de línea. Requiere intervención inmediata.',
        actions: [
          'Verificar alimentación eléctrica y cableado físico',
          'Revisar enlace de red y switch de distribución',
          'Reemplazar equipo si falla persiste tras reinicio',
        ],
      };
    }

    // Score de riesgo
    let score = 0;
    const factors = [];

    // Penalización por estado dormant
    if (status === 'dormant') {
      score += 2;
      factors.push('Estado dormant (+2)');
    }

    // Outages del AP
    if (outages >= 25) { score += 4; factors.push(`Caídas del AP: ${outages} (+4)`); }
    else if (outages >= 15) { score += 3; factors.push(`Caídas del AP: ${outages} (+3)`); }
    else if (outages >= 10) { score += 2; factors.push(`Caídas del AP: ${outages} (+2)`); }
    else if (outages >= 5) { score += 1; factors.push(`Caídas del AP: ${outages} (+1)`); }

    // Tasa promedio de desconexión de clientes
    if (avgDiscRate >= 1.4) { score += 4; factors.push(`Tasa desconexión: ${avgDiscRate.toFixed(2)} (+4)`); }
    else if (avgDiscRate >= 1.2) { score += 3; factors.push(`Tasa desconexión: ${avgDiscRate.toFixed(2)} (+3)`); }
    else if (avgDiscRate >= 1.0) { score += 1; factors.push(`Tasa desconexión: ${avgDiscRate.toFixed(2)} (+1)`); }

    // Densidad de errores de cliente
    if (errorDensity >= 0.5) { score += 2; factors.push(`Densidad errores: ${errorDensity.toFixed(2)}/h (+2)`); }
    else if (errorDensity >= 0.2) { score += 1; factors.push(`Densidad errores: ${errorDensity.toFixed(2)}/h (+1)`); }

    // Clasificación final
    let maintenanceType, urgency, reason, actions;

    if (score >= 7) {
      maintenanceType = 'PREDICTIVO';
      urgency = 'ALTA';
      reason = 'Métricas de riesgo críticas. Alta probabilidad de falla próxima.';
      actions = [
        'Programar inspección de campo esta semana',
        'Revisar logs de firmware y temperatura del equipo',
        'Evaluar sustitución preventiva del hardware',
        'Verificar calidad del enlace de backhaul',
      ];
    } else if (score >= 3) {
      maintenanceType = 'PREVENTIVO';
      urgency = 'MEDIA';
      reason = 'Indicadores de desgaste moderado. Intervención planificada recomendada.';
      actions = [
        'Incluir en ronda de mantenimiento mensual',
        'Revisar configuración de canal y potencia RF',
        'Limpiar y verificar conexiones físicas',
        'Actualizar firmware si hay versión disponible',
      ];
    } else {
      maintenanceType = 'NORMAL';
      urgency = 'BAJA';
      reason = 'Operación estable. Sin indicadores de riesgo significativos.';
      actions = ['Continuar monitoreo rutinario', 'Incluir en revisión trimestral'];
    }

    return {
      ap_name: ap.ap_name,
      status: ap.status,
      maintenance_type: maintenanceType,
      urgency,
      score,
      outages,
      avg_disc_rate: Math.round(avgDiscRate * 100) / 100,
      client_errors: clientErrors,
      error_density: Math.round(errorDensity * 100) / 100,
      reason,
      actions,
      risk_factors: factors,
    };
  });

  // Resumen por tipo
  const summary = { CORRECTIVO: 0, PREDICTIVO: 0, PREVENTIVO: 0, NORMAL: 0 };
  results.forEach((r) => { summary[r.maintenance_type] = (summary[r.maintenance_type] || 0) + 1; });

  const priorityOrder = { CORRECTIVO: 0, PREDICTIVO: 1, PREVENTIVO: 2, NORMAL: 3 };
  results.sort((a, b) => {
    const pd = priorityOrder[a.maintenance_type] - priorityOrder[b.maintenance_type];
    return pd !== 0 ? pd : b.score - a.score;
  });

  return { aps: results, summary };
}

export function getDashboardStats() {
  const { accessPoints, clients, networkEvents, hourlyMetrics } = getData();
  return {
    summary: {
      total_aps: accessPoints.length,
      online_aps: accessPoints.filter((a) => String(a.status).toLowerCase() === 'online').length,
      offline_aps: accessPoints.filter((a) => String(a.status).toLowerCase() === 'offline').length,
      dormant_aps: accessPoints.filter((a) => String(a.status).toLowerCase() === 'dormant').length,
      total_clients: clients.length,
      total_events: networkEvents.length,
      total_usage_gb: (clients.reduce((s, c) => s + toFloat(c.usage_mb), 0) / 1024).toFixed(2),
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
      connections: toInt(r.total_connections),
      disconnections: toInt(r.total_disconnections),
      unique_clients: toInt(r.unique_clients),
    }));
}
