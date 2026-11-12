import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MetricCard from '../components/MetricCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAuth } from '../features/AuthContext.jsx';
import { dashboardApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function UserDashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    dashboardApi.user()
      .then((data) => { if (active) setDashboard(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Personal overview</p>
          <h1>Welcome, {user?.fullName}</h1>
          <p className="section-copy">A current view of your synthetic account records and application.</p>
        </div>
        <Link className="text-link" to="/profile">View profile</Link>
      </div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p className="state-message" role="status">Loading your dashboard…</p>}
      {dashboard && (
        <>
          <div className="metric-grid">
            <MetricCard label="Accounts" value={dashboard.accountCount} note={`${dashboard.activeAccountCount} active`} />
            <MetricCard label="Onboarding" value={dashboard.onboarding?.status ?? 'Not submitted'} note={dashboard.onboarding ? `Submitted ${formatDate(dashboard.onboarding.submittedAt)}` : 'Start an application when ready'} />
            <MetricCard label="Profile status" value={dashboard.user.status} note={`Role: ${dashboard.user.role}`} />
          </div>

          <div className="dashboard-section-heading">
            <div><h2>Your accounts</h2><p>Only accounts linked to your profile are shown.</p></div>
            <Link className="text-link" to="/accounts">All accounts</Link>
          </div>
          {dashboard.accounts.length === 0 ? (
            <div className="empty-state"><p>No account records are linked to your profile yet.</p></div>
          ) : (
            <div className="account-grid">
              {dashboard.accounts.map((account) => (
                <Link className="account-tile" to={`/accounts/${account.id}`} key={account.id}>
                  <span className="account-type">{account.type}</span>
                  <strong>{account.balance} {account.currency}</strong>
                  <span className="field-hint">Synthetic account balance</span>
                  <StatusBadge value={account.status} />
                  <span className="account-date">Opened {formatDate(account.createdAt)}</span>
                </Link>
              ))}
            </div>
          )}

          <div className="dashboard-section-heading">
            <div><h2>Recent operations</h2><p>Synthetic transaction history. No real money is moved.</p></div>
          </div>
          {dashboard.recentOperations.length === 0 ? (
            <div className="empty-state"><p>No account operations have been recorded.</p></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Time</th><th>Account</th><th>Type</th><th>Direction</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>{dashboard.recentOperations.map((operation) => (
                  <tr key={operation.id}>
                    <td>{formatDate(operation.createdAt)}</td>
                    <td><Link className="text-link" to={`/accounts/${operation.accountId}`}>{operation.accountId.slice(0, 8)}</Link></td>
                    <td>{operation.type}</td><td>{operation.direction}</td>
                    <td>{operation.amount} {operation.currency}</td><td><StatusBadge value={operation.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}