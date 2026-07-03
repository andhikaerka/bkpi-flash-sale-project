import React, { useState } from 'react';
import { User } from 'lucide-react';
import { SaleStatusResponse, PurchaseState } from '../types';
import { API_BASE } from '../hooks/useFlashSale';

interface PurchaseFormProps {
  status: SaleStatusResponse;
  onPurchaseStateChange: (state: PurchaseState) => void;
  onPurchaseError: (error: string) => void;
  onUserIdSet: (userId: string) => void;
}

export function PurchaseForm({ status, onPurchaseStateChange, onPurchaseError, onUserIdSet }: PurchaseFormProps) {
  const [userId, setUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !status) return;

    setIsSubmitting(true);
    onPurchaseStateChange('submitting');
    onPurchaseError('');
    onUserIdSet(userId.trim());

    try {
      const res = await fetch(`${API_BASE}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId.trim(),
          productId: status.productId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        onPurchaseStateChange('success');
      } else {
        if (data.error === 'You have already purchased this item') {
          onPurchaseStateChange('already-purchased');
        } else if (data.error === 'Product is sold out') {
          onPurchaseStateChange('sold-out');
        } else {
          onPurchaseStateChange('error');
          onPurchaseError(data.error || 'Something went wrong');
        }
      }
    } catch (err) {
      onPurchaseStateChange('error');
      onPurchaseError('Failed to connect to the backend server');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handlePurchase}>
      <div className="input-group">
        <label className="input-label" htmlFor="userIdInput">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><User size={14} /> Enter Username or Email</span>
        </label>
        <input
          id="userIdInput"
          type="text"
          className="input-field"
          placeholder="e.g. janesmith@gmail.com"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={status.status !== 'active' || status.remainingStock === 0 || isSubmitting}
          required
        />
      </div>

      <button
        type="submit"
        className="btn-primary"
        disabled={status.status !== 'active' || status.remainingStock === 0 || isSubmitting}
      >
        {isSubmitting ? (
          <>
            <div className="spinner"></div>
            Securing Item...
          </>
        ) : status.status === 'upcoming' ? (
          'Sale Upcoming'
        ) : status.remainingStock === 0 || status.status === 'ended' ? (
          'Sold Out / Sale Ended'
        ) : (
          'Buy Now'
        )}
      </button>
    </form>
  );
}
