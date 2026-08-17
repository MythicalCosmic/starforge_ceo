import { cloneElement, useMemo, useState } from 'react';
import { httpRequest } from '../api/http.js';
import { Icons } from './Icons.jsx';
import {
  ActionButton,
  StatusPill,
  WorkspaceState,
} from './WorkspacePrimitives.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData } from '../hooks/useWorkspaceData.js';
import { canUseCapability } from '../lib/permissions.js';
import { formatBusinessMoney, formatOrganizationDate } from '../lib/formatters.js';
import { userFacingError } from '../lib/userFacingError.js';
import '../styles/decision-actions.css';

function requestKind(value) {
  return String(value || 'request')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isAmountBearing(request) {
  return request?.amount_uzs !== null && request?.amount_uzs !== undefined && request?.amount_uzs !== '';
}

export function ApprovalDecisionActions({ requestId, user }) {
  const toast = useToast();
  const request = useWorkspaceData(
    requestId ? `/api/v1/approvals/requests/${encodeURIComponent(requestId)}/` : null,
    undefined,
    { enabled: Boolean(requestId), staleTime: 0 },
  );
  const record = request.data;
  const mayApprove = canUseCapability(user, 'approvals:approve');
  const mayDisburse = canUseCapability(user, 'approvals:disburse');
  const mayCancel = canUseCapability(user, 'approvals:write') &&
    String(record?.requested_by ?? '') === String(user?.messaging_user_id ?? '');
  const paymentMethods = useWorkspaceData(
    '/api/v1/finance/payment-methods/',
    { is_active: true, page_size: 100 },
    {
      enabled: Boolean(record?.status === 'approved' && isAmountBearing(record) && mayDisburse),
      staleTime: 60_000,
    },
  );
  const methods = useMemo(
    () => paymentMethods.rows.filter((method) => method.is_active !== false),
    [paymentMethods.rows],
  );
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [busy, setBusy] = useState('');

  const act = async (action, body = {}) => {
    if (!record || busy) return;
    setBusy(action);
    try {
      const requestId = encodeURIComponent(record.id);
      const path = {
        approve: `/api/v1/approvals/requests/${requestId}/approve/`,
        reject: `/api/v1/approvals/requests/${requestId}/reject/`,
        cancel: `/api/v1/approvals/requests/${requestId}/cancel/`,
        disburse: `/api/v1/approvals/requests/${requestId}/disburse/`,
      }[action];
      if (!path) throw new Error('This request action is unavailable.');
      await httpRequest(
        'POST',
        path,
        { body },
      );
      setNote('');
      if (action === 'approve') toast.success('The request was approved.');
      else if (action === 'reject') toast.success('The request was declined and the reason was recorded.');
      else if (action === 'disburse') toast.success('Payment was recorded and the request is complete.');
      else toast.success('The request was withdrawn.');
      await request.retry();
    } catch (error) {
      toast.danger(userFacingError(error, { fallback: 'The decision could not be saved.' }));
    } finally {
      setBusy('');
    }
  };

  const reject = () => {
    const reason = note.trim();
    if (!reason) {
      toast.warning('Add a clear reason before declining this request.');
      return;
    }
    void act('reject', { note: reason });
  };

  const pay = () => {
    if (!paymentMethod) {
      toast.warning('Choose how the payment was made.');
      return;
    }
    void act('disburse', { payment_method: Number(paymentMethod) });
  };

  return (
    <section className="decision-actions" aria-label="Decision controls">
      <header>
        <span className="decision-actions-icon">{cloneElement(Icons.check, { size: 20 })}</span>
        <div>
          <span>Decision desk</span>
          <h2>Complete this request</h2>
          <p>The available next steps follow the request state and your assigned responsibility.</p>
        </div>
        {record && <StatusPill value={record.status} />}
      </header>

      <WorkspaceState state={request}>
        {record && (
          <div className="decision-actions-body">
            <aside>
              <span>Request type</span>
              <strong>{requestKind(record.kind)}</strong>
              <dl>
                <div><dt>Reference</dt><dd>#{record.id}</dd></div>
                <div><dt>Submitted</dt><dd>{formatOrganizationDate(record.created_at) || 'Not recorded'}</dd></div>
                {isAmountBearing(record) && <div className="is-wide"><dt>Amount</dt><dd>{formatBusinessMoney(record.amount_uzs, 'UZS')}</dd></div>}
              </dl>
            </aside>

            <main>
              {record.status === 'pending' && mayApprove && (
                <section className="decision-review-form">
                  <div><span>Review outcome</span><h3>Approve or decline</h3><p>Add context when useful. A reason is required when declining.</p></div>
                  <label><span>Decision note</span><textarea maxLength="255" rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record the reason, conditions, or follow-up…" /></label>
                  <footer>
                    <ActionButton tone="danger" icon={Icons.x} disabled={Boolean(busy)} onClick={reject}>{busy === 'reject' ? 'Declining…' : 'Decline request'}</ActionButton>
                    <ActionButton tone="primary" icon={Icons.check} disabled={Boolean(busy)} onClick={() => void act('approve', { note: note.trim() })}>{busy === 'approve' ? 'Approving…' : 'Approve request'}</ActionButton>
                  </footer>
                </section>
              )}

              {record.status === 'pending' && !mayApprove && mayCancel && (
                <section className="decision-finished is-neutral">
                  <span>{cloneElement(Icons.flag, { size: 21 })}</span>
                  <div><h3>Waiting for review</h3><p>You can withdraw this request while it is still pending.</p></div>
                  <ActionButton tone="danger" disabled={Boolean(busy)} onClick={() => void act('cancel')}>{busy === 'cancel' ? 'Withdrawing…' : 'Withdraw request'}</ActionButton>
                </section>
              )}

              {record.status === 'pending' && !mayApprove && !mayCancel && (
                <section className="decision-finished is-neutral"><span>{cloneElement(Icons.flag, { size: 21 })}</span><div><h3>Waiting for an authorized reviewer</h3><p>This request is visible to you, but its decision belongs to the assigned approval team.</p></div></section>
              )}

              {record.status === 'approved' && isAmountBearing(record) && mayDisburse && (
                <section className="decision-payment-form">
                  <div><span>Approved for payment</span><h3>Record the disbursement</h3><p>Select the actual payment method. The resulting finance entry is permanent.</p></div>
                  <label><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={paymentMethods.pending || Boolean(busy)}><option value="">Choose a payment method</option>{methods.map((method) => <option value={method.id} key={method.id}>{method.name}</option>)}</select></label>
                  {paymentMethods.error && <p className="decision-inline-error">Payment methods could not be loaded. Check your finance access and try again.</p>}
                  <footer><ActionButton tone="primary" icon={Icons.check} disabled={Boolean(busy) || paymentMethods.pending || !methods.length} onClick={pay}>{busy === 'disburse' ? 'Recording payment…' : 'Record payment'}</ActionButton></footer>
                </section>
              )}

              {record.status === 'approved' && mayApprove && (
                <details className="decision-reconsider">
                  <summary>Reconsider this approval</summary>
                  <div><p>Use this only when the decision must be reversed. The reason will be kept in the permanent record.</p><textarea maxLength="255" rows="2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why is this approval being reversed?" /><ActionButton tone="danger" disabled={Boolean(busy)} onClick={reject}>{busy === 'reject' ? 'Reversing…' : 'Reverse approval'}</ActionButton></div>
                </details>
              )}

              {record.status === 'approved' && !isAmountBearing(record) && (
                <section className="decision-finished is-success"><span>{cloneElement(Icons.check, { size: 21 })}</span><div><h3>Decision complete</h3><p>This request did not require a payment. The approval is now part of the permanent record.</p></div></section>
              )}

              {record.status === 'approved' && isAmountBearing(record) && !mayDisburse && (
                <section className="decision-finished is-warn"><span>{cloneElement(Icons.flag, { size: 21 })}</span><div><h3>Approved — waiting for payment</h3><p>The authorized finance team has been notified to complete the disbursement.</p></div></section>
              )}

              {['rejected', 'cancelled', 'disbursed'].includes(record.status) && (
                <section className={`decision-finished is-${record.status === 'disbursed' ? 'success' : 'neutral'}`}><span>{cloneElement(record.status === 'disbursed' ? Icons.check : Icons.flag, { size: 21 })}</span><div><h3>{record.status === 'disbursed' ? 'Payment complete' : record.status === 'rejected' ? 'Request declined' : 'Request withdrawn'}</h3><p>{record.decision_note || 'No further action is available for this request.'}</p></div></section>
              )}
            </main>
          </div>
        )}
      </WorkspaceState>
    </section>
  );
}
