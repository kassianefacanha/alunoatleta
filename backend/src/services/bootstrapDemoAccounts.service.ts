import { User } from "../models/index.js";
import { env } from "../config/environment.js";
import { hashPassword, validatePassword } from "./password.service.js";

type DemoAccountRole = "ADM" | "PROFESSOR" | "ALUNO";

interface DemoAccount {
  role: DemoAccountRole;
  email: string;
  password: string | undefined;
  fullName: string;
  isTestData: boolean;
  status?: "aprovado";
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

async function ensureAccount(account: DemoAccount, emailVariable: string, passwordVariable: string) {
  const email = account.email.trim().toLowerCase();
  const existing = await User.findOne({ email }).select("role deletedAt");
  if (existing) {
    if (existing.deletedAt || existing.role !== account.role) {
      throw new Error(`${emailVariable} já está associado a uma conta incompatível ou desativada.`);
    }
    return false;
  }
  if (!account.password) {
    throw new Error(`Defina ${passwordVariable} para criar a conta de demonstração ${account.role}.`);
  }
  const passwordError = validatePassword(account.password, account.fullName);
  if (passwordError) {
    throw new Error(`${passwordVariable} inválida: ${passwordError}`);
  }

  try {
    await User.create({
      email,
      passwordHash: await hashPassword(account.password),
      fullName: account.fullName,
      role: account.role,
      ...(account.status ? { status: account.status } : {}),
      isTestData: account.isTestData,
    });
    console.log(`Conta inicial criada: ${account.role}${account.isTestData ? " (demonstração)" : ""}.`);
    return true;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const conflictingAccount = await User.findOne({ email }).select("role deletedAt");
    if (!conflictingAccount || conflictingAccount.deletedAt || conflictingAccount.role !== account.role) {
      throw new Error(`${emailVariable} foi cadastrado por outra conta ou já está em uso por um perfil incompatível.`);
    }
    return false;
  }
}

export async function ensureBootstrapAccounts() {
  if (!env.TEACHER_EMAIL) {
    throw new Error("Defina TEACHER_EMAIL para criar ou localizar a conta de demonstração do professor.");
  }
  if (!env.TEST_STUDENT_EMAIL) {
    throw new Error("Defina TEST_STUDENT_EMAIL para criar ou localizar a conta de demonstração do aluno.");
  }
  const emails = [
    env.ADMIN_EMAIL?.trim().toLowerCase(),
    env.TEACHER_EMAIL.trim().toLowerCase(),
    env.TEST_STUDENT_EMAIL.trim().toLowerCase(),
  ].filter((email): email is string => Boolean(email));
  if (new Set(emails).size !== emails.length) {
    throw new Error("ADMIN_EMAIL, TEACHER_EMAIL e TEST_STUDENT_EMAIL devem ser diferentes.");
  }

  if (!await User.exists({ role: "ADM", deletedAt: null })) {
    if (!env.ADMIN_EMAIL) throw new Error("Defina ADMIN_EMAIL para criar a primeira conta de administração.");
    await ensureAccount({
      role: "ADM",
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      fullName: "Administração do Projeto",
      isTestData: false,
    }, "ADMIN_EMAIL", "ADMIN_PASSWORD");
  }

  await ensureAccount({
    role: "PROFESSOR",
    email: env.TEACHER_EMAIL,
    password: env.TEACHER_PASSWORD,
    fullName: "Perfil docente de demonstração",
    isTestData: true,
  }, "TEACHER_EMAIL", "TEACHER_PASSWORD");

  await ensureAccount({
    role: "ALUNO",
    email: env.TEST_STUDENT_EMAIL,
    password: env.TEST_STUDENT_PASSWORD,
    fullName: "Perfil estudantil de demonstração",
    status: "aprovado",
    isTestData: true,
  }, "TEST_STUDENT_EMAIL", "TEST_STUDENT_PASSWORD");
}
