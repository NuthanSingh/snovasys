import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { auditApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminAuditLogsPage() {
  const [params, setParams] = useSearchParams();
  const action = params.get('action') ?? '';
  const [draft, setDraft] = useState(action);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setDraft(action); }, [action]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    auditApi.adminList({ action, page: params.get('page') ?? 1, limit: 50 })
      .then((data) => { if (active) setResult(data); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [action, params]);

  return (
    <section className="content-page">
      <div className="section-heading"><div><p className="eyebrow">Accountability</p><h1>Audit log</h1><p className="section-copy">Administrative and account events recorded by the API.</p></div></div>
      <form className="search-form audit-search" onSubmit={(event) => { event.preventDefault(); setParams(draft.trim() ? { action: draft.trim() } : {}); }}>
        <label className="sr-only" htmlFor="audit-filter">Filter by action</label><input id="audit-filter" value={draft} maxLength={120} placeholder="Filter by action name" onChange={(event) => setDraft(event.target.value)} />
        <button className="button button-small" type="submit">Filter</button>
      </form>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p className="state-message" role="status">Loading audit events…</p>}
      {!loading && !error && result?.logs.length === 0 && <div className="empty-state"><p>No audit events match this filter.</p></div>}
      {!loading && result?.logs.length > 0 && (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Target ID</th><th>Result</th></tr></thead>
          <tbody>{result.logs.map((log) => <tr key={log.id}>
            <td>{formatDate(log.createdAt)}</td><td>{log.actor?.fullName ?? 'System'}</td><td>{log.action}</td><td>{log.targetType}</td><td>{log.targetId ?? '—'}</td><td>{log.result}</td>
          </tr>)}</tbody>
        </table></div>
      )}
      {result && <p className="table-summary">{result.total} audit entries</p>}
    </section>
  );
}