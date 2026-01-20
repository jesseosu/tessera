import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { currentSessionJwt } from '../auth';
import ProductCard from '../components/ProductCard';
import Loading from '../components/Loading';
import { showToast } from '../components/Toast';

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    api.search(query)
      .then(setResults)
      .catch((e) => showToast(e.message, 'error'))
      .finally(() => setLoading(false));

    api.analytics({ type: 'search', payload: { query } });
  }, [query]);

  const handleAdd = async (id: string) => {
    const jwt = await currentSessionJwt();
    if (!jwt) {
      showToast('Please sign in first', 'error');
      return;
    }
    try {
      await api.addToCart(jwt, id, 1);
      showToast('Added to cart', 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  if (!query) {
    return (
      <div className="empty-state">
        <p>Enter a search term in the search bar above.</p>
      </div>
    );
  }

  if (loading) return <Loading message={`Searching for "${query}"...`} />;

  const products = results?.products ?? [];

  return (
    <div>
      <div className="page-header">
        <h1>Search Results</h1>
        <p>
          {products.length} result{products.length !== 1 ? 's' : ''} for "{query}"
        </p>
      </div>

      {results?.suggestions && results.suggestions.length > 0 && (
        <div style={{ marginBottom: 16, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          Suggestions: {results.suggestions.join(', ')}
        </div>
      )}

      {products.length === 0 ? (
        <div className="empty-state">
          <p>No products found for "{query}".</p>
        </div>
      ) : (
        <div className="product-grid">
          {products.map((p: any) => (
            <ProductCard key={p.id} p={p} onAdd={handleAdd} />
          ))}
        </div>
      )}
    </div>
  );
}
