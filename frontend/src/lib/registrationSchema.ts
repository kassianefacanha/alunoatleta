import { z } from 'zod';

const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;

function parseBrazilianDate(value: string): Date | null {
  if (!datePattern.test(value)) return null;
  const [day, month, year] = value.split('/').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function calculateAge(date: Date): number {
  const today = new Date();
  let age = today.getFullYear() - date.getUTCFullYear();
  if (today.getMonth() < date.getUTCMonth() || (today.getMonth() === date.getUTCMonth() && today.getDate() < date.getUTCDate())) age -= 1;
  return age;
}

export const registrationSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
  fullName: z.string().trim().min(3, 'Informe o nome completo.'),
  age: z.coerce.number().int().min(0, 'Informe uma idade válida.').max(120),
  birthDate: z.string().regex(datePattern, 'Use o formato dd/mm/aaaa.').refine((value) => parseBrazilianDate(value) !== null, 'Informe uma data válida.'),
  sex: z.enum(['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'], { required_error: 'Selecione uma opção.' }),
  modality: z.string().min(1, 'Selecione uma modalidade.'),
  school: z.string().trim().min(1, 'Informe a escola.'),
  neighborhood: z.string().trim().min(1, 'Informe o bairro.'),
  city: z.string().trim().min(1, 'Informe a cidade.'),
  street: z.string().trim().min(1, 'Informe a rua ou endereço.'),
  number: z.string().trim().min(1, 'Informe o número.'),
  complement: z.string().optional(),
  guardianName: z.string().trim().min(3, 'Informe o nome do responsável.'),
  guardianPhone: z.string().regex(/^\(\d{2}\) \d{5}-\d{4}$/, 'Use o formato (XX) XXXXX-XXXX.'),
  studentPhoto: z.instanceof(File, { message: 'A foto do aluno é obrigatória.' }).refine((file) => ['image/jpeg', 'image/png'].includes(file.type), 'Envie uma imagem JPG ou PNG.').refine((file) => file.size <= 5 * 1024 * 1024, 'A foto deve ter no máximo 5 MB.'),
  signedForm: z.instanceof(File, { message: 'A ficha assinada é obrigatória.' })
    .refine((file) => file.type === 'application/pdf' && file.name.toLowerCase().endsWith('.pdf'), 'Envie a ficha em PDF.')
    .refine((file) => file.size <= 10 * 1024 * 1024, 'A ficha deve ter no máximo 10 MB.'),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'O aceite dos termos é obrigatório.' }) })
}).superRefine((values, ctx) => {
  const birthDate = parseBrazilianDate(values.birthDate);
  if (birthDate && Math.abs(calculateAge(birthDate) - values.age) > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['age'], message: 'A idade não corresponde à data de nascimento.' });
  }
  if (birthDate && birthDate.getTime() > Date.now()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'A data não pode estar no futuro.' });
  }
});

export type RegistrationFormValues = z.infer<typeof registrationSchema>;
