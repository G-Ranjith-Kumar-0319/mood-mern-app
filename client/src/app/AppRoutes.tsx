import { Route, Routes } from 'react-router';
import { AppLayout } from '../components/Layout/AppLayout';
import { AccountPage } from '../pages/Account/AccountPage';
import { AuthPage } from '../pages/Auth/AuthPage';
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '../pages/Auth/EmailLinkPages';
import { DashboardPage } from '../pages/Dashboard/DashboardPage';
import { HistoryPage } from '../pages/History/HistoryPage';
import { HomePage } from '../pages/Home/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PhoneCameraPage } from '../pages/PhoneCamera/PhoneCameraPage';

/** Kept separate from <App> so tests can render routes inside a MemoryRouter. */
export function AppRoutes() {
  return (
    <Routes>
      {/* Opened on a phone from the QR code: no app chrome, no live-update stream. */}
      <Route path="camera/:sessionId" element={<PhoneCameraPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="login" element={<AuthPage key="login" mode="login" />} />
        <Route path="register" element={<AuthPage key="register" mode="register" />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
