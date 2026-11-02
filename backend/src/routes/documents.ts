import { Router } from 'express';
import PDFDocument from 'pdfkit';

export const documentsRouter = Router();

documentsRouter.get('/enrollment-form.pdf', (_req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="ficha-de-inscricao.pdf"');
  const pdf = new PDFDocument({ size: 'A4', margin: 48 });
  pdf.pipe(res);
  pdf.fontSize(18).text('TERMO DE INSCRIÇÃO — ALUNO ATLETA', { align: 'center' }).moveDown(1.5);
  pdf.fontSize(11).text('Preencha os dados do aluno e do responsável. Leia o termo e assine ao final.', { align: 'center' }).moveDown(2);
  for (const field of ['Nome completo do aluno', 'Data de nascimento', 'Escola', 'Modalidade', 'Endereço', 'Nome do responsável', 'Telefone do responsável']) {
    pdf.fontSize(11).text(`${field}: ______________________________________________________________`).moveDown(1.4);
  }
  pdf.moveDown().fontSize(10).text('Declaro que as informações são verdadeiras e autorizo a participação do aluno nas atividades do projeto Aluno Atleta, conforme os termos e a política de privacidade apresentados no ato da inscrição.', { align: 'justify', lineGap: 5 }).moveDown(3);
  pdf.text('__________________________________                 ____ / ____ / ______', { align: 'center' });
  pdf.text('Assinatura do responsável                                           Data', { align: 'center' });
  pdf.end();
});
