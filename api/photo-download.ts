import { createClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "node:http";
import sharp from "sharp";

interface ApiRequest extends IncomingMessage {
  body?: unknown;
}

type PhotoRow = {
  album_id: string;
  storage_path: string;
  captured_at: string;
};

function sendJSON(response: ServerResponse, status: number, message: string) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ message }));
}

async function readJSONBody(request: ApiRequest): Promise<unknown> {
  if (request.body !== undefined) {
    if (typeof request.body === "string") return JSON.parse(request.body);
    if (Buffer.isBuffer(request.body)) {
      return JSON.parse(request.body.toString("utf8"));
    }
    return request.body;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isPhotoRequest(value: unknown): value is { photoId: string } {
  if (!value || typeof value !== "object") return false;
  const photoID = Reflect.get(value, "photoId");
  return (
    typeof photoID === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      photoID,
    )
  );
}

function outputFileName(extension: string, capturedAt: string) {
  const date = new Date(capturedAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const stamp = safeDate
    .toLocaleString("sv-SE", { timeZone: "Asia/Tokyo", hour12: false })
    .replace(" ", "_")
    .replaceAll(":", "");
  return `Eternal-memories_${stamp}.${extension}`;
}

export async function addWatermark(input: Buffer) {
  const metadata = await sharp(input, { failOn: "none" }).metadata();
  const rotated =
    metadata.orientation !== undefined &&
    metadata.orientation >= 5 &&
    metadata.orientation <= 8;
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  if (!width || !height) throw new Error("Image dimensions are unavailable");

  const shortSide = Math.min(width, height);
  const fontSize = Math.round(Math.max(18, Math.min(54, shortSide * 0.035)));
  const padding = Math.round(Math.max(8, fontSize * 0.42));
  const margin = Math.round(Math.max(14, shortSide * 0.025));
  const textWidth = Math.round(fontSize * 8.9);
  const boxWidth = textWidth + padding * 2;
  const boxHeight = fontSize + padding * 1.65;
  const boxX = Math.max(margin, width - margin - boxWidth);
  const boxY = Math.max(margin, height - margin - boxHeight);
  const textX = boxX + padding;
  const textY = boxY + padding + fontSize * 0.78;
  const overlay = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}"
        rx="${padding}" fill="rgba(0,0,0,0.22)" />
      <text x="${textX}" y="${textY}" font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}" font-weight="600" fill="rgba(255,255,255,0.62)"
        stroke="rgba(0,0,0,0.20)" stroke-width="1">Eternal memories</text>
    </svg>
  `);

  let pipeline = sharp(input, { failOn: "none" })
    .rotate()
    .composite([{ input: overlay, top: 0, left: 0 }])
    .withMetadata({ orientation: 1 });

  if (metadata.format === "png") {
    pipeline = pipeline.png({ compressionLevel: 9 });
    return {
      buffer: await pipeline.toBuffer(),
      contentType: "image/png",
      extension: "png",
    };
  }
  if (metadata.format === "webp") {
    pipeline = pipeline.webp({ quality: 90 });
    return {
      buffer: await pipeline.toBuffer(),
      contentType: "image/webp",
      extension: "webp",
    };
  }

  pipeline = pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4" });
  return {
    buffer: await pipeline.toBuffer(),
    contentType: "image/jpeg",
    extension: "jpg",
  };
}

export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJSON(response, 405, "Method Not Allowed");
    return;
  }

  const supabaseURL =
    process.env.SUPABASE_URL?.trim() ??
    process.env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY?.trim() ??
    process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!supabaseURL || !supabaseAnonKey) {
    console.error("[PhotoDownload] Supabase environment variables are missing");
    sendJSON(response, 500, "画像を保存できませんでした");
    return;
  }

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    sendJSON(response, 401, "ログインが必要です");
    return;
  }

  try {
    const body = await readJSONBody(request);
    if (!isPhotoRequest(body)) {
      sendJSON(response, 400, "写真の指定が正しくありません");
      return;
    }

    const client = createClient(supabaseURL, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError || !user) {
      sendJSON(response, 401, "ログイン情報を確認できませんでした");
      return;
    }

    const { data: photo, error: photoError } = await client
      .from("photos")
      .select("album_id, storage_path, captured_at")
      .eq("id", body.photoId)
      .maybeSingle<PhotoRow>();
    if (photoError) throw photoError;
    if (!photo?.album_id || !photo.storage_path) {
      sendJSON(response, 404, "写真が見つかりません");
      return;
    }

    const { data: isMember, error: membershipError } = await client.rpc(
      "is_album_member",
      { target_album_id: photo.album_id },
    );
    if (membershipError) throw membershipError;
    if (isMember !== true) {
      sendJSON(response, 403, "この写真を保存する権限がありません");
      return;
    }

    const { data: signed, error: signedError } = await client.storage
      .from("album-photos")
      .createSignedUrl(photo.storage_path, 30);
    if (signedError || !signed?.signedUrl) {
      throw signedError ?? new Error("Signed URL was not created");
    }

    const sourceResponse = await fetch(signed.signedUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!sourceResponse.ok) {
      throw new Error(`Storage returned ${sourceResponse.status}`);
    }
    const result = await addWatermark(
      Buffer.from(await sourceResponse.arrayBuffer()),
    );

    response.statusCode = 200;
    response.setHeader("Content-Type", result.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${outputFileName(result.extension, photo.captured_at)}"`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(result.buffer);
  } catch (error) {
    console.error("[PhotoDownload] Failed to create download", error);
    sendJSON(response, 500, "画像を保存できませんでした");
  }
}
