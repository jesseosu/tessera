import Guard from '../components/Guard';
import Loading from '../components/Loading';
import { api } from '../api';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { showToast } from '../components/Toast';

export default function Cart() {
  return <Guard>{(jwt) => <CartContent jwt={jwt} />}</Guard>;
}

function CartContent({ jwt }: { jwt: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await api.getCart(jwt);
      setData(res);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (loading && !data) return <Loading message="Loading cart..." />;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <div className="page-header">
        <h1>Shopping Cart</h1>
        <p>{items.length} item{items.length !== 1 ? 's' : ''}</p>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>Your cart is empty.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
            Continue Shopping
          </Link>
        </div>
      ) : (
        <>
          <div className="card">
            {items.map((item: any) => (
              <div key={item.productId} className="cart-item">
                <div className="item-details">
                  <div className="item-title">
                    <Link to={`/product/${item.productId}`}>{item.title || item.productId}</Link>
                  </div>
                  <div className="item-meta">Qty: {item.qty}</div>
                </div>
                <div className="item-price">
                  ${(item.price * item.qty).toFixed(2)}
                </div>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={async () => {
                    try {
                      await api.removeFromCart(jwt, item.productId);
                      showToast('Item removed', 'success');
                      refresh();
                    } catch (e: any) {
                      showToast(e.message, 'error');
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <div className="total">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <Link
              to="/checkout"
              className="btn btn-primary"
              style={{ width: '100%', textAlign: 'center' }}
            >
              Proceed to Checkout
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
