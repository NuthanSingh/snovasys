import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { APP_NAME } from '@balancevault/shared';
import { useAuth } from '../features/AuthContext.jsx';

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');

  async function handleLogout() {
    setLogoutError('');
    try {
      await logout();
      navigate('/', { replace: true });
    } catch (error) {
      setLogoutError(error.message);
    }
  }

  return (
    <div className="app-shell" id="top">
      <header className="site-header app-header">
        <Link className="brand" to="/" aria-label={`${APP_NAME} home`}>
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>{APP_NAME}</span>
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          {user ? (
            <>
              <Link to={user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard'}>Dashboard</Link>
              {user.role === 'ADMIN' && <Link to="/admin/onboarding">Review queue</Link>}
              <span className="nav-user">{user.fullName}</span>
              <button className="button button-quiet button-small" type="button" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link className="button button-small" to="/register">Create account</Link>
            </>
          )}
        </nav>
      </header>
      {logoutError && <p className="global-error" role="alert">{logoutError}</p>}
      <main className="page-main"><Outlet /></main>
      <footer className="site-footer app-footer">
        <span>BalanceVault · Snovasys Fresher Hiring Challenge 2026</span>
        <span>No banking integrations. No real funds.</span>
      </footer>
    </div>
  );
}