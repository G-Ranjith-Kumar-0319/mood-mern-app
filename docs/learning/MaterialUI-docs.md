# Material UI (MUI) — learning guide for this project

MUI 9 provides accessible, themeable React components. The project uses it for
layout, forms, feedback and data display. The only hand-drawn visuals are the SVG
charts and the face overlay.

---

## Theme and global styling

| API                                                                              | Where                                           | Why                                                                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `createTheme({ cssVariables: true, colorSchemes: { light: true, dark: true } })` | [app/theme.ts](../../client/src/app/theme.ts)   | Follows the OS light/dark preference; exposes colours as CSS variables (`var(--mui-palette-divider)`), which the SVG charts use    |
| `<ThemeProvider theme>`                                                          | [app/App.tsx](../../client/src/app/App.tsx)     | Makes the theme available to all components                                                                                        |
| `<CssBaseline />`                                                                | App.tsx                                         | Consistent base styles and correct dark-mode background                                                                            |
| `<GlobalStyles styles>`                                                          | App.tsx                                         | Injects the chart colour variables (`--series-happy` …) from [constants/chartColors.ts](../../client/src/constants/chartColors.ts) |
| `SxProps<Theme>` type                                                            | [utils/a11y.ts](../../client/src/utils/a11y.ts) | A reusable "visually hidden" style                                                                                                 |

## The `sx` prop

Almost every component is styled with `sx={{ … }}`, a theme-aware style object:

- spacing units: `p: 3` = 3 × 8px; `mb: 1`
- theme colours by name: `bgcolor: 'success.main'`, `color: 'text.secondary'`
- **responsive values:** `direction={{ xs: 'column', md: 'row' }}`,
  `p: { xs: 2, sm: 3 }`. This is how the layout adapts to phones.
- nested selectors: `'&:hover, &:focus-visible': { bgcolor: 'action.hover' }`

## Components used (and where)

**Layout:** `Box` (the generic building block; `component="video"`/`"svg"`/`"li"`
changes the rendered element), `Stack` (flex row/column with `spacing`),
`Container` (page width), `Paper` (surfaces/cards), `AppBar` + `Toolbar` (header).

**Text:** `Typography` with `variant` (h4, h6, body2, caption, overline) and
`component` to keep correct HTML semantics (e.g. an `h4`-styled `<h1>`).

**Buttons & inputs:** `Button` (`variant`, `startIcon`, `loading`, `href` +
`download` for the export link, `component={Link}` for router links), `IconButton`,
`TextField` (with `slotProps.htmlInput` for native `minLength`/`maxLength`),
`Select` + `MenuItem` + `FormControl` + `InputLabel` + `FormHelperText`, `Switch` +
`FormControlLabel`, `ToggleButtonGroup` + `ToggleButton` (dashboard range).

**Feedback:** `Alert` + `AlertTitle` (errors, success, offline banner),
`CircularProgress`, `LinearProgress` (determinate: confidence and summary
shares), `Tooltip`, `Chip` (camera-on badge, verified status, performance readout),
`Dialog` + `DialogTitle/Content/ContentText/Actions` (delete account, session summary).

**Data display:** `Table`, `TableHead/Body/Row/Cell`, `TableContainer` (history,
chart table views), `Accordion` + `AccordionSummary` + `AccordionDetails` (detection
settings).

**Icons** (`@mui/icons-material`, imported one by one so only those are bundled):
PlayArrow, Stop, VideocamOffOutlined, Delete, SaveOutlined, Download, ExpandMore, Tune.

## Accessibility lessons from this project

- **`Alert` defaults to `role="alert"`**, which screen readers announce _immediately_.
  The static privacy notice was being announced as an urgent alert. A test caught it
  ("found multiple elements with role alert"), and the fix was `role="note"`. The
  offline banner uses `role="status"` (polite).
- Every icon-only button has an `aria-label` (e.g. "Delete Happy detection from …").
- Switches render as checkbox inputs with labels, so tests find them with
  `getByLabelText('Detect multiple faces')`.
- `LinearProgress` gets `aria-label` and exposes `aria-valuenow`.
- MUI 9 removed some icons: `DeleteOutline` no longer exists (a type error found it),
  so check icon names after upgrades.

## Exercises

1. Add a dark/light toggle button using MUI's `useColorScheme()` hook.
2. Replace the `Stack` layout on the home page with `Grid` and compare the responsive behaviour.
