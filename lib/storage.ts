import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function saveFile(file: File, customFilename?: string): Promise<string> {
  try {
    // Ensure upload directory exists
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = customFilename || `${uuidv4()}${path.extname(file.name)}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    await fs.writeFile(filePath, buffer);

    return `/uploads/${fileName}`;
  } catch (error) {
    console.error("Error saving file:", error);
    throw new Error("Failed to save file");
  }
}

export async function deleteFile(fileUrl: string): Promise<void> {
  try {
    const fileName = path.basename(fileUrl);
    const filePath = path.join(UPLOAD_DIR, fileName);
    await fs.unlink(filePath);
  } catch (error) {
    console.error("Error deleting file:", error);
    // Don't throw error if file doesn't exist or can't be deleted
  }
}
