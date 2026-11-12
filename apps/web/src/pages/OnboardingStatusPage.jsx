import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { onboardingApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function OnboardingStatusPage() {
  const location = useLocation();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    onboardingApi.mine()
      .then(({ requests: items }) => { if (active) setRequests(items); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="content-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your applications</p>
          <h1>Onboarding status</h1>
          <p className="section-copy">Track submitted requests and review decisions.</p>
        </div>
        <Link className="button" to="/onboarding/new">New application</Link>
      </div>
      {location.state?.notice && <p className="success-message" role="status">{location.state.notice}</p>}
      {error && <p className="form-alert" role="alert">{error}</p>}
      {loading && <p className="state-message" role="status">Loading your applications…</p>}
      {!loading && !error && requests.length === 0 && (
        <div className="empty-state">
          <p className="eyebrow">No applications yet</p>
          <p>Submit your first onboarding application to see its review status here.</p>
          <Link className="text-link" to="/onboarding/new">Start an application</Link>
        </div>
      )}
      {!loading && requests.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Submitted</th><th>Status</th><th>Review update</th><th><span className="sr-only">Details</span></th></tr></thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>{formatDate(request.submittedAt)}</td>
                  <td><span className={`status-badge status-${request.status.toLowerCase()}`}>{request.status}</span></td>
                  <td>{request.reviewComment || (request.reviewedAt ? formatDate(request.reviewedAt) : 'Awaiting review')}</td>
                  <td><Link className="text-link" to={`/onboarding/requests/${request.id}`}>View details</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}