import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { stringify } from 'csv-stringify';
import { z } from 'zod';
import { requireAuth, requireRoles, requireTeacherPermission, type AuthenticatedRequest } from '../middleware/auth.js';
import { SportsClass, Student } from '../models/index.js';

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

exportsRouter.get('/students', async (req: AuthenticatedRequest, res, next) => {
  try {
    const query = z.object({
      format: z.enum(['csv', 'xlsx', 'pdf']).default('csv'),
      columns: z.string().optional(),
      name: z.string().optional(),
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      modality: z.string().optional()
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
      return Object.fromEntries(selected.map((column) => [labels[column], values[column]]));
    });
    const filename = `alunos-${new Date().toISOString().slice(0, 10)}`;
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.write('\uFEFF');
      const csv = stringify(rows, { header: true });
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
