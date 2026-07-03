import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, CheckCircle2, XCircle } from 'lucide-react';
import { CheckResult } from '../types';
import { API_BASE } from '../hooks/useFlashSale';

export function VerificationPanel() {
  const [searchUserId, setSearchUserId] = useState('');
  const [checkResult, setCheckResult] = useState<CheckResult>('not-checked');

  // Auto-dismiss verify alert after 3 seconds
  useEffect(() => {
    if (checkResult === 'secured' || checkResult === 'not-secured') {
      const timer = setTimeout(() => setCheckResult('not-checked'), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [checkResult]);

  const handleCheckPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchUserId.trim()) return;

    setCheckResult('checking');
    try {
      const res = await fetch(`${API_BASE}/purchase/${searchUserId.trim()}`);
      if (!res.ok) throw new Error('Check failed');
      const data = await res.json();
      if (data.hasSecuredItem) {
        setCheckResult('secured');
      } else {
        setCheckResult('not-secured');
      }
    } catch (err) {
      setCheckResult('not-checked');
      alert('Could not verify status. Make sure the backend server is running.');
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px 30px' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <ShieldCheck size={18} style={{ color: '#10b981' }} />
        Verify Order Status
      </h3>

      <form onSubmit={handleCheckPurchase} style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            className="input-field"
            style={{ padding: '10px 12px', fontSize: '0.85rem' }}
            placeholder="Enter User ID to verify"
            value={searchUserId}
            onChange={(e) => setSearchUserId(e.target.value)}
            required
          />
        </div>
        <button 
          type="submit" 
          className="btn-primary" 
          style={{ margin: 0, padding: '10px 16px', width: 'auto', background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: 'none' }}
          disabled={checkResult === 'checking'}
        >
          <Search size={16} />
        </button>
      </form>

      {checkResult === 'checking' && (
        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px', textAlign: 'left' }}>Checking registration database...</p>
      )}

      {checkResult === 'secured' && (
        <div style={{ marginTop: '12px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#34d399', textAlign: 'left' }}>
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>Success! Order confirmed for <strong>{searchUserId}</strong>.</span>
          <button
            onClick={() => setCheckResult('not-checked')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#34d399', opacity: 0.7, padding: '0 2px', lineHeight: 1, fontSize: '1rem', flexShrink: 0 }}
            aria-label="Close"
          >✕</button>
        </div>
      )}

      {checkResult === 'not-secured' && (
        <div style={{ marginTop: '12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239,68,68,0.2)', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#f87171', textAlign: 'left' }}>
          <XCircle size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>No order details found for user <strong>{searchUserId}</strong>.</span>
          <button
            onClick={() => setCheckResult('not-checked')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', opacity: 0.7, padding: '0 2px', lineHeight: 1, fontSize: '1rem', flexShrink: 0 }}
            aria-label="Close"
          >✕</button>
        </div>
      )}
    </div>
  );
}
