import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form);
      const defaultDestination = user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';
      navigate(location.state?.from ?? defaultDestination, { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="form-layout">
      <div className="form-intro">
        <p className="eyebrow">Welcome back</p>
        <h1>Log in to your account.</h1>
        <p>Access your private profile and onboarding history.</p>
      </div>
      <form className="form-panel" onSubmit={handleSubmit}>
        {error && <p className="form-alert" role="alert">{error}</p>}
        <label className="field-label" htmlFor="login-email">Email address</label>
        <input id="login-email" autoComplete="email" type="email" required maxLength={320} value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <label className="field-label" htmlFor="login-password">Password</label>
        <input id="login-password" autoComplete="current-password" type="password" required maxLength={72} value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <button className="button form-submit" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Log in'}
        </button>
        <p className="form-footnote">New to BalanceVault? <Link to="/register">Create an account</Link></p>
      </form>
    </section>
  );
}