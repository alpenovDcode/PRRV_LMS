import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || "",
    secretAccessKey: R2_SECRET_ACCESS_KEY || "",
  },
});

export function isRemoteStorageConfigured() {
  return Boolean(
    R2_ACCOUNT_ID && R2_BUCKET_NAME && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL
  );
}

export async function saveBuffer(
  buffer: Buffer,
  fileName: string,
  contentType = "application/octet-stream",
  options: { requireRemote?: boolean; forceLocal?: boolean } = {}
): Promise<string> {
  if (options.requireRemote && options.forceLocal) {
    throw new Error("Storage cannot be both remote-only and local-only");
  }

  if (!options.forceLocal && isRemoteStorageConfigured()) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
          Body: buffer,
          ContentType: contentType,
        })
      );
      return `${R2_PUBLIC_URL!.replace(/\/$/, "")}/${fileName}`;
    } catch (error) {
      if (options.requireRemote) throw error;
      console.error("R2 upload failed, using local storage fallback", error);
    }
  }

  if (options.requireRemote) {
    throw new Error("Remote object storage is not configured");
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  const filePath = path.resolve(uploadDir, fileName);
  if (!filePath.startsWith(`${path.resolve(uploadDir)}${path.sep}`)) {
    throw new Error("Invalid upload file path");
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${fileName}`;
}

export async function readStoredFile(fileUrl: string): Promise<Buffer> {
  const publicPrefix = R2_PUBLIC_URL?.replace(/\/$/, "");
  if (isRemoteStorageConfigured() && publicPrefix && fileUrl.startsWith(`${publicPrefix}/`)) {
    const key = fileUrl.slice(publicPrefix.length + 1);
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key })
    );
    if (!response.Body) throw new Error(`Stored file is empty: ${fileUrl}`);
    return Buffer.from(await response.Body.transformToByteArray());
  }

  const relativePath = decodeURIComponent(fileUrl).replace(/^\//, "");
  const filePath = path.resolve(process.cwd(), "public", relativePath);
  const publicDir = path.resolve(process.cwd(), "public");
  if (!filePath.startsWith(`${publicDir}${path.sep}`)) {
    throw new Error("Invalid stored file path");
  }
  return fs.promises.readFile(filePath);
}

// Fallback to local storage if R2 is not configured
export async function saveFile(file: File, customFilename?: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = customFilename || `${uuidv4()}${path.extname(file.name)}`;
  return saveBuffer(buffer, fileName, file.type || "application/octet-stream");
}

export async function deleteFile(fileUrl: string): Promise<void> {
  try {
    const publicPrefix = R2_PUBLIC_URL?.replace(/\/$/, "");
    if (isRemoteStorageConfigured() && publicPrefix && fileUrl.startsWith(`${publicPrefix}/`)) {
      const fileName = fileUrl.slice(publicPrefix.length + 1);
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
        })
      );
      return;
    }

    const relativePath = fileUrl.replace(/^\//, "");
    const filePath = path.resolve(process.cwd(), "public", relativePath);
    const publicDir = path.resolve(process.cwd(), "public");
    if (filePath.startsWith(`${publicDir}${path.sep}`)) {
      await fs.promises.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  } catch (error) {
    console.error("Failed to delete stored file:", error);
    // Don't throw error if file doesn't exist or can't be deleted
  }
}
