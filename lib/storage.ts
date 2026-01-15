import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

// Fallback to local storage if R2 is not configured
export async function saveFile(file: File, customFilename?: string): Promise<string> {
  // Check if R2 is configured
  if (R2_BUCKET_NAME && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = customFilename || `${uuidv4()}${path.extname(file.name)}`;
      
      // Determine content type
      const contentType = file.type || "application/octet-stream";

      await s3Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
          Body: buffer,
          ContentType: contentType,
        })
      );

      return `${R2_PUBLIC_URL}/${fileName}`;
    } catch (error) {
      console.error("R2 Upload failed, trying local storage fallback", error);
      // If R2 fails, fall through to local storage
    }
  }

  // Local Storage Implementation
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = customFilename || `${uuidv4()}${path.extname(file.name)}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");

    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);
    
    console.log(`[STORAGE] Saved file locally: ${filePath}`);

    return `/uploads/${fileName}`;
  } catch (error) {
    console.error("Local storage failed:", error);
    throw new Error("Failed to save file");
  }
}

export async function deleteFile(fileUrl: string): Promise<void> {
  try {
    // Extract filename from URL
    // URL format: https://storage.prrv.tech/filename.ext
    const fileName = fileUrl.split("/").pop();
    
    if (!fileName) return;

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileName,
      })
    );
  } catch (error) {

    // Don't throw error if file doesn't exist or can't be deleted
  }
}
