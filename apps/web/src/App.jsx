import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import UserLayout from './components/UserLayout.jsx';
import AccountDetailPage from './pages/AccountDetailPage.jsx';
import AccountsPage from './pages/AccountsPage.jsx';
import AdminAccountsPage from './pages/AdminAccountsPage.jsx';
import AdminAccountDetailPage from './pages/AdminAccountDetailPage.jsx';
import AdminAuditLogsPage from './pages/AdminAuditLogsPage.jsx';
import AdminTransactionsPage from './pages/AdminTransactionsPage.jsx';
import AdminOnboardingDetailPage from './pages/AdminOnboardingDetailPage.jsx';
import AdminOnboardingPage from './pages/AdminOnboardingPage.jsx';
import AdminDashboardPage from './pages/AdminDashboardPage.jsx';
import AdminUserDetailPage from './pages/AdminUserDetailPage.jsx';
import AdminUsersPage from './pages/AdminUsersPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import UserDashboardPage from './pages/UserDashboardPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import OnboardingRequestPage from './pages/OnboardingRequestPage.jsx';
import OnboardingStatusPage from './pages/OnboardingStatusPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<UserLayout />}>
            <Route path="dashboard" element={<UserDashboardPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="accounts/:accountId" element={<AccountDetailPage />} />
            <Route path="onboarding/new" element={<OnboardingPage />} />
            <Route path="onboarding" element={<OnboardingStatusPage />} />
            <Route path="onboarding/status" element={<OnboardingStatusPage />} />
            <Route path="onboarding/requests/:requestId" element={<OnboardingRequestPage />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute roles={['ADMIN']} />}>
          <Route element={<AdminLayout />}>
            <Route path="admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
            <Route path="admin/users/:userId" element={<AdminUserDetailPage />} />
            <Route path="admin/accounts" element={<AdminAccountsPage />} />
            <Route path="admin/accounts/:accountId" element={<AdminAccountDetailPage />} />
            <Route path="admin/transactions" element={<AdminTransactionsPage />} />
            <Route path="admin/onboarding" element={<AdminOnboardingPage />} />
            <Route path="admin/onboarding/:requestId" element={<AdminOnboardingDetailPage />} />
            <Route path="admin/audit-logs" element={<AdminAuditLogsPage />} />
            <Route path="admin/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}