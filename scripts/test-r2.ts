import { S3Client, PutObjectCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

console.log("Testing R2 Connection...");
console.log("Account ID:", R2_ACCOUNT_ID);
console.log("Bucket:", R2_BUCKET_NAME);
console.log("Access Key:", R2_ACCESS_KEY_ID ? "Set" : "Missing");

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("Missing credentials in .env");
  process.exit(1);
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

async function test() {
  try {
    console.log("Listing buckets...");
    const { Buckets } = await s3Client.send(new ListBucketsCommand({}));
    console.log("Buckets:", Buckets?.map(b => b.Name).join(", "));

    console.log("Uploading test file...");
    await s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: "test-upload.txt",
        Body: "Hello R2!",
        ContentType: "text/plain",
      })
    );
    console.log("Upload successful!");
  } catch (error) {
    console.error("R2 Test Failed:", error);
  }
}

test();
