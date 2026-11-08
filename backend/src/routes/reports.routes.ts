import { Router } from "express";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { allowRoles, requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  Attendance,
  AuditLog,
  Class,
  Evaluation,
  Event,
  LGPDRequest,
  LessonPlan,
  Material,
  Modality,
  Notification,
  Task,
  TaskResponse,
  User,
} from "../models/index.js";
import { recordAudit } from "../services/audit.service.js";

const MAX_REPORT_ROWS = 5000;
const router = Router();

interface ReportRecord {
  [key: string]: unknown;
}

interface ReportField {
  key: string;
  label: string;
  sensitive?: boolean;
}

interface ReportDataset {
  key: string;
  label: string;
  dateField: string;
  supportsClass?: boolean;
  supportsModality?: boolean;
  supportsStatus?: boolean;
  supportsPresence?: boolean;
  fields: ReportField[];
  defaults: string[];
}

interface ReportSection {
  key: string;
  label: string;
  headers: string[];
  rows: string[][];
  breakdown: Array<[string, number]>;
}

const datasets: ReportDataset[] = [
  {
    key: "students",
    label: "Inscrições e alunos",
    dateField: "createdAt",
    supportsClass: true,
    supportsModality: true,
    supportsStatus: true,
    fields: [
      { key: "fullName", label: "Nome" },
      { key: "email", label: "E-mail", sensitive: true },
      { key: "status", label: "Situação" },
      { key: "rejectionReason", label: "Motivo da recusa", sensitive: true },
      { key: "age", label: "Idade" },
      { key: "birthDate", label: "Data de nascimento", sensitive: true },
      { key: "gender", label: "Gênero" },
      { key: "modality", label: "Modalidade" },
      { key: "school", label: "Escola", sensitive: true },
      { key: "classNames", label: "Turmas" },
      { key: "neighborhood", label: "Bairro", sensitive: true },
      { key: "city", label: "Cidade", sensitive: true },
      { key: "street", label: "Rua", sensitive: true },
      { key: "number", label: "Número", sensitive: true },
      { key: "complement", label: "Complemento", sensitive: true },
      { key: "guardianName", label: "Nome do responsável", sensitive: true },
      { key: "guardianPhone", label: "Telefone do responsável", sensitive: true },
      { key: "termsAcceptedAt", label: "Aceite dos termos" },
      { key: "termsVersion", label: "Versão dos termos" },
      { key: "createdAt", label: "Data do cadastro" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["fullName", "status", "age", "modality", "classNames", "createdAt"],
  },
  {
    key: "teachers",
    label: "Professores",
    dateField: "createdAt",
    supportsClass: true,
    supportsModality: true,
    fields: [
      { key: "fullName", label: "Nome" },
      { key: "email", label: "E-mail", sensitive: true },
      { key: "classNames", label: "Turmas" },
      { key: "createdAt", label: "Data do cadastro" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["fullName", "classNames", "createdAt"],
  },
  {
    key: "classes",
    label: "Turmas",
    dateField: "createdAt",
    supportsClass: true,
    supportsModality: true,
    fields: [
      { key: "name", label: "Turma" },
      { key: "modality", label: "Modalidade" },
      { key: "teacherNames", label: "Professores" },
      { key: "studentCount", label: "Alunos vinculados" },
      { key: "enrolledCount", label: "Vagas reservadas" },
      { key: "enrollmentLimit", label: "Limite de vagas" },
      { key: "registrationStartsAt", label: "Início das inscrições" },
      { key: "registrationEndsAt", label: "Fim das inscrições" },
      { key: "createdAt", label: "Data de criação" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["name", "modality", "teacherNames", "studentCount", "enrolledCount", "enrollmentLimit"],
  },
  {
    key: "modalities",
    label: "Modalidades",
    dateField: "createdAt",
    supportsModality: true,
    fields: [
      { key: "name", label: "Modalidade" },
      { key: "description", label: "Descrição" },
      { key: "createdAt", label: "Data de criação" },
    ],
    defaults: ["name", "description", "createdAt"],
  },
  {
    key: "attendance",
    label: "Presenças",
    dateField: "date",
    supportsClass: true,
    supportsModality: true,
    supportsPresence: true,
    fields: [
      { key: "date", label: "Data" },
      { key: "studentName", label: "Aluno" },
      { key: "studentEmail", label: "E-mail do aluno", sensitive: true },
      { key: "className", label: "Turma" },
      { key: "modality", label: "Modalidade" },
      { key: "present", label: "Presente" },
      { key: "registeredByName", label: "Registrado por" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["date", "studentName", "className", "present"],
  },
  {
    key: "tasks",
    label: "Tarefas",
    dateField: "dueDate",
    supportsClass: true,
    supportsModality: true,
    fields: [
      { key: "title", label: "Título" },
      { key: "description", label: "Descrição" },
      { key: "className", label: "Turma" },
      { key: "modality", label: "Modalidade" },
      { key: "teacherName", label: "Professor" },
      { key: "dueDate", label: "Prazo" },
      { key: "createdAt", label: "Data de criação" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["title", "className", "teacherName", "dueDate"],
  },
  {
    key: "taskResponses",
    label: "Respostas de tarefas",
    dateField: "createdAt",
    supportsClass: true,
    supportsModality: true,
    fields: [
      { key: "title", label: "Resposta" },
      { key: "taskTitle", label: "Tarefa" },
      { key: "studentName", label: "Aluno" },
      { key: "studentEmail", label: "E-mail do aluno", sensitive: true },
      { key: "className", label: "Turma" },
      { key: "modality", label: "Modalidade" },
      { key: "grade", label: "Nota" },
      { key: "feedback", label: "Feedback" },
      { key: "createdAt", label: "Data da resposta" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["taskTitle", "studentName", "className", "grade", "createdAt"],
  },
  {
    key: "materials",
    label: "Materiais",
    dateField: "createdAt",
    supportsClass: true,
    supportsModality: true,
    fields: [
      { key: "title", label: "Título" },
      { key: "description", label: "Descrição" },
      { key: "type", label: "Tipo" },
      { key: "className", label: "Turma" },
      { key: "modality", label: "Modalidade" },
      { key: "teacherName", label: "Professor" },
      { key: "createdAt", label: "Data de criação" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["title", "type", "className", "teacherName", "createdAt"],
  },
  {
    key: "lessonPlans",
    label: "Planos de aula",
    dateField: "date",
    supportsClass: true,
    supportsModality: true,
    fields: [
      { key: "title", label: "Título" },
      { key: "content", label: "Conteúdo" },
      { key: "date", label: "Data da aula" },
      { key: "className", label: "Turma" },
      { key: "modality", label: "Modalidade" },
      { key: "teacherName", label: "Professor" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["title", "date", "className", "teacherName"],
  },
  {
    key: "notifications",
    label: "Notificações",
    dateField: "createdAt",
    supportsClass: true,
    supportsModality: true,
    fields: [
      { key: "title", label: "Título" },
      { key: "description", label: "Descrição" },
      { key: "studentName", label: "Destinatário" },
      { key: "studentEmail", label: "E-mail do destinatário", sensitive: true },
      { key: "className", label: "Turma" },
      { key: "modality", label: "Modalidade" },
      { key: "createdAt", label: "Data de envio" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["title", "studentName", "className", "createdAt"],
  },
  {
    key: "events",
    label: "Eventos",
    dateField: "date",
    supportsClass: true,
    supportsModality: true,
    fields: [
      { key: "title", label: "Título" },
      { key: "description", label: "Descrição" },
      { key: "date", label: "Data" },
      { key: "className", label: "Turma" },
      { key: "modality", label: "Modalidade" },
      { key: "teacherName", label: "Professor responsável" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["title", "date", "className", "teacherName"],
  },
  {
    key: "evaluations",
    label: "Avaliações",
    dateField: "date",
    supportsClass: true,
    supportsModality: true,
    fields: [
      { key: "title", label: "Título" },
      { key: "studentName", label: "Aluno" },
      { key: "studentEmail", label: "E-mail do aluno", sensitive: true },
      { key: "className", label: "Turma" },
      { key: "modality", label: "Modalidade" },
      { key: "grade", label: "Nota" },
      { key: "feedback", label: "Feedback" },
      { key: "teacherName", label: "Professor" },
      { key: "date", label: "Data da avaliação" },
      { key: "isTestData", label: "Dado de teste" },
    ],
    defaults: ["studentName", "className", "grade", "feedback", "date"],
  },
  {
    key: "audit",
    label: "Auditoria",
    dateField: "at",
    fields: [
      { key: "at", label: "Data e hora" },
      { key: "actorName", label: "Responsável" },
      { key: "actorEmail", label: "E-mail do responsável", sensitive: true },
      { key: "action", label: "Ação" },
      { key: "resourceType", label: "Tipo de registro" },
      { key: "resourceId", label: "Identificador do registro" },
      { key: "ip", label: "Endereço IP", sensitive: true },
    ],
    defaults: ["at", "actorName", "action", "resourceType"],
  },
  {
    key: "lgpdRequests",
    label: "Solicitações LGPD",
    dateField: "createdAt",
    fields: [
      { key: "requesterName", label: "Titular" },
      { key: "requesterEmail", label: "E-mail do titular", sensitive: true },
      { key: "type", label: "Tipo" },
      { key: "status", label: "Situação" },
      { key: "description", label: "Descrição", sensitive: true },
      { key: "createdAt", label: "Data da solicitação" },
    ],
    defaults: ["requesterName", "type", "status", "createdAt"],
  },
];

const datasetByKey = new Map(datasets.map((dataset) => [dataset.key, dataset]));
const dataSetSchema = z.enum(datasets.map(({ key }) => key) as [string, ...string[]]);
const exportSchema = z.object({
  datasets: z.array(dataSetSchema).min(1).max(datasets.length)
    .refine((keys) => new Set(keys).size === keys.length, "Não repita conjuntos de dados."),
  columns: z.record(z.string(), z.array(z.string().max(40)).min(1).max(25)),
  format: z.enum(["csv", "xlsx", "pdf"]),
  filters: z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    classId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    modality: z.string().trim().max(80).optional(),
    status: z.enum(["pendente", "aprovado", "recusado"]).optional(),
    presence: z.enum(["present", "absent"]).optional(),
    search: z.string().trim().max(100).optional(),
    includeTestData: z.boolean().default(true),
  }).default({ includeTestData: true }),
}).refine(
  ({ filters }) => !filters.from || !filters.to || filters.from <= filters.to,
  { path: ["filters", "to"], message: "A data final deve ser igual ou posterior à inicial." },
);

function asRecord(value: unknown): ReportRecord {
  return value !== null && typeof value === "object"
    ? value as ReportRecord
    : {};
}

function refName(value: unknown, key: "fullName" | "name" | "title" = "fullName") {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return typeof record[key] === "string" ? record[key] as string : "";
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function valueFor(record: ReportRecord, key: string): string | number {
  const address = asRecord(record.address);
  const guardian = asRecord(record.guardian);
  switch (key) {
    case "classNames":
      return Array.isArray(record.classIds) ? record.classIds.map((item) => refName(item, "name")).filter(Boolean).join(", ") : "";
    case "teacherNames":
      return Array.isArray(record.teacherIds) ? record.teacherIds.map((item) => refName(item)).filter(Boolean).join(", ") : "";
    case "studentCount":
      return Number(record.studentCount ?? 0);
    case "enrolledCount":
      return Number(record.enrolledCount ?? 0);
    case "studentName":
      return refName(record.studentId);
    case "studentEmail":
      return text(asRecord(record.studentId).email);
    case "className":
      return refName(record.classId, "name");
    case "modality":
      return text(record.modality) || text(asRecord(record.classId).modality);
    case "teacherName":
    case "registeredByName":
      return refName(key === "teacherName" ? record.createdBy : record.registeredBy);
    case "taskTitle":
      return refName(record.taskId, "title");
    case "requesterName":
      return refName(record.userId);
    case "requesterEmail":
      return text(asRecord(record.userId).email);
    case "actorName":
      return refName(record.actorId);
    case "actorEmail":
      return text(asRecord(record.actorId).email);
    case "neighborhood":
    case "city":
    case "street":
    case "number":
    case "complement":
      return text(address[key]);
    case "guardianName":
      return text(guardian.name);
    case "guardianPhone":
      return text(guardian.phone);
    case "resourceId":
      return text(record.resourceId);
    default: {
      const value = record[key];
      if (typeof value === "number") return value;
      return text(value);
    }
  }
}

function escapedRegex(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function dateQuery(dataset: ReportDataset, filters: z.infer<typeof exportSchema>["filters"]) {
  const range: Record<string, Date> = {};
  if (filters.from) range.$gte = new Date(`${filters.from}T00:00:00.000Z`);
  if (filters.to) {
    const until = new Date(`${filters.to}T00:00:00.000Z`);
    until.setUTCDate(until.getUTCDate() + 1);
    range.$lt = until;
  }
  return Object.keys(range).length ? { [dataset.dateField]: range } : {};
}

async function matchingClassIds(classId?: string, modality?: string) {
  return Class.find({
    ...(classId && { _id: classId }),
    ...(modality && { modality }),
  }).distinct("_id");
}

async function buildFilter(
  dataset: ReportDataset,
  filters: z.infer<typeof exportSchema>["filters"],
): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {
    ...dateQuery(dataset, filters),
    ...(!filters.includeTestData && { isTestData: { $ne: true } }),
  };
  const search = filters.search ? escapedRegex(filters.search) : undefined;

  if (dataset.key === "students" || dataset.key === "teachers") {
    filter.role = dataset.key === "students" ? "ALUNO" : "PROFESSOR";
    filter.deletedAt = null;
    if (dataset.key === "students" && filters.status) filter.status = filters.status;
    if (dataset.key === "students") {
      if (filters.classId) filter.classIds = filters.classId;
      if (filters.modality) filter.modality = filters.modality;
    } else if (filters.classId || filters.modality) {
      filter.classIds = { $in: await matchingClassIds(filters.classId, filters.modality) };
    }
    if (search) filter.$or = [{ fullName: search }, { email: search }, { modality: search }];
  } else if (dataset.key === "classes") {
    if (filters.classId) filter._id = filters.classId;
    if (filters.modality) filter.modality = filters.modality;
    if (search) filter.$or = [{ name: search }, { modality: search }];
  } else if (dataset.key === "modalities") {
    if (filters.modality) filter.name = filters.modality;
    if (search) filter.$or = [{ name: search }, { description: search }];
  } else if (dataset.key === "attendance") {
    if (filters.presence) filter.present = filters.presence === "present";
    if (filters.classId || filters.modality) {
      filter.classId = { $in: await matchingClassIds(filters.classId, filters.modality) };
    }
    if (search) {
      const [studentIds, matchingClasses] = await Promise.all([
        User.find({ role: "ALUNO", $or: [{ fullName: search }, { email: search }] }).distinct("_id"),
        Class.find({ $or: [{ name: search }, { modality: search }] }).distinct("_id"),
      ]);
      filter.$or = [
        { studentId: { $in: studentIds } },
        { classId: { $in: matchingClasses } },
      ];
    }
  } else if (dataset.key === "audit") {
    if (search) {
      const actors = await User.find({ $or: [{ fullName: search }, { email: search }] }).distinct("_id");
      filter.$or = [
        { actorId: { $in: actors } },
        { action: search },
        { resourceType: search },
        { ip: search },
      ];
    }
  } else if (dataset.key === "lgpdRequests") {
    if (search) {
      const users = await User.find({ $or: [{ fullName: search }, { email: search }] }).distinct("_id");
      filter.$or = [
        { userId: { $in: users } },
        { type: search },
        { status: search },
        { description: search },
      ];
    }
  } else {
    if (filters.classId || filters.modality) {
      filter.classId = { $in: await matchingClassIds(filters.classId, filters.modality) };
    }
    if (search) filter.$or = [
      { title: search },
      { name: search },
      { description: search },
      { content: search },
      { type: search },
    ];
  }
  return filter;
}

function findDatasetRecords(
  key: string,
  filter: Record<string, unknown>,
  limit: number,
  includeTestData: boolean,
): Promise<ReportRecord[]> {
  switch (key) {
    case "students":
      return User.find(filter)
        .select("fullName email status rejectionReason age birthDate gender modality school classIds address guardian termsAcceptedAt termsVersion createdAt isTestData")
        .populate({ path: "classIds", select: "name" })
        .sort({ createdAt: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "teachers":
      return User.find(filter)
        .select("fullName email classIds createdAt isTestData")
        .populate({ path: "classIds", select: "name" })
        .sort({ createdAt: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "classes":
      return Class.find(filter)
        .select("name modality teacherIds enrollmentLimit enrolledCount registrationStartsAt registrationEndsAt createdAt isTestData")
        .populate({ path: "teacherIds", select: "fullName" })
        .sort({ createdAt: -1 }).limit(limit).lean()
        .then(async (records) => {
          const rows = records.map(asRecord);
          const classIds = rows.map((row) => row._id);
          const counts = await User.aggregate([
            { $match: {
              role: "ALUNO",
              deletedAt: null,
              status: { $in: ["pendente", "aprovado"] },
              classIds: { $in: classIds },
              ...(!includeTestData && { isTestData: { $ne: true } }),
            } },
            { $unwind: "$classIds" },
            { $match: { classIds: { $in: classIds } } },
            { $group: { _id: "$classIds", count: { $sum: 1 } } },
          ]);
          const byClass = new Map(counts.map((row: { _id: mongoose.Types.ObjectId; count: number }) => [String(row._id), row.count]));
          return rows.map((row) => ({ ...row, studentCount: byClass.get(String(row._id)) ?? 0 }));
        });
    case "modalities":
      return Modality.find(filter).sort({ name: 1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "attendance":
      return Attendance.find(filter)
        .populate({ path: "studentId", select: "fullName email" })
        .populate({ path: "classId", select: "name modality" })
        .populate({ path: "registeredBy", select: "fullName" })
        .sort({ date: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "tasks":
      return Task.find(filter)
        .select("title description dueDate classId createdBy createdAt isTestData")
        .populate({ path: "classId", select: "name modality" })
        .populate({ path: "createdBy", select: "fullName" })
        .sort({ dueDate: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "taskResponses":
      return TaskResponse.find(filter)
        .select("title description taskId studentId classId grade feedback createdAt isTestData")
        .populate({ path: "taskId", select: "title" })
        .populate({ path: "studentId", select: "fullName email" })
        .populate({ path: "classId", select: "name modality" })
        .sort({ createdAt: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "materials":
      return Material.find(filter)
        .select("title description type classId createdBy createdAt isTestData")
        .populate({ path: "classId", select: "name modality" })
        .populate({ path: "createdBy", select: "fullName" })
        .sort({ createdAt: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "lessonPlans":
      return LessonPlan.find(filter)
        .select("title content date classId createdBy isTestData")
        .populate({ path: "classId", select: "name modality" })
        .populate({ path: "createdBy", select: "fullName" })
        .sort({ date: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "notifications":
      return Notification.find(filter)
        .select("title description studentId classId createdAt isTestData")
        .populate({ path: "studentId", select: "fullName email" })
        .populate({ path: "classId", select: "name modality" })
        .sort({ createdAt: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "events":
      return Event.find(filter)
        .select("title description date classId createdBy isTestData")
        .populate({ path: "classId", select: "name modality" })
        .populate({ path: "createdBy", select: "fullName" })
        .sort({ date: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "evaluations":
      return Evaluation.find(filter)
        .select("title studentId classId grade feedback createdBy date isTestData")
        .populate({ path: "studentId", select: "fullName email" })
        .populate({ path: "classId", select: "name modality" })
        .populate({ path: "createdBy", select: "fullName" })
        .sort({ date: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "audit":
      return AuditLog.find(filter)
        .select("actorId action resourceType resourceId ip at")
        .populate({ path: "actorId", select: "fullName email" })
        .sort({ at: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    case "lgpdRequests":
      return LGPDRequest.find(filter)
        .select("userId type status description createdAt")
        .populate({ path: "userId", select: "fullName email" })
        .sort({ createdAt: -1 }).limit(limit).lean()
        .then((records) => records.map(asRecord));
    default:
      throw new Error("Conjunto de dados não suportado.");
  }
}

function escapeSpreadsheetValue(value: string | number) {
  if (typeof value === "string" && /^[\u0000-\u0020]*[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function csvCell(value: string | number) {
  const safe = escapeSpreadsheetValue(value);
  return `"${String(safe).replace(/"/g, '""')}"`;
}

function createCsv(sections: ReportSection[], generatedAt: string) {
  const headers = [...new Set(sections.flatMap((section) => section.headers))];
  const counts = sections.flatMap((section) => [
    [section.label, String(section.rows.length)],
    ...section.breakdown.map(([label, count]) => [`${section.label} — ${label}`, String(count)]),
  ]);
  const rows = [
    ["Relatório Aluno / Atleta", `Gerado em ${generatedAt}`],
    ["Total de registros", String(sections.reduce((sum, section) => sum + section.rows.length, 0))],
    [],
    ["Contagem por conjunto", "Quantidade"],
    ...counts,
    [],
    ["Categoria", ...headers],
    ...sections.flatMap((section) => section.rows.map((row) => {
      const values = new Map(section.headers.map((header, index) => [header, row[index] ?? ""]));
      return [section.label, ...headers.map((header) => values.get(header) ?? "")];
    })),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

async function createWorkbook(
  sections: ReportSection[],
  generatedAt: string,
  filters: z.infer<typeof exportSchema>["filters"],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Projeto Aluno / Atleta";
  workbook.created = new Date(generatedAt);
  const summary = workbook.addWorksheet("Resumo");
  summary.addRows([
    ["Relatório Aluno / Atleta"],
    ["Gerado em", generatedAt],
    ["Período inicial", filters.from ?? "Não filtrado"],
    ["Período final", filters.to ?? "Não filtrado"],
    ["Total de registros", sections.reduce((sum, section) => sum + section.rows.length, 0)],
    [],
    ["Conjunto de dados", "Registros"],
    ...sections.flatMap((section) => [
      [section.label, section.rows.length],
      ...section.breakdown.map(([label, count]) => [`  ${label}`, count]),
    ]),
  ]);
  summary.getRow(1).font = { bold: true, size: 16, color: { argb: "FF1D3352" } };
  summary.getRow(7).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summary.getRow(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2867C1" } };
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 28;

  for (const [index, section] of sections.entries()) {
    const sheetName = `${index + 1}. ${section.label}`.slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(section.headers);
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2867C1" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: { row: 1, column: section.headers.length } };
    section.rows.forEach((row) => sheet.addRow(row.map(escapeSpreadsheetValue)));
    section.headers.forEach((header, columnIndex) => {
      sheet.getColumn(columnIndex + 1).width = Math.min(42, Math.max(14, header.length + 3));
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function createPdf(
  sections: ReportSection[],
  generatedAt: string,
) {
  const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer | Uint8Array | string) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.fontSize(20).fillColor("#1d3352").text("Relatório Aluno / Atleta");
  document.moveDown(0.3).fontSize(9).fillColor("#718198")
    .text(`Gerado em ${generatedAt} · ${sections.reduce((sum, section) => sum + section.rows.length, 0)} registros`);
  document.moveDown(0.4).fontSize(9).fillColor("#40546f");
  sections.forEach((section) => {
    document.text(`${section.label}: ${section.rows.length} registros`);
    section.breakdown.forEach(([label, count]) => document.text(`  ${label}: ${count}`));
  });
  for (const section of sections) {
    document.moveDown(1).fontSize(14).fillColor("#2867c1").text(`${section.label} (${section.rows.length})`);
    for (const row of section.rows) {
      const line = section.headers.map((header, index) => `${header}: ${row[index] ?? "—"}`).join("  |  ");
      if (document.y > 520) document.addPage();
      document.moveDown(0.25).fontSize(8).fillColor("#40546f").text(line, { width: 770 });
    }
  }
  document.end();
  return result;
}

router.use(requireAuth, allowRoles("ADM"));

router.get("/options", async (_request, response, next) => {
  try {
    const [classes, modalities] = await Promise.all([
      Class.find().select("name modality").sort({ name: 1 }).limit(500).lean(),
      Modality.find().select("name").sort({ name: 1 }).limit(200).lean(),
    ]);
    response.json({
      datasets: datasets.map(({ key, label, dateField, supportsClass, supportsModality, supportsStatus, supportsPresence, fields, defaults }) => ({
        key,
        label,
        dateField,
        supportsClass: Boolean(supportsClass),
        supportsModality: Boolean(supportsModality),
        supportsStatus: Boolean(supportsStatus),
        supportsPresence: Boolean(supportsPresence),
        fields,
        defaults,
      })),
      classes: classes.map((item) => ({ id: item._id, name: item.name, modality: item.modality })),
      modalities: modalities.map((item) => item.name),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/export", async (request: AuthenticatedRequest, response, next) => {
  try {
    const parsed = exportSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Confira os parâmetros do relatório." });
      return;
    }
    const { datasets: selectedKeys, columns, format, filters } = parsed.data;
    const selected = selectedKeys.map((key) => datasetByKey.get(key)!);
    for (const dataset of selected) {
      const selectedColumns = columns[dataset.key];
      const validColumns = new Set(dataset.fields.map(({ key }) => key));
      if (!selectedColumns?.length || selectedColumns.some((key) => !validColumns.has(key))) {
        response.status(400).json({ message: `Selecione colunas válidas para ${dataset.label}.` });
        return;
      }
    }

    let remaining = MAX_REPORT_ROWS;
    const sections = [];
    for (const dataset of selected) {
      const filter = await buildFilter(dataset, filters);
      const records = await findDatasetRecords(dataset.key, filter, remaining + 1, filters.includeTestData);
      if (records.length > remaining) {
        response.status(413).json({
          message: `O relatório ultrapassou ${MAX_REPORT_ROWS.toLocaleString("pt-BR")} registros. Reduza o período ou refine os filtros.`,
        });
        return;
      }
      remaining -= records.length;
      const selectedFields = dataset.fields.filter(({ key }) => columns[dataset.key].includes(key));
      const breakdown: Array<[string, number]> = [];
      if (dataset.key === "students") {
        for (const [status, label] of [["pendente", "Em análise"], ["aprovado", "Aprovados"], ["recusado", "Recusados"]]) {
          breakdown.push([label, records.filter((record) => record.status === status).length]);
        }
      } else if (dataset.key === "attendance") {
        breakdown.push(
          ["Presentes", records.filter((record) => record.present === true).length],
          ["Ausentes", records.filter((record) => record.present === false).length],
        );
      }
      sections.push({
        key: dataset.key,
        label: dataset.label,
        headers: selectedFields.map(({ label }) => label),
        rows: records.map((record) => selectedFields.map(({ key }) => text(valueFor(record, key)))),
        breakdown,
      });
    }

    const generatedAt = new Date().toISOString();
    const rowCounts = Object.fromEntries(sections.map((section) => [section.key, section.rows.length]));
    await recordAudit(request, "report_export", "Report", undefined, {
      format,
      datasets: selectedKeys,
      rowCounts,
      includeTestData: filters.includeTestData,
      sensitiveColumnsSelected: selected.some((dataset) =>
        dataset.fields.some(({ key, sensitive }) => sensitive && columns[dataset.key].includes(key)),
      ),
    });

    const fileDate = generatedAt.slice(0, 10);
    const filename = `relatorio-aluno-atleta-${fileDate}.${format}`;
    if (format === "csv") {
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.send(createCsv(sections, generatedAt));
      return;
    }
    if (format === "xlsx") {
      const workbook = await createWorkbook(sections, generatedAt, filters);
      response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.send(workbook);
      return;
    }
    const pdf = await createPdf(sections, generatedAt);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.send(pdf);
  } catch (error) {
    next(error);
  }
});

router.post("/registration-timeline/pdf", async (request: AuthenticatedRequest, response, next) => {
  try {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const rows = await User.aggregate([
      {
        $match: {
          role: "ALUNO",
          deletedAt: null,
          createdAt: { $gte: start },
        },
      },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);
    const counts = new Map(rows.map((row: { _id: { year: number; month: number }; count: number }) => [
      `${row._id.year}-${row._id.month}`,
      row.count,
    ]));
    const timeline = Array.from({ length: 12 }, (_, index) => {
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1));
      const year = month.getUTCFullYear();
      const monthNumber = month.getUTCMonth() + 1;
      return {
        year,
        month: monthNumber,
        count: counts.get(`${year}-${monthNumber}`) ?? 0,
        label: month.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }),
      };
    });
    const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 42 });
    const chunks: Buffer[] = [];
    const pdf = new Promise<Buffer>((resolve, reject) => {
      document.on("data", (chunk: Buffer | Uint8Array | string) => chunks.push(Buffer.from(chunk)));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
    });
    const max = Math.max(1, ...timeline.map(({ count }) => count));
    const chartLeft = 58;
    const chartTop = 118;
    const chartWidth = 720;
    const chartHeight = 330;
    const gap = 12;
    const barWidth = (chartWidth - gap * (timeline.length - 1)) / timeline.length;

    document.fontSize(20).fillColor("#1d3352").text("Inscrições de alunos por mês");
    document.moveDown(0.35).fontSize(9).fillColor("#718198")
      .text(`Período: ${timeline[0].label} ${timeline[0].year} — ${timeline[11].label} ${timeline[11].year}`);
    document.fontSize(9).fillColor("#687991").text("Quantidade de inscrições", chartLeft, chartTop - 20);
    for (let tick = 0; tick <= 4; tick++) {
      const value = Math.ceil(max * (4 - tick) / 4);
      const y = chartTop + chartHeight * tick / 4;
      document.moveTo(chartLeft, y).lineTo(chartLeft + chartWidth, y).lineWidth(0.5).strokeColor("#e4eaf2").stroke();
      document.fontSize(8).fillColor("#8290a4").text(String(value), chartLeft - 30, y - 4, { width: 23, align: "right" });
    }
    timeline.forEach((point, index) => {
      const x = chartLeft + index * (barWidth + gap);
      const height = (point.count / max) * (chartHeight - 10);
      const y = chartTop + chartHeight - height;
      document.roundedRect(x, y, barWidth, height, 3).fillColor("#7fa8dc").fill();
      document.fontSize(8).fillColor("#3b526e").text(String(point.count), x, y - 13, { width: barWidth, align: "center" });
      document.fontSize(7).fillColor("#718198").text(`${point.label}/${String(point.year).slice(-2)}`, x - 3, chartTop + chartHeight + 8, { width: barWidth + 6, align: "center" });
    });
    document.end();
    const buffer = await pdf;
    await recordAudit(request, "registration_timeline_export", "Report", undefined, { format: "pdf", months: 12 });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="inscricoes-por-mes-${now.toISOString().slice(0, 10)}.pdf"`);
    response.send(buffer);
  } catch (error) {
    next(error);
  }
});

export const reportRouter = router;
