import type { CameraSession } from '../types/remoteCamera';
import { apiRequest } from './apiClient';

export const cameraSessionApi = {
  /** A short-lived pairing session: the laptop keeps `hostToken`, the QR code carries the phone's. */
  async create(): Promise<CameraSession> {
    const response = await apiRequest<CameraSession>('/camera/sessions', { method: 'POST' });
    return response.data;
  },
};
