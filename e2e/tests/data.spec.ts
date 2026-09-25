import { expect, test } from '@playwright/test';
import { saveDetection } from './helpers';

test.describe('history, dashboard and live updates', () => {
  test('history lists saved detections and loads more with the cursor', async ({
    page,
    request,
  }) => {
    for (let i = 0; i < 25; i++) await saveDetection(request, 'neutral', 10 + i);

    await page.goto('/history');
    const rows = page.getByRole('table', { name: 'Detection history' }).getByRole('row');
    await expect(rows).toHaveCount(21); // header + first page of 20
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(rows).not.toHaveCount(21);
  });

  test('a detection saved elsewhere appears without reloading (Server-Sent Events)', async ({
    page,
    request,
  }) => {
    await page.goto('/history');
    await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();
    const disgusted = page.getByRole('cell', { name: /Disgusted/ });
    const before = await disgusted.count();

    await saveDetection(request, 'disgusted', 0);

    await expect(disgusted).toHaveCount(before + 1);
  });

  test('the dashboard shows statistics and the trend chart', async ({ page, request }) => {
    await saveDetection(request, 'happy', 5);

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Expression statistics' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Detections over time' })).toBeVisible();
    await expect(page.getByRole('group', { name: /Detections over time/ })).toBeVisible();

    // The accessible table view carries the same data as the chart.
    await page.getByLabel('Show as table').nth(1).check();
    await expect(page.getByRole('table', { name: 'Detections over time' })).toBeVisible();
  });
});
