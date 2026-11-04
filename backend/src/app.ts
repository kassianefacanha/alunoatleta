import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { documentsRouter } from './routes/documents.js';
import { exportsRouter } from './routes/exports.js';
import { managementRouter } from './routes/management.js';
import { uploadsRouter } from './routes/uploads.js';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = !origin || origin === new URL(env.FRONTEND_ORIGIN).origin ||
      (env.NODE_ENV !== 'production' && origin === 'http://localhost:3000');
    callback(allowed ? null : new Error('Origem não permitida pelo CORS.'), allowed);
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/v1', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});

const publicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente mais tarde.' }
});

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' }
});

app.use('/api/v1/auth/login', loginRateLimit);
app.use('/api/v1/auth', publicRateLimit, authRouter);
const registrationUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de uploads atingido. Tente novamente mais tarde.' }
});
uploadsRouter.post('/registration-presign', registrationUploadRateLimit);
app.use('/api/v1/uploads', publicRateLimit, uploadsRouter);
app.use('/api/v1/documents', documentsRouter);
app.use('/api/v1/exports', exportsRouter);
app.use('/api/v1', managementRouter);
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({ error: 'Dados inválidos.', details: error.flatten().fieldErrors });
    return;
  }
  if (error?.code === 11000) {
    res.status(409).json({ error: 'Já existe um registro com esses dados.' });
    return;
  }
  if (error?.name === 'CastError' || error?.name === 'ValidationError') {
    res.status(422).json({ error: 'Os dados enviados são inválidos.' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
};
app.use(errorHandler);
