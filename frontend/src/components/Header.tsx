import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Header() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <header className="app-header">
      <Link to="/" className="logo">
        Cloud<span>Shop</span>
      </Link>
      <nav>
        <Link to="/">Products</Link>
        <Link to="/orders">Orders</Link>
      </nav>
      <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 400, margin: '0 24px' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="text"
            placeholder="Search products..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 'var(--radius)',
              border: 'none',
              fontSize: '0.9rem',
            }}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
          >
            Search
          </button>
        </div>
      </form>
      <div className="header-right">
        <Link to="/cart">Cart</Link>
        <Link to="/profile">Profile</Link>
        <Link to="/login">Sign In</Link>
      </div>
    </header>
  );
}
