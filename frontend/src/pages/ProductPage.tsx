import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api';
import Guard from '../components/Guard';
import Loading from '../components/Loading';
import ProductCard from '../components/ProductCard';
import { showToast } from '../components/Toast';

export default function ProductPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getProduct(id)
      .then(setProduct)
      .finally(() => setLoading(false));

    api.getRecommendations(id)
      .then((res) => setRecommendations(res.recommendations ?? []))
      .catch(() => {});

    api.analytics({ type: 'view', payload: { page: 'product', productId: id } });
  }, [id]);

  if (loading) return <Loading message="Loading product..." />;
  if (!product) return <div className="error-boundary"><h2>Product not found</h2></div>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div>
          <img
            src={product.image || `https://via.placeholder.com/600x400/232f3e/ff9900?text=${encodeURIComponent(product.title?.slice(0, 16))}`}
            alt={product.title}
            style={{ width: '100%', borderRadius: 'var(--radius)' }}
          />
        </div>
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: 8 }}>{product.title}</h1>
          {product.category && (
            <div style={{ color: 'var(--color-text-muted)', marginBottom: 12, fontSize: '0.9rem' }}>
              Category: {product.category}
            </div>
          )}
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-warning)', marginBottom: 16 }}>
            ${Number(product.price).toFixed(2)}
          </div>
          {product.description && (
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
              {product.description}
            </p>
          )}
          <div className={`product-stock ${product.stock > 0 ? 'in-stock' : ''}`} style={{ marginBottom: 24 }}>
            {product.stock > 0 ? `In stock (${product.stock} available)` : 'Out of stock'}
          </div>

          <Guard>
            {(jwt) => (
              <button
                className="btn btn-primary"
                disabled={adding || product.stock === 0}
                onClick={async () => {
                  setAdding(true);
                  try {
                    await api.addToCart(jwt, product.id, 1);
                    showToast('Added to cart', 'success');
                    api.analytics({ type: 'add_to_cart', payload: { productId: product.id } });
                  } catch (e: any) {
                    showToast(e.message, 'error');
                  } finally {
                    setAdding(false);
                  }
                }}
              >
                {adding ? 'Adding...' : 'Add to Cart'}
              </button>
            )}
          </Guard>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div style={{ marginTop: 48 }}>
          <h2 style={{ marginBottom: 16 }}>You might also like</h2>
          <div className="product-grid">
            {recommendations.map((r: any) => (
              <ProductCard key={r.id} p={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
