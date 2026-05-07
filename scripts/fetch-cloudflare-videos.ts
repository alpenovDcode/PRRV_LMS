
import "dotenv/config";
import axios from "axios";
import fs from "fs";
import path from "path";

const CF_API = "https://api.cloudflare.com/client/v4";
const OUTPUT_PATH = path.join(process.cwd(), "cloudflare_videos.json");

const args = process.argv.slice(2);
const WITH_DOWNLOADS = args.includes("--with-downloads");
const CONCURRENCY = parseInt(
  args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] || "3",
  10
);
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;

interface VideoOut {
  id: string;
  title: string;
  created: string;
  duration: number;
  status: string;
  thumbnail: string;
  playback: string;
  download?: {
    status: "ready" | "inprogress" | "error" | "timeout";
    url?: string;
    error?: string;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAllVideos(accountId: string, apiToken: string) {
  const all: any[] = [];
  let page = 1;
  const perPage = 50;

  while (true) {
    console.log(`📄 Fetching page ${page}...`);
    const r = await axios.get(`${CF_API}/accounts/${accountId}/stream`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      params: { page, per_page: perPage },
    });

    if (!r.data.success) {
      console.error("❌ API Error:", JSON.stringify(r.data.errors, null, 2));
      break;
    }

    const videos = r.data.result;
    all.push(...videos);
    console.log(`   Found ${videos.length} videos on this page.`);

    const info = r.data.result_info;
    if (!info || page >= info.total_pages) break;
    page++;
  }

  return all;
}

async function pollDownload(
  accountId: string,
  apiToken: string,
  videoId: string
): Promise<VideoOut["download"]> {
  const url = `${CF_API}/accounts/${accountId}/stream/${videoId}/downloads`;
  const headers = { Authorization: `Bearer ${apiToken}` };

  try {
    await axios.post(url, {}, { headers });
  } catch (e: any) {
    const status = e.response?.status;
    // 409 = already requested; that's fine, just poll status below
    if (status !== 409) {
      return { status: "error", error: `POST failed: ${status} ${e.message}` };
    }
  }

  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    try {
      const r = await axios.get(url, { headers });
      const dl = r.data.result?.default;
      if (!dl) return { status: "error", error: "No 'default' in response" };

      if (dl.status === "ready") return { status: "ready", url: dl.url };
      if (dl.status === "error") return { status: "error", error: "CF reported error" };
    } catch (e: any) {
      return { status: "error", error: `GET failed: ${e.response?.status} ${e.message}` };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { status: "timeout" };
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<void>
) {
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) break;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

function loadExisting(): Map<string, VideoOut> {
  if (!fs.existsSync(OUTPUT_PATH)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8")) as VideoOut[];
    return new Map(raw.map((v) => [v.id, v]));
  } catch {
    return new Map();
  }
}

function saveAll(map: Map<string, VideoOut>) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(Array.from(map.values()), null, 2));
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    console.error(
      "❌ Missing credentials. Check .env for CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN"
    );
    process.exit(1);
  }

  console.log(`🔌 Connecting to Cloudflare Stream (Account: ${accountId})...`);

  const videos = await fetchAllVideos(accountId, apiToken);
  console.log(`\n✅ Total videos found: ${videos.length}`);

  const existing = WITH_DOWNLOADS ? loadExisting() : new Map<string, VideoOut>();

  const map = new Map<string, VideoOut>();
  for (const v of videos) {
    const prev = existing.get(v.uid);
    map.set(v.uid, {
      id: v.uid,
      title: v.meta?.name || "Untitled",
      created: v.created,
      duration: v.duration,
      status: v.status?.state,
      thumbnail: v.thumbnail,
      playback: v.playback?.hls,
      download: prev?.download,
    });
  }

  saveAll(map);
  console.log(`💾 Saved listing to ${OUTPUT_PATH}`);

  if (!WITH_DOWNLOADS) {
    console.log("\nℹ️  Run with --with-downloads to also collect direct MP4 URLs.");
    return;
  }

  const ready = Array.from(map.values()).filter((v) => v.status === "ready");
  const todo = ready.filter((v) => v.download?.status !== "ready");

  console.log(
    `\n🎬 Requesting MP4 download URLs for ${todo.length} videos ` +
      `(${ready.length - todo.length} already done, concurrency=${CONCURRENCY})`
  );

  let done = 0;
  const failed: { id: string; title: string; error?: string }[] = [];

  await processWithConcurrency(todo, CONCURRENCY, async (v) => {
    process.stdout.write(`   [${++done}/${todo.length}] ${v.title.slice(0, 60)}... `);
    const result = await pollDownload(accountId, apiToken, v.id);
    v.download = result;
    map.set(v.id, v);
    saveAll(map); // incremental save

    if (result?.status === "ready") {
      console.log("✅");
    } else {
      console.log(`❌ ${result?.status} ${result?.error || ""}`);
      failed.push({ id: v.id, title: v.title, error: result?.error });
    }
  });

  console.log(`\n✨ Done. Direct MP4 URLs saved in 'download.url' fields of ${OUTPUT_PATH}`);

  if (failed.length) {
    const errPath = path.join(process.cwd(), "download_errors.json");
    fs.writeFileSync(errPath, JSON.stringify(failed, null, 2));
    console.log(`⚠️  ${failed.length} videos failed — see ${errPath}. Re-run to retry.`);
  }
}

main().catch((e: any) => {
  console.error("\n❌ Fatal:", e.message);
  if (e.response) {
    console.error(`   HTTP ${e.response.status} ${e.response.statusText}`);
    console.error("   Response:", JSON.stringify(e.response.data, null, 2));
  }
  process.exit(1);
});
