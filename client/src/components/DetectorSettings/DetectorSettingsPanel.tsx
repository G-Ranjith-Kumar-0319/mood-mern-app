import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import {
  INPUT_SIZE_OPTIONS,
  RATE_OPTIONS,
  type DetectorSettings,
} from '../../hooks/useDetectorSettings';

interface DetectorSettingsPanelProps {
  settings: DetectorSettings;
  onChange: (changes: Partial<DetectorSettings>) => void;
  onReset: () => void;
  workerSupported: boolean;
}

/** Speed/accuracy trade-offs the user can tune; saved on this device. */
export function DetectorSettingsPanel({
  settings,
  onChange,
  onReset,
  workerSupported,
}: DetectorSettingsPanelProps) {
  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="detector-settings">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TuneIcon fontSize="small" aria-hidden />
          <Typography>Detection settings</Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails id="detector-settings">
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="input-size-label">Model accuracy</InputLabel>
              <Select
                labelId="input-size-label"
                label="Model accuracy"
                value={settings.inputSize}
                onChange={(event) => onChange({ inputSize: Number(event.target.value) })}
              >
                {INPUT_SIZE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>Higher finds smaller faces but uses more CPU/GPU.</FormHelperText>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="rate-label">Analyses per second</InputLabel>
              <Select
                labelId="rate-label"
                label="Analyses per second"
                value={settings.inferencesPerSecond}
                onChange={(event) => onChange({ inferencesPerSecond: Number(event.target.value) })}
              >
                {RATE_OPTIONS.map((rate) => (
                  <MenuItem key={rate} value={rate}>
                    {rate} per second
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>A target: slower devices run fewer automatically.</FormHelperText>
            </FormControl>
          </Stack>

          <Stack spacing={0.5}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.multiFace}
                  onChange={(event) => onChange({ multiFace: event.target.checked })}
                />
              }
              label="Detect multiple faces"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.useWorker && workerSupported}
                  disabled={!workerSupported}
                  onChange={(event) => onChange({ useWorker: event.target.checked })}
                />
              }
              label={
                workerSupported
                  ? 'Run AI in a background thread (Web Worker)'
                  : 'Background thread not supported by this browser'
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.showPerformance}
                  onChange={(event) => onChange({ showPerformance: event.target.checked })}
                />
              }
              label="Show performance (analyses/s and model time)"
            />
          </Stack>

          <Button size="small" onClick={onReset} sx={{ alignSelf: 'flex-start' }}>
            Reset to defaults
          </Button>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
