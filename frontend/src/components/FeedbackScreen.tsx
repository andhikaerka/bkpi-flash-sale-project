import { CheckCircle2, XCircle, Package } from 'lucide-react';
import { PurchaseState } from '../types';

interface FeedbackScreenProps {
  purchaseState: PurchaseState;
  userId: string;
  purchaseError: string;
  onReset: () => void;
}

export function FeedbackScreen({ purchaseState, userId, purchaseError, onReset }: FeedbackScreenProps) {
  if (purchaseState === 'success') {
    return (
      <div className="glass-panel feedback-screen">
        <div className="icon-wrapper icon-success">
          <CheckCircle2 size={40} />
        </div>
        <h2 style={{ marginBottom: '16px', fontSize: '1.8rem', fontWeight: 700 }}>Order Secured!</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '32px' }}>
          Congratulations! Your purchase request was processed atomically. Your smartphone is locked and reserved for User ID: <strong style={{ color: '#ffffff' }}>{userId}</strong>.
        </p>
        <button className="btn-primary" onClick={onReset}>
          Done
        </button>
      </div>
    );
  }

  if (purchaseState === 'already-purchased') {
    return (
      <div className="glass-panel feedback-screen">
        <div className="icon-wrapper icon-error">
          <XCircle size={40} />
        </div>
        <h2 style={{ marginBottom: '16px', fontSize: '1.8rem', fontWeight: 700 }}>Purchase Failed</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '32px' }}>
          Sorry, our systems detected that user <strong style={{ color: '#ffffff' }}>{userId}</strong> has already secured an item from this flash sale. Each user is strictly limited to 1 item.
        </p>
        <button className="btn-primary" onClick={onReset}>
          Go Back
        </button>
      </div>
    );
  }

  if (purchaseState === 'sold-out') {
    return (
      <div className="glass-panel feedback-screen">
        <div className="icon-wrapper icon-error" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245,158,11,0.2)' }}>
          <Package size={40} />
        </div>
        <h2 style={{ marginBottom: '16px', fontSize: '1.8rem', fontWeight: 700 }}>Sold Out!</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '32px' }}>
          We are sorry! All available units of the limited edition smartphone have been claimed. The sale is officially sold out.
        </p>
        <button className="btn-primary" onClick={onReset}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (purchaseState === 'error') {
    return (
      <div className="glass-panel feedback-screen">
        <div className="icon-wrapper icon-error">
          <XCircle size={40} />
        </div>
        <h2 style={{ marginBottom: '16px', fontSize: '1.8rem', fontWeight: 700 }}>Transaction Error</h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '32px' }}>
          {purchaseError}
        </p>
        <button className="btn-primary" onClick={onReset}>
          Try Again
        </button>
      </div>
    );
  }

  return null;
}
