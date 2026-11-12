import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
import { accountsApi } from '../lib/api.js';

export default function AdminAccountsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const [searchDraft, setSearchDraft] = useState(search);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setSearchDraft(search); }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    accountsApi.adminList({ search, status, page: params.get('page') ?? 1, limit: 25 })
      .then((data) => { if (active) setResult(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, status, params]);

  function applyFilters(values) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setParams(next);
  }

  return (
    <section className="content-page">
      <div className="section-heading"><div><p className="eyebrow">Synthetic account records</p><h1>Accounts</h1><p className="section-copy">Search account holders and manage permitted statuses.</p></div></div>
      <div className="filter-bar">
        <form className="search-form" onSubmit={(event) => { event.preventDefault(); applyFilters({ search: searchDraft.trim() }); }}>
          <label className="sr-only" htmlFor="account-search">Search accounts</label>
          <input id="account-search" type="search" value={searchDraft} maxLength={100} placeholder="Full account ID, holder or email" onChange={(event) => setSearchDraft(event.target.value)} />
          <button className="button button-small" type="submit">Search</button>
        </form>
        <label className="filter-control"><span>Status</span><select value={status} onChange={(event) => applyFilters({ status: event.target.value })}>
          <option value="">All statuses</option><option value="PENDING">Pending</option><option value="ACTIVE">Active</option><option value="FROZEN">Frozen</option><option value="CLOSED">Closed</option>
        </select></label>
      </div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p className="state-message" role="status">Loading accounts…</p>}
      {!loading && !error && result?.accounts.length === 0 && <div className="empty-state"><p>No account records match these filters.</p></div>}
      {!loading && result?.accounts.length > 0 && (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Holder</th><th>Email</th><th>Account ID</th><th>Type</th><th>Status</th><th>Created</th><th><span className="sr-only">Details</span></th></tr></thead>
          <tbody>{result.accounts.map((account) => (
            <tr key={account.id}><td>{account.holder.fullName}</td><td>{account.holder.email}</td><td>{account.id.slice(0, 12)}</td><td>{account.type}</td>
              <td><StatusBadge value={account.status} /></td><td>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(account.createdAt))}</td>
              <td><Link className="text-link" to={`/admin/accounts/${account.id}`}>Manage</Link></td></tr>
          ))}</tbody>
        </table></div>
      )}
      {result && <p className="table-summary">{result.total} synthetic account records</p>}
    </section>
  );
}