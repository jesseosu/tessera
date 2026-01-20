import Guard from '../components/Guard';
import Loading from '../components/Loading';
import { api } from '../api';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Orders() {
  return <Guard>{(jwt) => <OrdersContent jwt={jwt} />}</Guard>;
}

function OrdersContent({ jwt }: { jwt: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listOrders(jwt)
      .then((res) => setOrders(res.orders ?? []))
      .finally(() => setLoading(false));
  }, [jwt]);

  if (loading) return <Loading message="Loading orders..." />;

  return (
    <div>
      <div className="page-header">
        <h1>Order History</h1>
        <p>{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <p>No orders yet.</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="card">
          {orders.map((order: any) => (
            <div key={order.id} className="order-row">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Order #{order.id.slice(0, 8)}...
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  {new Date(order.createdAt).toLocaleDateString()} — {order.itemCount} item
                  {order.itemCount !== 1 ? 's' : ''}
                </div>
              </div>
              <span
                className={`status-badge ${(order.status ?? 'pending').toLowerCase()}`}
              >
                {order.status ?? 'PENDING'}
              </span>
              <div style={{ fontWeight: 700, minWidth: 80, textAlign: 'right' }}>
                ${Number(order.total).toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
