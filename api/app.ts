import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import v1Routes from './routes/v1.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app: express.Application = express();
const distPath = path.resolve(__dirname, '../dist');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/v1', v1Routes);

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'ok',
  });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));

  app.get('*', (_req: Request, res: Response, next: NextFunction) => {
    if (_req.path.startsWith('/api')) {
      return next();
    }

    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((error: Error, _req: Request, res: Response, next: NextFunction) => {
  void next;
  res.status(500).json({
    success: false,
    error: error.message || 'Server internal error',
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.path}`,
  });
});

export default app;
