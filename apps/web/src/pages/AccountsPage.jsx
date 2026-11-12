import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
import { accountsApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    accountsApi.mine()
      .then(({ accounts: items }) => { if (active) setAccounts(items); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="content-page">
      <div className="section-heading"><div><p className="eyebrow">Account records</p><h1>My accounts</h1><p className="section-copy">Synthetic account details and status.</p></div></div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p className="state-message" role="status">Loading accounts…</p>}
      {!loading && !error && accounts.length === 0 && <div className="empty-state"><p>No accounts are linked to your profile yet.</p></div>}
      {!loading && accounts.length > 0 && (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Account ID</th><th>Type</th><th>Balance</th><th>Status</th><th>Created</th><th><span className="sr-only">Details</span></th></tr></thead>
          <tbody>{accounts.map((account) => (
            <tr key={account.id}>
              <td>{account.id.slice(0, 12)}</td><td>{account.type}</td><td>{account.balance} {account.currency}</td>
              <td><StatusBadge value={account.status} /></td><td>{formatDate(account.createdAt)}</td>
              <td><Link className="text-link" to={`/accounts/${account.id}`}>Details</Link></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}