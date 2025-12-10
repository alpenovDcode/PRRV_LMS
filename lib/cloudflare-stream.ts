import axios from "axios";

const CLOUDFLARE_STREAM_API_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN!;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CLOUDFLARE_STREAM_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream`;

interface CloudflareStreamVideo {
  uid: string;
  thumbnail: string;
  readyToStream: boolean;
  status: {
    state: string;
    pctComplete: string;
  };
  meta: {
    name: string;
  };
  created: string;
  modified: string;
  size: number;
  duration: number;
}

interface UploadResponse {
  result: {
    uploadURL: string;
    uid: string;
  };
}

interface VideoResponse {
  result: CloudflareStreamVideo;
}

export class CloudflareStreamClient {
  private headers = {
    Authorization: `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
    "Content-Type": "application/json",
  };

  /**
   * Создает видео и возвращает upload URL для прямой загрузки
   */
  async createVideoUpload(fileName: string): Promise<{ uploadURL: string; videoId: string }> {
    const response = await axios.post<UploadResponse>(
      `${CLOUDFLARE_STREAM_BASE_URL}`,
      {
        meta: {
          name: fileName,
        },
      },
      { headers: this.headers }
    );

    return {
      uploadURL: response.data.result.uploadURL,
      videoId: response.data.result.uid,
    };
  }

  /**
   * Получает информацию о видео
   */
  async getVideo(videoId: string): Promise<CloudflareStreamVideo> {
    const response = await axios.get<VideoResponse>(`${CLOUDFLARE_STREAM_BASE_URL}/${videoId}`, {
      headers: this.headers,
    });

    return response.data.result;
  }

  /**
   * Генерирует signed URL для просмотра видео с watermark
   */
  generateSignedURL(videoId: string, userId: string, email: string): string {
    // Cloudflare Stream signed URL generation
    // В реальной реализации нужно использовать библиотеку для подписи
    const CUSTOMER_CODE = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || `customer-${CLOUDFLARE_ACCOUNT_ID}`;
    const baseURL = `https://${CUSTOMER_CODE}.cloudflarestream.com/${videoId}/manifest/video.m3u8`;
    
    // Добавление параметров watermark через токен
    // Это упрощенная версия, в продакшене нужно использовать правильную подпись
    return `${baseURL}?token=${this.generateToken(videoId, userId, email)}`;
  }

  /**
   * Генерирует токен для просмотра (упрощенная версия)
   * В продакшене использовать правильную подпись Cloudflare Stream
   */
  private generateToken(videoId: string, userId: string, email: string): string {
    // Это заглушка, в реальности нужно использовать правильную подпись
    const payload = {
      videoId,
      userId,
      email,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 час
    };
    
    return Buffer.from(JSON.stringify(payload)).toString("base64");
  }

  /**
   * Удаляет видео
   */
  async deleteVideo(videoId: string): Promise<void> {
    await axios.delete(`${CLOUDFLARE_STREAM_BASE_URL}/${videoId}`, {
      headers: this.headers,
    });
  }
}

export const cloudflareStream = new CloudflareStreamClient();

