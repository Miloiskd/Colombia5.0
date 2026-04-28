import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

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
      .on('data', (row) => records.push(row))
      .on('end', () => resolve(records))
      .on('error', reject);
  });
}

export async function loadAllData() {
  const [accessPoints, hourlyMetrics, clients, networkEvents] = await Promise.all([
    loadCSV('access_points_curated.csv'),
    loadCSV('ap_hourly_metrics_curated.csv'),
    loadCSV('clients_curated.csv'),
    loadCSV('network_events_curated.csv'),
  ]);

  cache = { accessPoints, hourlyMetrics, clients, networkEvents, loadedAt: new Date() };
  console.log(
    `Datos cargados: ${accessPoints.length} APs, ${networkEvents.length} eventos, ${clients.length} clientes`
  );
  return cache;
}

export function getData() {
  if (!cache.loadedAt) {
    throw new Error('Datos no cargados aun. Llame loadAllData() primero.');
  }
  return cache;
}
