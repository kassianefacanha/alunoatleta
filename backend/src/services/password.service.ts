import bcrypt from "bcryptjs";
import { PasswordHistory, User } from "../models/index.js";

const passwordRules = [
  /[A-Z]/,
  /[a-z]/,
  /[0-9]/,
  /[^A-Za-z0-9]/,
];

export function validatePassword(password: string, fullName: string) {
  if (password.length < 10 || password.length > 128) {
    return "A senha deve ter entre 10 e 128 caracteres.";
  }
  if (passwordRules.filter((rule) => rule.test(password)).length < 3) {
    return "Use pelo menos três tipos: maiúsculas, minúsculas, números e símbolos.";
  }
  const normalizedPassword = password.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  for (const namePart of fullName.split(/\s+/).filter((part) => part.length >= 3)) {
    const normalizedName = namePart.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (normalizedPassword.includes(normalizedName)) {
      return "A senha não pode conter partes do nome.";
    }
  }
  if (["Senha@123", "Admin@2024", "Password@123", "Aluno@12345"].includes(password)) {
    return "Escolha uma senha mais exclusiva.";
  }
  return null;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function passwordWasRecentlyUsed(userId: string, password: string, currentHash: string) {
  const history = await PasswordHistory.find({ userId })
    .sort({ changedAt: -1 })
    .limit(8)
    .select("+hash");
  for (const record of history) {
    if (await bcrypt.compare(password, record.hash)) return true;
  }
  if (await bcrypt.compare(password, currentHash)) return true;
  const user = await User.findById(userId).select("+passwordHistory");
  for (const oldHash of user?.passwordHistory ?? []) {
    if (await bcrypt.compare(password, oldHash)) return true;
  }
  return false;
}

export async function changePassword(userId: string, nextPassword: string, fullName: string) {
  const validationError = validatePassword(nextPassword, fullName);
  if (validationError) return validationError;

  const user = await User.findById(userId).select("+passwordHash");
  if (!user) throw new Error("Conta não encontrada.");
  if (await passwordWasRecentlyUsed(user.id, nextPassword, user.passwordHash)) {
    return "Escolha uma senha diferente das suas últimas oito senhas.";
  }

  await PasswordHistory.create({ userId: user.id, hash: user.passwordHash });
  user.passwordHash = await hashPassword(nextPassword);
  user.refreshTokenHash = undefined;
  await user.save();

  const previous = await PasswordHistory.find({ userId: user.id })
    .sort({ changedAt: -1 })
    .skip(8)
    .select("_id");
  if (previous.length) {
    await PasswordHistory.deleteMany({ _id: { $in: previous.map(({ id }) => id) } });
  }
  return null;
}
