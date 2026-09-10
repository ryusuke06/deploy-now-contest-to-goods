import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import jsQR from "jsqr";
import { productPageUrl } from "../src/lib/suzuri-product";
import { normalizeSiteUrl, PRINT_SIZE } from "../src/lib/validation";
import {
  signCapture,
  verifyCapture,
  validateDesign,
  printTexture,
} from "../src/lib/captures";
import { isPublicAddress, validateResourceUrl } from "../src/lib/safe-fetch";
import { POST } from "../src/app/api/products/route";
import { POST as screenshotPost } from "../src/app/api/screenshots/route";
process.env.SUZURI_API_KEY = "test-only-server-key-never-use-in-production";
const site = "https://demo.lolipop-now.app/";
async function makeBody() {
  const png = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#ec7447" },
  })
    .png()
    .toBuffer();
  return {
    src: `data:image/png;base64,${png.toString("base64")}`,
    receipt: signCapture(png, site),
    title: "作品",
    fit: "contain",
    background: "#f5f1e9",
    confirmed: true,
    publish: true,
  };
}
function request(data: unknown, origin = "http://localhost:3001") {
  return new Request("http://localhost:3001/api/products", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}
test("normalizes only HTTPS lolipop-now.app subdomains", () => {
  assert.equal(
    normalizeSiteUrl("demo.lolipop-now.app/work?q=1#top"),
    "https://demo.lolipop-now.app/work?q=1#top",
  );
  for (const url of [
    "https://lolipop-now.app",
    "https://lolipop-now.app.evil.com",
    "https://evil.com/?x=demo.lolipop-now.app",
    "http://demo.lolipop-now.app",
    "https://user:pass@demo.lolipop-now.app",
    "https://demo.lolipop-now.app:8080",
    "https://-demo.lolipop-now.app",
    "javascript:alert(1)",
    "https://127.0.0.1",
    "",
  ])
    assert.throws(() => normalizeSiteUrl(url), url);
});
test("blocks private, loopback, link-local, IPv6 mapped and reserved addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "192.0.2.1",
    "224.0.0.1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.throws(() => validateResourceUrl("https://example.com", true));
  assert.throws(() => validateResourceUrl("file:///etc/passwd", false));
  assert.throws(() => validateResourceUrl("http://example.com:8080", false));
  assert.equal(
    validateResourceUrl("https://cdn.example.com/image.png", false).hostname,
    "cdn.example.com",
  );
});
test("signed captures survive independent requests and reject tampering and expiry", async () => {
  const body = await makeBody();
  assert.equal(verifyCapture(body.src, body.receipt).url, site);
  assert.throws(() => verifyCapture(body.src, body.receipt + "x"));
  assert.throws(() =>
    verifyCapture(body.src.replace("base64,", "base64,AA"), body.receipt),
  );
  assert.throws(() =>
    verifyCapture(body.src, body.receipt, Date.now() + 16 * 60000),
  );
  assert.throws(() => validateDesign("stretch", "#ffffff"));
  const texture = await printTexture(
    verifyCapture(body.src, body.receipt),
    validateDesign(body.fit, body.background),
  );
  const image = await sharp(
    Buffer.from(texture.split(",")[1], "base64"),
  ).metadata();
  assert.equal(image.width, PRINT_SIZE);
  assert.equal(image.height, PRINT_SIZE);
  const decoded = await sharp(Buffer.from(texture.split(",")[1], "base64"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const qr = jsQR(
    new Uint8ClampedArray(decoded.data),
    decoded.info.width,
    decoded.info.height,
  );
  assert.equal(qr?.data, site);
});
test("rejects cross-origin, missing server key, unsigned images and unconfirmed creation", async () => {
  const body = await makeBody();
  assert.equal((await POST(request(body, "https://evil.com"))).status, 403);
  const key = process.env.SUZURI_API_KEY;
  delete process.env.SUZURI_API_KEY;
  try {
    assert.equal((await POST(request(body))).status, 503);
  } finally {
    process.env.SUZURI_API_KEY = key;
  }
  assert.equal(
    (await POST(request({ ...body, receipt: "forged" }))).status,
    400,
  );
  assert.equal(
    (await POST(request({ ...body, confirmed: false }))).status,
    400,
  );
  assert.equal(
    (await POST(request({ ...body, publish: undefined }))).status,
    400,
  );
  assert.equal((await POST(request(null))).status, 400);
  assert.equal(
    (await screenshotPost(request({ url: "https://example.com" }))).status,
    400,
  );
});
test("uses only server key and creates a public acrylic product from verified screenshot", async (t) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return calls.length === 1
        ? Response.json({
            items: [
              { id: 1, name: "t-shirt" },
              {
                id: 42,
                name: "acrylic-block",
                variants: [
                  {
                    id: 876,
                    enabled: true,
                    exemplary: true,
                    size: { name: "m" },
                    color: { name: "clear" },
                  },
                ],
              },
            ],
          })
        : Response.json({
            material: { id: 123 },
            products: [
              {
                item: { id: 42 },
                sampleUrl:
                  "https://suzuri.jp/demo/123/acrylic-block/free/clear",
              },
            ],
          });
    },
  );
  const req = request(await makeBody());
  req.headers.set("authorization", "Bearer attacker-selected-key");
  const response = await POST(req);
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).productUrl,
    "https://suzuri.jp/demo/123/acrylic-block/free/clear",
  );
  assert.deepEqual(JSON.parse(calls[1].init!.body as string).products, [
    {
      itemId: 42,
      exemplaryItemVariantId: 876,
      published: true,
      resizeMode: "contain",
    },
  ]);
  assert.equal(
    (calls[0].init!.headers as Record<string, string>).Authorization,
    `Bearer ${process.env.SUZURI_API_KEY}`,
  );
  assert.equal(calls[1].url, "https://suzuri.jp/api/v1/materials");
});
test("handles upstream auth, rate limits, missing item and uncertain creation", async (t) => {
  const body = await makeBody();
  const mock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 401 }),
  );
  assert.equal((await POST(request(body))).status, 401);
  mock.mock.mockImplementation(async () => new Response(null, { status: 429 }));
  assert.equal((await POST(request(body))).status, 429);
  mock.mock.mockImplementation(async () => Response.json({ items: [] }));
  assert.equal((await POST(request(body))).status, 503);
  mock.mock.mockImplementation(async (url: string | URL | Request) => {
    if (String(url).endsWith("/items"))
      return Response.json({
        items: [
          {
            id: 42,
            name: "acrylic-block",
            variants: [
              {
                id: 876,
                enabled: true,
                exemplary: true,
                size: { name: "m" },
                color: { name: "clear" },
              },
            ],
          },
        ],
      });
    throw new Error("private upstream details");
  });
  const response = await POST(request(body));
  const data = await response.json();
  assert.equal(response.status, 502);
  assert.equal(data.uncertain, true);
  assert.equal(data.error.includes("private"), false);
});

test("never redirects to SUZURI home, foreign hosts or the wrong product", () => {
  const variant = { id: 876, size: { name: "m" }, color: { name: "clear" } };
  for (const sampleUrl of [
    "https://suzuri.jp/",
    "https://evil.com/a/123/acrylic-block/m/clear",
    "https://suzuri.jp/a/999/acrylic-block/m/clear",
    "https://suzuri.jp/a/123/t-shirt/m/clear",
  ]) {
    assert.equal(productPageUrl({ sampleUrl }, 123, variant), null);
  }
  assert.equal(
    productPageUrl(
      { url: "https://suzuri.jp/a/123/acrylic-block/{size}/{color}" },
      123,
      variant,
    ),
    "https://suzuri.jp/a/123/acrylic-block/m/clear",
  );
});
test("repairs a material without a product without duplicating its artwork", async (t) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (calls.length === 1)
        return Response.json({
          items: [
            {
              id: 42,
              name: "acrylic-block",
              variants: [{ id: 876, enabled: true }],
            },
          ],
        });
      if (calls.length === 2)
        return Response.json({ material: { id: 123 }, products: [] });
      return Response.json({
        material: { id: 123 },
        products: [
          {
            id: 456,
            item: { id: 42 },
            sampleUrl: "https://suzuri.jp/a/123/acrylic-block/m/clear",
          },
        ],
      });
    },
  );
  const response = await POST(request(await makeBody()));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].init?.method, "PUT");
  assert.equal(calls[2].url, "https://suzuri.jp/api/v1/materials/123");
});

test("QR remains readable when product edges are cropped", async () => {
  const body = await makeBody();
  for (const fit of ["contain", "cover"] as const) {
    const texture = await printTexture(
      verifyCapture(body.src, body.receipt),
      validateDesign(fit, "#202b27"),
    );
    const cropped = await sharp(Buffer.from(texture.split(",")[1], "base64"))
      .extract({
        left: 128,
        top: 128,
        width: PRINT_SIZE - 256,
        height: PRINT_SIZE - 256,
      })
      .resize(800, 800)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const qr = jsQR(
      new Uint8ClampedArray(cropped.data),
      cropped.info.width,
      cropped.info.height,
    );
    assert.equal(
      qr?.data,
      site,
      `QR must survive edge cropping in ${fit} mode`,
    );
  }
});
