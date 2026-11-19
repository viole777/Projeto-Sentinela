import { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowUpRight, BedDouble, CalendarClock,
  CheckCircle2, Clock3, FileText, Pill, RefreshCw, ServerCrash, ShieldCheck, Users
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Card, PageHeader } from '../components/ui';

type DashboardData = {
  role?: string; nome?: string; backend?: string;
  cards?: Record<string, number>;
  consultasHoje?: number; triagensAbertas?: number; alertasAbertos?: number;
  criticos?: number; altos?: number; prescPendentes?: number; estoqueCritico?: number;
  internados?: number; leitosLivres?: number; ocupacao?: number; examesPendentes?: number;
  proximos?: Array<{ nome?: string; risco?: string; quando?: string; pacienteNome?: string; createdAt?: string }>;
  fila?: Array<{ nome?: string; risco?: string; quando?: string; pacienteNome?: string; createdAt?: string }>;
  alertas?: Array<{ id?: number | string; nivel?: string; regra?: string; mensagem?: string; resolvido?: boolean }>;
};
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('pt-BR') : '—';
const dateLabel = (value?: string) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const riskTone = (risk = '') => /crit|emerg/i.test(risk) ? 'danger' : /alto|urg/i.test(risk) ? 'warning' : 'neutral';

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/dashboard', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (response.status === 401) throw new Error('Sua sessão expirou. Entre novamente para consultar os dados da unidade.');
      if (!response.ok) throw new Error('O servidor não conseguiu carregar os indicadores.');
      setData(await response.json() as DashboardData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao conectar ao servidor.');
      setData(null);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const metrics = data ? [
    { label: 'Pacientes cadastrados', value: data.cards?.pacientes, detail: 'Cadastros disponíveis ao seu perfil', Icon: Users, tone: 'blue' },
    { label: 'Triagens abertas', value: data.triagensAbertas ?? data.cards?.espera, detail: 'Pessoas aguardando atendimento', Icon: Clock3, tone: 'teal' },
    { label: 'Alertas em aberto', value: data.alertasAbertos ?? data.cards?.alertas, detail: `${number(data.criticos)} críticos · ${number(data.altos)} altos`, Icon: AlertTriangle, tone: 'amber' },
    { label: 'Leitos livres', value: data.leitosLivres ?? data.cards?.leitos, detail: data.ocupacao == null ? 'Disponibilidade atual' : `${number(data.ocupacao)}% de ocupação`, Icon: BedDouble, tone: 'violet' },
  ] : [];
  const queue = data?.proximos ?? data?.fila ?? [];
  const operations: Array<{label:string;value:unknown;Icon:LucideIcon}> = [
    {label:'Consultas hoje',value:data?.consultasHoje,Icon:CalendarClock},
    {label:'Prescrições pendentes',value:data?.prescPendentes,Icon:Pill},
    {label:'Exames pendentes',value:data?.examesPendentes,Icon:FileText},
    {label:'Estoque crítico',value:data?.estoqueCritico,Icon:AlertTriangle},
    {label:'Internações ativas',value:data?.internados,Icon:Users}
  ];
  const greeting = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  return <div className="dashboard-page">
    <div className="dashboard-hero">
      <div className="dashboard-hero-copy">
        <div className="dashboard-kicker"><span className="dashboard-live-dot"/> VISÃO OPERACIONAL</div>
        <h1>{greeting}{data?.nome ? `, ${data.nome.split(' ')[0]}` : ''}.</h1>
        <p>Uma visão clara do fluxo assistencial, da unidade e dos pontos que precisam de atenção.</p>
        <div className="dashboard-hero-meta"><span><ShieldCheck size={14}/> Acesso conforme seu perfil</span><span><Activity size={14}/> {data?.backend || 'Dados do servidor'}</span></div>
      </div>
      <div className="dashboard-hero-art" aria-hidden="true">
        <div className="dashboard-orbit dashboard-orbit-one"/><div className="dashboard-orbit dashboard-orbit-two"/>
        <div className="dashboard-core"><Activity size={34}/></div>
        <span className="dashboard-orbit-node node-one"/><span className="dashboard-orbit-node node-two"/><span className="dashboard-orbit-node node-three"/>
      </div>
    </div>
    <PageHeader title="Resumo da unidade" description="Indicadores carregados diretamente do Sentinela." actions={<Button variant="secondary" onClick={() => void load()} loading={loading}><RefreshCw size={15}/> Atualizar</Button>}/>
    {error && <div role="alert" className="dashboard-error"><ServerCrash size={18}/><div><strong>Não foi possível carregar os dados reais</strong><p>{error}</p><small>Os indicadores foram ocultados para não apresentar dados fictícios.</small></div></div>}
    <div className="dashboard-metrics">
      {(loading && !data ? [0,1,2,3].map(i=>({label:'Carregando indicador',value:undefined,detail:'Consultando servidor',Icon:Activity,tone:'blue'})) : metrics).map(({label,value,detail,Icon,tone},i)=>
        <Card key={label+i} className="dashboard-metric-card">
          <div className="dashboard-metric-top"><span>{label}</span><i className={`metric-icon ${tone}`}><Icon size={19}/></i></div>
          <strong className="dashboard-metric-value">{number(value)}</strong>
          <small>{detail}</small>
        </Card>
      )}
    </div>
    <div className="dashboard-grid">
      <Card className="dashboard-section dashboard-queue">
        <div className="dashboard-section-head"><div><span className="dashboard-section-kicker">ACOMPANHAMENTO</span><h2>Fila assistencial</h2><p>Registros retornados pelo servidor conforme seu perfil.</p></div><Link to="/app/triagem" className="dashboard-text-link">Abrir triagem <ArrowUpRight size={15}/></Link></div>
        <div className="table-wrap"><table className="clinical-table"><thead><tr><th>Paciente</th><th>Prioridade</th><th>Registro</th></tr></thead><tbody>
          {queue.map((item,i)=>{const name=item.nome||item.pacienteNome||'Paciente sem nome informado';const risk=item.risco||'Não classificado';return <tr key={String(item.quando||item.createdAt||name)+i}><td><strong>{name}</strong></td><td><Badge tone={riskTone(risk)}>{risk}</Badge></td><td>{dateLabel(item.quando||item.createdAt)}</td></tr>})}
          {!loading&&queue.length===0&&<tr><td colSpan={3} className="dashboard-empty">Nenhum registro na fila.</td></tr>}
        </tbody></table></div>
      </Card>
      <div className="dashboard-side">
        <Card className="dashboard-section">
          <div className="dashboard-section-head"><div><span className="dashboard-section-kicker">ATENÇÃO</span><h2>Alertas em aberto</h2></div><AlertTriangle size={19} className="dashboard-alert-icon"/></div>
          <div className="dashboard-alert-list">{(data?.alertas||[]).slice(0,5).map((item,i)=><div key={String(item.id??i)} className="dashboard-alert-row"><span className={`dashboard-alert-dot ${/crit/i.test(item.nivel||'')?'critical':/alto/i.test(item.nivel||'')?'high':''}`}/><div><strong>{item.regra||item.mensagem||'Alerta sem descrição'}</strong><small>{item.nivel||'Em aberto'}</small></div></div>)}
          {!loading&&(data?.alertas||[]).length===0&&<p className="dashboard-empty">Nenhum alerta em aberto retornado pelo servidor.</p>}</div>
          <Link to="/app/notificacoes" className="dashboard-section-footer">Acessar notificações <ArrowUpRight size={15}/></Link>
        </Card>
        <Card className="dashboard-section dashboard-operations">
          <div className="dashboard-section-head"><div><span className="dashboard-section-kicker">ROTINA</span><h2>Resumo operacional</h2></div><CalendarClock size={19}/></div>
          <div className="dashboard-operation-list">{operations.map(({label,value,Icon})=><div key={label}><span><Icon size={15}/>{label}</span><strong>{number(value)}</strong></div>)}</div>
          <div className="dashboard-data-note"><CheckCircle2 size={14}/> Indicadores sujeitos às permissões da sessão.</div>
        </Card>
      </div>
    </div>
  </div>;
}
