import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_FILE = path.join(__dirname, '../data/reports.json');

async function readReports() {
  try {
    const content = await fs.readFile(REPORTS_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeReports(reports) {
  await fs.mkdir(path.dirname(REPORTS_FILE), { recursive: true });
  await fs.writeFile(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8');
}

export async function listReports() {
  return readReports();
}

export async function addReport(report) {
  const reports = await readReports();
  reports.unshift(report);
  await writeReports(reports);
  return report;
}

export async function assignReport(reportId, workerId) {
  const reports = await readReports();
  const index = reports.findIndex((item) => item.id === reportId);
  if (index === -1) return null;

  reports[index] = {
    ...reports[index],
    assignedWorkerId: workerId || null,
    status: workerId ? 'assigned' : 'open',
    assignedAt: workerId ? new Date().toISOString() : null,
  };

  await writeReports(reports);
  return reports[index];
}
