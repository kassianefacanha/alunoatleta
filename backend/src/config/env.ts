import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const candidatePaths = [
  process.cwd(),
  path.resolve(currentDir, '../..'),
  path.resolve(currentDir, '..'),
  path.resolve(currentDir, '../../..')
].filter((value, index, arr) => arr.indexOf(value) === index);

for (const basePath of candidatePaths) {
  const envFile = path.join(basePath, '.env');
  loadDotEnv({ path: envFile });
}

const rawEnv = {
  ...process.env,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.string().trim().email().transform((email) => email.toLowerCase()),
  ADMIN_PASSWORD: z.string().min(12),
  TEACHER_EMAIL: z.string().trim().email().transform((email) => email.toLowerCase()),
  TEACHER_PASSWORD: z.string().min(12),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  TERMS_VERSION: z.string().default('2026-01'),
  R2_ACCOUNT_ID: z.string().min(1).optional().or(z.literal('')),
  R2_ACCESS_KEY_ID: z.string().min(1).optional().or(z.literal('')),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional().or(z.literal('')),
  R2_BUCKET_NAME: z.string().min(1),
  R2_ENDPOINT: z.string().url().optional()
}).refine((config) => config.ADMIN_EMAIL !== config.TEACHER_EMAIL, {
  message: 'ADMIN_EMAIL e TEACHER_EMAIL devem ser diferentes.',
  path: ['TEACHER_EMAIL']
});

export const env = envSchema.parse(rawEnv);
