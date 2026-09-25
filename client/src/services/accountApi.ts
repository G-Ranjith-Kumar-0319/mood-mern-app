import type { RetentionDays, User } from '../types/api';
import { API_BASE_URL, apiRequest } from './apiClient';

/** A plain link: the browser downloads the file with its auth cookie (same origin). */
export const EXPORT_URL = `${API_BASE_URL}/account/export`;

export const accountApi = {
  async updateSettings(settings: { retentionDays: RetentionDays }): Promise<User> {
    const response = await apiRequest<{ user: User }>('/account/settings', {
      method: 'PATCH',
      body: settings,
    });
    return response.data.user;
  },

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<User> {
    const response = await apiRequest<{ user: User }>('/account/password', {
      method: 'POST',
      body: input,
    });
    return response.data.user;
  },

  async deleteAccount(password: string): Promise<{ deletedDetections: number }> {
    const response = await apiRequest<{ deletedDetections: number }>('/account', {
      method: 'DELETE',
      body: { password },
    });
    return response.data;
  },

  async requestEmailVerification(): Promise<void> {
    await apiRequest('/auth/verify-email/request', { method: 'POST' });
  },

  async verifyEmail(token: string): Promise<void> {
    await apiRequest('/auth/verify-email', { method: 'POST', body: { token }, skipRefresh: true });
  },

  async requestPasswordReset(email: string): Promise<void> {
    await apiRequest('/auth/password-reset/request', {
      method: 'POST',
      body: { email },
      skipRefresh: true,
    });
  },

  async resetPassword(token: string, password: string): Promise<User> {
    const response = await apiRequest<{ user: User }>('/auth/password-reset', {
      method: 'POST',
      body: { token, password },
      skipRefresh: true,
    });
    return response.data.user;
  },
};
