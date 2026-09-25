import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import { CameraView } from '../../components/Camera/CameraView';
import { DetectorSettingsPanel } from '../../components/DetectorSettings/DetectorSettingsPanel';
import { PerformanceReadout } from '../../components/DetectorSettings/PerformanceReadout';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { ExpressionResult } from '../../components/ExpressionResult/ExpressionResult';
import { FaceOverlay } from '../../components/FaceOverlay/FaceOverlay';
import { RecentDetections } from '../../components/History/RecentDetections';
import { SaveControls } from '../../components/History/SaveControls';
import { PrivacyNotice } from '../../components/PrivacyNotice/PrivacyNotice';
import { SessionSummaryDialog } from '../../components/SessionSummary/SessionSummaryDialog';
import { useCurrentUser } from '../../hooks/useAuth';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useCamera, type CameraStatus } from '../../hooks/useCamera';
import { useDetectorSettings } from '../../hooks/useDetectorSettings';
import { useExpressionDetection } from '../../hooks/useExpressionDetection';
import { useSaveDetection } from '../../hooks/useExpressionHistory';
import { useSessionSummary } from '../../hooks/useSessionSummary';
import { isWorkerDetectionSupported } from '../../services/workerExpressionDetector';
import { getDetectorViewState, type DetectorViewState } from '../../utils/detectorViewState';

const CAMERA_STATUS_LABEL: Record<CameraStatus, string> = {
  off: 'Off',
  requesting: 'Requesting permission',
  active: 'On',
  error: 'Error',
};

export function HomePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera();
  const detectorSettings = useDetectorSettings();
  const { settings } = detectorSettings;
  const detection = useExpressionDetection({
    videoRef,
    // Download the model while the permission prompt is open, to save time.
    loadModel: camera.status === 'requesting' || camera.status === 'active',
    running: camera.status === 'active',
    settings,
  });

  const viewState = getDetectorViewState({
    cameraStatus: camera.status,
    cameraError: camera.error,
    modelStatus: detection.modelStatus,
    modelError: detection.modelError,
    inferenceError: detection.inferenceError,
    faceDetected: detection.faceDetected,
    expression: detection.expression,
  });

  // Only confident, stable expressions are ever persisted.
  const confidentExpression = viewState.kind === 'detected' ? viewState.expression : null;
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const autoSave = useAutoSave({
    enabled: autoSaveEnabled && camera.status === 'active',
    current: confidentExpression,
  });
  const session = useSessionSummary(
    camera.status === 'active',
    confidentExpression?.expression ?? null,
  );
  const saveNow = useSaveDetection();
  const { data: currentUser } = useCurrentUser();
  const [manualSaveCount, setManualSaveCount] = useState(0);

  const handleSaveNow = () => {
    if (!confidentExpression) return;
    saveNow.mutate(
      {
        expression: confidentExpression.expression,
        confidence: confidentExpression.confidence,
        detectedAt: new Date().toISOString(),
      },
      { onSuccess: () => setManualSaveCount((count) => count + 1) },
    );
  };

  const isCameraBusy = camera.status === 'requesting' || camera.status === 'active';

  const restartCamera = () => {
    camera.stop();
    void camera.start();
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          AI Facial Expression Detector
        </Typography>
        <PrivacyNotice />
      </Box>

      <DetectorError
        state={viewState}
        onRetryCamera={() => void camera.start()}
        onRetryModel={detection.retryModel}
        onRestartCamera={restartCamera}
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: 'stretch' }}>
        <Stack spacing={2} sx={{ flex: 3, minWidth: 0 }}>
          <CameraView
            stream={camera.stream}
            videoRef={videoRef}
            overlay={
              <>
                <FaceOverlay
                  faces={detection.faces}
                  sourceWidth={detection.sourceWidth}
                  sourceHeight={detection.sourceHeight}
                  showLabels={settings.multiFace}
                />
                {settings.showPerformance && (
                  <PerformanceReadout
                    stats={detection.performance}
                    backend={detection.backend}
                    tfBackend={detection.tfBackend}
                  />
                )}
              </>
            }
          />
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={() => void camera.start()}
              disabled={isCameraBusy}
            >
              Start camera
            </Button>
            <Button
              variant="outlined"
              startIcon={<StopIcon />}
              onClick={camera.stop}
              disabled={!isCameraBusy}
            >
              Stop camera
            </Button>
            <Typography variant="body2" color="text.secondary" role="status">
              Camera status: <strong>{CAMERA_STATUS_LABEL[camera.status]}</strong>
            </Typography>
          </Stack>
          <DetectorSettingsPanel
            settings={settings}
            onChange={detectorSettings.update}
            onReset={detectorSettings.reset}
            workerSupported={isWorkerDetectionSupported()}
          />
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            flex: 2,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            justifyContent: 'center',
          }}
        >
          <ExpressionResult state={viewState} />
          <SaveControls
            autoSave={autoSaveEnabled}
            onAutoSaveChange={setAutoSaveEnabled}
            canSaveNow={confidentExpression !== null}
            onSaveNow={handleSaveNow}
            isSaving={saveNow.isPending}
            savedCount={autoSave.savedCount + manualSaveCount}
            error={saveNow.error ?? autoSave.lastError}
            isSignedIn={Boolean(currentUser)}
          />
        </Paper>
      </Stack>

      <RecentDetections />
      <SessionSummaryDialog summary={session.summary} onClose={session.dismiss} />
    </Stack>
  );
}

interface DetectorErrorProps {
  state: DetectorViewState;
  onRetryCamera: () => void;
  onRetryModel: () => void;
  onRestartCamera: () => void;
}

function DetectorError({
  state,
  onRetryCamera,
  onRetryModel,
  onRestartCamera,
}: DetectorErrorProps) {
  switch (state.kind) {
    case 'camera-error':
      return (
        <ErrorState
          title={
            state.error.code === 'CAMERA_PERMISSION_DENIED'
              ? 'Camera permission needed'
              : 'Camera unavailable'
          }
          message={state.error.message}
          actionLabel={state.error.code === 'CAMERA_NOT_SUPPORTED' ? undefined : 'Try again'}
          onAction={onRetryCamera}
        />
      );
    case 'model-error':
      return (
        <ErrorState
          title="AI model failed to load"
          message={state.error.message}
          actionLabel="Retry"
          onAction={onRetryModel}
        />
      );
    case 'inference-error':
      return (
        <ErrorState
          title="Detection stopped"
          message={state.error.message}
          actionLabel="Restart camera"
          onAction={onRestartCamera}
        />
      );
    default:
      return null;
  }
}
