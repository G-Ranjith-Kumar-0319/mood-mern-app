import type { Expression } from './expressions';

/**
 * Categorical colours for multi-series charts. Each expression keeps the same
 * colour everywhere (colour follows the entity, never its rank).
 *
 * Slots 1–7 of the validated reference palette, in fixed order. Validated with
 * the dataviz palette checker in both modes: adjacent CVD ΔE ≥ 8.4, normal-vision
 * ΔE ≥ 19.3. In light mode aqua/yellow/magenta are below 3:1 contrast on the
 * surface, so every chart using them also ships a legend, text labels and a
 * table view (the "relief rule").
 */
export const EXPRESSION_SERIES_COLORS: Record<Expression, { light: string; dark: string }> = {
  neutral: { light: '#2a78d6', dark: '#3987e5' }, // blue
  happy: { light: '#eb6834', dark: '#d95926' }, // orange
  sad: { light: '#1baf7a', dark: '#199e70' }, // aqua
  angry: { light: '#eda100', dark: '#c98500' }, // yellow
  fearful: { light: '#e87ba4', dark: '#d55181' }, // magenta
  disgusted: { light: '#008300', dark: '#008300' }, // green
  surprised: { light: '#4a3aa7', dark: '#9085e9' }, // violet
};

export const seriesColorVar = (expression: Expression) => `var(--series-${expression})`;

const toVars = (mode: 'light' | 'dark') =>
  Object.fromEntries(
    Object.entries(EXPRESSION_SERIES_COLORS).map(([expression, colors]) => [
      `--series-${expression}`,
      colors[mode],
    ]),
  );

/** Global CSS variables; the dark set follows the OS preference like the MUI theme does. */
export const chartColorStyles = {
  ':root': toVars('light'),
  '@media (prefers-color-scheme: dark)': { ':root': toVars('dark') },
};
