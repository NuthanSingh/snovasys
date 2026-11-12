import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
import { usersApi } from '../lib/api.js';

export default function AdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
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
    usersApi.adminList({ search, role, status, page, limit: 25 })
      .then((data) => { if (active) setResult(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, role, status, page]);

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
      <div className="section-heading"><div><p className="eyebrow">Access administration</p><h1>Users</h1><p className="section-copy">Search users and update permitted profile or account status fields.</p></div></div>
      <div className="filter-bar">
        <form className="search-form" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="user-search">Search users</label>
          <input id="user-search" type="search" value={searchDraft} maxLength={100} placeholder="Name or email" onChange={(event) => setSearchDraft(event.target.value)} />
          <button className="button button-small" type="submit">Search</button>
        </form>
        <label className="filter-control"><span>Role</span><select value={role} onChange={(event) => updateFilters({ role: event.target.value })}>
          <option value="">All roles</option><option value="USER">User</option><option value="ADMIN">Admin</option><option value="BOOTSTRAP_ADMIN">Bootstrap admin</option>
        </select></label>
        <label className="filter-control"><span>Status</span><select value={status} onChange={(event) => updateFilters({ status: event.target.value })}>
          <option value="">All statuses</option><option value="PENDING">Pending</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="CLOSED">Closed</option>
        </select></label>
      </div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p className="state-message" role="status">Loading users…</p>}
      {!loading && !error && result?.users.length === 0 && <div className="empty-state"><p>No users match these filters.</p></div>}
      {!loading && result?.users.length > 0 && (
        <>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Accounts</th><th>Joined</th><th><span className="sr-only">Details</span></th></tr></thead>
            <tbody>{result.users.map((user) => (
              <tr key={user.id}>
                <td>{user.fullName}</td><td>{user.email}</td><td>{user.role.name}</td>
                <td><StatusBadge value={user.status} /></td><td>{user._count.accounts}</td>
                <td>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(user.createdAt))}</td>
                <td><Link className="text-link" to={`/admin/users/${user.id}`}>Manage</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="pagination-row"><span>{result.total} users</span><div>
            <button className="button button-quiet button-small" type="button" disabled={page <= 1} onClick={() => updateFilters({ page: String(page - 1) })}>Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button className="button button-quiet button-small" type="button" disabled={page >= pageCount} onClick={() => updateFilters({ page: String(page + 1) })}>Next</button>
          </div></div>
        </>
      )}
    </section>
  );
}