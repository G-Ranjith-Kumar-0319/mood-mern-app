# 0015 — Camera source selection and front/rear switching

**Status:** accepted

## Context

The app opened one default camera. Desktop users with several webcams (integrated, USB, virtual)
could not choose one, and phone users could not use the rear camera. The browser APIs have traps:

- `enumerateDevices()` hides labels (and in Firefox/Safari, device ids) until permission is granted.
- Many phones cannot open two cameras at once, so the old stream must be stopped first.
- Phone labels are localised or vague ("camera2 0, facing back"); `facingMode` is more reliable.
- A remembered `deviceId` may belong to an unplugged camera.

## Decision

- **Layers:** `types/camera.ts` → `utils/camera.utils.ts` (pure: normalise, label fallback
  "Camera N", facing-mode inference, default choice, next camera, mobile detection) →
  `services/camera.service.ts` (stateless MediaDevices wrapper) → `hooks/useCamera.ts` (the only
  stateful part) → `components/Camera/*`. No new dependencies.
- **Permission without a throwaway stream.** The first _Start camera_ opens the real camera
  (`facingMode: { ideal: "user" }`), then enumerates. A temporary stream just to read labels would
  open the camera twice. Cameras already permitted are listed on page load.
- **One stream at most.** Every start/switch stops the current tracks _before_ requesting the next.
  A request id discards results that arrive after Stop, another switch, or unmount.
- **Switching.** Phones: `facingMode: { exact: <opposite> }`, falling back to the next listed device
  on `OverconstrainedError`/`NotFoundError`. Desktop: the next device by `deviceId`. The camera
  actually opened is read back from `track.getSettings()`.
- **UI.** Desktop shows a _Camera source_ dropdown; phones show _Switch camera_ instead (a dropdown
  of "camera2 0 / camera2 1" is not useful there). Only the front camera is mirrored.
- **Detection during a switch.** Status `switching` stops the inference loop, which drops the old
  camera's tracked faces and confidence; the UI shows _Switching camera…_. When the new stream is
  active, the loop restarts and waits until the video has frames. The session summary and auto-save
  treat a switch as the same session.
- **Plug/unplug.** A `devicechange` listener re-enumerates, keeps the selection if it still exists,
  otherwise picks a default; if the _active_ camera disappears (or its track ends) the stream is
  released and "The camera was disconnected" is shown with another camera pre-selected.

## Consequences

- Covered by unit tests with a mocked `navigator.mediaDevices` (no physical camera needed):
  selection, switching, fallbacks, stale requests, device removal and cleanup.
- Mobile detection is a heuristic (UA Client Hints, UA string, iPadOS touch check). It only chooses
  the default camera and dropdown-vs-button, so a wrong guess degrades the UI, not the function.
- Facing-mode inference from labels covers common English labels only; unknown cameras are shown
  mirrored, like a webcam.
- Real-device behaviour (particular phones, Safari/Firefox device ids) must be checked manually;
  Playwright's fake camera exposes a single device.
