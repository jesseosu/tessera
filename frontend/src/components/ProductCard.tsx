import { Link } from 'react-router-dom';

type Props = {
  p: any;
  onAdd?: (id: string) => void;
};

export default function ProductCard({ p, onAdd }: Props) {
  const inStock = p.stock > 0;

  return (
    <div className="card product-card">
      <img
        src={p.image || `https://via.placeholder.com/300x200/232f3e/ff9900?text=${encodeURIComponent(p.title?.slice(0, 12) ?? 'Product')}`}
        alt={p.title}
        loading="lazy"
      />
      <div className="product-info">
        <div className="product-title">{p.title}</div>
        {p.category && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>
            {p.category}
          </div>
        )}
        <div className="product-price">${Number(p.price).toFixed(2)}</div>
        <div className={`product-stock ${inStock ? 'in-stock' : ''}`}>
          {inStock ? `In stock (${p.stock})` : 'Out of stock'}
        </div>
        <div className="product-actions">
          <Link to={`/product/${p.id}`} className="btn btn-sm">
            View Details
          </Link>
          {onAdd && inStock && (
            <button className="btn btn-primary btn-sm" onClick={() => onAdd(p.id)}>
              Add to Cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
