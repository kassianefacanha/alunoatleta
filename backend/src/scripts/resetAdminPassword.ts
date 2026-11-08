import mongoose from "mongoose";
import { env } from "../config/environment.js";
import { User } from "../models/index.js";
import { changePassword } from "../services/password.service.js";

function readHidden(prompt: string) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Execute este comando em um terminal interativo para digitar a senha com segurança.");
  }

  return new Promise<string>((resolve, reject) => {
    const wasRaw = input.isRaw;
    let value = "";
    let settled = false;
    const cleanup = () => {
      input.removeListener("data", onData);
      input.setRawMode(wasRaw ?? false);
      input.pause();
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003" || character === "\u0004") {
          finish(new Error("Operação cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " ") {
          value += character;
        }
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
    process.stdout.write(prompt);
  });
}

async function resetAdminPassword() {
  if (!env.ADMIN_EMAIL) throw new Error("Defina ADMIN_EMAIL no backend/.env.");

  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const admin = await User.findOne({
    email: env.ADMIN_EMAIL.toLowerCase(),
    role: "ADM",
    deletedAt: null,
  }).select("fullName");
  if (!admin) {
    throw new Error("Não foi encontrada uma conta ADM ativa para ADMIN_EMAIL.");
  }

  const password = await readHidden("Nova senha (entrada oculta): ");
  const confirmation = await readHidden("Confirme a nova senha: ");
  if (password !== confirmation) throw new Error("As senhas não conferem; nenhuma alteração foi feita.");

  const passwordError = await changePassword(admin.id, password, admin.fullName);
  if (passwordError) throw new Error(`${passwordError} Nenhuma alteração foi feita.`);
  console.log("Senha do ADM atualizada; sessões anteriores foram invalidadas.");
}

resetAdminPassword()
  .catch((error: unknown) => {
    console.error("Não foi possível redefinir a senha do ADM.", error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
