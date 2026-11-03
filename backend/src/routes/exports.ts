import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify';
import { z } from 'zod';
import { requireAuth, requireRoles, requireTeacherPermission, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  Assignment, AssignmentSubmission, Attendance, Evaluation, LessonPlan, Material, SportsClass, SportsEvent, Student, User
} from '../models/index.js';

export const exportsRouter = Router();
exportsRouter.use(requireAuth, requireRoles('admin', 'teacher'), requireTeacherPermission('exports:read'));

const availableColumns = ['fullName', 'age', 'birthDate', 'sex', 'modality', 'school', 'neighborhood', 'city', 'guardianName', 'guardianPhone', 'enrollmentStatus'] as const;
type StudentColumn = typeof availableColumns[number];
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const labels: Record<StudentColumn, string> = {
  fullName: 'Nome', age: 'Idade', birthDate: 'Nascimento', sex: 'Sexo', modality: 'Modalidade',
  school: 'Escola', neighborhood: 'Bairro', city: 'Cidade', guardianName: 'Responsável',
  guardianPhone: 'Telefone do responsável', enrollmentStatus: 'Situação'
};

const tableColumns = {
  classes: {
    name: 'Turma', modality: 'Modalidade', teacher: 'Professor', location: 'Local',
    studentCount: 'Quantidade de alunos', active: 'Ativa', createdAt: 'Criada em'
  },
  attendance: {
    student: 'Aluno', class: 'Turma', date: 'Data', status: 'Situação', note: 'Observação'
  },
  assignments: {
    title: 'Tarefa', class: 'Turma', description: 'Descrição', responseType: 'Tipo de resposta',
    dueAt: 'Prazo', createdAt: 'Criada em'
  },
  submissions: {
    assignment: 'Tarefa', student: 'Aluno', response: 'Resposta', submittedAt: 'Entregue em'
  },
  evaluations: {
    student: 'Aluno', class: 'Turma', score: 'Nota', feedback: 'Feedback',
    teacher: 'Professor', evaluatedAt: 'Avaliada em'
  },
  events: {
    title: 'Evento', class: 'Turma', description: 'Descrição', startsAt: 'Data do evento', location: 'Local'
  },
  lessonPlans: {
    class: 'Turma', date: 'Data', objectives: 'Objetivos', activities: 'Atividades', notes: 'Observações'
  },
  materials: {
    title: 'Material', class: 'Turma', body: 'Texto', url: 'Link', fileName: 'Arquivo', createdAt: 'Publicado em'
  }
} as const;

type ExportQuery = {
  format: 'csv' | 'xlsx' | 'pdf';
  columns?: string;
  classId?: string;
  from?: Date;
  to?: Date;
};

function formatValue(value: unknown): string | number {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value.toLocaleString('pt-BR');
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string') {
    if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
    return value;
  }
  if (typeof value === 'number') return value;
  return String(value);
}

function csvSafeRows(rows: Array<Record<string, string | number>>) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  ])));
}

function exportData(
  res: import('express').Response,
  table: string,
  format: ExportQuery['format'],
  columns: readonly string[],
  headers: Record<string, string>,
  values: Array<Record<string, unknown>>
) {
  const rows = values.map((value) => Object.fromEntries(columns.map((column) => [
    headers[column]!,
    formatValue(value[column])
  ])));
  const filename = `${table}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.write('\uFEFF');
    stringify(csvSafeRows(rows), {
      header: true,
      columns: columns.map((column) => headers[column]!)
    }).pipe(res);
    return;
  }
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(table.slice(0, 31));
    sheet.columns = columns.map((column) => ({
      header: headers[column],
      key: headers[column],
      width: Math.min(40, Math.max(headers[column]!.length + 4, 16))
    }));
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B4D' } };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    void workbook.xlsx.write(res).then(() => res.end()).catch((error: unknown) => res.destroy(error as Error));
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  pdf.pipe(res);
  pdf.fontSize(18).text(`Relatório: ${table}`, { underline: true }).moveDown();
  pdf.fontSize(8);
  const colWidth = (pdf.page.width - 72) / columns.length;
  const drawRow = (cells: string[]) => {
    const y = pdf.y;
    cells.forEach((cell, index) => pdf.text(cell, 36 + index * colWidth, y, {
      width: colWidth - 8,
      height: 34,
      ellipsis: true
    }));
    pdf.moveDown(2);
  };
  drawRow(columns.map((column) => headers[column]!));
  pdf.moveTo(36, pdf.y).lineTo(pdf.page.width - 36, pdf.y).stroke();
  for (const row of rows) {
    if (pdf.y > pdf.page.height - 60) pdf.addPage();
    drawRow(columns.map((column) => String(row[headers[column]!] ?? '')));
  }
  pdf.end();
}

const querySchema = z.object({
  format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
  columns: z.string().optional(),
  classId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'A data inicial deve ser anterior à data final.'
});

exportsRouter.get('/options', (_req, res) => {
  res.json({
    tables: Object.entries(tableColumns).map(([id, columns]) => ({
      id,
      label: id === 'lessonPlans' ? 'Planos de aula' : id === 'submissions' ? 'Entregas de tarefas'
        : id === 'classes' ? 'Turmas' : id === 'attendance' ? 'Chamadas'
          : id === 'assignments' ? 'Tarefas' : id === 'evaluations' ? 'Avaliações'
            : id === 'events' ? 'Eventos' : 'Materiais',
      columns: Object.entries(columns).map(([key, label]) => ({ key, label }))
    })),
    studentColumns: Object.entries(labels).map(([key, label]) => ({ key, label }))
  });
});

exportsRouter.get('/students', async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = z.object({
      format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
      columns: z.string().optional(),
      name: z.string().optional(),
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      modality: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional()
    }).refine((value) => !value.from || !value.to || value.from <= value.to, {
      message: 'A data inicial deve ser anterior à data final.'
    }).parse(req.query);
    const selected = (query.columns?.split(',') ?? [...availableColumns]).filter((column): column is StudentColumn =>
      availableColumns.includes(column as StudentColumn));
    if (selected.length === 0) {
      res.status(422).json({ error: 'Selecione ao menos uma coluna válida.' });
      return;
    }
    const filter: Record<string, unknown> = {};
    if (query.name) filter.fullName = { $regex: escapeRegex(query.name), $options: 'i' };
    if (query.status) filter.enrollmentStatus = query.status;
    if (query.modality) filter.modality = query.modality;
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {})
      };
    }
    if (req.auth?.role === 'teacher') {
      const classIds = await SportsClass.find({ teacherId: req.auth.userId }).distinct('_id');
      filter.classIds = { $in: classIds };
    }
    const records = await Student.find(filter).sort({ fullName: 1 }).lean();
    const rows = records.map((student) => {
      const values: Record<StudentColumn, string | number> = {
        fullName: student.fullName,
        age: student.age,
        birthDate: student.birthDate.toLocaleDateString('pt-BR'),
        sex: student.sex,
        modality: student.modality,
        school: student.school,
        neighborhood: student.address?.neighborhood ?? '',
        city: student.address?.city ?? '',
        guardianName: student.guardian?.name ?? '',
        guardianPhone: student.guardian?.phone ?? '',
        enrollmentStatus: student.enrollmentStatus
      };
      return Object.fromEntries(selected.map((column) => [labels[column], formatValue(values[column])]));
    });
    const filename = `alunos-${new Date().toISOString().slice(0, 10)}`;
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.write('\uFEFF');
      const csv = stringify(csvSafeRows(rows), { header: true });
      csv.pipe(res);
      return;
    }
    if (query.format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Alunos');
      sheet.columns = selected.map((column) => ({ header: labels[column], key: labels[column], width: Math.min(32, Math.max(labels[column].length + 4, 16)) }));
      sheet.addRows(rows);
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176B4D' } };
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    const pdf = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    pdf.pipe(res);
    pdf.fontSize(18).text('Relatório de alunos', { underline: true }).moveDown();
    pdf.fontSize(8);
    const colWidth = (pdf.page.width - 72) / selected.length;
    const headers = selected.map((column) => labels[column]);
    const drawRow = (values: string[]) => {
      const y = pdf.y;
      values.forEach((value, index) => pdf.text(value, 36 + index * colWidth, y, { width: colWidth - 8, height: 34, ellipsis: true }));
      pdf.moveDown(2);
    };
    drawRow(headers);
    pdf.moveTo(36, pdf.y).lineTo(pdf.page.width - 36, pdf.y).stroke();
    for (const row of rows) {
      if (pdf.y > pdf.page.height - 60) pdf.addPage();
      drawRow(selected.map((column) => String(row[labels[column]] ?? '')));
    }
    pdf.end();
  } catch (error) {
    next(error);
  }
});

exportsRouter.get('/:table', async (req: AuthenticatedRequest, res, next) => {
  try {
    const table = z.enum(['classes', 'attendance', 'assignments', 'submissions', 'evaluations', 'events', 'lessonPlans', 'materials']).parse(req.params.table);
    const query = querySchema.parse(req.query);
    const headers = tableColumns[table];
    const available = Object.keys(headers);
    const columns = (query.columns?.split(',') ?? available).filter((column) => available.includes(column));
    if (!columns.length) {
      res.status(422).json({ error: 'Selecione ao menos uma coluna válida.' });
      return;
    }

    const teacherClassIds = req.auth?.role === 'teacher'
      ? await SportsClass.find({ teacherId: req.auth.userId }).distinct('_id')
      : undefined;
    if (query.classId && teacherClassIds && !teacherClassIds.some((id) => id.toString() === query.classId)) {
      res.status(403).json({ error: 'Você não participa desta turma.' });
      return;
    }
    const classIds = query.classId
      ? [query.classId]
      : teacherClassIds;
    const dateFilter = query.from || query.to ? {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {})
    } : undefined;
    const classQuery = classIds ? { classId: { $in: classIds } } : {};
    let rows: Array<Record<string, unknown>>;

    if (table === 'classes') {
      const filter: Record<string, unknown> = teacherClassIds ? { _id: { $in: teacherClassIds } } : {};
      if (query.classId) filter._id = query.classId;
      if (dateFilter) filter.createdAt = dateFilter;
      const classes = await SportsClass.find(filter).sort({ name: 1 })
        .select('name modality teacherId location studentIds isActive').lean();
      const teachers = await User.find({ _id: { $in: classes.map((item) => item.teacherId) } }).select('email').lean();
      const teachersById = new Map(teachers.map((item) => [item._id.toString(), item.email]));
      rows = classes.map((item) => ({
        name: item.name, modality: item.modality,
        teacher: teachersById.get(item.teacherId.toString()) ?? '',
        location: item.location, studentCount: item.studentIds.length, active: item.isActive, createdAt: item._id.getTimestamp()
      }));
    } else if (table === 'attendance') {
      const filter: Record<string, unknown> = { ...classQuery };
      if (dateFilter) filter.date = dateFilter;
      const records = await Attendance.find(filter).sort({ date: -1 }).select('studentId classId date status note').lean();
      const [students, classes] = await Promise.all([
        Student.find({ _id: { $in: records.map((item) => item.studentId) } }).select('fullName').lean(),
        SportsClass.find({ _id: { $in: records.map((item) => item.classId) } }).select('name').lean()
      ]);
      const studentsById = new Map(students.map((item) => [item._id.toString(), item.fullName]));
      const classesById = new Map(classes.map((item) => [item._id.toString(), item.name]));
      rows = records.map((item) => ({
        student: studentsById.get(item.studentId.toString()) ?? '',
        class: classesById.get(item.classId.toString()) ?? '',
        date: item.date, status: item.status, note: item.note
      }));
    } else if (table === 'assignments') {
      const filter: Record<string, unknown> = { ...classQuery };
      if (dateFilter) filter.createdAt = dateFilter;
      const records = await Assignment.find(filter).sort({ _id: -1 }).select('title classId description responseType dueAt').lean();
      const classes = await SportsClass.find({ _id: { $in: records.map((item) => item.classId) } }).select('name').lean();
      const classesById = new Map(classes.map((item) => [item._id.toString(), item.name]));
      rows = records.map((item) => ({
        title: item.title, class: classesById.get(item.classId.toString()) ?? '',
        description: item.description, responseType: item.responseType, dueAt: item.dueAt, createdAt: item._id.getTimestamp()
      }));
    } else if (table === 'submissions') {
      const assignments = await Assignment.find(classQuery).select('_id title classId').lean();
      const records = await AssignmentSubmission.find({
        assignmentId: { $in: assignments.map((item) => item._id) },
        ...(dateFilter ? { submittedAt: dateFilter } : {})
      }).sort({ submittedAt: -1 }).select('assignmentId studentId response submittedAt').lean();
      const students = await Student.find({ _id: { $in: records.map((item) => item.studentId) } }).select('fullName').lean();
      const studentsById = new Map(students.map((item) => [item._id.toString(), item.fullName]));
      const assignmentsById = new Map(assignments.map((item) => [item._id.toString(), item.title]));
      rows = records.map((item) => ({
        assignment: assignmentsById.get(item.assignmentId.toString()) ?? '',
        student: studentsById.get(item.studentId.toString()) ?? '',
        response: item.response, submittedAt: item.submittedAt
      }));
    } else if (table === 'evaluations') {
      const filter: Record<string, unknown> = { ...classQuery };
      if (dateFilter) filter.evaluatedAt = dateFilter;
      const records = await Evaluation.find(filter).sort({ evaluatedAt: -1 })
        .select('studentId classId teacherId score feedback evaluatedAt').lean();
      const [students, classes, teachers] = await Promise.all([
        Student.find({ _id: { $in: records.map((item) => item.studentId) } }).select('fullName').lean(),
        SportsClass.find({ _id: { $in: records.map((item) => item.classId) } }).select('name').lean(),
        User.find({ _id: { $in: records.map((item) => item.teacherId) } }).select('email').lean()
      ]);
      const studentsById = new Map(students.map((item) => [item._id.toString(), item.fullName]));
      const classesById = new Map(classes.map((item) => [item._id.toString(), item.name]));
      const teachersById = new Map(teachers.map((item) => [item._id.toString(), item.email]));
      rows = records.map((item) => ({
        student: studentsById.get(item.studentId.toString()) ?? '',
        class: classesById.get(item.classId.toString()) ?? '',
        score: item.score, feedback: item.feedback,
        teacher: teachersById.get(item.teacherId.toString()) ?? '',
        evaluatedAt: item.evaluatedAt
      }));
    } else if (table === 'events') {
      const filter: Record<string, unknown> = { ...classQuery };
      if (dateFilter) filter.startsAt = dateFilter;
      const records = await SportsEvent.find(filter).sort({ startsAt: -1 }).select('title classId description startsAt location').lean();
      const classes = await SportsClass.find({ _id: { $in: records.map((item) => item.classId) } }).select('name').lean();
      const classesById = new Map(classes.map((item) => [item._id.toString(), item.name]));
      rows = records.map((item) => ({
        title: item.title, class: classesById.get(item.classId.toString()) ?? '',
        description: item.description, startsAt: item.startsAt, location: item.location
      }));
    } else if (table === 'lessonPlans') {
      const filter: Record<string, unknown> = { ...classQuery };
      if (dateFilter) filter.date = dateFilter;
      const records = await LessonPlan.find(filter).sort({ date: -1 }).select('classId date objectives activities notes').lean();
      const classes = await SportsClass.find({ _id: { $in: records.map((item) => item.classId) } }).select('name').lean();
      const classesById = new Map(classes.map((item) => [item._id.toString(), item.name]));
      rows = records.map((item) => ({
        class: classesById.get(item.classId.toString()) ?? '',
        date: item.date, objectives: item.objectives, activities: item.activities, notes: item.notes
      }));
    } else {
      const filter: Record<string, unknown> = { ...classQuery };
      if (dateFilter) filter.createdAt = dateFilter;
      const records = await Material.find(filter).sort({ _id: -1 }).select('title classId body url fileName').lean();
      const classes = await SportsClass.find({ _id: { $in: records.map((item) => item.classId) } }).select('name').lean();
      const classesById = new Map(classes.map((item) => [item._id.toString(), item.name]));
      rows = records.map((item) => ({
        title: item.title, class: classesById.get(item.classId.toString()) ?? '',
        body: item.body, url: item.url, fileName: item.fileName, createdAt: item._id.getTimestamp()
      }));
    }
    exportData(res, table, query.format, columns, headers, rows);
  } catch (error) {
    next(error);
  }
});
