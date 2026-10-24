import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { AdvancedModulePage } from './pages/AdvancedModules';

function isAdminRole() {
  const role = (sessionStorage.getItem('sentinelaRole') ?? '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  return ['admin', 'administrador', 'administrator', 'superadmin', 'super_admin'].includes(role);
}
function AdminOnly() {
  return isAdminRole() ? <PlaceholderPage page="safety-engine" /> : <Navigate to="/app/dashboard" replace />;
}
function AdminAdvanced({ page }: { page: string }) {
  return isAdminRole() ? <AdvancedModulePage page={page} /> : <Navigate to="/app/dashboard" replace />;
}
const advancedRoutes = [
  'agenda-medica','disponibilidade','recepcao','fila-chamada','transferencias','mapa-leitos','internacoes','alta-hospitalar',
  'evolucao-medica','evolucao-enfermagem','plano-cuidados','sinais-vitais','prescricao-eletronica-avancada','administracao-medicamentos',
  'incidentes','protocolos-clinicos','alergias','exames-laboratoriais','resultados-laboratoriais','exames-imagem','cardiologia',
  'farmacia-clinica','controlados','movimentacao-estoque','validade-perdas','solicitacao-compras','faturamento-sus','producao-sus',
  'faturamento-dashboard','glosas','relatorios-producao','profissionais','escalas','troca-plantao','frequencia','notificacao-incidente',
  'indicadores-qualidade','dashboard-gerencial','ccih-infeccao','lgpd-consentimentos','trilha-auditoria','notificacoes','comunicados',
  'encaminhamentos','portal-paciente','configuracao-protocolos','config-safety','parametros-unidade','modulos','gestao-usuarios',
  'gestao-perfis','unidades-setores','acesso-unidade'
];
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
      {advancedRoutes.map(path => <Route key={path} path={path} element={['config-safety','gestao-usuarios','gestao-perfis','unidades-setores','acesso-unidade','parametros-unidade','modulos'].includes(path) ? <AdminAdvanced page={path} /> : <AdvancedModulePage page={path} />} />)}
      <Route path="safety-engine" element={<AdminOnly />} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}
