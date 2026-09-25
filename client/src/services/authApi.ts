import type { User } from '../types/api';
import { apiRequest } from './apiClient';

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  displayName?: string;
}

/** Tokens are HttpOnly cookies managed by the browser; this code never sees them. */
export const authApi = {
  async me(signal?: AbortSignal): Promise<User | null> {
    const response = await apiRequest<{ user: User | null }>('/auth/me', { signal });
    return response.data.user;
  },

  async login(credentials: Credentials): Promise<User> {
    const response = await apiRequest<{ user: User }>('/auth/login', {
      method: 'POST',
      body: credentials,
      skipRefresh: true,
    });
    return response.data.user;
  },

  async register(registration: Registration): Promise<User> {
    const response = await apiRequest<{ user: User }>('/auth/register', {
      method: 'POST',
      body: registration,
      skipRefresh: true,
    });
    return response.data.user;
  },

  async logout(): Promise<void> {
    await apiRequest<{ loggedOut: boolean }>('/auth/logout', { method: 'POST', skipRefresh: true });
  },
};
