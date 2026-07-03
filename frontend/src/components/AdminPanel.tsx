import { useState } from 'react';
import { Settings } from 'lucide-react';
import { SaleStatusResponse, AdminMessage } from '../types';
import { API_BASE } from '../hooks/useFlashSale';

interface AdminPanelProps {
  status: SaleStatusResponse | null;
  onStatusUpdate: (newData: Partial<SaleStatusResponse>) => void;
}

export function AdminPanel({ status, onStatusUpdate }: AdminPanelProps) {
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminStartTime, setAdminStartTime] = useState('');
  const [adminEndTime, setAdminEndTime] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState<AdminMessage>({ type: '', text: '' });

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
        onStatusUpdate({ startTime: data.startTime, endTime: data.endTime });
      } else {
        setAdminMessage({ type: 'error', text: data.error || 'Failed to save' });
      }
    } catch (err) {
      setAdminMessage({ type: 'error', text: 'Connection error' });
    } finally {
      setAdminSaving(false);
    }
  };

  return (
    <>
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
    </>
  );
}
