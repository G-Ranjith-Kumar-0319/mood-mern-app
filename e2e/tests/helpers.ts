import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const SETTINGS_KEY = 'expression-detector:settings:v1';

/** Detector preferences are per-device (localStorage); set them before the app loads. */
export async function useDetectorSettings(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    SETTINGS_KEY,
    JSON.stringify(settings),
  ] as const);
}

export async function startCamera(page: Page) {
  await page.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByText('Camera on', { exact: true })).toBeVisible();
}

export const expressionTitle = (page: Page) => page.getByTestId('expression-title');

/** Saves an anonymous detection through the API (the same call the app makes). */
export async function saveDetection(
  request: APIRequestContext,
  expression: string,
  minutesAgo = 1,
) {
  const response = await request.post('/api/v1/expressions', {
    data: {
      expression,
      confidence: 0.9,
      detectedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      durationMs: 3000,
    },
  });
  expect(response.status()).toBe(201);
}
