import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { bootstrapDefaultUsers } from '../services/bootstrapUsers.js';
import {
  Assignment, AssignmentSubmission, Attendance, AuditLog, Evaluation, LessonPlan, Material, Notification,
  SocialComment, SocialPost, SportsClass, SportsEvent, Student, User
} from '../models/index.js';

function assertLocalDevelopmentDatabase() {
  if (env.NODE_ENV !== 'development') {
    throw new Error('Os dados de demonstração só podem ser criados com NODE_ENV=development.');
  }
  const databaseUrl = new URL(env.MONGODB_URI);
  if (databaseUrl.protocol !== 'mongodb:' ||
      !['localhost', '127.0.0.1', '[::1]', '::1'].includes(databaseUrl.hostname)) {
    throw new Error('Seed bloqueado: configure MONGODB_URI para um MongoDB local (localhost) antes de continuar.');
  }
}

function dateAtOffset(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

async function ensureDemoStudents(modality: string, classId: mongoose.Types.ObjectId) {
  const students = [];
  const examples = [
    { email: 'demo.aluno01@example.test', name: 'Ana Beatriz Lima', status: 'approved', sex: 'Feminino' },
    { email: 'demo.aluno02@example.test', name: 'Lucas Ferreira Costa', status: 'approved', sex: 'Masculino' },
    { email: 'demo.aluno03@example.test', name: 'Mariana Alves Rocha', status: 'approved', sex: 'Feminino' },
    { email: 'demo.aluno04@example.test', name: 'Pedro Henrique Santos', status: 'pending', sex: 'Masculino' },
    { email: 'demo.aluno05@example.test', name: 'Julia Martins Oliveira', status: 'rejected', sex: 'Prefiro não informar' }
  ] as const;

  for (const [index, example] of examples.entries()) {
    let user = await User.findOne({ email: example.email });
    if (user && user.role !== 'student') {
      throw new Error(`O e-mail reservado ${example.email} já pertence a outro perfil.`);
    }
    if (!user) {
      user = await User.create({
        email: example.email,
        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
        role: 'student'
      });
    }

    const existingStudent = await Student.findOne({ userId: user._id });
    if (existingStudent && !existingStudent.fullName.endsWith('(Demonstração)')) {
      throw new Error(`O perfil associado a ${example.email} não é um perfil de demonstração.`);
    }

    const birthDate = new Date(Date.UTC(2010 + (index % 4), index, 10, 12));
    const student = await Student.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          fullName: `${example.name} (Demonstração)`,
          birthDate,
          age: new Date().getUTCFullYear() - birthDate.getUTCFullYear(),
          sex: example.sex,
          modality,
          school: 'Escola Municipal de Demonstração',
          address: {
            neighborhood: 'Alto da Mangueira',
            city: 'Maracanaú',
            street: `Rua Exemplo ${index + 1}`,
            number: String(100 + index)
          },
          guardian: { name: `Responsável ${index + 1} (Demonstração)`, phone: `(85) 90000-000${index + 1}` },
          studentPhotoKey: `demo-data/aluno-${index + 1}/foto.jpg`,
          signedFormPdfKey: `demo-data/aluno-${index + 1}/ficha.pdf`,
          enrollmentStatus: example.status,
          ...(example.status === 'rejected' ? { rejectionReason: 'Documento de demonstração pendente de atualização.' } : {}),
          termsAcceptedAt: dateAtOffset(30),
          termsAcceptedIp: '127.0.0.1',
          termsVersion: env.TERMS_VERSION,
          classIds: example.status === 'approved' ? [classId] : []
        }
      },
      { new: true, upsert: true, runValidators: true }
    );
    students.push({ user, student });
  }
  return students;
}

async function seedDemoData() {
  assertLocalDevelopmentDatabase();
  await mongoose.connect(env.MONGODB_URI);
  try {
    await bootstrapDefaultUsers();
    const [teacher, admin] = await Promise.all([
      User.findOne({ email: env.TEACHER_EMAIL, role: 'teacher' }),
      User.findOne({ email: env.ADMIN_EMAIL, role: 'admin' })
    ]);
    if (!teacher || !admin) throw new Error('As contas padrão de professor e administrador precisam existir.');

    const sportsClass = await SportsClass.findOneAndUpdate(
      { name: 'Futsal Sub-12 (Demonstração)', teacherId: teacher._id },
      {
        $set: {
          modality: 'Futsal',
          location: 'Quadra do Alto da Mangueira (Demonstração)',
          schedule: [{ dayOfWeek: 2, startTime: '15:00', endTime: '16:30' }],
          isActive: true
        },
        $setOnInsert: { teacherId: teacher._id }
      },
      { new: true, upsert: true, runValidators: true }
    );
    const students = await ensureDemoStudents(sportsClass.modality, sportsClass._id);
    const approvedStudents = students.filter(({ student }) => student.enrollmentStatus === 'approved');
    const configuredTestUser = env.TEST_STUDENT_EMAIL
      ? await User.findOne({ email: env.TEST_STUDENT_EMAIL, role: 'student' })
      : null;
    const configuredTestStudent = configuredTestUser
      ? await Student.findOne({ userId: configuredTestUser._id, enrollmentStatus: 'approved' })
      : null;
    if (configuredTestStudent && configuredTestUser) {
      await Student.updateOne({ _id: configuredTestStudent._id }, { $addToSet: { classIds: sportsClass._id } });
      approvedStudents.push({ user: configuredTestUser, student: configuredTestStudent });
    }
    const studentUserIds = approvedStudents.map(({ user }) => user._id);
    await SportsClass.updateOne(
      { _id: sportsClass._id },
      { $set: { studentIds: [...approvedStudents.map(({ student }) => student._id), ...(configuredTestStudent ? [configuredTestStudent._id] : [])] } }
    );

    for (const { student } of approvedStudents) {
      for (const [daysAgo, status] of [[2, 'present'], [4, 'present'], [6, 'excused']] as const) {
        const date = dateAtOffset(daysAgo);
        await Attendance.updateOne(
          { classId: sportsClass._id, studentId: student._id, date },
          { $set: { status, note: status === 'excused' ? 'Compromisso familiar (demonstração).' : '', recordedBy: teacher._id } },
          { upsert: true }
        );
      }
    }

    const assignmentExamples = [
      { title: 'Fundamentos do passe (Demonstração)', description: 'Descreva três pontos importantes para realizar um passe preciso.', responseType: 'text', dueAt: dateAtOffset(-3) },
      { title: 'Aquecimento antes do treino (Demonstração)', description: 'Prepare-se para o treino com uma rotina de aquecimento orientada.', responseType: 'none', dueAt: dateAtOffset(-1) },
      { title: 'Jogo coletivo e comunicação (Demonstração)', description: 'Conte como a comunicação ajuda a equipe durante uma partida.', responseType: 'text', dueAt: dateAtOffset(4) }
    ] as const;
    const assignments = [];
    for (const example of assignmentExamples) {
      assignments.push(await Assignment.findOneAndUpdate(
        { classId: sportsClass._id, title: example.title },
        { $set: { ...example, createdBy: teacher._id } },
        { new: true, upsert: true, runValidators: true }
      ));
    }
    const submissionAssignment = assignments[0];
    if (!submissionAssignment) throw new Error('Não foi possível preparar a tarefa de demonstração.');
    for (const [index, { student }] of approvedStudents.entries()) {
      await AssignmentSubmission.updateOne(
        { assignmentId: submissionAssignment._id, studentId: student._id },
        { $set: { response: index === 0 ? 'Passei com o lado interno do pé e mantive atenção na posição da equipe.' : 'Procurei manter o passe firme e olhar para quem estava livre.', submittedAt: dateAtOffset(index + 1) } },
        { upsert: true }
      );
    }

    const materials = [
      { title: 'Guia de hidratação (Demonstração)', body: 'Beba água antes, durante e depois das atividades. Traga sua garrafa identificada.' },
      { title: 'Regras de convivência (Demonstração)', body: 'Respeite colegas, equipe e espaço esportivo. Todos aprendem em ritmos diferentes.' }
    ];
    for (const material of materials) {
      await Material.findOneAndUpdate(
        { classId: sportsClass._id, title: material.title },
        { $set: { ...material, createdBy: teacher._id } },
        { upsert: true, runValidators: true }
      );
    }

    for (const [index, recipientId] of studentUserIds.entries()) {
      await Notification.findOneAndUpdate(
        { recipientId, classId: sportsClass._id, title: 'Treino de demonstração desta semana' },
        {
          $set: {
            senderId: teacher._id,
            message: 'Confira o horário do treino e chegue com alguns minutos de antecedência.',
            ...(index === 0 ? { readAt: dateAtOffset(1) } : {})
          },
          ...(index === 0 ? {} : { $unset: { readAt: 1 } })
        },
        { upsert: true, runValidators: true }
      );
    }

    const event = await SportsEvent.findOneAndUpdate(
      { classId: sportsClass._id, title: 'Festival esportivo da turma (Demonstração)' },
      {
        $set: {
          createdBy: teacher._id,
          description: 'Atividade amistosa para celebrar o aprendizado e a cooperação.',
          startsAt: dateAtOffset(-7),
          location: 'Quadra do Alto da Mangueira'
        }
      },
      { new: true, upsert: true, runValidators: true }
    );
    void event;

    for (const [index, { student }] of approvedStudents.entries()) {
      await Evaluation.findOneAndUpdate(
        { classId: sportsClass._id, studentId: student._id, feedback: 'Boa participação e evolução nos fundamentos (Demonstração).' },
        { $set: { teacherId: teacher._id, score: 7 + (index % 4), evaluatedAt: dateAtOffset(index + 2) } },
        { upsert: true, runValidators: true }
      );
    }

    await LessonPlan.findOneAndUpdate(
      { classId: sportsClass._id, date: dateAtOffset(1), objectives: 'Desenvolver passe e domínio de bola (Demonstração).' },
      {
        $set: {
          teacherId: teacher._id,
          activities: 'Aquecimento em dupla, circuito de condução e jogo reduzido.',
          notes: 'Adaptar intensidade conforme a necessidade dos alunos.'
        }
      },
      { upsert: true, runValidators: true }
    );

    const post = await SocialPost.findOneAndUpdate(
      { classId: sportsClass._id, authorId: teacher._id, text: 'Nosso treino de demonstração foi cheio de boas jogadas. Parabéns, equipe!' },
      { $set: { likedBy: studentUserIds.slice(0, 2) } },
      { new: true, upsert: true, runValidators: true }
    );
    await SocialComment.findOneAndUpdate(
      { postId: post._id, authorId: studentUserIds[0], text: 'Foi muito divertido treinar em equipe! (Demonstração)' },
      { $set: { postId: post._id, authorId: studentUserIds[0], text: 'Foi muito divertido treinar em equipe! (Demonstração)' } },
      { upsert: true, runValidators: true }
    );

    await AuditLog.findOneAndUpdate(
      { actorId: admin._id, action: 'demo.data.seeded', resource: 'demo', resourceId: sportsClass._id },
      { $set: { metadata: { className: sportsClass.name, students: students.length }, ip: '127.0.0.1' } },
      { upsert: true, runValidators: true }
    );

    console.info('Dados de demonstração criados/atualizados no MongoDB local.');
    console.info(`Turma: ${sportsClass.name}; estudantes: ${students.length} (3 aprovados, 1 pendente, 1 recusado).`);
    console.info('Contas de demonstração adicionais usam senhas aleatórias não divulgadas; acesse o sistema com as contas locais de administrador, professor e aluno configuradas no backend/.env.');
  } finally {
    await mongoose.disconnect();
  }
}

await seedDemoData();
