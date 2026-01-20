import { useEffect, useState } from 'react';
import { api } from '../api';
import { currentSessionJwt } from '../auth';
import ProductCard from '../components/ProductCard';
import Loading from '../components/Loading';
import { showToast } from '../components/Toast';

export default function Home() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listProducts()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    api.analytics({ type: 'view', payload: { page: 'home' } });
  }, []);

  const handleAdd = async (id: string) => {
    const jwt = await currentSessionJwt();
    if (!jwt) {
      showToast('Please sign in to add items to your cart', 'error');
      return;
    }
    try {
      await api.addToCart(jwt, id, 1);
      showToast('Added to cart', 'success');
      api.analytics({ type: 'add_to_cart', payload: { productId: id } });
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  if (loading) return <Loading message="Loading products..." />;
  if (error) return <div className="error-boundary"><h2>Failed to load products</h2><p>{error}</p></div>;

  const items = data?.items ?? data ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>All Products</h1>
        <p>{items.length} product{items.length !== 1 ? 's' : ''} available</p>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          <p>No products yet. Products will appear here once they're added.</p>
        </div>
      ) : (
        <div className="product-grid">
          {items.map((p: any) => (
            <ProductCard key={p.id} p={p} onAdd={handleAdd} />
          ))}
        </div>
      )}
    </div>
  );
}
