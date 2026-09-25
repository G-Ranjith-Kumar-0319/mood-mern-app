import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/renderWithProviders';
import { AuthPage } from './AuthPage';

describe('AuthPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the server error for invalid credentials', async () => {
    const user = userEvent.setup();
    mockFetch(() => ({
      status: 401,
      body: {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      },
    }));
    renderWithProviders(<AuthPage mode="login" />, { route: '/login' });

    await user.type(screen.getByLabelText(/Email/), 'ada@example.com');
    await user.type(screen.getByLabelText(/Password/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('registers and sends the expected payload', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(() => ({
      status: 201,
      body: {
        success: true,
        data: { user: { id: '1', email: 'ada@example.com', displayName: 'Ada' } },
      },
    }));
    const { queryClient } = renderWithProviders(<AuthPage mode="register" />, {
      route: '/register',
    });

    await user.type(screen.getByLabelText(/Display name/), 'Ada');
    await user.type(screen.getByLabelText(/Email/), 'ada@example.com');
    await user.type(screen.getByLabelText(/Password/), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await vi.waitFor(() => expect(queryClient.getQueryData(['auth', 'me'])).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/register');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'ada@example.com',
      password: 'a-strong-password',
      displayName: 'Ada',
    });
  });
});
