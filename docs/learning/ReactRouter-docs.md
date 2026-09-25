# React Router — learning guide for this project

React Router (v8, imported from `react-router`) maps URLs to pages without full
page reloads. The app is a single-page application: Nginx (or Vite) always serves
`index.html`, and React Router decides what to show.

---

## Components and hooks used

| API                                            | What it does                                                                   | Where                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `<BrowserRouter>`                              | Keeps the UI in sync with the real address bar (History API)                   | [app/App.tsx](../../client/src/app/App.tsx)                                                        |
| `<MemoryRouter initialEntries={[route]}>`      | Router that keeps the URL in memory. Used in tests, which have no address bar. | [test/renderWithProviders.tsx](../../client/src/test/renderWithProviders.tsx)                      |
| `<Routes>` / `<Route path element>`            | The route table                                                                | [app/AppRoutes.tsx](../../client/src/app/AppRoutes.tsx)                                            |
| Layout route `<Route element={<AppLayout />}>` | Wraps every page in the same header/navigation                                 | AppRoutes                                                                                          |
| `<Route index>`                                | The page for the parent path (`/`)                                             | AppRoutes                                                                                          |
| `<Route path="*">`                             | Catch-all: the 404 page                                                        | AppRoutes                                                                                          |
| `<Outlet />`                                   | Where the child route renders inside the layout                                | [components/Layout/AppLayout.tsx](../../client/src/components/Layout/AppLayout.tsx)                |
| `<NavLink end>`                                | A link that knows whether it is active (adds the `active` class)               | AppLayout nav                                                                                      |
| `<Link to>`                                    | Client-side navigation link                                                    | RecentDetections, UserMenu, auth pages                                                             |
| `<Navigate to replace>`                        | Redirect while rendering                                                       | [AccountPage](../../client/src/pages/Account/AccountPage.tsx) sends anonymous visitors to `/login` |
| `useNavigate()`                                | Navigate from code (after an action)                                           | AuthPage (after login), AccountPage (after delete), ResetPasswordPage                              |
| `useSearchParams()`                            | Read query-string values                                                       | [EmailLinkPages](../../client/src/pages/Auth/EmailLinkPages.tsx) reads `?token=`                   |

## Route table

```text
/                → HomePage (detector)
/history         → HistoryPage
/dashboard       → DashboardPage
/account         → AccountPage (signed-in only)
/login /register → AuthPage (key="login" / key="register")
/verify-email    → VerifyEmailPage   (?token=… from the email)
/forgot-password → ForgotPasswordPage
/reset-password  → ResetPasswordPage (?token=…)
*                → NotFoundPage
```

## Patterns worth copying

- **MUI + router links:** `<Button component={Link} to="/history">` renders an MUI
  button that navigates like a router link.
- **Route keys:** both `/login` and `/register` render `<AuthPage>`. Without
  different `key`s React would reuse the same component instance and keep the typed
  email and old error messages when switching. With keys, each route gets a fresh form.
- **Why `AppRoutes` is separate from `App`:** tests render `AppRoutes` (or single
  pages) inside a `MemoryRouter`, while the real app uses `BrowserRouter`.
- **Server-side support:** Nginx's `try_files $uri /index.html` returns the app for
  unknown paths, so refreshing `/dashboard` works (see [Nginx-docs.md](Nginx-docs.md)).

## Exercises

1. Add a `/about` page and a nav link. Check the active style with `NavLink`.
2. Make the login page redirect back to the page the user came from (hint:
   `<Navigate to="/login" state={{ from: location }} />` plus `useLocation`).
