import { ShoppingBag } from 'lucide-react';
import { SaleStatusResponse } from '../types';

interface HeaderProps {
  status: SaleStatusResponse;
}

export function Header({ status }: HeaderProps) {
  return (
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
  );
}
