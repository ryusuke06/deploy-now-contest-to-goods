import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { siteQr, QR_OFFSET } from "./qr";
import { normalizeSiteUrl, PRINT_SIZE } from "./validation";
export const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
export type CaptureRecord = { png: Buffer; url: string };
function signature(payload: string) {
  const key = process.env.SUZURI_API_KEY?.trim();
  if (!key) throw new Error("サーバーのSUZURI APIキーが未設定です。");
  return createHmac("sha256", key)
    .update(`web-object-capture-v1:${payload}`)
    .digest("base64url");
}
export function signCapture(png: Buffer, url: string, now = Date.now()) {
  if (png.length > MAX_CAPTURE_BYTES)
    throw new Error("撮影画像が大きすぎます。");
  const payload = Buffer.from(
    JSON.stringify({
      url: normalizeSiteUrl(url),
      hash: createHash("sha256").update(png).digest("hex"),
      expires: now + 15 * 60000,
    }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyCapture(
  src: unknown,
  receipt: unknown,
  now = Date.now(),
): CaptureRecord {
  if (
    typeof src !== "string" ||
    typeof receipt !== "string" ||
    receipt.length > 4096 ||
    src.length > MAX_CAPTURE_BYTES * 1.4 ||
    !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)
  )
    throw new Error("サイトをもう一度撮影してください。");
  const [payload, mac, ...extra] = receipt.split(".");
  if (!payload || !mac || extra.length) throw new Error("撮影情報が無効です。");
  const actual = Buffer.from(mac, "base64url"),
    expected = Buffer.from(signature(payload), "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("撮影情報が無効です。");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const png = Buffer.from(src.slice(src.indexOf(",") + 1), "base64");
  if (
    !Number.isFinite(data.expires) ||
    data.expires < now ||
    png.length > MAX_CAPTURE_BYTES ||
    createHash("sha256").update(png).digest("hex") !== data.hash
  )
    throw new Error(
      "撮影画像が変更されたか期限が切れています。もう一度撮影してください。",
    );
  return { png, url: normalizeSiteUrl(data.url) };
}
export function validateDesign(
  fit: unknown,
  background: unknown,
): { fit: "contain" | "cover"; background: string } {
  if (fit !== "contain" && fit !== "cover")
    throw new Error("画像の配置を選んでください。");
  if (
    typeof background !== "string" ||
    !["#f5f1e9", "#ffffff", "#202b27", "#ed794e"].includes(background)
  )
    throw new Error("余白の色を選んでください。");
  return { fit, background };
}
export async function printTexture(
  record: CaptureRecord,
  design: ReturnType<typeof validateDesign>,
) {
  const qr = Buffer.from((await siteQr(record.url)).split(",")[1], "base64");
  const png = await sharp(record.png, { limitInputPixels: 12_000_000 })
    .resize(PRINT_SIZE, PRINT_SIZE, {
      fit: design.fit,
      background: design.background,
      position: "centre",
    })
    .flatten({ background: design.background })
    .composite([{ input: qr, left: QR_OFFSET, top: QR_OFFSET }])
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
