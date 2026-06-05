/**
 * lib/payments/freshcredit/fetch.ts
 *
 * Точечный fetch-обёртка для Freshcredit API.
 *
 * Зачем нужно: сервер Freshcredit (formapi.freshcredit.ru:5046) отдаёт
 * НЕПОЛНУЮ цепочку TLS-сертификатов — leaf-сертификат есть, а
 * промежуточного CA в response нет. Node-fetch (через undici) валит
 * запрос с `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. curl/браузеры в этом
 * месте лояльнее (подгружают intermediate через AIA), а вот строгий
 * Node — нет.
 *
 * Правильное решение — попросить Freshcredit отдавать полную цепочку,
 * либо подкладывать промежуточный CA в `NODE_EXTRA_CA_CERTS`. Но пока
 * этого нет, держим точечный bypass ТОЛЬКО для этого API.
 *
 * Глобальный `NODE_TLS_REJECT_UNAUTHORIZED=0` мы НЕ ставим — это
 * сломало бы безопасность всех остальных HTTPS-запросов в приложении
 * (CloudPayments, ОТП, Bitrix, S3, Cloudflare, и т.д.).
 *
 * Управляется флагом `FC_INSECURE_TLS` (см. config.ts). Когда
 * Freshcredit починят SSL — поставить `FC_INSECURE_TLS=false`.
 */

import https from "node:https";
import http from "node:http";
import { URL } from "node:url";
import { FC_INSECURE_TLS } from "./config";

export interface FcFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface FcFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<any>;
}

/**
 * fetch-совместимая обёртка. При FC_INSECURE_TLS=true использует
 * node:https с `rejectUnauthorized: false` (только для этого вызова),
 * иначе — обычный глобальный fetch со стандартной TLS-валидацией.
 */
export async function fcFetch(
  url: string,
  init: FcFetchInit = {}
): Promise<FcFetchResponse> {
  if (!FC_INSECURE_TLS) {
    // Стандартный путь — валидируем сертификат как обычно.
    const r = await fetch(url, init as RequestInit);
    return {
      ok: r.ok,
      status: r.status,
      text: () => r.text(),
      json: () => r.json(),
    };
  }

  const u = new URL(url);
  const isHttps = u.protocol === "https:";
  const lib = isHttps ? https : http;

  return new Promise<FcFetchResponse>((resolve, reject) => {
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: init.method || "GET",
        headers: init.headers || {},
        // ← точечный bypass TLS-верификации ТОЛЬКО для запросов через
        // эту обёртку (то есть только для Freshcredit).
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const status = res.statusCode || 0;
          let cachedText: string | null = null;
          const text = async (): Promise<string> => {
            if (cachedText === null) cachedText = buf.toString("utf-8");
            return cachedText;
          };
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text,
            json: async () => {
              const t = await text();
              return JSON.parse(t);
            },
          });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
