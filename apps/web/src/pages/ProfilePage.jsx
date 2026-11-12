import { useEffect, useState } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAuth } from '../features/AuthContext.jsx';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setFullName(user?.fullName ?? ''); }, [user?.fullName]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await updateProfile({ fullName });
      setNotice('Profile updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-page profile-page">
      <div className="section-heading"><div><p className="eyebrow">Personal information</p><h1>Profile</h1><p className="section-copy">Only your display name can be changed here.</p></div></div>
      <dl className="detail-grid profile-summary">
        <div><dt>Email</dt><dd>{user.email}</dd></div>
        <div><dt>Role</dt><dd>{user.role}</dd></div>
        <div><dt>Account status</dt><dd><StatusBadge value={user.status} /></dd></div>
      </dl>
      <form className="form-panel profile-form" onSubmit={handleSubmit}>
        {error && <p className="form-alert" role="alert">{error}</p>}
        {notice && <p className="success-message" role="status">{notice}</p>}
        <label className="field-label" htmlFor="profile-name">Full name</label>
        <input id="profile-name" autoComplete="name" minLength={2} maxLength={120} required value={fullName} onChange={(event) => setFullName(event.target.value)} />
        <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
      </form>
    </section>
  );
}