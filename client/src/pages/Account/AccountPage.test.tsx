import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/renderWithProviders';
import type { User } from '../../types/api';
import { AccountPage } from './AccountPage';

const USER: User = {
  id: 'u1',
  email: 'ada@example.com',
  displayName: 'Ada',
  emailVerified: false,
  retentionDays: null,
};

function mockAccountApi(user: User | null = USER) {
  return mockFetch((url, init) => {
    if (url.pathname === '/api/v1/auth/me') return { body: { success: true, data: { user } } };
    if (url.pathname === '/api/v1/account/settings') {
      const body = JSON.parse(String(init?.body)) as { retentionDays: number | null };
      return { body: { success: true, data: { user: { ...USER, ...body } } } };
    }
    if (url.pathname === '/api/v1/account' && init?.method === 'DELETE') {
      const { password } = JSON.parse(String(init.body)) as { password: string };
      return password === 'right-password'
        ? { body: { success: true, data: { deleted: true, deletedDetections: 3 } } }
        : {
            status: 401,
            body: {
              success: false,
              error: { code: 'INVALID_CREDENTIALS', message: 'Password is incorrect' },
            },
          };
    }
    return { body: { success: true, data: { sent: true } } };
  });
}

describe('AccountPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the profile with verification status and offers a re-send', async () => {
    const user = userEvent.setup();
    const fetchMock = mockAccountApi();
    renderWithProviders(<AccountPage />, { route: '/account' });

    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Not verified')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Re-send verification email' }));
    expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/verify-email/request', expect.anything());
  });

  it('links the export download to the API', async () => {
    mockAccountApi();
    renderWithProviders(<AccountPage />, { route: '/account' });
    const link = await screen.findByRole('link', { name: 'Download my data' });
    expect(link).toHaveAttribute('href', '/api/v1/account/export');
  });

  it('changes the retention period', async () => {
    const user = userEvent.setup();
    const fetchMock = mockAccountApi();
    renderWithProviders(<AccountPage />, { route: '/account' });

    await user.click(await screen.findByRole('combobox', { name: 'Delete my detections after' }));
    await user.click(await screen.findByRole('option', { name: '30 days' }));

    expect(await screen.findByText('Retention updated.')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(
      ([input]) => String(input) === '/api/v1/account/settings',
    );
    expect(call?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ retentionDays: 30 }),
    });
  });

  it('asks for the password before deleting the account', async () => {
    const user = userEvent.setup();
    mockAccountApi();
    renderWithProviders(<AccountPage />, { route: '/account' });

    await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Password/), 'wrong');
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));

    expect(await within(dialog).findByText('Password is incorrect')).toBeInTheDocument();
  });

  it('redirects anonymous visitors to sign in', async () => {
    mockAccountApi(null);
    renderWithProviders(<AccountPage />, { route: '/account' });
    await vi.waitFor(() => expect(screen.queryByText('Your account')).not.toBeInTheDocument());
  });
});
