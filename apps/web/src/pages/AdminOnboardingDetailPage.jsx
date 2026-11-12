import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { onboardingApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminOnboardingDetailPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    onboardingApi.adminGet(requestId)
      .then(({ request: item }) => { if (active) { setRequest(item); setComment(item.reviewComment ?? ''); } })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestId]);

  async function submitDecision(status) {
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const { request: reviewed } = await onboardingApi.review(requestId, { status, comment });
      setRequest(reviewed);
      setNotice(status === 'APPROVED'
        ? 'Request approved. Pending applicants are activated; account creation remains a separate admin step.'
        : 'Request rejected and audit record created.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="state-message" role="status">Loading request…</p>;
  if (error && !request) {
    return <section className="content-page"><p className="form-alert" role="alert">{error}</p><Link className="text-link" to="/admin/onboarding">Back to requests</Link></section>;
  }
  if (!request) return null;

  const pending = request.status === 'PENDING';
  return (
    <section className="content-page detail-page">
      <button className="text-button back-link" type="button" onClick={() => navigate('/admin/onboarding')}>← Back to requests</button>
      <div className="section-heading detail-heading">
        <div>
          <p className="eyebrow">Request review</p>
          <h1>{request.user.fullName}</h1>
          <p className="section-copy">{request.user.email}</p>
        </div>
        <span className={`status-badge status-${request.status.toLowerCase()}`}>{request.status}</span>
      </div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      <dl className="detail-grid">
        <div><dt>Submitted</dt><dd>{formatDate(request.submittedAt)}</dd></div>
        <div><dt>Phone</dt><dd>{request.phoneNumber}</dd></div>
        <div className="detail-wide"><dt>Address</dt><dd>{request.addressLine}, {request.city}, {request.postalCode}, {request.countryCode}</dd></div>
        {request.reviewedAt && <div><dt>Reviewed</dt><dd>{formatDate(request.reviewedAt)}</dd></div>}
        {request.reviewedBy && <div><dt>Reviewer</dt><dd>{request.reviewedBy.fullName}</dd></div>}
        {request.reviewComment && <div className="detail-wide"><dt>Review comment</dt><dd>{request.reviewComment}</dd></div>}
      </dl>
      {pending && (
        <div className="review-panel">
          <label className="field-label" htmlFor="review-comment">Optional review comment</label>
          <textarea id="review-comment" rows="4" maxLength={500} value={comment}
            onChange={(event) => setComment(event.target.value)} />
          <p className="field-hint">Comments are visible in the applicant's status history.</p>
          <div className="action-row">
            <button className="button" type="button" disabled={submitting} onClick={() => submitDecision('APPROVED')}>
              {submitting ? 'Saving…' : 'Approve request'}
            </button>
            <button className="button button-danger" type="button" disabled={submitting} onClick={() => submitDecision('REJECTED')}>
              {submitting ? 'Saving…' : 'Reject request'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}