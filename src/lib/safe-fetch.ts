import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { lookup } from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import ipaddr from "ipaddr.js";
import { normalizeSiteUrl } from "./validation";

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function validateResourceUrl(value: string, document: boolean) {
  const url = new URL(document ? normalizeSiteUrl(value) : value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Unsupported resource URL");
  return url;
}

// Each HTTP hop is resolved, checked and pinned to the checked IP for this connection.
// Redirects are followed here, not by Chromium: Playwright does not route each redirect hop.
export async function fetchPublicResource(
  value: string,
  document: boolean,
  signal: AbortSignal,
  redirects = 0,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  finalUrl: string;
}> {
  if (redirects > 5) throw new Error("Too many redirects");
  const url = validateResourceUrl(value, document);
  signal.throwIfAborted();
  const addresses = await lookup(url.hostname, { all: true });
  signal.throwIfAborted();
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new Error("Private network is unavailable");
  const address = addresses.find((a) => a.family === 4) || addresses[0];
  const result = await new Promise<{
    status: number;
    headers: Record<string, string>;
    body: Buffer;
  }>((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        family: address.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; WebObject/1.0)",
          "Accept-Encoding": "identity",
          Accept: "*/*",
        },
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (
            value !== undefined &&
            ![
              "connection",
              "transfer-encoding",
              "content-length",
              "set-cookie",
              "alt-svc",
            ].includes(key)
          )
            headers[key] = Array.isArray(value) ? value.join(", ") : value;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) {
            res.destroy(new Error("Resource too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode || 502,
            headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("Resource timeout")));
    req.end();
  });
  if (
    [301, 302, 303, 307, 308].includes(result.status) &&
    result.headers.location
  ) {
    const target = validateResourceUrl(
      new URL(result.headers.location, url).href,
      document,
    );
    return fetchPublicResource(target.href, document, signal, redirects + 1);
  }
  const encoding = result.headers["content-encoding"];
  if (encoding) {
    const options = { maxOutputLength: 8 * 1024 * 1024 };
    if (encoding === "gzip") result.body = gunzipSync(result.body, options);
    else if (encoding === "br")
      result.body = brotliDecompressSync(result.body, options);
    else if (encoding === "deflate")
      result.body = inflateSync(result.body, options);
    else if (encoding !== "identity") throw new Error("Unsupported encoding");
    delete result.headers["content-encoding"];
  }
  return { ...result, finalUrl: url.href };
}
