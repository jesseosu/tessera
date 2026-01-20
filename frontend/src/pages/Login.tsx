import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, userPool } from '../auth';
import { showToast } from '../components/Toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      showToast('Signed in successfully', 'success');
      navigate('/');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    userPool.signUp(email, password, [], [], (err) => {
      setLoading(false);
      if (err) {
        showToast(err.message, 'error');
      } else {
        showToast('Account created! Check your email for verification.', 'success');
        setIsSignUp(false);
      }
    });
  };

  return (
    <div className="card form-card">
      <h2 style={{ marginBottom: 24 }}>{isSignUp ? 'Create Account' : 'Sign In'}</h2>
      <form onSubmit={isSignUp ? handleSignUp : handleLogin}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            required
            minLength={8}
          />
        </div>
        <button className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
        </button>
      </form>
      <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
        {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setIsSignUp(!isSignUp);
          }}
          style={{ color: 'var(--color-accent)' }}
        >
          {isSignUp ? 'Sign In' : 'Create one'}
        </a>
      </p>
    </div>
  );
}
