import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
import { transactionApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminTransactionsPage() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const search = params.get('search') ?? '';
  const page = Number(params.get('page') ?? 1);
  const [searchDraft, setSearchDraft] = useState(search);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setSearchDraft(search); }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    transactionApi.adminList({ type, status, search, page, limit: 25 })
      .then((data) => { if (active) setResult(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, status, search, page]);

  function updateFilters(values) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!Object.hasOwn(values, 'page')) next.delete('page');
    setParams(next);
  }

  function submitSearch(event) {
    event.preventDefault();
    updateFilters({ search: searchDraft.trim() });
  }

  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  return (
    <section className="content-page">
      <div className="section-heading"><div><p className="eyebrow">Ledger oversight</p><h1>Transactions</h1><p className="section-copy">Completed synthetic ledger operations. No real payment processing.</p></div></div>
      <div className="filter-bar transaction-filters">
        <form className="search-form" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="transaction-search">Search transactions</label>
          <input id="transaction-search" type="search" value={searchDraft} maxLength={100} placeholder="Full reference ID or description" onChange={(event) => setSearchDraft(event.target.value)} />
          <button className="button button-small" type="submit">Search</button>
        </form>
        <label className="filter-control"><span>Type</span><select value={type} onChange={(event) => updateFilters({ type: event.target.value })}>
          <option value="">All types</option><option value="DEPOSIT">Deposit</option><option value="TRANSFER">Transfer</option>
        </select></label>
        <label className="filter-control"><span>Status</span><select value={status} onChange={(event) => updateFilters({ status: event.target.value })}>
          <option value="">All statuses</option><option value="COMPLETED">Completed</option>
        </select></label>
      </div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p className="state-message" role="status">Loading transactions…</p>}
      {!loading && !error && result?.transactions.length === 0 && <div className="empty-state"><p>No transactions match these filters.</p></div>}
      {!loading && result?.transactions.length > 0 && <>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Time</th><th>Reference</th><th>Type</th><th>Account</th><th>Amount</th><th>Status</th><th>Actor</th></tr></thead>
          <tbody>{result.transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>{formatDate(transaction.createdAt)}</td><td>{transaction.referenceId.slice(0, 12)}</td><td>{transaction.type}</td>
              <td>{transaction.destinationAccount ? <Link className="text-link" to={`/admin/accounts/${transaction.destinationAccount.id}`}>{transaction.destinationAccount.holder.fullName}</Link> : '—'}</td>
              <td>{transaction.amount} {transaction.currency}</td><td><StatusBadge value={transaction.status} /></td><td>{transaction.actor?.fullName ?? 'System'}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="pagination-row"><span>{result.total} transactions</span><div>
          <button className="button button-quiet button-small" type="button" disabled={page <= 1} onClick={() => updateFilters({ page: String(page - 1) })}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button className="button button-quiet button-small" type="button" disabled={page >= pageCount} onClick={() => updateFilters({ page: String(page + 1) })}>Next</button>
        </div></div>
      </>}
    </section>
  );
}