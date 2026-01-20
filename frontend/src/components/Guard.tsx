import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { currentSessionJwt } from '../auth';
import Loading from './Loading';

export default function Guard({ children }: { children: (jwt: string) => JSX.Element }) {
  const [jwt, setJwt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    currentSessionJwt().then((token) => setJwt(token ?? null));
  }, []);

  if (jwt === undefined) return <Loading message="Checking session..." />;

  if (!jwt) {
    return (
      <div className="empty-state">
        <p>Please sign in to access this page.</p>
        <Link to="/login" className="btn btn-primary" style={{ marginTop: 16 }}>
          Sign In
        </Link>
      </div>
    );
  }

  return children(jwt);
}
