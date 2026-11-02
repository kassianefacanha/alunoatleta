import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

const hasR2Credentials = Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY);

export const s3 = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: hasR2Credentials
    ? { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! }
    : undefined
});

export const bucketName = env.R2_BUCKET_NAME;

export async function createUploadUrl(key: string, contentType: string, contentLength: number): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({
    Bucket: bucketName, Key: key, ContentType: contentType, ContentLength: contentLength
  }), { expiresIn: 300 });
}

export async function createDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucketName, Key: key }), { expiresIn: 600 });
}

export async function inspectObject(key: string) {
  return s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
}
