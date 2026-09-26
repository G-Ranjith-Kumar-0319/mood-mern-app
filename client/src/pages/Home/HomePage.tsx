import { Box, Paper, Stack, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import { Camera } from '../../components/Camera/Camera';
import { CameraPermissionError } from '../../components/Camera/CameraPermissionError';
import {
  CameraSourceSelector,
  type CameraSourceType,
} from '../../components/CameraSourceSelector/CameraSourceSelector';
import { DetectorSettingsPanel } from '../../components/DetectorSettings/DetectorSettingsPanel';
import { PerformanceReadout } from '../../components/DetectorSettings/PerformanceReadout';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { ExpressionResult } from '../../components/ExpressionResult/ExpressionResult';
import { FaceOverlay } from '../../components/FaceOverlay/FaceOverlay';
import { PhoneCameraConnector } from '../../components/PhoneCameraConnector/PhoneCameraConnector';
import { RecentDetections } from '../../components/History/RecentDetections';
import { SaveControls } from '../../components/History/SaveControls';
import { PrivacyNotice } from '../../components/PrivacyNotice/PrivacyNotice';
import { SessionSummaryDialog } from '../../components/SessionSummary/SessionSummaryDialog';
import { useCurrentUser } from '../../hooks/useAuth';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useCamera } from '../../hooks/useCamera';
import { useDetectorSettings } from '../../hooks/useDetectorSettings';
import { useExpressionDetection } from '../../hooks/useExpressionDetection';
import { useSaveDetection } from '../../hooks/useExpressionHistory';
import { usePhoneCamera } from '../../hooks/usePhoneCamera';
import { useSessionSummary } from '../../hooks/useSessionSummary';
import { isWorkerDetectionSupported } from '../../services/workerExpressionDetector';
import { shouldMirror } from '../../utils/camera.utils';
import { isPhoneAboutToStream, phoneToCameraStatus } from '../../utils/cameraSource';
import { isWebRtcSupported } from '../../utils/peerStatus';
import { getDetectorViewState, type DetectorViewState } from '../../utils/detectorViewState';

export function HomePage() {
  // One <video> for every source: the detector only ever reads this element.
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera();
  const phone = usePhoneCamera();
  const [sourceType, setSourceType] = useState<CameraSourceType>('local');
  // A phone streaming to a phone makes no sense; the selector is a desktop feature.
  const canUsePhoneCamera = !camera.isMobile && isWebRtcSupported();

  const source =
    sourceType === 'phone'
      ? { status: phoneToCameraStatus(phone.status), error: phone.error, mirrored: false }
      : { status: camera.status, error: camera.error, mirrored: shouldMirror(camera.facingMode) };

  const detectorSettings = useDetectorSettings();
  const { settings } = detectorSettings;
  // A camera switch pauses detection but is still the same session (summary, auto-save).
  const isSessionActive = source.status === 'active' || source.status === 'switching';
  const detection = useExpressionDetection({
    videoRef,
    // Download the model while the permission prompt is open (or a phone is pairing).
    loadModel:
      source.status === 'requesting-permission' ||
      isSessionActive ||
      (sourceType === 'phone' && isPhoneAboutToStream(phone.status)),
    // Pausing on 'switching' drops the old camera's tracked faces and confidence.
    running: source.status === 'active',
    settings,
  });

  const viewState = getDetectorViewState({
    source: sourceType,
    cameraStatus: source.status,
    cameraError: source.error,
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
    enabled: autoSaveEnabled && isSessionActive,
    current: confidentExpression,
  });
  const session = useSessionSummary(isSessionActive, confidentExpression?.expression ?? null);
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

  const changeSource = (next: CameraSourceType) => {
    if (next === sourceType) return;
    // Never keep two sources open: the local camera light goes off / the phone link closes.
    if (next === 'phone') {
      camera.stopCamera();
      phone.start();
    } else {
      phone.stop();
    }
    setSourceType(next);
  };

  const retryCamera = () => {
    if (sourceType === 'phone') phone.regenerate();
    else void camera.startCamera();
  };

  const restartCamera = () => {
    if (sourceType === 'phone') {
      phone.regenerate();
      return;
    }
    camera.stopCamera();
    void camera.startCamera();
  };

  const overlay = (
    <>
      <FaceOverlay
        faces={detection.faces}
        sourceWidth={detection.sourceWidth}
        sourceHeight={detection.sourceHeight}
        showLabels={settings.multiFace}
        mirrored={source.mirrored}
      />
      {settings.showPerformance && (
        <PerformanceReadout
          stats={detection.performance}
          backend={detection.backend}
          tfBackend={detection.tfBackend}
        />
      )}
    </>
  );

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
        onRetryCamera={retryCamera}
        retryCameraLabel={sourceType === 'phone' ? 'New QR code' : 'Try again'}
        onRetryModel={detection.retryModel}
        onRestartCamera={restartCamera}
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: 'stretch' }}>
        <Stack spacing={2} sx={{ flex: 3, minWidth: 0 }}>
          {canUsePhoneCamera && <CameraSourceSelector value={sourceType} onChange={changeSource} />}
          {sourceType === 'phone' ? (
            <PhoneCameraConnector phone={phone} videoRef={videoRef} overlay={overlay} />
          ) : (
            <Camera camera={camera} videoRef={videoRef} overlay={overlay} />
          )}
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
  retryCameraLabel: string;
  onRetryModel: () => void;
  onRestartCamera: () => void;
}

function DetectorError({
  state,
  onRetryCamera,
  retryCameraLabel,
  onRetryModel,
  onRestartCamera,
}: DetectorErrorProps) {
  switch (state.kind) {
    case 'camera-error':
      return (
        <CameraPermissionError
          error={state.error}
          onRetry={onRetryCamera}
          retryLabel={retryCameraLabel}
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
