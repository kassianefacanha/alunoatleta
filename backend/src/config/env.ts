import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';
import { getSecurityConfigurationIssues } from './securityRules.js';

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
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET
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
  TEST_STUDENT_EMAIL: z.string().trim().email().transform((email) => email.toLowerCase()).optional(),
  TEST_STUDENT_PASSWORD: z.string().min(12).optional(),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  TERMS_VERSION: z.string().default('2026-01'),
  R2_ACCOUNT_ID: z.string().min(1).optional().or(z.literal('')),
  R2_ACCESS_KEY_ID: z.string().min(1).optional().or(z.literal('')),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional().or(z.literal('')),
  R2_BUCKET_NAME: z.string().min(1),
  R2_ENDPOINT: z.string().url().optional()
}).superRefine((config, context) => {
  for (const issue of getSecurityConfigurationIssues({
    nodeEnv: config.NODE_ENV,
    jwtAccessSecret: config.JWT_ACCESS_SECRET,
    jwtRefreshSecret: config.JWT_REFRESH_SECRET,
    frontendOrigin: config.FRONTEND_ORIGIN,
    mongodbUri: config.MONGODB_URI,
    r2AccessKeyId: config.R2_ACCESS_KEY_ID || undefined,
    r2SecretAccessKey: config.R2_SECRET_ACCESS_KEY || undefined,
    r2AccountId: config.R2_ACCOUNT_ID || undefined,
    r2Endpoint: config.R2_ENDPOINT
  })) {
    context.addIssue({ code: 'custom', message: issue.message, path: [issue.path] });
  }
  if (config.ADMIN_EMAIL === config.TEACHER_EMAIL) {
    context.addIssue({ code: 'custom', message: 'ADMIN_EMAIL e TEACHER_EMAIL devem ser diferentes.', path: ['TEACHER_EMAIL'] });
  }
  if (Boolean(config.TEST_STUDENT_EMAIL) !== Boolean(config.TEST_STUDENT_PASSWORD)) {
    context.addIssue({
      code: 'custom',
      message: 'Configure TEST_STUDENT_EMAIL e TEST_STUDENT_PASSWORD juntos.',
      path: ['TEST_STUDENT_EMAIL']
    });
  }
  if (config.TEST_STUDENT_EMAIL && [config.ADMIN_EMAIL, config.TEACHER_EMAIL].includes(config.TEST_STUDENT_EMAIL)) {
    context.addIssue({
      code: 'custom',
      message: 'A conta de teste deve ter e-mail diferente do administrador e do professor.',
      path: ['TEST_STUDENT_EMAIL']
    });
  }
  if (config.NODE_ENV === 'production' && (config.TEST_STUDENT_EMAIL || config.TEST_STUDENT_PASSWORD)) {
    context.addIssue({
      code: 'custom',
      message: 'Credenciais de aluno de teste não podem ser configuradas em produção.',
      path: ['TEST_STUDENT_EMAIL']
    });
  }
});

export const env = envSchema.parse(rawEnv);
