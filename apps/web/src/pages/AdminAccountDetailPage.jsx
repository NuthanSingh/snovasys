import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge.jsx';
import { accountsApi } from '../lib/api.js';

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const nextStatuses = {
  PENDING: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['FROZEN', 'CLOSED'],
  FROZEN: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export default function AdminAccountDetailPage() {
  const { accountId } = useParams();
  const [account, setAccount] = useState(null);
  const [nextStatus, setNextStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDescription, setDepositDescription] = useState('Synthetic demonstration deposit');
  const [depositKey, setDepositKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let active = true;
    accountsApi.adminGet(accountId)
      .then(({ account: item }) => { if (active) { setAccount(item); setNextStatus(nextStatuses[item.status][0] ?? ''); } })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId]);

  async function submitDeposit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { transaction } = await accountsApi.adminDeposit(accountId, {
        amount: depositAmount,
        description: depositDescription,
      }, depositKey);
      setNotice(`Synthetic deposit ${transaction.referenceId} completed. No real funds were moved.`);
      setDepositAmount('');
      setDepositKey(crypto.randomUUID());
      const { account: updated } = await accountsApi.adminGet(accountId);
      setAccount(updated);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveStatus(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { account: updated } = await accountsApi.adminUpdateStatus(accountId, { status: nextStatus });
      setAccount((current) => ({ ...current, ...updated }));
      setNextStatus(nextStatuses[updated.status][0] ?? '');
      setNotice(`Account status updated to ${updated.status}.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="state-message" role="status">Loading account…</p>;
  if (error && !account) return <section className="content-page"><p className="form-alert" role="alert">{error}</p><Link className="text-link" to="/admin/accounts">Back to accounts</Link></section>;
  if (!account) return null;

  return (
    <section className="content-page detail-page">
      <Link className="text-link back-link" to="/admin/accounts">Back to accounts</Link>
      <div className="section-heading detail-heading"><div><p className="eyebrow">Synthetic account record</p><h1>{account.type}</h1><p className="section-copy">{account.holder.fullName} · {account.holder.email}</p></div><StatusBadge value={account.status} /></div>
      {error && <p className="form-alert" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      <dl className="detail-grid">
        <div><dt>Account ID</dt><dd>{account.id}</dd></div><div><dt>Holder status</dt><dd><StatusBadge value={account.holder.status} /></dd></div>
        <div><dt>Balance</dt><dd>{account.balance} {account.currency}</dd></div><div><dt>Created</dt><dd>{formatDate(account.createdAt)}</dd></div>
      </dl>
      {nextStatus && <form className="inline-form" onSubmit={saveStatus}>
        <label className="filter-control"><span>Change status</span><select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
          {nextStatuses[account.status].map((status) => <option value={status} key={status}>{status}</option>)}
        </select></label>
        <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update status'}</button>
      </form>}
      {account.status === 'ACTIVE' && <form className="review-panel transfer-panel" onSubmit={submitDeposit}>
        <p className="eyebrow">Admin-only synthetic deposit</p>
        <p className="field-hint">Adds demonstration ledger value only. This is not a payment or bank deposit.</p>
        <label className="field-label" htmlFor="deposit-amount">Amount</label>
        <input id="deposit-amount" inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})?" required value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
        <label className="field-label" htmlFor="deposit-description">Description</label>
        <input id="deposit-description" maxLength={240} value={depositDescription} onChange={(event) => setDepositDescription(event.target.value)} />
        <button className="button" type="submit" disabled={saving}>{saving ? 'Processing…' : 'Add synthetic deposit'}</button>
      </form>}
      <div className="dashboard-section-heading"><div><h2>Operation history</h2><p>Append-only simulated ledger entries.</p></div></div>
      {account.transactions.length === 0 ? <div className="empty-state"><p>No operations are recorded for this account.</p></div> : (
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Type</th><th>Amount</th><th>Reference</th></tr></thead>
          <tbody>{account.transactions.map((transaction) => <tr key={transaction.id}><td>{formatDate(transaction.createdAt)}</td><td>{transaction.type}</td><td>{transaction.amount} {account.currency}</td><td>{transaction.referenceId}</td></tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}