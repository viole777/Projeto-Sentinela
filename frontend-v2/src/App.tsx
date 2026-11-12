import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { AdvancedModulePage } from './pages/AdvancedModules';
import { SentinelaAiPage } from './pages/SentinelaAi';
import { ReceptionWorkspace, TriageWorkspace, ConsultationWorkspace } from './pages/OperationalWorkspaces';
import { PERMISSION_BY_PATH, canAccessPermission } from './access';

function Protected({ path, children }: { path: string; children: JSX.Element }) {
  const permission = PERMISSION_BY_PATH[path];
  return canAccessPermission(permission) ? children : <Navigate to="/app/dashboard" replace />;
}
function AdminAdvanced({ page }: { page: string }) {
  if (page === 'config-safety') return <PlaceholderPage page="safety-engine" />;
  return <AdvancedModulePage page={page} />;
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
const adminPages = new Set(['config-safety','gestao-usuarios','gestao-perfis','unidades-setores','acesso-unidade','parametros-unidade','modulos','configuracao-protocolos','lgpd-consentimentos']);
export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/primeiro-acesso" element={<Login mode="first" />} />
    <Route path="/recuperar-senha" element={<Login mode="recover" />} />
    <Route path="/app" element={<AppShell />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Protected path="/app/dashboard"><Dashboard /></Protected>} />
      <Route path="sentinela-ai" element={<Protected path="/app/sentinela-ai"><SentinelaAiPage /></Protected>} />
      <Route path="pacientes" element={<Protected path="/app/pacientes"><PlaceholderPage page="pacientes" /></Protected>} />
      <Route path="triagem" element={<Protected path="/app/triagem"><TriageWorkspace /></Protected>} />
      <Route path="consultas" element={<Protected path="/app/consultas"><ConsultationWorkspace /></Protected>} />
      <Route path="recepcao" element={<Protected path="/app/recepcao"><ReceptionWorkspace /></Protected>} />
      {['farmacia','estoque','alertas','relatorios','configuracoes'].map(path =>
        <Route key={path} path={path} element={<Protected path={`/app/${path}`}><PlaceholderPage page={path} /></Protected>} />
      )}
      {advancedRoutes.map(path => {
        const routePath = `/app/${path}`;
        const page = adminPages.has(path) ? <AdminAdvanced page={path} /> : <AdvancedModulePage page={path} />;
        return <Route key={path} path={path} element={<Protected path={routePath}>{page}</Protected>} />;
      })}
      <Route path="safety-engine" element={<Protected path="/app/safety-engine"><PlaceholderPage page="safety-engine" /></Protected>} />
      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>;
}
