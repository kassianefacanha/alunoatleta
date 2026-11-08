import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, isR2Configured } from "../config/environment.js";
import { FileUpload } from "../models/index.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_SITE_DOCUMENT_SIZE = 15 * 1024 * 1024;
const allowedTypes = {
  studentPhoto: ["image/jpeg", "image/png"],
  signedFormPdf: ["application/pdf"],
} as const;

const client = isR2Configured
  ? new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export async function generateUploadUrl(
  uploadType: keyof typeof allowedTypes,
  contentType: string,
) {
  if (!client) {
    throw new Error("O armazenamento de arquivos ainda não foi configurado.");
  }
  if (!allowedTypes[uploadType].includes(contentType as never)) {
    throw new Error("Esse tipo de arquivo não é permitido.");
  }
  const extension = uploadType === "signedFormPdf"
    ? "pdf"
    : contentType === "image/png" ? "png" : "jpg";
  const key = `applications/${randomUUID()}/${uploadType}.${extension}`;
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  await FileUpload.create({
    key,
    uploadType,
    contentType,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return {
    key,
    uploadUrl: await getSignedUrl(client, command, { expiresIn: 300 }),
  };
}

export async function confirmUploadedFile(
  key: string,
  uploadType: keyof typeof allowedTypes,
  contentType: string,
) {
  if (!client) {
    throw new Error("O armazenamento de arquivos ainda não foi configurado.");
  }
  const upload = await FileUpload.findOne({
    key,
    uploadType,
    contentType,
    confirmedAt: null,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!key.startsWith("applications/") || !upload) {
    throw new Error("A chave do arquivo é inválida ou expirou.");
  }
  if (
    !allowedTypes[uploadType].includes(contentType as never) ||
    (uploadType === "studentPhoto" && !/\/studentPhoto\.(png|jpg)$/i.test(key)) ||
    (uploadType === "signedFormPdf" && !/\/signedFormPdf\.pdf$/i.test(key))
  ) {
    throw new Error("Esse tipo de arquivo não é permitido.");
  }
  const details = await client.send(new HeadObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  }));
  if (
    details.ContentType !== contentType ||
    details.ContentLength === undefined ||
    details.ContentLength > MAX_FILE_SIZE ||
    details.ContentLength <= 0
  ) {
    throw new Error("O arquivo não foi recebido corretamente ou ultrapassa 5 MB.");
  }
  const firstBytes = await client.send(new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Range: "bytes=0-7",
  }));
  if (!firstBytes.Body) {
    throw new Error("O arquivo enviado está vazio.");
  }
  const signature = new Uint8Array(await firstBytes.Body.transformToByteArray());
  const matches = (bytes: number[]) =>
    bytes.every((byte, index) => signature[index] === byte);
  const validSignature =
    uploadType === "studentPhoto" && contentType === "image/jpeg"
      ? matches([0xff, 0xd8, 0xff])
      : uploadType === "studentPhoto" && contentType === "image/png"
        ? matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        : matches([0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (!validSignature) {
    throw new Error("O conteúdo do arquivo não corresponde ao formato informado.");
  }
  const updated = await FileUpload.updateOne(
    { _id: upload.id, confirmedAt: null, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { confirmedAt: new Date() } },
  );
  if (updated.modifiedCount !== 1) {
    throw new Error("Este arquivo já foi confirmado ou expirou.");
  }
  return key;
}

export type SiteDocumentKind = "registration-form" | "regulation";

export async function generateSiteDocumentUploadUrl(kind: SiteDocumentKind) {
  if (!client) {
    throw new Error("O armazenamento de arquivos ainda não foi configurado.");
  }
  const key = `site-content/${kind}/${randomUUID()}.pdf`;
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: "application/pdf",
  });
  return { key, uploadUrl: await getSignedUrl(client, command, { expiresIn: 300 }) };
}

export async function verifySiteDocument(key: string, kind: SiteDocumentKind) {
  if (!client) {
    throw new Error("O armazenamento de arquivos ainda não foi configurado.");
  }
  if (!key.startsWith(`site-content/${kind}/`) || !/^[\w/-]+\.pdf$/i.test(key)) {
    throw new Error("O arquivo enviado não corresponde ao documento selecionado.");
  }
  const head = await client.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
  if (head.ContentType !== "application/pdf" || !head.ContentLength ||
    head.ContentLength > MAX_SITE_DOCUMENT_SIZE) {
    throw new Error("O documento deve ser um PDF válido de até 15 MB.");
  }
  const start = await client.send(new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Range: "bytes=0-4",
  }));
  if (!start.Body) throw new Error("Não foi possível validar o conteúdo do PDF enviado.");
  const signature = new Uint8Array(await start.Body.transformToByteArray());
  if (signature.length < 5 || signature[0] !== 0x25 || signature[1] !== 0x50 ||
    signature[2] !== 0x44 || signature[3] !== 0x46 || signature[4] !== 0x2d) {
    throw new Error("O conteúdo do arquivo não é um PDF válido.");
  }
}

export async function getSiteDocumentUrl(key: string, documentName: string) {
  if (!client) {
    throw new Error("O armazenamento de arquivos ainda não foi configurado.");
  }
  const fileName = documentName.replace(/[^A-Za-z0-9._-]/g, "_") || "documento.pdf";
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    }),
    { expiresIn: 60 },
  );
}

export async function getApplicationDocumentUrl(key: string) {
  if (!client) {
    throw new Error("O armazenamento de arquivos ainda não foi configurado.");
  }
  if (!key.startsWith("applications/")) {
    throw new Error("A chave do documento não é válida.");
  }
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
    { expiresIn: 60 },
  );
}
