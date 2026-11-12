import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
import { accountsApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AccountDetailPage() {
  const { accountId } = useParams();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('Synthetic account transfer');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  async function loadAccount() {
    const { account: item } = await accountsApi.mineById(accountId);
    setAccount(item);
  }

  useEffect(() => {
    let active = true;
    accountsApi.mineById(accountId)
      .then(({ account: item }) => { if (active) setAccount(item); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId]);

  async function submitTransfer(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const { transaction } = await accountsApi.transfer(accountId, {
        destinationAccountId,
        amount,
        description,
      }, idempotencyKey);
      setNotice(`Synthetic transfer ${transaction.referenceId} completed.`);
      setAmount('');
      setIdempotencyKey(crypto.randomUUID());
      await loadAccount();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="state-message" role="status">Loading account…</p>;
  if (error && !account) return <section className="content-page"><p className="form-alert" role="alert">{error}</p><Link className="text-link" to="/accounts">Back to accounts</Link></section>;

  return (
    <section className="content-page detail-page">
      <Link className="text-link back-link" to="/accounts">Back to accounts</Link>
      <div className="section-heading detail-heading"><div><p className="eyebrow">Synthetic account</p><h1>{account.type}</h1></div><StatusBadge value={account.status} /></div>
      <dl className="detail-grid">
        <div><dt>Account ID</dt><dd>{account.id}</dd></div>
        <div><dt>Account holder</dt><dd>Your profile</dd></div>
        <div><dt>Balance</dt><dd>{account.balance} {account.currency}</dd></div>
        <div><dt>Created</dt><dd>{formatDate(account.createdAt)}</dd></div>
      </dl>
      <div className="dashboard-section-heading"><div><h2>Account activity</h2><p>Append-only simulated ledger entries.</p></div></div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      {account.transactions.length === 0 ? <div className="empty-state"><p>No operations are recorded for this account.</p></div> : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Time</th><th>Transaction</th><th>Direction</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
          <tbody>{account.transactions.map((transaction) => <tr key={transaction.id}>
            <td>{formatDate(transaction.createdAt)}</td><td>{transaction.type}</td><td>{transaction.direction}</td>
            <td>{transaction.amount} {transaction.currency}</td><td><StatusBadge value={transaction.status} /></td><td>{transaction.referenceId}</td>
          </tr>)}</tbody>
        </table></div>
      )}
      {account.status === 'ACTIVE' && <form className="review-panel transfer-panel" onSubmit={submitTransfer}>
        <p className="eyebrow">Synthetic transfer</p>
        <p className="field-hint">Moves only demonstration ledger value. No payment network or real funds are involved.</p>
        <label className="field-label" htmlFor="transfer-destination">Destination account ID</label>
        <input id="transfer-destination" required value={destinationAccountId} onChange={(event) => setDestinationAccountId(event.target.value)} />
        <div className="field-grid">
          <div><label className="field-label" htmlFor="transfer-amount">Amount</label><input id="transfer-amount" inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?" required value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div><label className="field-label" htmlFor="transfer-description">Description</label><input id="transfer-description" maxLength={240} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
        </div>
        <button className="button" type="submit" disabled={submitting}>{submitting ? 'Processing…' : 'Submit synthetic transfer'}</button>
      </form>}
    </section>
  );
}