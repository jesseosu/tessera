import Guard from '../components/Guard';
import Loading from '../components/Loading';
import { api } from '../api';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { showToast } from '../components/Toast';

export default function Checkout() {
  return <Guard>{(jwt) => <CheckoutContent jwt={jwt} />}</Guard>;
}

function CheckoutContent({ jwt }: { jwt: string }) {
  const [cart, setCart] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);

  useEffect(() => {
    api.getCart(jwt)
      .then(setCart)
      .finally(() => setLoading(false));
  }, [jwt]);

  const handleCheckout = async () => {
    setProcessing(true);
    try {
      const result = await api.checkout(jwt);
      setOrderResult(result);
      showToast('Order placed successfully!', 'success');
      api.analytics({ type: 'purchase', payload: { orderId: result.orderId, total: result.total } });
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <Loading message="Loading checkout..." />;

  if (orderResult) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>&#10003;</div>
        <h1 style={{ color: 'var(--color-success)', marginBottom: 8 }}>Order Placed!</h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>
          Order ID: <strong>{orderResult.orderId}</strong>
        </p>
        <p style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 24 }}>
          Total: ${orderResult.total.toFixed(2)}
        </p>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 24, fontSize: '0.9rem' }}>
          Status: <span className="status-badge pending">{orderResult.status}</span>
          {' — '}Your order is being processed asynchronously via our event-driven pipeline.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to="/orders" className="btn btn-primary">View Orders</Link>
          <Link to="/" className="btn">Continue Shopping</Link>
        </div>
      </div>
    );
  }

  const items = cart?.items ?? [];
  const total = cart?.total ?? 0;

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <p>Your cart is empty. Add some products first!</p>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Browse Products</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="page-header">
        <h1>Checkout</h1>
        <p>Review your order</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        {items.map((item: any) => (
          <div key={item.productId} className="cart-item">
            <div className="item-details">
              <div className="item-title">{item.title || item.productId}</div>
              <div className="item-meta">Qty: {item.qty} x ${item.price.toFixed(2)}</div>
            </div>
            <div className="item-price">${(item.price * item.qty).toFixed(2)}</div>
          </div>
        ))}
      </div>

      <div className="cart-summary">
        <div className="total">
          <span>Order Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={handleCheckout}
          disabled={processing}
        >
          {processing ? 'Processing...' : `Place Order - $${total.toFixed(2)}`}
        </button>
        <p style={{ textAlign: 'center', marginTop: 12, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          Mock payment — orders up to $10,000 will be approved
        </p>
      </div>
    </div>
  );
}
