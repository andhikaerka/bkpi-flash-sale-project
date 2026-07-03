import { Timer, Package } from 'lucide-react';
import { SaleStatusResponse } from '../types';
import { useCountdown } from '../hooks/useCountdown';

interface ProductInfoProps {
  status: SaleStatusResponse;
}

// Helper formatting dates
const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export function ProductInfo({ status }: ProductInfoProps) {
  const timeLeft = useCountdown(status);
  
  const { remainingStock, startTime, endTime } = status;
  const initialStock = 100; // matching backend code value
  const stockPercentage = Math.max(0, (remainingStock / initialStock) * 100);

  return (
    <div style={{ marginBottom: '24px', textAlign: 'left' }}>
      <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '8px' }}>PlayStation 5 – 30th Anniversary Edition</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', margin: '0 0 16px' }}>
        This highly collectible console pays ultimate homage to gaming history by sporting the iconic retro grey color scheme of the original 1994 PlayStation (PS1).
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
  );
}
