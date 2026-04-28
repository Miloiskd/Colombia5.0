import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAllData } from './services/dataLoader.js';
import dashboardRoutes from './routes/dashboard.js';
import reportsRoutes from './routes/reports.js';
import workersRoutes from './routes/workers.js';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use(express.static(path.join(__dirname, '../dashboard')));
app.use('/api', dashboardRoutes);
app.use('/api', reportsRoutes);
app.use('/api', workersRoutes);

const PORT = config.server.port;

loadAllData()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
      console.log(`Dashboard: http://localhost:${PORT}/index.html`);
      console.log(`API: http://localhost:${PORT}/api/stats`);
    });
  })
  .catch((err) => {
    console.error('Error cargando datos:', err);
    process.exit(1);
  });
