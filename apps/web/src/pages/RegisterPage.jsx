import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/AuthContext.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (new TextEncoder().encode(form.password).length > 72) {
      setError('Use a password no longer than 72 UTF-8 bytes.');
      return;
    }

    setSubmitting(true);
    try {
      await register({ fullName: form.fullName, email: form.email, password: form.password });
      navigate('/onboarding/new', { replace: true, state: { notice: 'Account created. Continue with your onboarding application.' } });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="form-layout">
      <div className="form-intro">
        <p className="eyebrow">Create your profile</p>
        <h1>Start with the essentials.</h1>
        <p>Your account is created with standard user access. Administrator access is never assigned through public registration.</p>
      </div>
      <form className="form-panel" onSubmit={handleSubmit}>
        {error && <p className="form-alert" role="alert">{error}</p>}
        <label className="field-label" htmlFor="register-name">Full name</label>
        <input id="register-name" autoComplete="name" required minLength={2} maxLength={120} value={form.fullName}
          onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
        <label className="field-label" htmlFor="register-email">Email address</label>
        <input id="register-email" autoComplete="email" type="email" required maxLength={320} value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <label className="field-label" htmlFor="register-password">Password</label>
        <input id="register-password" autoComplete="new-password" type="password" required minLength={12} maxLength={72} value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })} />
        <label className="field-label" htmlFor="register-confirm">Confirm password</label>
        <input id="register-confirm" autoComplete="new-password" type="password" required minLength={12} maxLength={72} value={form.confirmPassword}
          onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
        <p className="field-hint">Use at least 12 characters. Avoid entering real banking or identity data in this demonstration.</p>
        <button className="button form-submit" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
        <p className="form-footnote">Already registered? <Link to="/login">Log in</Link></p>
      </form>
    </section>
  );
}