import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import sharp from "sharp";
const origin = process.env.TEST_ORIGIN || "http://localhost:3001";

test("studio shows a QR-equipped 3D block and redirects after creation", async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const png = await sharp(
      Buffer.from(
        '<svg width="1440" height="1080" xmlns="http://www.w3.org/2000/svg"><rect width="1440" height="1080" fill="#f6efdb"/><rect x="90" y="120" width="1260" height="65" fill="#263b32"/><text x="90" y="350" font-family="Arial" font-size="110" fill="#263b32">HELLO, WORLD.</text><circle cx="1120" cy="720" r="220" fill="#ec7447"/><text x="90" y="520" font-family="Arial" font-size="42" fill="#263b32">Your website, on your desk.</text></svg>',
      ),
    )
      .png()
      .toBuffer();
    await page.route("**/api/screenshots", (route) =>
      route.fulfill({
        json: {
          src: `data:image/png;base64,${png.toString("base64")}`,
          receipt: "browser-test-fixture",
          width: 1440,
          height: 1080,
          url: "https://fixture.lolipop-now.app/",
        },
      }),
    );
    let submitted = false;
    const productUrl = "https://suzuri.jp/fixture/123/acrylic-block/m/clear";
    await page.route("**/api/products", async (route) => {
      submitted = true;
      const body = route.request().postDataJSON();
      assert.equal(body.receipt, "browser-test-fixture");
      assert.equal(body.confirmed, true);
      assert.equal(body.publish, true);
      assert.ok(!("texture" in body));
      await route.fulfill({ json: { productUrl, message: "作成しました" } });
    });
    await page.route("https://suzuri.jp/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Created acrylic block</h1>",
      }),
    );
    await page.goto(origin);
    assert.equal(
      await page.getByRole("button", { name: "サイトを開く" }).count(),
      0,
    );
    await page
      .getByLabel("公開したサイトのURL")
      .fill("https://fixture.lolipop-now.app/");
    await page.getByRole("button", { name: "撮影して次へ" }).click();
    await page.getByRole("link", { name: "画像を保存" }).waitFor();
    await page.locator(".acrylic-canvas canvas").waitFor();
    await page.waitForTimeout(2000);
    await page
      .locator(".preview-panel")
      .screenshot({ path: "/tmp/web-object-3d-preview.png" });
    await page.screenshot({ path: "/tmp/web-object-mobile-step2.png" });
    assert.equal(await page.getByLabel("作品名", { exact: true }).count(), 0);
    const canvasResolution = await page
      .locator(".acrylic-canvas canvas")
      .evaluate((canvas) => ({
        pixels: (canvas as HTMLCanvasElement).width,
        width: canvas.getBoundingClientRect().width,
      }));
    assert.ok(canvasResolution.pixels >= canvasResolution.width * 2);
    const before = await page.locator(".acrylic-canvas canvas").screenshot();
    const box = await page.locator(".acrylic-canvas canvas").boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 100,
      box.y + box.height / 2 + 10,
      { steps: 10 },
    );
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await page.locator(".acrylic-canvas canvas").screenshot();
    assert.notDeepEqual(before, after);
    await page.getByRole("button", { name: "角度を戻す" }).click();
    await page.getByRole("button", { name: "これで次へ" }).click();
    await page
      .getByRole("heading", { name: "あなただけのグッズに。" })
      .waitFor();
    await page
      .getByLabel("作品名", { exact: true })
      .fill("Browser integration test");
    await page.getByRole("checkbox").check();
    await page.screenshot({ path: "/tmp/web-object-mobile-step3.png" });
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 500 },
      { width: 1280, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      const preview = await page.locator(".preview-panel").boundingBox();
      await page
        .locator(".step-content")
        .evaluate((panel) => panel.scrollTo(0, panel.scrollHeight));
      assert.deepEqual(
        await page.locator(".preview-panel").boundingBox(),
        preview,
      );
      const action = await page
        .getByRole("button", { name: "SUZURIで作成する" })
        .boundingBox();
      assert.ok(action && action.y + action.height <= viewport.height);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "SUZURIで作成する" }).click();
    await page.waitForURL(productUrl);
    assert.equal(submitted, true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
