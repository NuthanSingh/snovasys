import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MetricCard from '../components/MetricCard.jsx';
import { dashboardApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    dashboardApi.admin()
      .then((data) => { if (active) setDashboard(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="dashboard-page">
      <div className="dashboard-heading">
        <div><p className="eyebrow">Operations overview</p><h1>Administrator dashboard</h1><p className="section-copy">Current counts from registered users, onboarding requests, and synthetic accounts.</p></div>
      </div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p className="state-message" role="status">Loading overview…</p>}
      {dashboard && (
        <>
          <div className="metric-grid metric-grid-admin">
            <MetricCard label="Registered users" value={dashboard.totalUsers} note={`${dashboard.activeUsers} active`} />
            <MetricCard label="Pending onboarding" value={dashboard.pendingOnboarding} note="Waiting for review" />
            <MetricCard label="Approved users" value={dashboard.approvedUsers} note="At least one approved application" />
            <MetricCard label="Rejected requests" value={dashboard.rejectedOnboarding} note={`${dashboard.approvedOnboarding} approved requests`} />
            <MetricCard label="Synthetic accounts" value={dashboard.totalAccounts} note={`${dashboard.frozenAccounts} frozen`} />
            <MetricCard label="Transactions" value={dashboard.completedTransactions} note={`${dashboard.completedTransfers} transfers · ${dashboard.completedDeposits} deposits`} />
          </div>
          <div className="dashboard-section-heading"><div><h2>Recent synthetic transactions</h2><p>Completed ledger-backed demo operations.</p></div><Link className="text-link" to="/admin/transactions">All transactions</Link></div>
          {dashboard.recentTransactions.length === 0 ? <div className="empty-state"><p>No synthetic transactions have been recorded.</p></div> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Time</th><th>Actor</th><th>Type</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
              <tbody>{dashboard.recentTransactions.map((transaction) => (
                <tr key={transaction.id}><td>{formatDate(transaction.createdAt)}</td><td>{transaction.actor?.fullName ?? 'System'}</td><td>{transaction.type}</td>
                  <td>{transaction.amount} {transaction.currency}</td><td>{transaction.status}</td><td>{transaction.referenceId.slice(0, 12)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
          <div className="dashboard-section-heading"><div><h2>Recent audit activity</h2><p>Administrative changes and account events.</p></div><Link className="text-link" to="/admin/audit-logs">View audit log</Link></div>
          {dashboard.recentAuditLogs.length === 0 ? <div className="empty-state"><p>No audit events have been recorded.</p></div> : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Result</th></tr></thead>
              <tbody>{dashboard.recentAuditLogs.map((entry) => (
                <tr key={entry.id}><td>{formatDate(entry.createdAt)}</td><td>{entry.actor?.fullName ?? 'System'}</td><td>{entry.action}</td><td>{entry.targetType}</td><td>{entry.result}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
    </section>
  );
}