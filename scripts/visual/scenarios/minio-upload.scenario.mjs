/**
 * Image upload against the local MinIO, end to end, through the real UI.
 *
 *   npm run visual:run -- scripts/visual/scenarios/minio-upload.scenario.mjs
 *
 * WHY THIS EXISTS: `POST /me/uploads` has hermetic HTTP coverage
 * (`uploads.e2e.test.ts`, in-memory store) and real-store coverage
 * (`s3-file-storage-provider.minio.e2e.test.ts`, MinIO but no browser). Neither
 * can answer the question a person actually asks — "if I drop a photo on the
 * banner tile, does it appear?" — because that answer spans the file input, the
 * multipart request, the bucket's anonymous-read policy and an `<img>` the
 * browser has to decode. This walks exactly that path.
 *
 * PREREQUISITES: `bash db-manage.sh start` (Postgres, Redis and MinIO),
 * `npm run dev`, and `npm run visual:login`.
 */
export const requiresAuth = true;

/**
 * A 400x200 blue-to-red gradient, inline so the scenario carries its own
 * fixture. `setInputFiles` takes the buffer directly — nothing is written to
 * disk, and there is no path to go stale on another machine.
 */
const BANNER_PNG = Buffer.from(

  "iVBORw0KGgoAAAANSUhEUgAAAZAAAADICAIAAABJdyC1AAAIYklEQVR42u3U0xIoBgIE0RvbtpOJ" +
  "bdu2bdu2bdu2bXNj23ayOz+xb6eqf6HPgAH5bxso/7aB888g+bsNmr8Gy59t8PwxRH5vQ+a3NlR+" +
  "HTq/tGHy87D5qQ2XH4fPD22EfN9GzHcj5ds2cr4ZJV+3UfPVaPmyjZ4v2hj5fMx81sbKp2PnkzZO" +
  "Ph43H7Xx8mEbPx9MkPfbhHlvorzbJs47k+TtNmneapPlzcnzRpsiryf/aVPmtanyaps6r7Rp8vK0" +
  "ealNlxenzwtthjw/Y55rM+XZmfNMmyVPt1nz1Gx5ss2eJ+bI423OPDZXHm1z55E2Tx6eNw+1+fLg" +
  "/HmgLZD7F8x9baHc2xbOPYvk7rZo7losd7bFc8cSub0tmdvaUrl16dzSlsnNy+amtlxuXD43tBVy" +
  "fVsx162Ua9vKuWaVXN1WzVWr5cq2eq5oa+TyNXNZWyuXrp1L2jq5eN1c1NbLhW39XLBBzm8b5ryN" +
  "cm7bOOdskrPbpjlrs5zZNs8ZbYucvmVOa1vl1K1zStsmJ2+bk9p2ObFtnxN2yPFtxxy3U45tO+eY" +
  "XXJ02zVHtd1y5O45ou2Rw/fMYW2vHLp3Dmn75OC2bw7aLwe2/XPAAdm/HZj9Dsq+7eDs0w7J3odm" +
  "r3ZY9jw8e7QjsvuR2a0dlV3b0dnlmOzcjs1Ox2XHdnx2OCHbtxOzXTsp256cbdop2frUbNVOy5an" +
  "Z4t2RjY/M5u1s7JpOzubnJON27nZ6Lxs2M7PBhdk/XZh1msXZd2Ls067JGtfmrXaZVnz8qzRrsjq" +
  "7cqsdlVWbVdnlWuycrs2K12XFdv1WaHdkOVvzHLtpix7c5Zpt2TpW7NUuy1LttuzxB1ZvN2Zxe7K" +
  "ou3uLHJPFm73ZqF2Xxa8Pwu0BzL/g5mvPZR5H8487ZHM3R7NXI9lzvZ45ngis7cnM9tTmbU9nVme" +
  "yczt2czUnsuMz2eG9kKmfzHTtZcy7cuZpr2Sqdurmeq1TNm6zeuZor2Ryd/MZO2tTNreziTvZOL2" +
  "biZ6LxO29zPBBxm/fZjx2kcZ9+OM0z7J2J9mrPZZxvw8Y7QvMnr7MqN9lVHb1xnlm4zcvs1I32XE" +
  "9n1GaD9k+B8zXPspw/6cYdovGfrXDNV+y5Dt9wzxRwZvf2awvzJo+zuD/JOB278ZaACwgAUsYAEL" +
  "WMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jA" +
  "AhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIW" +
  "sIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCA" +
  "BSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUs" +
  "YAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGAB" +
  "C1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtY" +
  "wAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMAC" +
  "FrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhaw" +
  "gAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAF" +
  "LGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxg" +
  "AQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAEL" +
  "WMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jA" +
  "AhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIW" +
  "sIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCA" +
  "BSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUs" +
  "YAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGAB" +
  "C1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtY" +
  "wAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMAC" +
  "FrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhaw" +
  "gAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAF" +
  "LGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxg" +
  "AQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAEL" +
  "WMACFrCABSxgAQtY/z+w/gc0BDCZBIFwnQAAAABJRU5ErkJggg==",
  "base64",
);

/** Where an object must land: path-style, bucket first. See the compose file. */
const MINIO_PREFIX = "http://localhost:9000/crafthub-media/uploads/";

export default async function minioUpload({ goto, shot, assert, page, log }) {
  await goto("/dashboard");
  await page.getByRole("button", { name: /edit profile/i }).first().click();
  await page.getByTestId("banner-upload").waitFor({ timeout: 15_000 });

  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/me/uploads") &&
      response.request().method() === "POST",
    { timeout: 20_000 },
  );

  await page
    .getByTestId("banner-upload")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "banner.png",
      mimeType: "image/png",
      buffer: BANNER_PNG,
    });

  const response = await uploadResponse;
  const status = response.status();
  const body = await response.json().catch(() => null);
  log(`POST /me/uploads -> ${status} ${JSON.stringify(body)}`);

  assert(status === 201, `the upload was accepted (got ${status})`);
  assert(
    String(body?.url ?? "").startsWith(MINIO_PREFIX),
    `the stored URL points at the local MinIO bucket (got ${body?.url})`,
  );

  const cover = page
    .getByTestId("profile-appearance-preview")
    .getByTestId("profile-cover-image");
  await cover.waitFor({ timeout: 15_000 });
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector(
          '[data-testid="profile-appearance-preview"] [data-testid="profile-cover-image"]',
        )
        ?.getAttribute("src") === expected,
    body.url,
    { timeout: 15_000 },
  );

  /*
   * `naturalWidth`, not the `src` attribute. A src proves the app built a URL;
   * only a decoded image proves the browser fetched those bytes ANONYMOUSLY —
   * with no Authorization header and no signature, the way an <img> always
   * does. That is the bucket's public-read policy under test, and it is the one
   * thing a 403 would break silently: the attribute would still be perfect.
   */
  const painted = await cover.evaluate(
    (img) => img.complete && img.naturalWidth > 0,
  );
  assert(painted, "the browser decoded the image served by MinIO");

  await page.getByTestId("profile-appearance-preview").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot("uploaded-banner");
}
