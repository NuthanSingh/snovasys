import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { onboardingApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export default function AdminOnboardingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? '';
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    onboardingApi.adminList(status)
      .then(({ requests: items }) => { if (active) setRequests(items); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status]);

  return (
    <section className="content-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administrator workspace</p>
          <h1>Onboarding requests</h1>
          <p className="section-copy">Review synthetic account applications and record a decision.</p>
        </div>
        <label className="filter-control">
          <span>Status</span>
          <select value={status} onChange={(event) => setSearchParams(event.target.value ? { status: event.target.value } : {})}>
            <option value="">All requests</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>
      </div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p className="state-message" role="status">Loading requests…</p>}
      {!loading && !error && requests.length === 0 && <div className="empty-state"><p>No requests match this filter.</p></div>}
      {!loading && requests.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Applicant</th><th>Email</th><th>Submitted</th><th>Status</th><th><span className="sr-only">Details</span></th></tr></thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>{request.user.fullName}</td>
                  <td>{request.user.email}</td>
                  <td>{formatDate(request.submittedAt)}</td>
                  <td><span className={`status-badge status-${request.status.toLowerCase()}`}>{request.status}</span></td>
                  <td><Link className="text-link" to={`/admin/onboarding/${request.id}`}>Review request</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}