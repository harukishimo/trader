import { test, expect } from "@playwright/test";
test("watchlist, evaluation, alert, paper and mobile flow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "投資を、見渡す。" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "商品を追加", exact: true })
    .first()
    .click();
  await page.getByPlaceholder("商品名・コードで検索").fill("みらい");
  const result = page
    .locator(".search-result")
    .filter({ hasText: "みらいインデックス" });
  await expect(result).toBeVisible();
  if (await result.getByRole("button").isEnabled())
    await result.getByRole("button").click();
  else await page.getByRole("button", { name: "ダイアログを閉じる" }).click();
  await expect(page.locator(".modal")).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".watch-table")).toContainText(
    "みらいインデックス",
  );
  await page.goto("/instruments/demo-1");
  await expect(page.getByRole("heading", { name: "価格の推移" })).toBeVisible();
  await page
    .getByRole("button", { name: "資料を評価する", exact: true })
    .click();
  await expect
    .poll(async () => {
      const d = await (await page.request.get("/api/data")).json();
      return d.evaluations.find(
        (e: { instrument_id: string; status: string }) =>
          e.instrument_id === "demo-1",
      )?.status;
    })
    .toBe("succeeded");
  await page.goto("/evaluations");
  await expect(page.locator(".evaluation-row").first()).toContainText(
    "上方修正",
  );
  await page.goto("/alerts");
  await page.getByRole("button", { name: "条件を追加" }).click();
  await page.getByLabel("しきい値（価格は円 / 確信度は0〜1）").fill("1");
  await page.getByRole("button", { name: "条件を保存" }).click();
  await expect(page.locator(".modal")).not.toBeVisible();
  await page.goto("/paper");
  await page
    .getByRole("button", { name: "比較運用を作成", exact: true })
    .click();
  await page.getByLabel("比較運用名").fill("E2E検証");
  await page.getByRole("button", { name: "比較運用を作成する" }).click();
  await expect(page.locator(".paper-grid")).toContainText("E2E検証");
  await page.goto("/compare");
  await expect(
    page.getByRole("img", { name: "共通基準日を100とした価格比較" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "投資を、見渡す。" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("rejects unauthenticated cron and cross-origin mutation", async ({
  request,
}) => {
  expect((await request.get("/api/cron")).status()).toBe(401);
  expect(
    (
      await request.post("/api/action", {
        headers: { origin: "https://untrusted.example" },
        data: { action: "refresh" },
      })
    ).status(),
  ).toBe(403);
});
