import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useFlashSale } from './hooks/useFlashSale';
import { PurchaseState } from './types';

// Components
import { Header } from './components/Header';
import { ProductInfo } from './components/ProductInfo';
import { PurchaseForm } from './components/PurchaseForm';
import { FeedbackScreen } from './components/FeedbackScreen';
import { VerificationPanel } from './components/VerificationPanel';
import { AdminPanel } from './components/AdminPanel';

export default function App() {
  const { status, statusLoading, statusError, updateStatus } = useFlashSale();

  // Purchase Form State
  const [purchaseState, setPurchaseState] = useState<PurchaseState>('idle');
  const [purchaseError, setPurchaseError] = useState('');
  const [userId, setUserId] = useState('');

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

  if (purchaseState !== 'idle') {
    return (
      <FeedbackScreen
        purchaseState={purchaseState}
        userId={userId}
        purchaseError={purchaseError}
        onReset={() => {
          setPurchaseState('idle');
          if (purchaseState === 'success') {
            setUserId('');
          }
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: '480px' }}>
      <div className="glass-panel">
        <Header status={status} />
        
        <ProductInfo status={status} />

        <PurchaseForm 
          status={status}
          onPurchaseStateChange={setPurchaseState}
          onPurchaseError={setPurchaseError}
          onUserIdSet={setUserId}
        />
      </div>

      <VerificationPanel />

      <AdminPanel status={status} onStatusUpdate={updateStatus} />
    </div>
  );
}
