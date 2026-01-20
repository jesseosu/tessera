import Guard from '../components/Guard';
import Loading from '../components/Loading';
import { api } from '../api';
import { useEffect, useState } from 'react';
import { showToast } from '../components/Toast';
import { userPool } from '../auth';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  return <Guard>{(jwt) => <ProfileContent jwt={jwt} />}</Guard>;
}

function ProfileContent({ jwt }: { jwt: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.me(jwt)
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [jwt]);

  const handleSignOut = () => {
    const user = userPool.getCurrentUser();
    if (user) user.signOut();
    showToast('Signed out', 'success');
    navigate('/login');
  };

  if (loading) return <Loading message="Loading profile..." />;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="page-header">
        <h1>Your Profile</h1>
      </div>

      <div className="profile-section">
        <h3>Account Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px' }}>
          <span style={{ fontWeight: 600 }}>Email:</span>
          <span>{profile?.email ?? '—'}</span>
          <span style={{ fontWeight: 600 }}>Name:</span>
          <span>{profile?.name ?? '—'}</span>
          <span style={{ fontWeight: 600 }}>Member since:</span>
          <span>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}</span>
        </div>
      </div>

      {profile?.address && (
        <div className="profile-section">
          <h3>Shipping Address</h3>
          <p>{profile.address.line1}</p>
          {profile.address.line2 && <p>{profile.address.line2}</p>}
          <p>
            {profile.address.city}, {profile.address.state} {profile.address.postalCode}
          </p>
          <p>{profile.address.country}</p>
        </div>
      )}

      <button className="btn btn-danger" onClick={handleSignOut} style={{ marginTop: 16 }}>
        Sign Out
      </button>
    </div>
  );
}
