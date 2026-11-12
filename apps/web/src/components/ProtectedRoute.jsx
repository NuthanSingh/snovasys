import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/AuthContext.jsx';

export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="state-message" role="status">Checking your session…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (roles && !roles.includes(user.role)) {
    return (
      <section className="message-panel" role="alert">
        <p className="eyebrow">Access restricted</p>
        <h1>This area is for authorized administrators.</h1>
        <p>Your current role does not have permission to view this page.</p>
        <Link className="text-link" to="/onboarding">Return to your onboarding</Link>
      </section>
    );
  }

  return <Outlet />;
}