import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { onboardingApi } from '../lib/api.js';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ phoneNumber: '', addressLine: '', city: '', postalCode: '', countryCode: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onboardingApi.submit(form);
      navigate('/onboarding/status', { replace: true, state: { notice: 'Your application was submitted for review.' } });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="form-layout onboarding-layout">
      <div className="form-intro">
        <p className="eyebrow">Secure account onboarding</p>
        <h1>Tell us where to reach you.</h1>
        <p>Use synthetic demonstration details only. Do not enter government ID numbers, bank details, or other real financial credentials.</p>
      </div>
      <form className="form-panel" onSubmit={handleSubmit}>
        {location.state?.notice && <p className="success-message" role="status">{location.state.notice}</p>}
        {error && <p className="form-alert" role="alert">{error}</p>}
        <label className="field-label" htmlFor="onboarding-phone">Phone number</label>
        <input id="onboarding-phone" autoComplete="tel" type="tel" placeholder="+14155550123" pattern="\+[1-9][0-9]{7,14}" required value={form.phoneNumber}
          onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} />
        <label className="field-label" htmlFor="onboarding-address">Street address</label>
        <input id="onboarding-address" autoComplete="street-address" required minLength={5} maxLength={200} value={form.addressLine}
          onChange={(event) => setForm({ ...form, addressLine: event.target.value })} />
        <div className="field-grid">
          <div>
            <label className="field-label" htmlFor="onboarding-city">City</label>
            <input id="onboarding-city" autoComplete="address-level2" required minLength={2} maxLength={80} value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor="onboarding-postal">Postal code</label>
            <input id="onboarding-postal" autoComplete="postal-code" required minLength={2} maxLength={20} value={form.postalCode}
              onChange={(event) => setForm({ ...form, postalCode: event.target.value })} />
          </div>
        </div>
        <label className="field-label" htmlFor="onboarding-country">Country code</label>
        <input id="onboarding-country" autoComplete="country" placeholder="US" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" value={form.countryCode}
          onChange={(event) => setForm({ ...form, countryCode: event.target.value })} />
        <button className="button form-submit" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit application'}
        </button>
      </form>
    </section>
  );
}