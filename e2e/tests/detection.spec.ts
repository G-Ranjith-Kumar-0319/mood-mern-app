import { expect, test } from '@playwright/test';
import { expressionTitle, startCamera, useDetectorSettings } from './helpers';

test.describe('detection with a real face (fake camera plays a photo)', () => {
  test('detects a face and shows a smoothed expression with confidence', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/does not determine or diagnose/)).toBeVisible();

    await startCamera(page);

    await expect(page.getByTestId('face-box').first()).toBeVisible({ timeout: 60_000 });
    await expect(expressionTitle(page)).not.toHaveText(/Detecting|Loading|Waiting/, {
      timeout: 60_000,
    });
    await expect(page.getByText(/^Confidence:/)).toBeVisible();
  });

  test('multi-face mode labels several faces and the Web Worker reports performance', async ({
    page,
  }) => {
    await useDetectorSettings(page, {
      inputSize: 416,
      inferencesPerSecond: 10,
      multiFace: true,
      useWorker: true,
      showPerformance: true,
    });
    await page.goto('/');
    await startCamera(page);

    await expect
      .poll(() => page.getByTestId('face-box').count(), { timeout: 60_000 })
      .toBeGreaterThan(1);
    await expect(page.getByLabel(/^Performance:.*Web Worker/)).toBeVisible();
  });

  test('stopping the camera releases it and shows the session summary', async ({ page }) => {
    await page.goto('/');
    await startCamera(page);
    await expect(page.getByTestId('face-box').first()).toBeVisible({ timeout: 60_000 });
    // Sessions shorter than 3 s are not summarised.
    await page.waitForTimeout(3500);

    await page.getByRole('button', { name: 'Stop camera' }).click();

    await expect(page.getByText('Camera on', { exact: true })).toBeHidden();
    const dialog = page.getByRole('dialog', { name: 'Session summary' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('stays on your device');
  });
});
