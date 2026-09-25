import {
  Box,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useId, useRef, useState } from 'react';
import { seriesColorVar } from '../../constants/chartColors';
import { SUPPORTED_EXPRESSIONS } from '../../constants/expressions';
import { useElementWidth } from '../../hooks/useElementWidth';
import type { ExpressionTrends, TrendPoint } from '../../types/api';
import { countScale, formatPeriod, labelStride } from '../../utils/chartScale';
import { getExpressionLabel } from '../../utils/expressionDisplay';

interface TrendChartProps {
  trends: ExpressionTrends;
}

const HEIGHT = 240;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 36 };
const MAX_BAR_WIDTH = 36;
/** Surface-coloured gap between stacked segments. */
const SEGMENT_GAP = 2;
const CORNER_RADIUS = 4;

// Chart ink follows the MUI theme (light/dark) through its CSS variables.
const INK = {
  muted: 'var(--mui-palette-text-secondary)',
  grid: 'var(--mui-palette-divider)',
  surface: 'var(--mui-palette-background-paper)',
};

function Legend() {
  return (
    <Stack
      component="ul"
      direction="row"
      useFlexGap
      spacing={2}
      sx={{ flexWrap: 'wrap', listStyle: 'none', p: 0, m: 0 }}
      aria-label="Legend"
    >
      {SUPPORTED_EXPRESSIONS.map((expression) => (
        <Stack
          component="li"
          key={expression}
          direction="row"
          spacing={0.75}
          sx={{ alignItems: 'center' }}
        >
          <Box
            aria-hidden
            sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: seriesColorVar(expression) }}
          />
          <Typography variant="caption" color="text.secondary">
            {getExpressionLabel(expression)}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function describePoint(point: TrendPoint, trends: ExpressionTrends): string {
  const label = formatPeriod(point.period, trends.groupBy, trends.timezone, { long: true });
  const parts = SUPPORTED_EXPRESSIONS.filter((e) => point.counts[e] > 0).map(
    (e) => `${getExpressionLabel(e)} ${point.counts[e]}`,
  );
  return `${label}: ${point.total} detection${point.total === 1 ? '' : 's'}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

function TrendTable({ trends }: TrendChartProps) {
  return (
    <TableContainer sx={{ maxHeight: 360 }}>
      <Table size="small" stickyHeader aria-label="Detections over time">
        <TableHead>
          <TableRow>
            <TableCell>Period</TableCell>
            {SUPPORTED_EXPRESSIONS.map((e) => (
              <TableCell key={e} align="right">
                {getExpressionLabel(e)}
              </TableCell>
            ))}
            <TableCell align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {trends.series.map((point) => (
            <TableRow key={point.period}>
              <TableCell>
                {formatPeriod(point.period, trends.groupBy, trends.timezone, { long: true })}
              </TableCell>
              {SUPPORTED_EXPRESSIONS.map((e) => (
                <TableCell key={e} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {point.counts[e]}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {point.total}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * Stacked bars over time: each bar is one period, each segment one expression.
 * Hover or keyboard-focus a bar for its breakdown; a table view is one switch away.
 */
export function TrendChart({ trends }: TrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const clipPrefix = useId();
  const [showTable, setShowTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  const { series } = trends;
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const { max: yMax, ticks } = countScale(Math.max(0, ...series.map((point) => point.total)));
  const band = series.length > 0 ? plotWidth / series.length : plotWidth;
  const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, band * 0.7));
  const stride = labelStride(series.length, plotWidth);
  const y = (value: number) => MARGIN.top + plotHeight - (value / yMax) * plotHeight;
  const activePoint = active === null ? null : series[active];

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Legend />
        <FormControlLabel
          control={<Switch checked={showTable} onChange={(e) => setShowTable(e.target.checked)} />}
          label="Show as table"
        />
      </Stack>

      {/* The measured container stays mounted so its width is known when switching back. */}
      <Box ref={containerRef} sx={{ position: 'relative', width: '100%' }}>
        {showTable ? (
          <TrendTable trends={trends} />
        ) : (
          <>
            <svg
              width={width}
              height={HEIGHT}
              role="group"
              aria-label="Detections over time, stacked by expression"
              style={{ display: 'block', overflow: 'visible' }}
            >
              {/* Recessive horizontal grid + y-axis labels */}
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={MARGIN.left}
                    x2={MARGIN.left + plotWidth}
                    y1={y(tick)}
                    y2={y(tick)}
                    stroke={INK.grid}
                    strokeWidth={1}
                  />
                  <text
                    x={MARGIN.left - 6}
                    y={y(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill={INK.muted}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {tick}
                  </text>
                </g>
              ))}

              {series.map((point, index) => {
                const x = MARGIN.left + index * band + (band - barWidth) / 2;
                const top = y(point.total);
                const clipId = `${clipPrefix}-bar-${index}`;
                let cumulative = 0;
                return (
                  <g key={point.period}>
                    {point.total > 0 && (
                      <>
                        {/* Rounds only the top (data end); the bottom is hidden below the baseline. */}
                        <clipPath id={clipId}>
                          <rect
                            x={x}
                            y={top}
                            width={barWidth}
                            height={y(0) - top + CORNER_RADIUS}
                            rx={Math.min(CORNER_RADIUS, barWidth / 2)}
                          />
                        </clipPath>
                        <g
                          clipPath={`url(#${clipId})`}
                          opacity={active === null || active === index ? 1 : 0.55}
                        >
                          {SUPPORTED_EXPRESSIONS.map((expression) => {
                            const count = point.counts[expression];
                            if (count === 0) return null;
                            const segmentBottom = y(cumulative);
                            cumulative += count;
                            const segmentTop = y(cumulative);
                            const gap = cumulative < point.total ? SEGMENT_GAP : 0;
                            return (
                              <rect
                                key={expression}
                                x={x}
                                y={segmentTop + gap}
                                width={barWidth}
                                height={Math.max(0, segmentBottom - segmentTop - gap)}
                                fill={seriesColorVar(expression)}
                              />
                            );
                          })}
                        </g>
                      </>
                    )}
                    {index % stride === 0 && (
                      <text
                        x={x + barWidth / 2}
                        y={HEIGHT - 8}
                        textAnchor="middle"
                        fontSize={11}
                        fill={INK.muted}
                      >
                        {formatPeriod(point.period, trends.groupBy, trends.timezone)}
                      </text>
                    )}
                    {/* Hit target: the whole column, larger than the bar itself. */}
                    <rect
                      x={MARGIN.left + index * band}
                      y={MARGIN.top}
                      width={band}
                      height={plotHeight}
                      fill="transparent"
                      tabIndex={0}
                      role="img"
                      aria-label={describePoint(point, trends)}
                      onMouseEnter={() => setActive(index)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(index)}
                      onBlur={() => setActive(null)}
                      style={{ outline: 'none', cursor: 'default' }}
                    />
                  </g>
                );
              })}

              {/* Baseline */}
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(0)}
                y2={y(0)}
                stroke={INK.muted}
                strokeWidth={1}
              />
            </svg>

            {activePoint && active !== null && (
              <Box
                role="tooltip"
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: Math.min(
                    Math.max(0, MARGIN.left + active * band + band / 2 - 90),
                    Math.max(0, width - 180),
                  ),
                  width: 180,
                  p: 1.25,
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  boxShadow: 3,
                  pointerEvents: 'none',
                }}
              >
                <Typography variant="caption" component="p" sx={{ fontWeight: 600 }}>
                  {formatPeriod(activePoint.period, trends.groupBy, trends.timezone, {
                    long: true,
                  })}
                </Typography>
                <Typography variant="caption" component="p" color="text.secondary" gutterBottom>
                  {activePoint.total} detection{activePoint.total === 1 ? '' : 's'}
                </Typography>
                {SUPPORTED_EXPRESSIONS.filter((e) => activePoint.counts[e] > 0)
                  .reverse() // top-of-stack first, matching the visual order
                  .map((e) => (
                    <Stack key={e} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '2px',
                          bgcolor: seriesColorVar(e),
                        }}
                      />
                      <Typography variant="caption" sx={{ flexGrow: 1 }}>
                        {getExpressionLabel(e)}
                      </Typography>
                      <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {activePoint.counts[e]}
                      </Typography>
                    </Stack>
                  ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </Stack>
  );
}
