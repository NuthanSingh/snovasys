import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { onboardingApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function OnboardingRequestPage() {
  const { requestId } = useParams();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    onboardingApi.mineById(requestId)
      .then(({ request: item }) => { if (active) setRequest(item); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [requestId]);

  if (error) return <p className="form-alert" role="alert">{error}</p>;
  if (!request) return <p className="state-message" role="status">Loading request…</p>;

  return (
    <section className="content-page detail-page">
      <Link className="text-link back-link" to="/onboarding">Back to applications</Link>
      <p className="eyebrow">Application details</p>
      <h1>Onboarding request</h1>
      <dl className="detail-grid">
        <div><dt>Status</dt><dd><span className={`status-badge status-${request.status.toLowerCase()}`}>{request.status}</span></dd></div>
        <div><dt>Submitted</dt><dd>{formatDate(request.submittedAt)}</dd></div>
        <div><dt>Phone</dt><dd>{request.phoneNumber}</dd></div>
        <div className="detail-wide"><dt>Address</dt><dd>{request.addressLine}, {request.city}, {request.postalCode}, {request.countryCode}</dd></div>
        {request.reviewedAt && <div><dt>Reviewed</dt><dd>{formatDate(request.reviewedAt)}</dd></div>}
        {request.reviewComment && <div className="detail-wide"><dt>Review comment</dt><dd>{request.reviewComment}</dd></div>}
      </dl>
    </section>
  );
}