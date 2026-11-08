import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const output = resolve(dirname(fileURLToPath(import.meta.url)), "../frontend/public/ficha-inscricao.pdf");
const lines = [
  [24, "PROJETO ALUNO / ATLETA"],
  [11, "ALTO DA MANGUEIRA - MARACANAU / CEARA"],
  [19, "TERMO DE INSCRICAO"],
  [10, "Preencha os campos e solicite a assinatura do responsavel."],
  [12, "DADOS DO ALUNO"],
  [10, "Nome completo: ___________________________________________________________"],
  [10, "Data de nascimento: ____ / ____ / _______     Idade: ______     Genero: __________"],
  [10, "Modalidade: ___________________________     Escola: __________________________"],
  [10, "Bairro: _______________________________     Cidade: __________________________"],
  [10, "Rua / endereco: ___________________________________________________________"],
  [10, "Numero: ______________________________     Complemento: ___________________"],
  [12, "RESPONSAVEL"],
  [10, "Nome completo: ___________________________________________________________"],
  [10, "Telefone: (____) ________________________     Parentesco: _____________________"],
  [12, "AUTORIZACAO"],
  [10, "Declaro que as informacoes desta ficha sao verdadeiras e solicito a"],
  [10, "inscricao do aluno no Projeto Aluno / Atleta."],
  [10, "Autorizo o uso destes dados para analisar e gerenciar a inscricao, conforme"],
  [10, "a Politica de Privacidade. Tenho ciencia de que a inscricao sera avaliada."],
  [10, "Assinatura do responsavel: __________________________________________________"],
  [10, "Data: ____ / ____ / _______"],
  [9, "Ajude a equipe: confira todos os dados e anexe esta ficha assinada em PDF."],
];

const text = lines.map(([size, value], index) =>
  `BT /F1 ${size} Tf 52 ${787 - index * 30} Td (${value}) Tj ET`,
).join("\n");
const stream = `${text}\n`;
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`,
];

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const [index, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf, "ascii"));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
}
const xrefOffset = Buffer.byteLength(pdf, "ascii");
pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
for (const offset of offsets.slice(1)) {
  pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, pdf, "ascii");
console.log(`Generated printable registration form: ${output}`);
