
import "dotenv/config";
import axios from "axios";
import fs from "fs";
import path from "path";

async function fetchAllVideos() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    console.error("❌ Missing credentials. Check .env file for CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN");
    process.exit(1);
  }

  console.log(`🔌 Connecting to Cloudflare Stream (Account: ${accountId})...`);

  let allVideos: any[] = [];
  let page = 1;
  const perPage = 50; // max usually

  try {
    while (true) {
      console.log(`📄 Fetching page ${page}...`);
      
      const response = await axios.get(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        params: {
            page: page,
            per_page: perPage
        }
      });

      const data = response.data;

      if (!data.success) {
        console.error("❌ API Error:", JSON.stringify(data.errors, null, 2));
        break;
      }

      const videos = data.result;
      allVideos = [...allVideos, ...videos];

      console.log(`   Found ${videos.length} videos on this page.`);

      const resultInfo = data.result_info;
      if (!resultInfo) {
          // No pagination info, assume done
          break;
      }

      if (page >= resultInfo.total_pages) {
          break;
      }

      page++;
    }

    console.log(`\n✅ Total videos found: ${allVideos.length}`);

    const simplified = allVideos.map((v: any) => ({
      id: v.uid,
      title: v.meta.name || "Untitled",
      created: v.created,
      duration: v.duration,
      status: v.status.state,
      thumbnail: v.thumbnail,
      playback: v.playback.hls
    }));

    const outputPath = path.join(process.cwd(), "cloudflare_videos.json");
    fs.writeFileSync(outputPath, JSON.stringify(simplified, null, 2));

    console.log(`💾 Saved to ${outputPath}`);

  } catch (error: any) {
    console.error("\n❌ Error fetching videos:");
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(`   Message: ${error.message}`);
    }
  }
}

fetchAllVideos();
