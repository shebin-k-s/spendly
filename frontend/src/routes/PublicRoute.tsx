import { Navigate } from 'react-router-dom';

export default function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('accessToken');
  if (token) return <Navigate to="/" replace />;
  return <>{children}</>;
}
