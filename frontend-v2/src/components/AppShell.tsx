import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Bell, Boxes, CalendarDays, ChevronDown, ChevronLeft,
  ChevronRight, ClipboardCheck, ClipboardList, FileBarChart, FileText, HeartPulse,
  LayoutDashboard, LogOut, Menu, Moon, Pill, Search, Settings, ShieldCheck,
  Stethoscope, Sun, Users, X, BedDouble, Building2, UserCog, BellRing,
  PackageSearch, BrainCircuit
} from 'lucide-react';

type NavItem = [label: string, path: string, icon: LucideIcon];
type NavGroup = { label: string; items: NavItem[] };

const nav: NavGroup[] = [
  { label: 'Visão geral', items: [
    ['Dashboard','/app/dashboard',LayoutDashboard],
    ['Painel gerencial','/app/dashboard-gerencial',Activity],
    ['Pacientes','/app/pacientes',Users],
    ['Recepção','/app/recepcao',Users],
    ['Agenda médica','/app/agenda-medica',CalendarDays],
    ['Disponibilidade','/app/disponibilidade',CalendarDays],
  ]},
  { label: 'Fluxo do paciente', items: [
    ['Triagem','/app/triagem',Activity],
    ['Fila e chamada','/app/fila-chamada',BellRing],
    ['Consultas médicas','/app/consultas',Stethoscope],
    ['Transferências','/app/transferencias',Building2],
    ['Mapa de leitos','/app/mapa-leitos',BedDouble],
    ['Internações','/app/internacoes',Building2],
    ['Alta hospitalar','/app/alta-hospitalar',ClipboardCheck],
  ]},
  { label: 'Assistência clínica', items: [
    ['Evolução médica','/app/evolucao-medica',Stethoscope],
    ['Evolução enfermagem','/app/evolucao-enfermagem',HeartPulse],
    ['Plano de cuidados','/app/plano-cuidados',ClipboardList],
    ['Sinais vitais','/app/sinais-vitais',Activity],
    ['Prescrição eletrônica','/app/prescricao-eletronica-avancada',Pill],
    ['Administração de medicamentos','/app/administracao-medicamentos',Pill],
    ['Protocolos clínicos','/app/protocolos-clinicos',ClipboardList],
    ['Alergias','/app/alergias',HeartPulse],
    ['Exames laboratoriais','/app/exames-laboratoriais',Activity],
    ['Imagem e laudos','/app/exames-imagem',FileText],
    ['Cardiologia','/app/cardiologia',HeartPulse],
    ['Resumo clínico com IA','/app/sentinela-ai',BrainCircuit],
  ]},
  { label: 'Farmácia e suprimentos', items: [
    ['Farmácia','/app/farmacia',Pill],
    ['Farmácia clínica','/app/farmacia-clinica',Pill],
    ['Medicamentos controlados','/app/controlados',Pill],
    ['Estoque','/app/estoque',Boxes],
    ['Movimentações','/app/movimentacao-estoque',Boxes],
    ['Validade e perdas','/app/validade-perdas',PackageSearch],
    ['Solicitações de compra','/app/solicitacao-compras',ClipboardList],
  ]},
  { label: 'Faturamento SUS', items: [
    ['AIH / BPA / APAC','/app/faturamento-sus',FileText],
    ['Produção SUS','/app/producao-sus',FileText],
    ['Dashboard faturamento','/app/faturamento-dashboard',Activity],
    ['Glosas','/app/glosas',FileText],
    ['Relatórios de produção','/app/relatorios-producao',FileBarChart],
  ]},
  { label: 'Gestão de pessoas', items: [
    ['Profissionais','/app/profissionais',Users],
    ['Escalas e plantões','/app/escalas',CalendarDays],
    ['Troca de plantão','/app/troca-plantao',CalendarDays],
    ['Frequência','/app/frequencia',ClipboardList],
  ]},
  { label: 'Qualidade e segurança', items: [
    ['Incidentes','/app/incidentes',ShieldCheck],
    ['Indicadores de qualidade','/app/indicadores-qualidade',Activity],
    ['CCIH','/app/ccih-infeccao',ShieldCheck],
    ['LGPD e consentimentos','/app/lgpd-consentimentos',ShieldCheck],
    ['Trilha de auditoria','/app/trilha-auditoria',ShieldCheck],
    ['Alertas clínicos','/app/alertas',Bell],
    ['Safety Engine','/app/safety-engine',ShieldCheck],
  ]},
  { label: 'Comunicação', items: [
    ['Notificações','/app/notificacoes',Bell],
    ['Comunicados internos','/app/comunicados',BellRing],
    ['Encaminhamentos','/app/encaminhamentos',Stethoscope],
    ['Portal paciente/família','/app/portal-paciente',Users],
  ]},
  { label: 'Administração', items: [
    ['Usuários','/app/gestao-usuarios',UserCog],
    ['Perfis e permissões','/app/gestao-perfis',ShieldCheck],
    ['Unidades e setores','/app/unidades-setores',Building2],
    ['Acesso por unidade','/app/acesso-unidade',ShieldCheck],
    ['Configurar protocolos','/app/configuracao-protocolos',Settings],
    ['Configurar Safety Engine','/app/config-safety',ShieldCheck],
    ['Parâmetros por unidade','/app/parametros-unidade',Settings],
    ['Gestão de módulos','/app/modulos',Settings],
    ['Relatórios','/app/relatorios',FileBarChart],
    ['Configurações','/app/configuracoes',Settings],
  ]},
];

const adminPermissionByPath: Record<string, string> = {
  '/app/safety-engine': 'safety.configure',
  '/app/config-safety': 'safety.configure',
  '/app/gestao-usuarios': 'users.read',
  '/app/gestao-perfis': 'roles.read',
  '/app/unidades-setores': 'units.read',
  '/app/acesso-unidade': 'units.read',
  '/app/parametros-unidade': 'settings.manage',
  '/app/modulos': 'modules.manage',
  '/app/configuracao-protocolos': 'settings.manage',
  '/app/lgpd-consentimentos': 'settings.manage'
};
function readPermissions(): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem('sentinelaPermissions') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function canAccessPermission(permission?: string) {
  if (!permission) return true;
  const permissions = readPermissions();
  return permissions.includes('*') || permissions.includes(permission);
}
function canAccessAiSummary() {
  return canAccessPermission('ai.read');
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<string[]>(['Visão geral','Fluxo do paciente','Assistência clínica','Qualidade e segurança']);
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const navigate = useNavigate();
  const location = useLocation();
  const canUseAi = canAccessAiSummary();
  const visibleGroups = useMemo(() => nav.map(group => ({
    ...group,
    items: group.items.filter(([label, path]) =>
      (!adminPermissionByPath[path] || canAccessPermission(adminPermissionByPath[path])) &&
      (path !== '/app/sentinela-ai' || canUseAi) &&
      (!query || label.toLowerCase().includes(query.toLowerCase()) || group.label.toLowerCase().includes(query.toLowerCase()))
    )
  })).filter(group => group.items.length), [query]);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('sentinela-theme', next ? 'dark' : 'light');
  }

  const activeLabel = nav.flatMap(group => group.items).find(([, path]) => path === location.pathname)?.[0] ?? 'Área clínica';

  return <div className="sent-shell">
    {mobileOpen && <button aria-label="Fechar menu" className="sent-mobile-backdrop" onClick={() => setMobileOpen(false)} />}
    <aside className={`sent-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <div className="sent-brand">
        <img src="/brand/sentinela-mark.svg" alt="" className="sent-brand-mark" />
        {!collapsed && <div className="min-w-0"><div className="sent-brand-name">SENTINELA</div><div className="sent-brand-caption">Plataforma assistencial</div></div>}
        <button className="sent-icon-button sent-mobile-close" aria-label="Fechar menu" onClick={() => setMobileOpen(false)}><X size={19}/></button>
      </div>
      <div className="sent-workspace">
        <span className="sent-workspace-dot" />
        {!collapsed && <div><strong>Ambiente clínico</strong><small>Unidade operacional</small></div>}
      </div>
      {!collapsed && <label className="sent-nav-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar módulo..." aria-label="Buscar módulo" />{query && <button onClick={() => setQuery('')} aria-label="Limpar busca"><X size={14}/></button>}</label>}
      <nav className="sent-navigation" aria-label="Navegação principal">
        {visibleGroups.map(group => {
          const expanded = !!query || openGroups.includes(group.label);
          return <section className="sent-nav-group" key={group.label}>
            {!collapsed && <button className="sent-nav-heading" onClick={() => setOpenGroups(current => expanded ? current.filter(item => item !== group.label) : [...current, group.label])} aria-expanded={expanded}>
              <span>{group.label}</span><ChevronDown size={14} className={expanded ? '' : '-rotate-90'}/>
            </button>}
            {(expanded || collapsed || query) && <div className="sent-nav-items">{group.items.map(([label, to, Icon]) =>
              <NavLink key={to} to={to} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)}
                className={({isActive}) => `sent-nav-link ${isActive ? 'is-active' : ''}`}>
                <Icon size={17} strokeWidth={1.8}/>{!collapsed && <span>{label}</span>}
              </NavLink>
            )}</div>}
          </section>;
        })}
        {query && visibleGroups.length === 0 && <p className="sent-empty-search">Nenhum módulo encontrado.</p>}
      </nav>
      <div className="sent-sidebar-footer">
        <button className="sent-footer-action sent-collapse-button" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          {collapsed ? <ChevronRight size={17}/> : <><ChevronLeft size={17}/> Recolher menu</>}
        </button>
        <button className="sent-footer-action" onClick={() => navigate('/login')}><LogOut size={17}/>{!collapsed && 'Sair do sistema'}</button>
      </div>
    </aside>

    <div className={`sent-main ${collapsed ? 'is-collapsed' : ''}`}>
      <header className="sent-topbar">
        <button className="sent-icon-button sent-mobile-menu" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu size={21}/></button>
        <div className="sent-topbar-context"><span className="sent-context-kicker">SENTINELA / OPERAÇÕES</span><strong>{activeLabel}</strong></div>
        <div className="sent-topbar-actions">
          <button className="sent-icon-button sent-notification" aria-label="Notificações" onClick={() => navigate('/app/notificacoes')}><Bell size={19}/><i/></button>
          <button className="sent-icon-button" onClick={toggleDark} aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
          <div className="sent-user-chip"><span className="sent-user-avatar">{(sessionStorage.getItem('sentinelaNome') || 'P').trim().charAt(0).toUpperCase()}</span><div><strong>{sessionStorage.getItem('sentinelaNome') || 'Profissional'}</strong><small>{(sessionStorage.getItem('sentinelaRole') || '').toLowerCase() === 'admin' ? 'Administrador' : 'Acesso profissional'}</small></div></div>
        </div>
      </header>
      <main className="sent-content"><div className="sent-breadcrumb"><span>Sentinela</span><ChevronRight size={13}/><span>Área clínica</span><ChevronRight size={13}/><strong>{activeLabel}</strong></div><Outlet/></main>
      <footer className="sent-footer"><span>Sentinela · Plataforma assistencial</span><span>Ambiente de trabalho</span></footer>
    </div>
  </div>;
}
