import dotenv from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: resolve(process.cwd(), "../.env") });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/alunoatleta"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve conter pelo menos 32 caracteres."),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET deve conter pelo menos 32 caracteres."),
  TERMS_VERSION: z.string().default("1.0"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default("aluno-atleta-uploads"),
  R2_ENDPOINT: z.string().url().optional(),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(12).optional(),
  SEED_TEST_PASSWORD: z.string().min(12).optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  TEACHER_EMAIL: z.string().email().optional(),
  TEACHER_PASSWORD: z.string().min(12).optional(),
  TEST_STUDENT_EMAIL: z.string().email().optional(),
  TEST_STUDENT_PASSWORD: z.string().min(12).optional(),
  SEED_CLEAR_CONFIRM: z.string().optional(),
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join(" ");
  console.error("Configuração inválida:", issues);
  throw new Error("Configure as variáveis obrigatórias no arquivo .env antes de iniciar.");
}

export const env = {
  ...parsed.data,
  SEED_ADMIN_EMAIL: parsed.data.SEED_ADMIN_EMAIL ?? parsed.data.ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD: parsed.data.SEED_ADMIN_PASSWORD ?? parsed.data.ADMIN_PASSWORD,
  SEED_TEST_PASSWORD: parsed.data.SEED_TEST_PASSWORD ?? parsed.data.TEST_STUDENT_PASSWORD,
};
export const isR2Configured = Boolean(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_ENDPOINT,
);
