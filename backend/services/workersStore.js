import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKERS_FILE = path.join(__dirname, '../data/workers.json');
const SEED_FILE = path.join(__dirname, '../data/workers.seed.json');

async function readJson(filePath, fallback = []) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeWorkers(workers) {
  await fs.mkdir(path.dirname(WORKERS_FILE), { recursive: true });
  await fs.writeFile(WORKERS_FILE, JSON.stringify(workers, null, 2), 'utf8');
}

export async function listWorkers() {
  const workers = await readJson(WORKERS_FILE, null);
  if (workers) return workers;
  return readJson(SEED_FILE, []);
}

export async function addWorker(worker) {
  const workers = await listWorkers();
  workers.unshift(worker);
  await writeWorkers(workers);
  return worker;
}

export async function updateWorker(workerId, updates) {
  const workers = await listWorkers();
  const index = workers.findIndex((item) => item.id === workerId);
  if (index === -1) return null;
  workers[index] = { ...workers[index], ...updates };
  await writeWorkers(workers);
  return workers[index];
}

export async function deleteWorker(workerId) {
  const workers = await listWorkers();
  const next = workers.filter((item) => item.id !== workerId);
  if (next.length === workers.length) return false;
  await writeWorkers(next);
  return true;
}

export async function getWorkerById(workerId) {
  const workers = await listWorkers();
  return workers.find((item) => item.id === workerId) || null;
}
