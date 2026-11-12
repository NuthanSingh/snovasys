import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
import { accountsApi, usersApi } from '../lib/api.js';

export default function AdminUserDetailPage() {
  const { userId } = useParams();
  const [user, setUser] = useState(null);
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState('CHECKING');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadUser() {
    const { user: detail } = await usersApi.adminGet(userId);
    setUser(detail);
    setFullName(detail.fullName);
  }

  useEffect(() => {
    let active = true;
    usersApi.adminGet(userId)
      .then(({ user: detail }) => { if (active) { setUser(detail); setFullName(detail.fullName); } })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  async function updateUser(changes, message) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { user: updated } = await usersApi.adminUpdate(userId, changes);
      setUser((current) => ({ ...current, ...updated }));
      setFullName(updated.fullName);
      setNotice(message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function createAccount(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { account } = await accountsApi.adminCreateForUser(userId, { type: accountType });
      setUser((current) => ({ ...current, accounts: [account, ...current.accounts] }));
      setNotice('Synthetic account record created. No funds were added.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="state-message" role="status">Loading user…</p>;
  if (error && !user) return <section className="content-page"><p className="form-alert" role="alert">{error}</p><Link className="text-link" to="/admin/users">Back to users</Link></section>;
  if (!user) return null;

  const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : user.status === 'SUSPENDED' || user.status === 'PENDING' ? 'ACTIVE' : null;
  return (
    <section className="content-page detail-page">
      <Link className="text-link back-link" to="/admin/users">Back to users</Link>
      <div className="section-heading detail-heading"><div><p className="eyebrow">User record</p><h1>{user.fullName}</h1><p className="section-copy">{user.email}</p></div><StatusBadge value={user.status} /></div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      <dl className="detail-grid">
        <div><dt>User ID</dt><dd>{user.id}</dd></div><div><dt>Role</dt><dd>{user.role.name}</dd></div>
        <div><dt>Accounts</dt><dd>{user.accounts.length}</dd></div><div><dt>Onboarding requests</dt><dd>{user.onboardingRequests.length}</dd></div>
      </dl>
      <div className="management-panels">
        <form className="form-panel" onSubmit={(event) => { event.preventDefault(); updateUser({ fullName }, 'User profile updated.'); }}>
          <h2>Permitted profile fields</h2>
          <label className="field-label" htmlFor="managed-user-name">Full name</label>
          <input id="managed-user-name" value={fullName} minLength={2} maxLength={120} required onChange={(event) => setFullName(event.target.value)} />
          <button className="button" type="submit" disabled={saving}>Save name</button>
          <p className="field-hint">Roles cannot be changed here. Administrator access uses the protected bootstrap process.</p>
        </form>
        <div className="form-panel">
          <h2>Account access</h2>
          <p>Current status: <StatusBadge value={user.status} /></p>
          {nextStatus && <button className={`button${nextStatus === 'SUSPENDED' ? ' button-danger' : ''}`} type="button" disabled={saving} onClick={() => updateUser({ status: nextStatus }, `User status changed to ${nextStatus}.`)}>
            {nextStatus === 'ACTIVE' ? 'Activate user' : 'Suspend user'}
          </button>}
        </div>
      </div>
      <div className="dashboard-section-heading"><div><h2>Accounts</h2><p>Create a synthetic account record for an active user.</p></div></div>
      {user.accounts.length === 0 ? <div className="empty-state"><p>No account records.</p></div> : (
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Account ID</th><th>Type</th><th>Status</th><th>Currency</th><th><span className="sr-only">Details</span></th></tr></thead>
          <tbody>{user.accounts.map((account) => <tr key={account.id}><td>{account.id.slice(0, 12)}</td><td>{account.type}</td><td><StatusBadge value={account.status} /></td><td>{account.currency}</td><td><Link className="text-link" to={`/admin/accounts/${account.id}`}>Details</Link></td></tr>)}</tbody>
        </table></div>
      )}
      <form className="inline-form" onSubmit={createAccount}>
        <label className="filter-control"><span>Account type</span><select value={accountType} onChange={(event) => setAccountType(event.target.value)}><option value="CHECKING">Checking</option><option value="SAVINGS">Savings</option></select></label>
        <button className="button" type="submit" disabled={saving || user.status !== 'ACTIVE'}>Create synthetic account</button>
        {user.status !== 'ACTIVE' && <span className="field-hint">Approve onboarding to activate a pending user before creating an account.</span>}
      </form>
    </section>
  );
}