import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { env } from "../config/environment.js";
import {
  AuditLog,
  Attendance,
  Class,
  Evaluation,
  Event,
  LGPDRequest,
  LessonPlan,
  Material,
  Modality,
  Notification,
  PasswordResetRequest,
  RegistrationSettings,
  SiteContent,
  Task,
  TaskResponse,
  User,
} from "../models/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const args = process.argv.slice(2);
const applyChanges = args.includes("--apply");
const confirmationIndex = args.indexOf("--confirm-database");
const confirmedDatabase = confirmationIndex >= 0 ? args[confirmationIndex + 1] : undefined;

const modalities = [
  { name: "Futsal", description: "Fundamentos e jogos coletivos.", icon: "soccer", color: "#DBEAFE" },
  { name: "Basquete", description: "Coordenação, arremesso e trabalho em equipe.", icon: "basketball", color: "#FFEDD5" },
  { name: "Vôlei", description: "Fundamentos de voleibol e cooperação.", icon: "volleyball", color: "#EDE9FE" },
  { name: "Handebol", description: "Velocidade, passe e estratégia.", icon: "handball", color: "#D1FAE5" },
  { name: "Tênis", description: "Coordenação motora e fundamentos de tênis.", icon: "tennis", color: "#FEF3C7" },
  { name: "Corrida", description: "Atividades de corrida e condicionamento.", icon: "running", color: "#CFFAFE" },
  { name: "Condicionamento", description: "Atividades físicas e preparação geral.", icon: "fitness", color: "#E2E8F0" },
  { name: "Natação", description: "Práticas de natação e segurança aquática.", icon: "swimming", color: "#DBEAFE" },
] as const;

const demoNames = [
  "Alex Silva", "Beatriz Santos", "Caio Oliveira", "Dandara Costa", "Enzo Almeida",
  "Fernanda Lima", "Gabriel Souza", "Helena Rocha", "Igor Ferreira", "Julia Martins",
  "Kaique Ribeiro", "Larissa Barros", "Miguel Gomes", "Nina Carvalho", "Otavio Nunes",
  "Paula Araujo", "Rafael Melo", "Sofia Freitas", "Theo Monteiro", "Valentina Castro",
  "Wesley Cardoso", "Yasmin Teixeira", "Arthur Correia", "Bianca Lopes", "Daniel Moura",
  "Ester Campos", "Felipe Batista", "Giovana Dias", "Heitor Rezende", "Isabela Peixoto",
] as const;

function dateFromNow(dayOffset: number) {
  return new Date(Date.now() + dayOffset * DAY_MS);
}

function dateOnlyFromNow(dayOffset: number) {
  const date = dateFromNow(dayOffset);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getBaseAccounts() {
  const adminEmail = env.SEED_ADMIN_EMAIL?.toLowerCase();
  const teacherEmail = env.TEACHER_EMAIL?.toLowerCase();
  const studentEmail = env.TEST_STUDENT_EMAIL?.toLowerCase();
  if (!adminEmail || !teacherEmail || !studentEmail || !env.SEED_TEST_PASSWORD) {
    throw new Error(
      "Configure ADMIN_EMAIL, TEACHER_EMAIL, TEST_STUDENT_EMAIL e TEST_STUDENT_PASSWORD no .env.",
    );
  }
  if (new Set([adminEmail, teacherEmail, studentEmail]).size !== 3) {
    throw new Error("Os e-mails das três contas padrão devem ser diferentes.");
  }
  return { adminEmail, teacherEmail, studentEmail };
}

function assertLocalDatabaseUri(uri: string) {
  const authority = /^mongodb:\/\/([^/?#]+)/i.exec(uri)?.[1];
  if (!authority) {
    throw new Error("Este comando exige uma URI mongodb:// local; mongodb+srv não é permitido.");
  }
  const hostList = authority.slice(authority.lastIndexOf("@") + 1);
  const hosts = hostList.split(",").map((address) => {
    if (address.startsWith("[")) return address.slice(1, address.indexOf("]")).toLowerCase();
    return address.split(":")[0]!.toLowerCase();
  });
  if (!hosts.length || hosts.some((hostname) =>
    !["localhost", "127.0.0.1", "::1"].includes(hostname))) {
    throw new Error("Este comando só pode limpar um MongoDB local (localhost ou loopback).");
  }
}

function printUsage() {
  console.log([
    "Uso seguro:",
    "  npm run seed:demo-reset",
    "  npm run seed:demo-reset -- --apply --confirm-database <nome-exato-do-banco>",
    "A primeira forma apenas exibe o alvo e as contagens; a segunda limpa e repovoa o banco local.",
  ].join("\n"));
}

async function getCollectionsSummary() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Conexão sem banco selecionado.");
  const collections = await db.listCollections({}, { nameOnly: false }).toArray();
  const summary = await Promise.all(collections
    .filter((collection) => collection.type !== "view")
    .map(async (collection) => ({
      name: collection.name,
      count: await db.collection(collection.name).countDocuments({}),
    })));
  return summary.sort((left, right) => left.name.localeCompare(right.name));
}

async function validateBaseAccounts(baseEmails: string[]) {
  const accounts = await User.find({ email: { $in: baseEmails } }).select("email role");
  const expectedRoles = new Map([
    [baseEmails[0], "ADM"],
    [baseEmails[1], "PROFESSOR"],
    [baseEmails[2], "ALUNO"],
  ]);
  if (accounts.length !== baseEmails.length || accounts.some((account) =>
    expectedRoles.get(account.email) !== account.role)) {
    throw new Error(
      "As três contas do .env precisam existir no banco e ter os papéis ADM, PROFESSOR e ALUNO, nessa ordem.",
    );
  }
  const accountsByEmail = new Map(accounts.map((account) => [account.email, account]));
  return baseEmails.map((email) => accountsByEmail.get(email)!);
}

async function resetCollections(baseEmails: string[]) {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Conexão sem banco selecionado.");
  const collections = await db.listCollections({}, { nameOnly: false }).toArray();
  for (const collection of collections) {
    if (collection.type === "view") continue;
    if (collection.name === User.collection.collectionName) {
      await db.collection(collection.name).deleteMany({ email: { $nin: baseEmails } });
    } else {
      await db.collection(collection.name).deleteMany({});
    }
  }
}

async function createUsers(
  passwordHash: string,
  count: number,
  role: "PROFESSOR" | "ALUNO",
  isTestData: boolean,
) {
  return User.insertMany(Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const fullName = demoNames[(index + (role === "PROFESSOR" ? 11 : 0)) % demoNames.length]!;
    const email = role === "PROFESSOR"
      ? `${isTestData ? "admin.teste" : "demo"}.professor${number}@alunoatleta.test`
      : `${isTestData ? "admin.teste" : "demo"}.aluno${String(number).padStart(2, "0")}@alunoatleta.test`;
    const age = 8 + (index % 10);
    const approved = role === "ALUNO" && (isTestData ? index % 4 !== 0 : index < 12);
    const pending = role === "ALUNO" && !isTestData && index >= 12 && index < 15;
    const status = role === "ALUNO"
      ? approved ? "aprovado" : pending ? "pendente" : "recusado"
      : undefined;
    return {
      email,
      passwordHash,
      fullName,
      role,
      ...(role === "ALUNO" && {
        status,
        rejectionReason: status === "recusado" ? "Envie uma ficha de inscrição legível." : "",
        rejectionReasons: status === "recusado" ? ["documento_ilegivel"] : [],
        age,
        birthDate: new Date(Date.UTC(new Date().getUTCFullYear() - age, index % 12, 10)),
        gender: ["Feminino", "Masculino", "Outro"][index % 3],
        modality: modalities[index % modalities.length]!.name,
        school: `Escola de demonstração ${1 + (index % 5)}`,
        address: {
          neighborhood: `Bairro de demonstração ${1 + (index % 4)}`,
          city: "Fortaleza",
          street: `Rua de demonstração ${number}`,
          number: String(100 + number),
          complement: "",
        },
        guardian: { name: `Responsável de demonstração ${number}`, phone: `8599000${String(number).padStart(4, "0")}` },
        termsAcceptedAt: dateFromNow(-index - 1),
        termsAcceptedIp: "192.0.2.10",
        termsVersion: env.TERMS_VERSION,
      }),
      isTestData,
      deletedAt: null,
    };
  }));
}

async function seedData(baseEmails: string[]) {
  const [admin, baseTeacher, baseStudent] = await validateBaseAccounts(baseEmails);
  const testPasswordHash = await bcrypt.hash(env.SEED_TEST_PASSWORD!, 12);
  const baseIds = {
    admin: admin._id,
    teacher: baseTeacher._id,
    student: baseStudent._id,
  };

  await User.updateMany(
    { email: { $in: baseEmails } },
    { $set: { isTestData: false, deletedAt: null, classIds: [] } },
  );
  const defaultStudentProfile = {
    status: "aprovado",
    rejectionReason: "",
    rejectionReasons: [],
    rejectionOtherReason: "",
    modality: modalities[0].name,
  };
  await User.updateOne({ _id: baseIds.student }, { $set: defaultStudentProfile });

  await Modality.insertMany(modalities);
  const normalTeachers = await createUsers(testPasswordHash, 3, "PROFESSOR", false);
  const testTeachers = await createUsers(testPasswordHash, 3, "PROFESSOR", true);
  const normalTeacherIds = [baseIds.teacher, ...normalTeachers.map((teacher) => teacher._id)];
  const testTeacherIds = testTeachers.map((teacher) => teacher._id);
  const modalityNames = modalities.map((modality) => modality.name);
  const visibleClasses = await Class.insertMany(Array.from({ length: 8 }, (_, index) => ({
    name: `${modalityNames[index % modalityNames.length]} demonstração ${1 + Math.floor(index / modalityNames.length)}`,
    modality: modalityNames[index % modalityNames.length],
    teacherIds: [normalTeacherIds[index % normalTeacherIds.length]!],
    enrollmentLimit: 30,
    registrationStartsAt: dateFromNow(-60),
    registrationEndsAt: dateFromNow(120),
    requiresNeighborhoodSchool: index % 2 === 0,
    minimumAge: 6,
    maximumAge: 18,
    requirements: index % 2 === 0 ? ["Comparecer com roupa adequada para a prática."] : [],
    enrolledCount: 0,
    enrollmentCounterInitialized: true,
    isTestData: false,
  })));
  const testClasses = await Class.insertMany(Array.from({ length: 12 }, (_, index) => ({
    name: `Turma exclusiva ADM ${String(index + 1).padStart(2, "0")}`,
    modality: modalityNames[(index + 2) % modalityNames.length],
    teacherIds: [testTeacherIds[index % testTeacherIds.length]!],
    enrollmentLimit: 36,
    registrationStartsAt: dateFromNow(-90),
    registrationEndsAt: dateFromNow(180),
    minimumAge: 6,
    maximumAge: 18,
    requirements: [],
    enrolledCount: 0,
    enrollmentCounterInitialized: true,
    isTestData: true,
  })));

  const normalStudents = await createUsers(testPasswordHash, 18, "ALUNO", false);
  const testStudents = await createUsers(testPasswordHash, 36, "ALUNO", true);
  await Promise.all([
    ...normalStudents.map((student, index) => User.updateOne(
      { _id: student._id },
      { $set: { classIds: [visibleClasses[index % visibleClasses.length]!._id] } },
    )),
    ...testStudents.map((student, index) => User.updateOne(
      { _id: student._id },
      { $set: { classIds: [testClasses[index % testClasses.length]!._id] } },
    )),
    User.updateOne(
      { _id: baseIds.student },
      { $set: { classIds: [visibleClasses[0]!._id, visibleClasses[1]!._id] } },
    ),
  ]);
  await Promise.all([
    ...visibleClasses.map(async (sportsClass) => {
      const enrolledCount = await User.countDocuments({
        classIds: sportsClass._id,
        role: "ALUNO",
        status: "aprovado",
        isTestData: false,
        deletedAt: null,
      });
      await Class.updateOne({ _id: sportsClass._id }, { $set: { enrolledCount } });
    }),
    ...testClasses.map(async (sportsClass) => {
      const enrolledCount = await User.countDocuments({
        classIds: sportsClass._id,
        role: "ALUNO",
        status: "aprovado",
        isTestData: true,
        deletedAt: null,
      });
      await Class.updateOne({ _id: sportsClass._id }, { $set: { enrolledCount } });
    }),
  ]);

  const visibleStudentIds = [
    baseIds.student,
    ...normalStudents.filter((student) => student.status === "aprovado").map((student) => student._id),
  ];
  const testStudentIds = testStudents
    .filter((student) => student.status === "aprovado")
    .map((student) => student._id);
  const classForStudent = new Map<string, Types.ObjectId>();
  classForStudent.set(String(baseIds.student), visibleClasses[0]!._id);
  normalStudents.forEach((student, index) => classForStudent.set(
    String(student._id),
    visibleClasses[index % visibleClasses.length]!._id,
  ));
  testStudents.forEach((student, index) => classForStudent.set(
    String(student._id),
    testClasses[index % testClasses.length]!._id,
  ));

  const visibleTasks = await Task.insertMany(Array.from({ length: 24 }, (_, index) => ({
    title: [
      "Fundamentos e movimentação", "Trabalho em equipe", "Desafio de coordenação",
      "Revisão do treino", "Estratégia de jogo", "Diário de atividades",
    ][index % 6],
    description: `Atividade de demonstração ${index + 1} para a turma.`,
    content: `Descreva o que praticou na atividade ${index + 1} e o que deseja aprimorar.`,
    classId: visibleClasses[index % visibleClasses.length]!._id,
    dueDate: dateFromNow(index % 4 === 0 ? 10 + index : -1 - index),
    createdBy: normalTeacherIds[index % normalTeacherIds.length]!,
    data: { allowResponse: index % 5 !== 0 },
    isTestData: false,
  })));
  const testTasks = await Task.insertMany(Array.from({ length: 36 }, (_, index) => ({
    title: `Atividade ADM ${String(index + 1).padStart(2, "0")}`,
    description: "Atividade de demonstração visível apenas para administração.",
    content: "Registre a resposta de demonstração.",
    classId: testClasses[index % testClasses.length]!._id,
    dueDate: dateFromNow(index % 2 === 0 ? 14 : -14),
    createdBy: testTeacherIds[index % testTeacherIds.length]!,
    data: { allowResponse: index % 2 === 0 },
    isTestData: true,
  })));

  const visibleTaskResponses = await TaskResponse.insertMany(visibleTasks.slice(0, 18).flatMap((task, index) => {
    const studentsForClass = visibleStudentIds.filter((studentId) =>
      String(classForStudent.get(String(studentId))) === String(task.classId));
    const studentId = studentsForClass[index % Math.max(1, studentsForClass.length)];
    if (!studentId) return [];
    return [{
      title: `Resposta da atividade ${index + 1}`,
      content: `Resposta fictícia para a atividade ${index + 1}.`,
      description: `Resposta fictícia para a atividade ${index + 1}.`,
      taskId: task._id,
      classId: task.classId,
      studentId,
      createdBy: studentId,
      ...(index % 3 !== 0 && {
        grade: 7 + (index % 4) * 0.5,
        feedback: index % 2 === 0 ? "Boa participação; continue praticando." : "Revise os pontos combinados no treino.",
      }),
      isTestData: false,
    }];
  }));
  const testTaskResponses = await TaskResponse.insertMany(testTasks.slice(0, 24).flatMap((task, index) => {
    const studentsForClass = testStudentIds.filter((studentId) =>
      String(classForStudent.get(String(studentId))) === String(task.classId));
    const studentId = studentsForClass[index % Math.max(1, studentsForClass.length)];
    if (!studentId) return [];
    return [{
      title: `Resposta de teste ADM ${index + 1}`,
      content: "Conteúdo fictício da resposta para validação administrativa.",
      description: "Conteúdo fictício da resposta para validação administrativa.",
      taskId: task._id,
      classId: task.classId,
      studentId,
      createdBy: studentId,
      ...(index % 2 === 0 && { grade: 8, feedback: "Retorno de demonstração." }),
      isTestData: true,
    }];
  }));

  await Material.insertMany(Array.from({ length: 24 }, (_, index) => ({
    title: `Material de apoio ${index + 1}`,
    description: "Conteúdo de demonstração para apoio às aulas.",
    content: index % 2 === 0
      ? `https://example.com/material-de-demonstracao-${index + 1}`
      : `Texto de apoio ${index + 1}: aquecimento, hidratação, técnica e trabalho em equipe.`,
    type: index % 2 === 0 ? "link" : "text",
    classId: visibleClasses[index % visibleClasses.length]!._id,
    createdBy: normalTeacherIds[index % normalTeacherIds.length]!,
    isTestData: false,
  })));
  await Material.insertMany(Array.from({ length: 24 }, (_, index) => ({
    title: `Material ADM ${index + 1}`,
    description: "Material de demonstração exclusivo para administração.",
    content: "Conteúdo fictício sem arquivo externo vinculado.",
    type: "text",
    classId: testClasses[index % testClasses.length]!._id,
    createdBy: testTeacherIds[index % testTeacherIds.length]!,
    isTestData: true,
  })));

  await LessonPlan.insertMany(Array.from({ length: 24 }, (_, index) => ({
    title: `Plano de aula ${index + 1}`,
    description: `Plano de demonstração para aula ${index + 1}.`,
    content: "Acolhida, aquecimento, prática de fundamentos, atividade coletiva e alongamento.",
    date: dateFromNow(index - 12),
    classId: visibleClasses[index % visibleClasses.length]!._id,
    createdBy: normalTeacherIds[index % normalTeacherIds.length]!,
    isTestData: false,
  })));
  await LessonPlan.insertMany(Array.from({ length: 24 }, (_, index) => ({
    title: `Plano ADM ${index + 1}`,
    description: "Plano de aula fictício para administração.",
    content: "Sequência de demonstração com aquecimento e prática esportiva.",
    date: dateFromNow(index - 12),
    classId: testClasses[index % testClasses.length]!._id,
    createdBy: testTeacherIds[index % testTeacherIds.length]!,
    isTestData: true,
  })));

  await Event.insertMany(Array.from({ length: 24 }, (_, index) => ({
    title: `Evento esportivo ${index + 1}`,
    description: "Evento de demonstração para a comunidade do projeto.",
    date: dateFromNow(index - 7),
    classId: visibleClasses[index % visibleClasses.length]!._id,
    createdBy: normalTeacherIds[index % normalTeacherIds.length]!,
    isTestData: false,
  })));
  await Event.insertMany(Array.from({ length: 24 }, (_, index) => ({
    title: `Evento ADM ${index + 1}`,
    description: "Evento de demonstração exclusivo para administração.",
    date: dateFromNow(index - 7),
    classId: testClasses[index % testClasses.length]!._id,
    createdBy: testTeacherIds[index % testTeacherIds.length]!,
    isTestData: true,
  })));

  await Evaluation.insertMany(visibleStudentIds.flatMap((studentId, studentIndex) =>
    Array.from({ length: 5 }, (_, evaluationIndex) => ({
      title: [
        "Participação e presença", "Fundamentos esportivos", "Trabalho em equipe",
        "Desenvolvimento técnico", "Evolução no período",
      ][evaluationIndex]!,
      description: "Avaliação de demonstração com critérios pedagógicos.",
      date: dateFromNow(-30 + evaluationIndex * 7),
      grade: 6 + ((studentIndex + evaluationIndex) % 9) * 0.5,
      feedback: evaluationIndex % 2 === 0
        ? "Boa evolução e participação nas atividades."
        : "Continue praticando os fundamentos trabalhados.",
      studentId,
      classId: classForStudent.get(String(studentId))!,
      createdBy: baseIds.teacher,
      isTestData: false,
    })),
  ));
  await Evaluation.insertMany(testStudentIds.flatMap((studentId, studentIndex) =>
    Array.from({ length: 3 }, (_, evaluationIndex) => ({
      title: `Avaliação ADM ${evaluationIndex + 1}`,
      description: "Registro de avaliação fictício para administração.",
      date: dateFromNow(-20 + evaluationIndex * 8),
      grade: 6 + ((studentIndex + evaluationIndex) % 9) * 0.5,
      feedback: "Feedback fictício de demonstração.",
      studentId,
      classId: classForStudent.get(String(studentId))!,
      createdBy: testTeacherIds[evaluationIndex % testTeacherIds.length]!,
      isTestData: true,
    })),
  ));

  const visibleAttendance = visibleStudentIds.flatMap((studentId, studentIndex) =>
    Array.from({ length: 20 }, (_, attendanceIndex) => ({
      classId: classForStudent.get(String(studentId))!,
      studentId,
      date: dateOnlyFromNow(-(attendanceIndex + 1) * 3),
      present: (attendanceIndex + studentIndex) % 5 !== 0,
      registeredBy: baseIds.teacher,
      isTestData: false,
    })),
  );
  const testAttendance = testStudentIds.flatMap((studentId, studentIndex) =>
    Array.from({ length: 16 }, (_, attendanceIndex) => ({
      classId: classForStudent.get(String(studentId))!,
      studentId,
      date: dateOnlyFromNow(-(attendanceIndex + 1) * 4),
      present: (attendanceIndex + studentIndex) % 6 !== 0,
      registeredBy: testTeacherIds[studentIndex % testTeacherIds.length]!,
      isTestData: true,
    })),
  );
  await Attendance.insertMany([...visibleAttendance, ...testAttendance]);

  await Notification.insertMany(visibleStudentIds.flatMap((studentId, studentIndex) =>
    Array.from({ length: 4 }, (_, notificationIndex) => ({
      title: [
        "Aviso sobre a próxima aula", "Atividade disponível", "Lembrete de evento",
        "Atualização do projeto",
      ][notificationIndex]!,
      description: `Notificação de demonstração ${notificationIndex + 1}.`,
      classId: classForStudent.get(String(studentId))!,
      studentId,
      createdBy: baseIds.teacher,
      data: { read: (studentIndex + notificationIndex) % 3 === 0 },
      isTestData: false,
    })),
  ));
  await Notification.insertMany(testStudentIds.flatMap((studentId, index) => [{
    title: "Notificação exclusiva ADM",
    description: "Registro fictício para validar a listagem de administração.",
    classId: classForStudent.get(String(studentId))!,
    studentId,
    createdBy: testTeacherIds[index % testTeacherIds.length]!,
    data: { read: index % 2 === 0 },
    isTestData: true,
  }]));

  const lgpdTypes = ["access", "correction", "deletion", "portability", "revocation"] as const;
  await LGPDRequest.insertMany(visibleStudentIds.flatMap((userId, index) =>
    Array.from({ length: 2 }, (_, requestIndex) => ({
      userId,
      type: lgpdTypes[(index + requestIndex) % lgpdTypes.length],
      description: "Solicitação fictícia para testar o histórico LGPD.",
      status: ["open", "processing", "completed", "rejected"][(index + requestIndex) % 4],
      isTestData: false,
    })),
  ));
  await LGPDRequest.insertMany(testStudentIds.map((userId, index) => ({
    userId,
    type: lgpdTypes[index % lgpdTypes.length],
    description: "Solicitação fictícia exclusiva para administração.",
    status: ["open", "processing", "completed", "rejected"][index % 4],
    isTestData: true,
  })));

  await AuditLog.insertMany(Array.from({ length: 80 }, (_, index) => ({
    actorId: [baseIds.admin, baseIds.teacher, ...normalTeacherIds.slice(1)][index % (normalTeacherIds.length + 1)]!,
    action: [
      "student_profile_view", "teacher_attendance_save", "teacher_tasks_create",
      "admin_class_update", "student_lgpd_request_create", "admin_report_export",
    ][index % 6]!,
    resourceType: ["User", "Attendance", "Task", "Class", "LGPDRequest", "Report"][index % 6]!,
    at: dateFromNow(-index),
    ip: `192.0.2.${1 + (index % 200)}`,
    metadata: { source: "seed-demo", sequence: index + 1 },
  })));

  await PasswordResetRequest.insertMany([
    { userId: baseIds.student, status: "pending", requestedAt: dateFromNow(-2) },
    { userId: baseIds.teacher, status: "completed", requestedAt: dateFromNow(-15), resolvedAt: dateFromNow(-14), resolvedBy: baseIds.admin },
  ]);
  const activeStudentCount = normalStudents.filter((student) =>
    student.status === "aprovado" || student.status === "pendente").length + 1;
  await RegistrationSettings.create({
    key: "global",
    studentLimit: 500,
    studentRegistrationsOpen: true,
    studentCount: activeStudentCount,
    teacherLimit: 100,
    teacherRegistrationsOpen: true,
    teacherCount: normalTeacherIds.length,
    countersInitialized: true,
  });
  await SiteContent.create({ key: "public" });

  console.log(JSON.stringify({
    seeded: true,
    preservedBaseAccounts: 3,
    visibleDemo: {
      teachers: normalTeacherIds.length,
      students: normalStudents.length + 1,
      classes: visibleClasses.length,
      tasks: visibleTasks.length,
      taskResponses: visibleTaskResponses.length,
      materials: 24,
      lessonPlans: 24,
      events: 24,
      evaluations: visibleStudentIds.length * 5,
      attendances: visibleAttendance.length,
      notifications: visibleStudentIds.length * 4,
      lgpdRequests: visibleStudentIds.length * 2,
    },
    adminOnlyDemo: {
      teachers: testTeachers.length,
      students: testStudents.length,
      classes: testClasses.length,
      tasks: testTasks.length,
      taskResponses: testTaskResponses.length,
      materials: 24,
      lessonPlans: 24,
      events: 24,
      evaluations: testStudentIds.length * 3,
      attendances: testAttendance.length,
      notifications: testStudentIds.length,
      lgpdRequests: testStudentIds.length,
    },
    externalFiles: "não criados; requerem arquivos reais no R2",
  }, null, 2));
}

async function main() {
  if (args.includes("--help")) {
    printUsage();
    return;
  }
  if (env.NODE_ENV === "production") {
    throw new Error("A seed de demonstração é bloqueada em produção.");
  }
  const base = getBaseAccounts();
  const baseEmails = [base.adminEmail, base.teacherEmail, base.studentEmail];
  assertLocalDatabaseUri(env.MONGODB_URI);
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 2,
  });
  const db = mongoose.connection.db;
  if (!db) throw new Error("Conexão sem banco selecionado.");
  const accounts = await validateBaseAccounts(baseEmails);
  const collections = await getCollectionsSummary();
  const currentCounts = Object.fromEntries(collections.map(({ name, count }) => [name, count]));
  const totalDocuments = collections.reduce((sum, collection) => sum + collection.count, 0);
  const preservedUserCount = accounts.length;

  console.log(JSON.stringify({
    mode: applyChanges ? "APLICAR RESET E POPULAR" : "SIMULAÇÃO SOMENTE LEITURA",
    host: mongoose.connection.host,
    database: db.databaseName,
    totalDocuments,
    preservedBaseAccounts: preservedUserCount,
    documentsToRemove: Math.max(0, totalDocuments - preservedUserCount),
    collections: currentCounts,
  }, null, 2));

  if (!applyChanges) {
    console.log("Nenhum dado foi alterado. Para aplicar, informe --apply e --confirm-database com o nome acima.");
    return;
  }
  if (confirmedDatabase !== db.databaseName) {
    throw new Error("A confirmação deve corresponder exatamente ao nome do banco exibido na simulação.");
  }

  await resetCollections(baseEmails);
  await seedData(baseEmails);
}

main()
  .catch((error: unknown) => {
    console.error("Não foi possível concluir o reset e a seed de demonstração.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
