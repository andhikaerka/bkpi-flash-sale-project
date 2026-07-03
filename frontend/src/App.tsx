import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  CheckCircle2, 
  XCircle, 
  Timer, 
  User, 
  Package, 
  Search, 
  ShieldCheck, 
  AlertTriangle,
  Settings
} from 'lucide-react';

const API_BASE = 'http://localhost:3000';

interface SaleStatusResponse {
  status: 'upcoming' | 'active' | 'ended';
  productId: string;
  remainingStock: number;
  startTime: string;
  endTime: string;
}

export default function App() {
  const [status, setStatus] = useState<SaleStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);

  // Purchase States
  const [userId, setUserId] = useState('');
  const [purchaseState, setPurchaseState] = useState<'idle' | 'submitting' | 'success' | 'error' | 'already-purchased' | 'sold-out'>('idle');
  const [purchaseError, setPurchaseError] = useState('');

  // Status check states
  const [searchUserId, setSearchUserId] = useState('');
  const [checkResult, setCheckResult] = useState<'not-checked' | 'secured' | 'not-secured' | 'checking'>('not-checked');

  // Admin states
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminStartTime, setAdminStartTime] = useState('');
  const [adminEndTime, setAdminEndTime] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState({ type: '', text: '' });

  // Countdown Timer state
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!status) return;

    let targetTime = 0;
    if (status.status === 'upcoming') {
      targetTime = new Date(status.startTime).getTime();
    } else if (status.status === 'active') {
      targetTime = new Date(status.endTime).getTime();
    }

    if (!targetTime) {
      setTimeLeft(null);
      return;
    }

    const updateTime = () => {
      const now = new Date().getTime();
      const distance = targetTime - now;

      if (distance <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
      } else {
        const hours = Math.floor(distance / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds });
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Auto-dismiss verify alert after 3 seconds
  useEffect(() => {
    if (checkResult === 'secured' || checkResult === 'not-secured') {
      const timer = setTimeout(() => setCheckResult('not-checked'), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [checkResult]);

  // Short polling for sale status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/flash-sale/status`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data: SaleStatusResponse = await res.json();
        setStatus(data);
        setStatusError(false);
      } catch (err) {
        console.error('Error fetching sale status:', err);
        setStatusError(true);
      } finally {
        setStatusLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !status) return;

    setPurchaseState('submitting');
    setPurchaseError('');

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
        setPurchaseState('success');
      } else {
        if (data.error === 'You have already purchased this item') {
          setPurchaseState('already-purchased');
        } else if (data.error === 'Product is sold out') {
          setPurchaseState('sold-out');
        } else {
          setPurchaseState('error');
          setPurchaseError(data.error || 'Something went wrong');
        }
      }
    } catch (err) {
      setPurchaseState('error');
      setPurchaseError('Failed to connect to the backend server');
    }
  };

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

  const handleAdminToggle = () => {
    if (!showAdmin && status) {
      const start = new Date(status.startTime);
      const end = new Date(status.endTime);
      start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
      end.setMinutes(end.getMinutes() - end.getTimezoneOffset());
      setAdminStartTime(start.toISOString().slice(0, 16));
      setAdminEndTime(end.toISOString().slice(0, 16));
      setAdminMessage({ type: '', text: '' });
    }
    setShowAdmin(!showAdmin);
  };

  const handleAdminSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSaving(true);
    setAdminMessage({ type: '', text: '' });

    try {
      const res = await fetch(`${API_BASE}/flash-sale/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: new Date(adminStartTime).toISOString(),
          endTime: new Date(adminEndTime).toISOString()
        })
      });
      const data = await res.json();
      if (res.ok) {
        setAdminMessage({ type: 'success', text: 'Configuration saved!' });
        setStatus(prev => prev ? { ...prev, startTime: data.startTime, endTime: data.endTime } : null);
      } else {
        setAdminMessage({ type: 'error', text: data.error || 'Failed to save' });
      }
    } catch (err) {
      setAdminMessage({ type: 'error', text: 'Connection error' });
    } finally {
      setAdminSaving(false);
    }
  };

  // Helper formatting dates
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (statusLoading) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 40px' }}>
        <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
        <h3 style={{ fontWeight: 400, opacity: 0.8 }}>Loading sale parameters...</h3>
      </div>
    );
  }

  if (statusError || !status) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '50px 40px' }}>
        <div className="icon-wrapper icon-error">
          <AlertTriangle size={36} />
        </div>
        <h2 style={{ marginBottom: '12px' }}>Database Connection Error</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '24px', fontSize: '0.95rem' }}>
          Unable to establish connection to the backend API services. Please verify that your docker containers are running properly.
        </p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Retry Connection
        </button>
      </div>
    );
  }

  const { remainingStock, startTime, endTime } = status;
  const initialStock = 100; // matching backend code value
  const stockPercentage = Math.max(0, (remainingStock / initialStock) * 100);

  // Render different flows
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
        <button className="btn-primary" onClick={() => { setPurchaseState('idle'); setUserId(''); }}>
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
        <button className="btn-primary" onClick={() => setPurchaseState('idle')}>
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
        <button className="btn-primary" onClick={() => setPurchaseState('idle')}>
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
        <button className="btn-primary" onClick={() => setPurchaseState('idle')}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: '480px' }}>
      <div className="glass-panel">
        
        {/* Header and status badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingBag style={{ color: '#6366f1' }} size={24} />
            <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.05em', fontFamily: 'Outfit' }}>FLASH SALE</span>
          </div>
          <div>
            {status.status === 'upcoming' && (
              <span className="badge badge-upcoming">Upcoming</span>
            )}
            {status.status === 'active' && (
              <span className="badge badge-active">Active</span>
            )}
            {status.status === 'ended' && (
              <span className="badge badge-ended">Ended</span>
            )}
          </div>
        </div>

        {/* Product Information */}
        <div style={{ marginBottom: '24px', textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '8px' }}>Limited Smartphone</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', margin: '0 0 16px' }}>
            Flagship processing speed, ultra-premium screen, limited availability.
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '6px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Package size={14} /> Stock Left:</span>
            <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{remainingStock} / {initialStock}</span>
          </div>

          {/* Stock bar progress */}
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden', marginBottom: '20px' }}>
            <div 
              style={{ 
                width: `${stockPercentage}%`, 
                height: '100%', 
                background: status.status === 'active' && remainingStock > 0 
                  ? 'linear-gradient(90deg, #6366f1, #06b6d4)' 
                  : 'rgba(255,255,255,0.2)',
                borderRadius: '4px',
                transition: 'width 0.4s ease-out'
              }}
            ></div>
          </div>

          {/* Timing details */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
            <Timer size={20} style={{ color: '#06b6d4' }} />
            <div>
              {status.status === 'upcoming' && (
                timeLeft ? (
                  <span>Starts in <strong style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: '1.05rem', letterSpacing: '1px' }}>{String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}</strong></span>
                ) : (
                  <span>Starts at <strong style={{ color: '#ffffff' }}>{formatDate(startTime)}</strong></span>
                )
              )}
              {status.status === 'active' && (
                timeLeft ? (
                  <span>Ends in <strong style={{ color: '#facc15', fontFamily: 'monospace', fontSize: '1.05rem', letterSpacing: '1px' }}>{String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}</strong></span>
                ) : (
                  <span>Ends at <strong style={{ color: '#ffffff' }}>{formatDate(endTime)}</strong></span>
                )
              )}
              {status.status === 'ended' && (
                <span>Sale concluded at <strong style={{ color: '#ffffff' }}>{formatDate(endTime)}</strong></span>
              )}
            </div>
          </div>
        </div>

        {/* Purchase form */}
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
              disabled={status.status !== 'active' || remainingStock === 0 || purchaseState === 'submitting'}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={status.status !== 'active' || remainingStock === 0 || purchaseState === 'submitting'}
          >
            {purchaseState === 'submitting' ? (
              <>
                <div className="spinner"></div>
                Securing Item...
              </>
            ) : status.status === 'upcoming' ? (
              'Sale Upcoming'
            ) : remainingStock === 0 || status.status === 'ended' ? (
              'Sold Out / Sale Ended'
            ) : (
              'Buy Now'
            )}
          </button>
        </form>
      </div>

      {/* Query verification area */}
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

      {/* Admin Panel Toggle */}
      <div style={{ textAlign: 'center' }}>
        <button 
          onClick={handleAdminToggle}
          style={{ 
            background: '#eab308', 
            color: '#111827', 
            border: 'none', 
            borderRadius: '8px', 
            padding: '8px 16px', 
            cursor: 'pointer', 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px', 
            fontSize: '0.9rem',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(234, 179, 8, 0.3)',
            transition: 'all 0.2s ease'
          }}
        >
          <Settings size={16} /> {showAdmin ? 'Close Admin Panel' : 'Admin Panel'}
        </button>
      </div>

      {/* Admin Panel */}
      {showAdmin && (
        <div className="glass-panel" style={{ padding: '24px 30px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Settings size={18} style={{ color: '#f43f5e' }} />
            Configure Flash Sale
          </h3>
          {adminMessage.text && (
            <p style={{ marginBottom: '16px', fontSize: '0.85rem', color: adminMessage.type === 'success' ? '#34d399' : '#f87171' }}>
              {adminMessage.text}
            </p>
          )}
          <form onSubmit={handleAdminSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="input-group">
              <label className="input-label" style={{ display: 'block', marginBottom: '6px' }}>Start Time</label>
              <input
                type="datetime-local"
                className="input-field"
                value={adminStartTime}
                onChange={(e) => setAdminStartTime(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label className="input-label" style={{ display: 'block', marginBottom: '6px' }}>End Time</label>
              <input
                type="datetime-local"
                className="input-field"
                value={adminEndTime}
                onChange={(e) => setAdminEndTime(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={adminSaving} style={{ background: '#f43f5e' }}>
              {adminSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
