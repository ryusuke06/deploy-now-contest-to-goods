import { NextResponse } from "next/server";
export const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function checkRequest(request: Request) {
  const origin = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return reply({ error: "このサイトの画面から操作してください。" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ error: "JSONが必要です。" }, 415);
}
export async function readJson(request: Request, limit = 8192) {
  if (!request.body) throw new Error("リクエストが空です。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("入力が大きすぎます。");
    }
    chunks.push(value);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object")
    throw new Error("入力内容を確認してください。");
  return body;
}
