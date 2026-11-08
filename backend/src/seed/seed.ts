import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../config/database.js";
import { env } from "../config/environment.js";
import { Attendance, Class, Evaluation, Event, LessonPlan, Material, Modality, Task, User } from "../models/index.js";

async function seedData() {
  if (env.NODE_ENV === "production") {
    throw new Error("A seed de demonstração não pode ser executada em produção.");
  }
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD || !env.SEED_TEST_PASSWORD) {
    throw new Error("Defina SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD e SEED_TEST_PASSWORD no .env para executar a seed.");
  }
  await connectDatabase();

  const adminEmail = env.SEED_ADMIN_EMAIL.toLowerCase();
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      email: adminEmail,
      passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12),
      fullName: "Admin de demonstração",
      role: "ADM",
      isTestData: true,
    });
  }

  const modality = await Modality.findOneAndUpdate(
    { name: "Futsal" },
    { $setOnInsert: { name: "Futsal", description: "Atividades de futsal." } },
    { upsert: true, new: true },
  );

  const teacherIds: typeof admin._id[] = [];
  const teacherAccounts = [
    {
      email: env.TEACHER_EMAIL ?? "prof1@alunoatleta.test",
      password: env.TEACHER_PASSWORD ?? env.SEED_TEST_PASSWORD,
      fullName: "Ana Souza",
    },
    {
      email: "prof2@alunoatleta.test",
      password: env.SEED_TEST_PASSWORD,
      fullName: "Carlos Lima",
    },
  ];
  for (const account of teacherAccounts) {
    const email = account.email.toLowerCase();
    let teacher = await User.findOne({ email });
    if (!teacher) {
      teacher = await User.create({
        email,
        passwordHash: await bcrypt.hash(account.password, 12),
        fullName: account.fullName,
        role: "PROFESSOR",
        isTestData: true,
      });
    }
    teacherIds.push(teacher._id);
  }

  const classes: Array<{ _id: Types.ObjectId; name: string }> = [];
  for (const [index, name] of ["Futsal Manhã", "Futsal Tarde", "Futsal Noite"].entries()) {
    const sportsClass = await Class.findOneAndUpdate(
      { name, isTestData: true },
      { $setOnInsert: { name, modality: modality.name, teacherIds: [teacherIds[index % 2]], isTestData: true } },
      { upsert: true, new: true },
    );
    classes.push(sportsClass);
  }

  const students = [];
  for (let index = 0; index < 9; index++) {
    const email = (index === 0
      ? env.TEST_STUDENT_EMAIL ?? "aluno1@alunoatleta.test"
      : `aluno${index + 1}@alunoatleta.test`).toLowerCase();
    const existing = await User.findOne({ email });
    if (existing) {
      students.push(existing);
      continue;
    }
    students.push(await User.create({
      email,
      passwordHash: await bcrypt.hash(env.TEST_STUDENT_PASSWORD ?? env.SEED_TEST_PASSWORD, 12),
      fullName: `Aluno demonstração ${index + 1}`,
      role: "ALUNO",
      status: index < 6 ? "aprovado" : index < 8 ? "pendente" : "recusado",
      rejectionReason: index === 8 ? "Envie uma ficha de inscrição legível." : "",
      classIds: [classes[index % classes.length]!._id],
      modality: modality.name,
      termsAcceptedAt: new Date(),
      termsAcceptedIp: "127.0.0.1",
      termsVersion: env.TERMS_VERSION,
      isTestData: true,
    }));
  }

  const demoOperations = [
    () => Task.updateOne(
      { title: "Passe e movimentação", isTestData: true },
      { $setOnInsert: { title: "Passe e movimentação", description: "Treino de fundamento com a equipe.", classId: classes[0]!._id, createdBy: teacherIds[0], isTestData: true } },
      { upsert: true },
    ),
    () => Task.updateOne(
      { title: "Meu esporte, minha equipe", isTestData: true },
      { $setOnInsert: { title: "Meu esporte, minha equipe", description: "Compartilhe o que você aprendeu nos treinos.", classId: classes[1]!._id, createdBy: teacherIds[0], isTestData: true } },
      { upsert: true },
    ),
    () => Material.updateOne(
      { title: "Guia de aquecimento", isTestData: true },
      { $setOnInsert: { title: "Guia de aquecimento", description: "Orientações para preparar o corpo para o treino.", classId: classes[0]!._id, createdBy: teacherIds[0], isTestData: true } },
      { upsert: true },
    ),
    () => LessonPlan.updateOne(
      { title: "Fundamentos do futsal", isTestData: true },
      { $setOnInsert: { title: "Fundamentos do futsal", content: "Condução, passes e jogo em equipe.", classId: classes[0]!._id, createdBy: teacherIds[0], isTestData: true } },
      { upsert: true },
    ),
    () => Event.updateOne(
      { title: "Festival Aluno / Atleta", isTestData: true },
      { $setOnInsert: { title: "Festival Aluno / Atleta", description: "Encontro da comunidade esportiva.", classId: classes[1]!._id, createdBy: teacherIds[0], isTestData: true } },
      { upsert: true },
    ),
    ...students.slice(0, 2).map((student, index) =>
      () => Attendance.updateOne(
        { studentId: student._id, date: new Date("2025-01-15T12:00:00Z") },
        { $setOnInsert: { classId: classes[0]!._id, studentId: student._id, date: new Date("2025-01-15T12:00:00Z"), present: index === 0, registeredBy: teacherIds[0], isTestData: true } },
        { upsert: true },
      ),
    ),
    ...students.slice(0, 1).map((student) =>
      () => Evaluation.updateOne(
        { studentId: student._id, title: "Evolução de fundamentos", isTestData: true },
        { $setOnInsert: { title: "Evolução de fundamentos", grade: 9, feedback: "Boa participação e espírito de equipe.", studentId: student._id, classId: classes[0]!._id, createdBy: teacherIds[0], isTestData: true } },
        { upsert: true },
      ),
    ),
  ];
  await Promise.all(demoOperations.map((operation) => operation()));
  console.log(`Seed idempotente concluído: ${classes.length} turmas, ${students.length} alunos, 1 administrador e 2 professores. Os registros de exemplo são visíveis apenas para ADM.`);
}

seedData()
  .catch((error: unknown) => {
    console.error("Não foi possível concluir a seed de demonstração.", error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
