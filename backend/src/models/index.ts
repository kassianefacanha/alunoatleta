import {
  Schema,
  type InferSchemaType,
  type Model,
} from "mongoose";
import mongoose from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    passwordHistory: { type: [String], default: [], select: false },
    fullName: { type: String, required: true, trim: true, maxlength: 140 },
    role: { type: String, required: true, enum: ["ADM", "PROFESSOR", "ALUNO"], index: true },
    status: { type: String, enum: ["pendente", "aprovado", "recusado"], default: undefined },
    rejectionReason: { type: String, maxlength: 500, default: "" },
    rejectionReasons: { type: [String], default: [] },
    rejectionOtherReason: { type: String, maxlength: 500, default: "" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    classIds: [{ type: Schema.Types.ObjectId, ref: "Class" }],
    age: { type: Number, min: 4, max: 99 },
    birthDate: { type: Date },
    gender: { type: String, enum: ["Feminino", "Masculino", "Outro", "Prefiro não informar"] },
    modality: { type: String, trim: true, maxlength: 60 },
    school: { type: String, trim: true, maxlength: 160 },
    address: {
      neighborhood: { type: String, trim: true },
      city: { type: String, trim: true },
      street: { type: String, trim: true },
      number: { type: String, trim: true },
      complement: { type: String, trim: true },
    },
    guardian: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    studentPhotoKey: { type: String, select: false },
    signedFormPdfKey: { type: String, select: false },
    termsAcceptedAt: { type: Date },
    termsAcceptedIp: { type: String },
    termsVersion: { type: String },
    refreshTokenHash: { type: String, select: false },
    isTestData: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: true },
);
userSchema.index({ studentPhotoKey: 1 }, { unique: true, sparse: true });
userSchema.index({ signedFormPdfKey: 1 }, { unique: true, sparse: true });

const classSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    modality: { type: String, default: "Futsal" },
    teacherIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    enrollmentLimit: { type: Number, min: 1, default: 30 },
    registrationStartsAt: { type: Date },
    registrationEndsAt: { type: Date },
    requiresNeighborhoodSchool: { type: Boolean, default: false },
    minimumAge: { type: Number, min: 4, max: 99 },
    maximumAge: { type: Number, min: 4, max: 99 },
    otherEligibilityRequirements: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    enrolledCount: { type: Number, min: 0, default: 0 },
    enrollmentCounterInitialized: { type: Boolean, default: false, select: false },
    isTestData: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
classSchema.pre("validate", function validateAgeRange() {
  if (this.minimumAge != null && this.maximumAge != null && this.minimumAge > this.maximumAge) {
    this.invalidate("maximumAge", "A idade máxima deve ser igual ou maior que a idade mínima.");
  }
});
classSchema.pre("validate", function validateRegistrationWindow() {
  if (
    this.registrationStartsAt &&
    this.registrationEndsAt &&
    this.registrationStartsAt >= this.registrationEndsAt
  ) {
    this.invalidate("registrationEndsAt", "O encerramento das inscrições deve ocorrer após a abertura.");
  }
});

const entitySchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 200 },
    name: { type: String, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 5000 },
    content: { type: String, trim: true, maxlength: 12000 },
    classId: { type: Schema.Types.ObjectId, ref: "Class" },
    studentId: { type: Schema.Types.ObjectId, ref: "User" },
    taskId: { type: Schema.Types.ObjectId, ref: "Task" },
    modality: { type: String, trim: true },
    type: { type: String, trim: true },
    date: { type: Date },
    dueDate: { type: Date },
    present: { type: Boolean },
    grade: { type: Number, min: 0, max: 10 },
    feedback: { type: String, trim: true, maxlength: 5000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    isTestData: { type: Boolean, default: false, index: true },
    data: { type: Schema.Types.Mixed },
  },
  { timestamps: true, strict: true },
);
export type EntityDocument = InferSchemaType<typeof entitySchema>;

const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId },
    ip: { type: String },
    at: { type: Date, default: Date.now, immutable: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: false, strict: true, versionKey: false },
);
auditSchema.index({ at: -1 });
auditSchema.index({ actorId: 1, at: -1 });
auditSchema.index({ action: 1, at: -1 });
auditSchema.index({ resourceType: 1, at: -1 });
auditSchema.index({ ip: 1, at: -1 });
auditSchema.pre("findOneAndUpdate", function rejectAuditMutation() {
  throw new Error("Os registros de auditoria são append-only.");
});
auditSchema.pre("updateOne", function rejectAuditUpdates() {
  throw new Error("Os registros de auditoria são append-only.");
});
auditSchema.pre("deleteOne", function rejectAuditDeletion() {
  throw new Error("Os registros de auditoria são append-only.");
});
auditSchema.pre("deleteMany", function rejectAuditBulkDeletion() {
  throw new Error("Os registros de auditoria são append-only.");
});

const lgpdRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["access", "correction", "deletion", "portability", "anonymization", "revocation"], required: true },
    description: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: ["open", "processing", "completed", "rejected"], default: "open" },
    responseNote: { type: String, trim: true, maxlength: 2000, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    isTestData: { type: Boolean, default: false },
  },
  { timestamps: true, strict: true },
);
const fileUploadSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    uploadType: { type: String, enum: ["studentPhoto", "signedFormPdf"], required: true },
    contentType: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    confirmedAt: { type: Date },
    usedAt: { type: Date },
  },
  { timestamps: true, strict: true },
);
fileUploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

function registerModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[name];
  if (existing) return existing as Model<T>;
  return mongoose.model<T>(name, schema);
}

export const User = registerModel("User", userSchema);
export const Student = User;
export const Teacher = User;
export const Admin = User;
export type UserDocument = InferSchemaType<typeof userSchema>;
export const Class = registerModel("Class", classSchema);
const registrationSettingsSchema = new Schema({
  key: { type: String, required: true, unique: true, default: "global" },
  studentLimit: { type: Number, min: 1, max: 100000, default: 10000 },
  studentRegistrationsOpen: { type: Boolean, default: true },
  studentCount: { type: Number, min: 0, default: 0 },
  teacherLimit: { type: Number, min: 1, max: 100000, default: 10000 },
  teacherRegistrationsOpen: { type: Boolean, default: true },
  teacherCount: { type: Number, min: 0, default: 0 },
  countersInitialized: { type: Boolean, default: false, select: false },
}, { timestamps: true, strict: true });
export const RegistrationSettings = registerModel("RegistrationSettings", registrationSettingsSchema);
const siteContentSchema = new Schema({
  key: { type: String, required: true, unique: true, default: "public" },
  heroDescription: {
    type: String,
    default: "O Projeto Aluno / Atleta transforma a vida de crianças e jovens do Alto da Mangueira, unindo prática esportiva, desempenho escolar e cidadania. Inscrições abertas para alunos da rede pública.",
    maxlength: 1200,
  },
  methodologyTitle: { type: String, default: "Como o projeto funciona", maxlength: 120 },
  methodologyDescription: {
    type: String,
    default: "Um modelo que conecta sala de aula e quadra, garantindo que o aluno se desenvolva como atleta sem deixar a escola para trás.",
    maxlength: 1200,
  },
  modalityTitle: { type: String, default: "Esportes oferecidos", maxlength: 120 },
  modalityDescription: {
    type: String,
    default: "Quatro modalidades coletivas trabalhando técnica, disciplina e trabalho em equipe.",
    maxlength: 1200,
  },
  enrollmentTitle: { type: String, default: "Inscrições abertas para o Alto da Mangueira", maxlength: 160 },
  enrollmentDescription: {
    type: String,
    default: "A inscrição é gratuita. O aluno deve estudar ou morar no Alto da Mangueira. É necessário anexar foto do atleta e o termo de participação assinado pelo responsável.",
    maxlength: 1200,
  },
  footerDescription: {
    type: String,
    default: "Educação e esporte caminhando juntos para transformar a juventude do Alto da Mangueira.",
    maxlength: 600,
  },
  contactEmail: { type: String, default: "projetoalunoatleta@gmail.com", maxlength: 254 },
  contactPhone: { type: String, default: "(85) 99182-3661", maxlength: 40 },
  contactAddress: { type: String, default: "Alto da Mangueira", maxlength: 200 },
  supportText: { type: String, default: "LAB JUV · Previo · SEJUV — Governo do Estado do Ceará", maxlength: 500 },
  copyrightText: {
    type: String,
    default: "© 2026 Projeto Aluno / Atleta. Todos os direitos reservados.",
    maxlength: 300,
  },
  termsVersion: { type: String, default: "1.0", maxlength: 24 },
  termsUpdatedAt: { type: Date, default: Date.now },
  termsContent: {
    type: String,
    default: [
      "QUEM PODE SE INSCREVER\nA ficha deve ser preenchida pelo aluno com a ajuda de seu responsável. O envio de uma inscrição não garante vaga, acesso ou aprovação imediata.",
      "INFORMAÇÕES E DOCUMENTOS\nInforme dados corretos e atuais. Anexe uma foto em JPG ou PNG e uma ficha de inscrição legível em PDF, assinada pelo responsável. Cada arquivo pode ter até 5 MB.",
      "REVISÃO DA INSCRIÇÃO\nA equipe do projeto avalia os dados enviados. A inscrição permanece pendente durante a revisão. Em caso de recusa, a plataforma informa o motivo e permite que a equipe entre em contato sobre uma correção.",
      "DADOS PESSOAIS\nO envio da inscrição registra seu aceite da política de privacidade indicada, a versão dos termos, a data e o IP da solicitação. Leia a Política de Privacidade e peça ajuda a seu responsável antes de continuar.",
      "ACESSO AO SISTEMA\nAs funcionalidades para alunos ficam disponíveis após aprovação. O login de professores é fornecido pela coordenação. Não compartilhe sua senha e avise à equipe se suspeitar de acesso indevido.",
      "DOCUMENTO PROVISÓRIO\nEste texto é um rascunho para a implementação técnica e deve ser revisado pela organização responsável antes de ser usado para receber inscrições reais.",
    ].join("\n\n"),
    maxlength: 20000,
  },
  privacyContent: {
    type: String,
    default: [
      "DADOS TRATADOS\nDurante a inscrição são solicitados nome, e-mail, senha, data de nascimento, idade, gênero, modalidade, escola, endereço, nome e telefone do responsável. Também recebemos a foto do aluno e a ficha assinada pelo responsável. Registramos o aceite, sua data, a versão do documento e o IP da solicitação.",
      "FINALIDADE\nOs dados são solicitados para analisar a inscrição, permitir comunicação com o aluno e seu responsável e, após aprovação, preparar o acesso aos serviços do projeto. Os documentos anexados são usados para análise da inscrição.",
      "COMPARTILHAMENTO E FORNECEDORES\nPara funcionamento do serviço, os dados podem ser processados na hospedagem da aplicação (Vercel), da API (Render), no banco configurado pelo operador (MongoDB) e no armazenamento de arquivos (Cloudflare R2). A conexão e os provedores utilizados dependem da configuração de implantação do projeto.",
      "PROTEÇÃO E ACESSO\nAs credenciais são armazenadas com hash e os arquivos são carregados para armazenamento privado por links temporários. O acesso às informações pessoais deve se limitar à equipe autorizada a avaliar e administrar o projeto. Não coloque dados pessoais em material de demonstração.",
      "RETENÇÃO E DIREITOS\nO controlador ainda precisa definir os prazos de conservação das inscrições, dos arquivos, dos logs e dos backups e os procedimentos para acesso, correção, eliminação, portabilidade, anonimização e revogação. A equipe responsável deve publicar um canal de atendimento para dúvidas e solicitações de privacidade antes de receber dados reais.",
      "IMPORTANTE\nEste documento é um rascunho técnico, não substitui uma política validada pelo controlador. Antes de coletar dados reais, a equipe responsável deve conferir as finalidades, as bases legais, os operadores e os prazos de retenção aplicáveis.",
    ].join("\n\n"),
    maxlength: 20000,
  },
  registrationFormKey: { type: String, default: "" },
  registrationFormName: { type: String, default: "Ficha de inscrição (PDF)", maxlength: 180 },
  regulationKey: { type: String, default: "" },
  regulationName: { type: String, default: "", maxlength: 180 },
}, { timestamps: true, strict: true });
export const SiteContent = registerModel("SiteContent", siteContentSchema);
export const Modality = registerModel("Modality", new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  icon: { type: String, enum: ["soccer", "basketball", "volleyball", "handball", "tennis", "running", "fitness", "swimming"], default: "soccer" },
  color: { type: String, enum: ["#DBEAFE", "#D1FAE5", "#EDE9FE", "#FFE4E6", "#FFEDD5", "#FEF3C7", "#CFFAFE", "#E2E8F0"], default: "#DBEAFE" },
}, { timestamps: true }));
export const Attendance = registerModel("Attendance", new Schema({
  classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, required: true },
  present: { type: Boolean, required: true },
  registeredBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  isTestData: { type: Boolean, default: false },
}, { timestamps: true }).index({ studentId: 1, date: 1 }, { unique: true }));
export const Task = registerModel("Task", entitySchema.clone());
export const TaskResponse = registerModel("TaskResponse", entitySchema.clone());
export const Material = registerModel("Material", entitySchema.clone());
export const LessonPlan = registerModel("LessonPlan", entitySchema.clone());
export const Notification = registerModel("Notification", entitySchema.clone());
export const Event = registerModel("Event", entitySchema.clone());
export const Evaluation = registerModel("Evaluation", entitySchema.clone());
export const AuditLog = registerModel("AuditLog", auditSchema);
export const PasswordHistory = registerModel("PasswordHistory", new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  hash: { type: String, required: true, select: false },
  changedAt: { type: Date, default: Date.now, immutable: true },
}, { timestamps: false }));
export const LGPDRequest = registerModel("LGPDRequest", lgpdRequestSchema);
const passwordResetRequestSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status: { type: String, enum: ["pending", "completed", "rejected"], default: "pending", index: true },
  requestedAt: { type: Date, default: Date.now, immutable: true },
  processingUntil: { type: Date },
  resolvedAt: { type: Date },
  resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: false, strict: true });
passwordResetRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
passwordResetRequestSchema.index({ status: 1, requestedAt: -1 });
export const PasswordResetRequest = registerModel("PasswordResetRequest", passwordResetRequestSchema);
export const FileUpload = registerModel("FileUpload", fileUploadSchema);
