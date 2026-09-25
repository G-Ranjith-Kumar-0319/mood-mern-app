import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../../test/renderWithProviders';
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from './EmailLinkPages';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

describe('VerifyEmailPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing until the user confirms (link scanners must not consume the token)', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(() => ({ body: { success: true, data: { verified: true } } }));
    renderWithProviders(<VerifyEmailPage />, { route: `/verify-email?token=${TOKEN}` });

    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Verify my email' }));

    expect(await screen.findByText(/your email address is verified/)).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ token: TOKEN });
  });

  it('explains an expired link', async () => {
    const user = userEvent.setup();
    mockFetch(() => ({
      status: 400,
      body: {
        success: false,
        error: { code: 'INVALID_LINK', message: 'This link is invalid or has expired' },
      },
    }));
    renderWithProviders(<VerifyEmailPage />, { route: `/verify-email?token=${TOKEN}` });
    await user.click(screen.getByRole('button', { name: 'Verify my email' }));
    expect(await screen.findByText('This link is invalid or has expired')).toBeInTheDocument();
  });

  it('handles a link without a token', () => {
    renderWithProviders(<VerifyEmailPage />, { route: '/verify-email' });
    expect(screen.getByText(/This link is incomplete/)).toBeInTheDocument();
  });
});

describe('ForgotPasswordPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the same confirmation regardless of whether the account exists', async () => {
    const user = userEvent.setup();
    mockFetch(() => ({ body: { success: true, data: { sent: true } } }));
    renderWithProviders(<ForgotPasswordPage />, { route: '/forgot-password' });

    await user.type(screen.getByLabelText(/Email/), 'someone@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(
      await screen.findByText(/If an account exists for someone@example.com/),
    ).toBeInTheDocument();
  });
});

describe('ResetPasswordPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the token with the new password', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(() => ({
      body: {
        success: true,
        data: {
          user: {
            id: '1',
            email: 'a@b.c',
            displayName: null,
            emailVerified: true,
            retentionDays: null,
          },
        },
      },
    }));
    renderWithProviders(<ResetPasswordPage />, { route: `/reset-password?token=${TOKEN}` });

    await user.type(screen.getByLabelText(/New password/), 'brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      token: TOKEN,
      password: 'brand-new-password',
    });
  });
});
