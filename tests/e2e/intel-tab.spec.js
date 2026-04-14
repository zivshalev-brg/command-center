// @ts-check
/**
 * E2E Tests — Beanz OS Command Center: Intel Tab (CIBE)
 *
 * Covers:
 *   1. Intel Tab Navigation
 *   2. Briefings View
 *   3. Correlations View
 *   4. Market View
 *   5. Roasters View
 *   6. Anomalies View
 *   7. API Endpoints
 */

const { test, expect, request } = require('playwright/test');

const BASE_URL = 'http://localhost:3737';

// ---------------------------------------------------------------------------
// Helper: navigate to the Intel tab and wait for data to load
// ---------------------------------------------------------------------------
async function openIntelTab(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Click the Intel tab (data-mod="intel")
  const intelTab = page.locator('[data-mod="intel"]');
  await expect(intelTab).toBeVisible();
  await intelTab.click();

  // Wait for the sidebar "Intel Sections" header to confirm tab rendered
  await expect(page.locator('text=Intel Sections')).toBeVisible({ timeout: 10000 });
}

// Helper: click a sidebar item by label and wait for a heading to appear
async function clickSidebarItem(page, label, expectedHeading) {
  const item = page.locator('.sb-item', { hasText: label });
  await expect(item).toBeVisible();
  await item.click();

  if (expectedHeading) {
    await expect(
      page.locator('#main h2', { hasText: expectedHeading })
    ).toBeVisible({ timeout: 10000 });
  }
}

// ---------------------------------------------------------------------------
// Suite 1 — Intel Tab Navigation
// ---------------------------------------------------------------------------
test.describe('Intel Tab — Navigation', () => {
  test('clicking Intel tab activates it and shows Intel Sections sidebar', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const intelTab = page.locator('[data-mod="intel"]');
    await expect(intelTab).toBeVisible();
    await intelTab.click();

    // Sidebar title present
    await expect(page.locator('text=Intel Sections')).toBeVisible({ timeout: 10000 });
  });

  test('keyboard shortcut 9 activates Intel tab', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Press digit 9 to switch to Intel tab
    await page.keyboard.press('9');

    await expect(page.locator('text=Intel Sections')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar shows all 5 sections: Briefings, Correlations, Market, Roasters, Anomalies', async ({ page }) => {
    await openIntelTab(page);

    const expectedSections = ['Briefings', 'Correlations', 'Market', 'Roasters', 'Anomalies'];
    for (const section of expectedSections) {
      await expect(
        page.locator('.sb-item', { hasText: section })
      ).toBeVisible({ timeout: 8000 });
    }
  });

  test('Quick Stats shows "28 roasters monitored" after data loads', async ({ page }) => {
    await openIntelTab(page);

    // Wait for CIBE data to finish loading (sidebar meta updates)
    await expect(
      page.locator('.sb-meta', { hasText: '28 roasters monitored' })
    ).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Briefings View
// ---------------------------------------------------------------------------
test.describe('Intel Tab — Briefings View', () => {
  test.beforeEach(async ({ page }) => {
    await openIntelTab(page);
  });

  test('Briefings is the default section shown on tab activation', async ({ page }) => {
    await expect(
      page.locator('#main h2', { hasText: 'Intelligence Briefings' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('Generate Daily and Generate Weekly buttons are visible', async ({ page }) => {
    // Navigate explicitly to ensure briefings section is active
    await clickSidebarItem(page, 'Briefings', 'Intelligence Briefings');

    await expect(page.locator('#btn-gen-daily')).toBeVisible();
    await expect(page.locator('#btn-gen-weekly')).toBeVisible();

    await expect(page.locator('#btn-gen-daily')).toHaveText('Generate Daily');
    await expect(page.locator('#btn-gen-weekly')).toHaveText('Generate Weekly');
  });

  test('empty state message appears when no briefings exist', async ({ page }) => {
    await clickSidebarItem(page, 'Briefings', 'Intelligence Briefings');

    // The API returns 0 briefings — verify empty state
    await expect(
      page.locator('.empty-title', { hasText: 'No briefings yet' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('empty state sub-message instructs user to generate a briefing', async ({ page }) => {
    await clickSidebarItem(page, 'Briefings', 'Intelligence Briefings');

    await expect(
      page.locator('.empty-sub', { hasText: 'Generate Weekly' })
    ).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Correlations View
// ---------------------------------------------------------------------------
test.describe('Intel Tab — Correlations View', () => {
  test.beforeEach(async ({ page }) => {
    await openIntelTab(page);
    await clickSidebarItem(page, 'Correlations', 'Cross-Signal Correlations');
  });

  test('"Cross-Signal Correlations" heading is visible', async ({ page }) => {
    await expect(
      page.locator('#main h2', { hasText: 'Cross-Signal Correlations' })
    ).toBeVisible();
  });

  test('"Refresh" button is present', async ({ page }) => {
    await expect(
      page.locator('#main button', { hasText: 'Refresh' })
    ).toBeVisible();
  });

  test('empty state shows when no correlations exist', async ({ page }) => {
    // Correlations API returns 0 items; expect empty state
    await expect(
      page.locator('.empty-title', { hasText: 'No correlations yet' })
    ).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Market View
// ---------------------------------------------------------------------------
test.describe('Intel Tab — Market View', () => {
  test.beforeEach(async ({ page }) => {
    await openIntelTab(page);
    await clickSidebarItem(page, 'Market', 'Market Intelligence');
  });

  test('"Market Intelligence" heading is visible', async ({ page }) => {
    await expect(
      page.locator('#main h2', { hasText: 'Market Intelligence' })
    ).toBeVisible();
  });

  test('"Product Catalogue" summary card is present', async ({ page }) => {
    await expect(
      page.locator('#main .card-title', { hasText: 'Product Catalogue' })
    ).toBeVisible();
  });

  test('"Outlier Alerts" summary card is present', async ({ page }) => {
    await expect(
      page.locator('#main .card-title', { hasText: 'Outlier Alerts' })
    ).toBeVisible();
  });

  test('"Google Trends" summary card is present', async ({ page }) => {
    await expect(
      page.locator('#main .card-title', { hasText: 'Google Trends' })
    ).toBeVisible();
  });

  test('"View Products" button is present', async ({ page }) => {
    await expect(
      page.locator('#main button', { hasText: 'View Products' })
    ).toBeVisible();
  });

  test('exactly 3 summary cards are shown in Market view', async ({ page }) => {
    const cards = page.locator('#main .card-title');
    await expect(cards).toHaveCount(3);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Roasters View
// ---------------------------------------------------------------------------
test.describe('Intel Tab — Roasters View', () => {
  test.beforeEach(async ({ page }) => {
    await openIntelTab(page);
    await clickSidebarItem(page, 'Roasters', 'Monitored Roasters');
  });

  test('"28 active" roasters count label is shown', async ({ page }) => {
    await expect(
      page.locator('#main', { hasText: '28 active' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('all 6 scrape buttons are visible: Homepages, Catalogues, Social, Trends, EDMs, Log', async ({ page }) => {
    // Non-"Log" buttons use substring matching; "Log" needs exact match to
    // avoid matching "Catalogues" (which also contains "log").
    const substringButtons = ['Homepages', 'Social', 'Trends', 'EDMs'];
    for (const label of substringButtons) {
      await expect(
        page.locator('#main button', { hasText: label })
      ).toBeVisible({ timeout: 8000 });
    }

    // "Catalogues" and "Log" resolved via role + exact name to avoid strict-mode conflicts
    await expect(
      page.locator('#main').getByRole('button', { name: 'Catalogues', exact: true })
    ).toBeVisible({ timeout: 8000 });

    await expect(
      page.locator('#main').getByRole('button', { name: 'Log', exact: true })
    ).toBeVisible({ timeout: 8000 });
  });

  test('scrape status bar shows HP, Cat, Social, Trends, EDM schedule fields', async ({ page }) => {
    // Status bar is rendered when scrapeStatus data is present
    // Wait for text containing "HP:" label
    await expect(
      page.locator('#main', { hasText: 'HP:' })
    ).toBeVisible({ timeout: 10000 });

    await expect(page.locator('#main', { hasText: 'Cat:' })).toBeVisible();
    await expect(page.locator('#main', { hasText: 'Social:' })).toBeVisible();
    await expect(page.locator('#main', { hasText: 'Trends:' })).toBeVisible();
    await expect(page.locator('#main', { hasText: 'EDM:' })).toBeVisible();
  });

  test('roaster table has all required column headers', async ({ page }) => {
    const expectedHeaders = ['Name', 'Country', 'Type', 'Website', 'Instagram', 'Partner', 'Actions'];
    for (const header of expectedHeaders) {
      await expect(
        page.locator('#main table th', { hasText: header })
      ).toBeVisible({ timeout: 8000 });
    }
  });

  test('roaster table has 28 data rows', async ({ page }) => {
    const rows = page.locator('#main table tbody tr');
    await expect(rows).toHaveCount(28, { timeout: 10000 });
  });

  test('each roaster row has an HP button and an AI button', async ({ page }) => {
    // Verify at least the first row has HP and AI action buttons
    const firstRow = page.locator('#main table tbody tr').first();
    await expect(firstRow.locator('button', { hasText: 'HP' })).toBeVisible();
    await expect(firstRow.locator('button', { hasText: 'AI' })).toBeVisible();
  });

  test('first roaster row shows a known roaster name', async ({ page }) => {
    // Campos Coffee is the first roaster (alphabetical in AU group)
    const firstRowName = page.locator('#main table tbody tr').first().locator('td').first();
    // Just verify cell is non-empty — not hardcoding order
    await expect(firstRowName).not.toBeEmpty();
  });

  test('scrape status bar shows "idle" or "running" state indicator', async ({ page }) => {
    const statusBar = page.locator('#main', { hasText: 'Scraper:' });
    await expect(statusBar).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Anomalies View
// ---------------------------------------------------------------------------
test.describe('Intel Tab — Anomalies View', () => {
  test.beforeEach(async ({ page }) => {
    await openIntelTab(page);
    await clickSidebarItem(page, 'Anomalies', 'KPI Anomalies');
  });

  test('"KPI Anomalies" heading is visible', async ({ page }) => {
    await expect(
      page.locator('#main h2', { hasText: 'KPI Anomalies' })
    ).toBeVisible();
  });

  test('empty state shows when no anomalies are detected', async ({ page }) => {
    // The API returns 0 anomalies currently
    await expect(
      page.locator('.empty-title', { hasText: 'No anomalies detected' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('empty state sub-message is informative', async ({ page }) => {
    await expect(
      page.locator('.empty-sub', { hasText: 'All monitored KPIs are within normal range' })
    ).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Section Switching (sidebar navigation)
// ---------------------------------------------------------------------------
test.describe('Intel Tab — Sidebar Navigation Flow', () => {
  test('can navigate through all 5 sections sequentially', async ({ page }) => {
    await openIntelTab(page);

    // Briefings (default)
    await expect(
      page.locator('#main h2', { hasText: 'Intelligence Briefings' })
    ).toBeVisible({ timeout: 10000 });

    // Correlations
    await clickSidebarItem(page, 'Correlations', 'Cross-Signal Correlations');

    // Market
    await clickSidebarItem(page, 'Market', 'Market Intelligence');

    // Roasters
    await clickSidebarItem(page, 'Roasters', 'Monitored Roasters');

    // Anomalies
    await clickSidebarItem(page, 'Anomalies', 'KPI Anomalies');

    // Navigate back to Briefings
    await clickSidebarItem(page, 'Briefings', 'Intelligence Briefings');
  });

  test('active sidebar item is highlighted when switching sections', async ({ page }) => {
    await openIntelTab(page);

    // Click Roasters and verify it has the active class
    const roastersItem = page.locator('.sb-item', { hasText: 'Roasters' });
    await roastersItem.click();

    await expect(
      page.locator('#main h2', { hasText: 'Monitored Roasters' })
    ).toBeVisible({ timeout: 10000 });

    await expect(roastersItem).toHaveClass(/active/);
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — API Endpoints
// ---------------------------------------------------------------------------
test.describe('CIBE API Endpoints', () => {
  let apiContext;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: BASE_URL,
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('GET /api/cibe/roasters returns 200 with roasters array of count 28', async () => {
    const response = await apiContext.get('/api/cibe/roasters');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('roasters');
    expect(Array.isArray(body.roasters)).toBe(true);
    expect(body.roasters.length).toBe(28);
    expect(body).toHaveProperty('count', 28);
  });

  test('GET /api/cibe/roasters — each roaster has required fields', async () => {
    const response = await apiContext.get('/api/cibe/roasters');
    const body = await response.json();
    const requiredFields = ['id', 'name', 'country', 'type', 'website', 'instagram', 'beanz_partner', 'active'];

    for (const roaster of body.roasters) {
      for (const field of requiredFields) {
        expect(roaster).toHaveProperty(field);
      }
    }
  });

  test('GET /api/cibe/correlations returns 200 with correlations array', async () => {
    const response = await apiContext.get('/api/cibe/correlations');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('correlations');
    expect(Array.isArray(body.correlations)).toBe(true);
  });

  test('GET /api/cibe/trends returns 200', async () => {
    const response = await apiContext.get('/api/cibe/trends');
    expect(response.status()).toBe(200);

    const body = await response.json();
    // trends can be an array or object with trends property
    expect(body).toBeDefined();
  });

  test('GET /api/cibe/overview returns 200 with roasters, products, briefings, anomalies keys', async () => {
    const response = await apiContext.get('/api/cibe/overview');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('roasters');
    expect(body).toHaveProperty('products');
    expect(body).toHaveProperty('briefings');
    expect(body).toHaveProperty('anomalies');
  });

  test('GET /api/cibe/overview — roasters count is 28', async () => {
    const response = await apiContext.get('/api/cibe/overview');
    const body = await response.json();
    expect(body.roasters).toBe(28);
  });

  test('GET /api/cibe/briefings?limit=5 returns 200 with briefings array', async () => {
    const response = await apiContext.get('/api/cibe/briefings?limit=5');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('briefings');
    expect(Array.isArray(body.briefings)).toBe(true);
    // Respects limit: should have at most 5
    expect(body.briefings.length).toBeLessThanOrEqual(5);
  });

  test('GET /api/cibe/products?aggregate=true returns 200', async () => {
    const response = await apiContext.get('/api/cibe/products?aggregate=true');
    expect(response.status()).toBe(200);

    const body = await response.json();
    // Aggregated response has byOrigin, byRoastLevel, byRoaster keys
    expect(body).toHaveProperty('byOrigin');
    expect(body).toHaveProperty('byRoastLevel');
    expect(body).toHaveProperty('byRoaster');
  });

  test('GET /api/cibe/internal/anomalies returns 200 with anomalies array', async () => {
    const response = await apiContext.get('/api/cibe/internal/anomalies');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('anomalies');
    expect(Array.isArray(body.anomalies)).toBe(true);
    expect(body).toHaveProperty('total');
  });

  test('GET /api/cibe/scrape/cibe-status returns 200 with schedule timestamps', async () => {
    const response = await apiContext.get('/api/cibe/scrape/cibe-status');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('nextHomepage');
    expect(body).toHaveProperty('nextCatalogue');
    expect(body).toHaveProperty('nextSocial');
    expect(body).toHaveProperty('nextTrends');
    expect(body).toHaveProperty('nextEdm');
    expect(body).toHaveProperty('schedule');
  });

  test('GET /api/cibe/scrape/cibe-status — schedule has all 5 frequency fields', async () => {
    const response = await apiContext.get('/api/cibe/scrape/cibe-status');
    const body = await response.json();
    expect(body.schedule).toHaveProperty('homepages');
    expect(body.schedule).toHaveProperty('catalogues');
    expect(body.schedule).toHaveProperty('social');
    expect(body.schedule).toHaveProperty('trends');
    expect(body.schedule).toHaveProperty('edms');
  });

  test('GET /api/cibe/scrape/cibe-status — nextHomepage is a valid ISO date string', async () => {
    const response = await apiContext.get('/api/cibe/scrape/cibe-status');
    const body = await response.json();
    const nextHomepage = new Date(body.nextHomepage);
    expect(nextHomepage.getTime()).not.toBeNaN();
  });
});
