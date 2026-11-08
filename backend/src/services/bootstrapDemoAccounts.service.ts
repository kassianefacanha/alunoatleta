import { Class, Modality, Task, User } from "../models/index.js";
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

function reportAccountConflict(account: DemoAccount, emailVariable: string, reason: string) {
  const message = `${emailVariable} ${reason}`;
  if (account.isTestData) {
    console.warn(`${message} A conta de demonstração foi ignorada; configure um e-mail exclusivo para criá-la.`);
    return;
  }
  throw new Error(message);
}

async function migrateLegacyAdmin(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const legacyAdmin = await User.collection.findOne({
    email: normalizedEmail,
    role: "admin",
    isActive: true,
  });
  if (!legacyAdmin) return;

  const result = await User.collection.updateOne(
    { _id: legacyAdmin._id, email: normalizedEmail, role: "admin", isActive: true },
    [
      {
        $set: {
          role: "ADM",
          fullName: { $ifNull: ["$fullName", "Administração do Projeto"] },
          deletedAt: null,
          updatedAt: new Date(),
        },
      },
      { $unset: ["isActive", "teacherPermissions", "refreshTokenHash"] },
    ],
  );
  if (result.matchedCount !== 1) {
    throw new Error("A conta administrativa antiga mudou durante a migração. Reinicie o serviço para tentar novamente.");
  }
  console.log("Conta administrativa antiga migrada para o perfil ADM.");
}

async function ensureAccount(account: DemoAccount, emailVariable: string, passwordVariable: string) {
  const email = account.email.trim().toLowerCase();
  const existing = await User.findOne({ email }).select("role deletedAt isTestData");
  if (existing) {
    if (
      existing.deletedAt ||
      existing.role !== account.role ||
      existing.isTestData !== account.isTestData
    ) {
      reportAccountConflict(
        account,
        emailVariable,
        "já está associado a uma conta incompatível, desativada ou não marcada como demonstração.",
      );
      return false;
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
    const conflictingAccount = await User.findOne({ email }).select("role deletedAt isTestData");
    if (
      !conflictingAccount ||
      conflictingAccount.deletedAt ||
      conflictingAccount.role !== account.role ||
      conflictingAccount.isTestData !== account.isTestData
    ) {
      reportAccountConflict(
        account,
        emailVariable,
        "foi cadastrado por outra conta ou já está em uso por um perfil incompatível.",
      );
      return false;
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

  if (env.ADMIN_EMAIL) {
    await migrateLegacyAdmin(env.ADMIN_EMAIL);
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

  const [teacher, student] = await Promise.all([
    User.findOne({
      email: env.TEACHER_EMAIL.toLowerCase(),
      role: "PROFESSOR",
      isTestData: true,
      deletedAt: null,
    }),
    User.findOne({
      email: env.TEST_STUDENT_EMAIL.toLowerCase(),
      role: "ALUNO",
      isTestData: true,
      deletedAt: null,
    }),
  ]);
  if (!teacher || !student) {
    console.warn("Espaço de teste não foi criado porque uma ou mais contas de demonstração não existem.");
    return;
  }

  const modality = await Modality.findOneAndUpdate(
    { name: "Futsal" },
    { $setOnInsert: { name: "Futsal", description: "Modalidade do espaço de demonstração." } },
    { upsert: true, new: true },
  );
  const demoClass = await Class.findOneAndUpdate(
    { name: "Turma de demonstração", teacherIds: teacher._id, isTestData: true },
    {
      $setOnInsert: {
        modality: modality.name,
        teacherIds: [teacher._id],
        enrollmentLimit: 30,
        enrolledCount: 1,
        enrollmentCounterInitialized: true,
        isTestData: true,
      },
    },
    { upsert: true, new: true },
  );
  await Promise.all([
    User.updateOne(
      { _id: teacher._id, isTestData: true },
      { $set: { classIds: [demoClass._id] } },
    ),
    User.updateOne(
      { _id: student._id, isTestData: true },
      {
        $set: { classIds: [demoClass._id], status: "aprovado", modality: modality.name },
      },
    ),
    Task.updateOne(
      { classId: demoClass._id, title: "Atividade de demonstração", isTestData: true },
      {
        $setOnInsert: {
          title: "Atividade de demonstração",
          description: "Envie uma resposta para testar a interação entre os painéis.",
          classId: demoClass._id,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdBy: teacher._id,
          isTestData: true,
          data: { allowResponse: true },
        },
      },
      { upsert: true },
    ),
  ]);
  console.log("Espaço isolado de demonstração preparado para os painéis de professor e aluno.");
}
