#!/usr/bin/env tsx

import "dotenv/config";
import axios, { AxiosError } from "axios";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

const CF_API = "https://api.cloudflare.com/client/v4";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 60 * 60 * 1_000;

const args = process.argv.slice(2);
const outputArg = args.find((arg) => arg.startsWith("--output="));
const concurrencyArg = args.find((arg) => arg.startsWith("--concurrency="));
const listOnly = args.includes("--list-only");

const outputDir = path.resolve(
  process.cwd(),
  outputArg?.slice("--output=".length) || "cloudflare-stream-export"
);
const concurrency = Math.max(
  1,
  Math.min(10, Number.parseInt(concurrencyArg?.slice("--concurrency=".length) || "3", 10) || 3)
);
const manifestPath = path.join(outputDir, "manifest.json");

type DownloadState = {
  status: "pending" | "inprogress" | "ready" | "downloaded" | "error";
  url?: string;
  file?: string;
  bytes?: number;
  error?: string;
};

type VideoRecord = {
  id: string;
  title: string;
  created: string;
  duration: number;
  status: string;
  thumbnail?: string;
  hls?: string;
  download: DownloadState;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const response = error as AxiosError<{ errors?: Array<{ message?: string }> }>;
    const apiMessage = response.response?.data?.errors
      ?.map((item) => item.message)
      .filter(Boolean)
      .join("; ");
    return [response.response?.status, apiMessage || response.message].filter(Boolean).join(" ");
  }
  return error instanceof Error ? error.message : String(error);
}

function safeFilename(title: string, id: string): string {
  const cleaned = title
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 140);
  return `${cleaned || "video"}--${id}.mp4`;
}

function loadManifest(): Map<string, VideoRecord> {
  if (!fs.existsSync(manifestPath)) return new Map();
  try {
    const records = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as VideoRecord[];
    return new Map(records.map((record) => [record.id, record]));
  } catch {
    return new Map();
  }
}

function saveManifest(records: Map<string, VideoRecord>) {
  fs.mkdirSync(outputDir, { recursive: true });
  const temporaryPath = `${manifestPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify([...records.values()], null, 2));
  fs.renameSync(temporaryPath, manifestPath);
}

async function fetchAllVideos(accountId: string, apiToken: string): Promise<any[]> {
  const videos: any[] = [];
  let page = 1;

  while (true) {
    const response = await axios.get(`${CF_API}/accounts/${accountId}/stream`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      params: { page, per_page: 1000 },
      timeout: 60_000,
    });

    if (!response.data.success) {
      throw new Error(JSON.stringify(response.data.errors));
    }

    const current = response.data.result || [];
    videos.push(...current);
    console.log(`Каталог: страница ${page}, получено ${current.length}, всего ${videos.length}`);

    const info = response.data.result_info;
    if (current.length === 0 || !info || page >= info.total_pages) break;
    page += 1;
  }

  return videos;
}

async function getMp4Url(accountId: string, apiToken: string, videoId: string): Promise<string> {
  const endpoint = `${CF_API}/accounts/${accountId}/stream/${videoId}/downloads/default`;
  const headers = { Authorization: `Bearer ${apiToken}` };

  try {
    await axios.post(endpoint, {}, { headers, timeout: 60_000 });
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status !== 409) throw error;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const response = await axios.get(
      `${CF_API}/accounts/${accountId}/stream/${videoId}/downloads`,
      { headers, timeout: 60_000 }
    );
    const download = response.data.result?.default;

    if (download?.status === "ready" && download.url) return download.url;
    if (download?.status === "error") throw new Error("Cloudflare не смог подготовить MP4");

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Тайм-аут ожидания MP4 (60 минут)");
}

async function downloadFile(url: string, destination: string): Promise<number> {
  const temporaryPath = `${destination}.part`;
  fs.rmSync(temporaryPath, { force: true });

  const response = await axios.get(url, {
    responseType: "stream",
    timeout: 0,
    maxRedirects: 10,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  await pipeline(response.data, fs.createWriteStream(temporaryPath, { flags: "wx" }));
  const bytes = fs.statSync(temporaryPath).size;
  if (bytes === 0) throw new Error("Cloudflare вернул пустой файл");

  fs.renameSync(temporaryPath, destination);
  return bytes;
}

async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "Задайте CLOUDFLARE_ACCOUNT_ID и CLOUDFLARE_STREAM_API_TOKEN " +
        "(или CLOUDFLARE_API_TOKEN) в .env"
    );
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const previous = loadManifest();
  const sourceVideos = await fetchAllVideos(accountId, apiToken);
  const records = new Map<string, VideoRecord>();

  for (const video of sourceVideos) {
    const old = previous.get(video.uid);
    records.set(video.uid, {
      id: video.uid,
      title: video.meta?.name || "Без названия",
      created: video.created,
      duration: Number(video.duration || 0),
      status: video.status?.state || "unknown",
      thumbnail: video.thumbnail,
      hls: video.playback?.hls,
      download: old?.download || { status: "pending" },
    });
  }
  saveManifest(records);

  console.log(`Каталог сохранён: ${manifestPath}`);
  if (listOnly) return;

  const readyVideos = [...records.values()].filter((video) => video.status === "ready");
  let completed = 0;
  let failed = 0;

  await runPool(readyVideos, async (video, index) => {
    const filename = safeFilename(video.title, video.id);
    const destination = path.join(outputDir, filename);

    if (fs.existsSync(destination) && fs.statSync(destination).size > 0) {
      video.download = {
        ...video.download,
        status: "downloaded",
        file: filename,
        bytes: fs.statSync(destination).size,
        error: undefined,
      };
      completed += 1;
      saveManifest(records);
      console.log(`[${index + 1}/${readyVideos.length}] Уже скачано: ${filename}`);
      return;
    }

    try {
      video.download = { ...video.download, status: "inprogress", error: undefined };
      saveManifest(records);
      console.log(`[${index + 1}/${readyVideos.length}] Подготовка MP4: ${video.title}`);

      const url = await getMp4Url(accountId, apiToken, video.id);
      video.download = { status: "ready", url };
      saveManifest(records);

      const bytes = await downloadFile(url, destination);
      video.download = { status: "downloaded", url, file: filename, bytes };
      completed += 1;
      console.log(`[${index + 1}/${readyVideos.length}] Готово: ${filename}`);
    } catch (error) {
      failed += 1;
      video.download = {
        ...video.download,
        status: "error",
        error: errorMessage(error),
      };
      console.error(
        `[${index + 1}/${readyVideos.length}] Ошибка ${video.title}: ${video.download.error}`
      );
    } finally {
      saveManifest(records);
    }
  });

  console.log(
    `Экспорт завершён. Скачано/найдено: ${completed}, ошибок: ${failed}, ` +
      `не готово к просмотру: ${records.size - readyVideos.length}`
  );
  if (failed > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`Критическая ошибка: ${errorMessage(error)}`);
  process.exitCode = 1;
});
