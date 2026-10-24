import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PlaceholderPage } from './pages/PlaceholderPage';

function isAdminRole() {
  const role = (sessionStorage.getItem('sentinelaRole') ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return ['admin', 'administrador', 'administrator', 'superadmin', 'super_admin'].includes(role);
}
function AdminOnly() {
  return isAdminRole() ? <PlaceholderPage page="safety-engine" /> : <Navigate to="/app/dashboard" replace />;
}
export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/primeiro-acesso" element={<Login mode="first" />} />
    <Route path="/recuperar-senha" element={<Login mode="recover" />} />
    <Route path="/app" element={<AppShell />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      {['pacientes', 'triagem', 'consultas', 'farmacia', 'estoque', 'alertas', 'relatorios', 'configuracoes'].map(path =>
        <Route key={path} path={path} element={<PlaceholderPage page={path} />} />
      )}
      <Route path="safety-engine" element={<AdminOnly />} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}