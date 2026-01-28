import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in .env');
  process.exit(1);
}

interface VideoTask {
  title: string;
  url: string;
}

async function uploadVideos() {
  const filePath = path.join(process.cwd(), 'videos_to_upload.json');
  
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const videos: VideoTask[] = JSON.parse(fileContent);

    if (!Array.isArray(videos) || videos.length === 0) {
      console.log('No videos found in videos_to_upload.json');
      return;
    }

    console.log(`Found ${videos.length} videos to upload...`);

    for (const video of videos) {
      if (!video.url || !video.title) {
        console.warn('Skipping invalid entry:', video);
        continue;
      }

      console.log(`Uploading: ${video.title}...`);

      try {
        const response = await axios.post(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/copy`,
          {
            url: video.url,
            meta: {
              name: video.title
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data.success) {
            console.log(`✅ Started upload for: ${video.title}`);
            console.log(`   ID: ${response.data.result.uid}`);
            console.log(`   Status: ${response.data.result.status.state}`);
        } else {
            console.error(`❌ Failed content generation for: ${video.title}`, response.data.errors);
        }

      } catch (error: any) {
        console.error(`❌ Error uploading ${video.title}:`);
        if (axios.isAxiosError(error)) {
             console.error(error.response?.data || error.message);
        } else {
             console.error(error);
        }
      }
    }

    console.log('\nAll upload tasks processed.');

  } catch (error) {
    console.error('Error reading videos_to_upload.json:', error);
  }
}

uploadVideos();
