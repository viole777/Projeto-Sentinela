import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, BedDouble, Clock3, Users, RefreshCw, ServerCrash } from 'lucide-react';
import { Link } from 'react-router-dom';
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
      const result = await response.json() as DashboardData;
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao conectar ao servidor.');
      setData(null);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const metrics = data ? [
    { label: 'Pacientes cadastrados', value: data.cards?.pacientes ?? '—', detail: 'Total disponível ao seu perfil', Icon: Users },
    { label: 'Triagens abertas', value: data.triagensAbertas ?? data.cards?.espera ?? '—', detail: 'Fila assistencial atual', Icon: Clock3 },
    { label: 'Alertas em aberto', value: data.alertasAbertos ?? data.cards?.alertas ?? '—', detail: `${number(data.criticos)} críticos · ${number(data.altos)} altos`, Icon: AlertTriangle },
    { label: 'Leitos livres', value: data.leitosLivres ?? data.cards?.leitos ?? '—', detail: data.ocupacao == null ? 'Disponibilidade atual' : `${number(data.ocupacao)}% de ocupação`, Icon: BedDouble },
  ] : [];
  const queue = data?.proximos ?? data?.fila ?? [];
  return <>
    <PageHeader title="Painel operacional" description={data ? `Indicadores atualizados pelo servidor · ${data.nome || 'profissional'}` : 'Visão operacional da unidade'} actions={<Button variant="secondary" onClick={() => void load()} loading={loading}><RefreshCw size={15}/> Atualizar</Button>}/>
    {error && <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"><ServerCrash size={18} className="mt-0.5 shrink-0"/><div><p className="font-semibold">Não foi possível carregar os dados reais</p><p className="mt-1">{error}</p><p className="mt-2 text-xs">Os indicadores foram ocultados para evitar apresentar dados fictícios como se fossem reais.</p></div></div>}
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{(loading && !data ? [0,1,2,3].map(i=>({label:'Carregando indicador',value:'…',detail:'Consultando servidor',Icon:Activity})) : metrics).map(({label,value,detail,Icon},i)=><Card key={label+i} className="p-4"><div className="flex items-start justify-between gap-3"><div className="text-xs font-medium muted">{label}</div><div className="rounded-md bg-blue-50 p-2 text-sus-900 dark:bg-slate-800 dark:text-blue-200"><Icon size={18}/></div></div><div className="mt-3 text-3xl font-bold tracking-tight">{number(value)}</div><div className="mt-2 text-xs muted">{detail}</div></Card>)}</div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_1fr]">
      <Card><div className="flex items-center justify-between border-b px-4 py-3" style={{borderColor:'var(--border)'}}><div><h2 className="text-sm font-bold">Fila assistencial</h2><p className="mt-1 text-xs muted">Registros retornados pelo servidor conforme seu perfil</p></div><Link to="/app/triagem" className="text-xs font-semibold text-sus-700 dark:text-blue-300">Abrir triagem <ArrowRight size={14} className="inline"/></Link></div>
      <div className="table-wrap"><table className="clinical-table"><thead><tr><th>Paciente</th><th>Prioridade</th><th>Registro</th></tr></thead><tbody>{queue.map((item,i)=>{const name=item.nome||item.pacienteNome||'Paciente sem nome informado';const risk=item.risco||'Não classificado';const tone=/crit|urgente/i.test(risk)?'danger':/alto|prior/i.test(risk)?'warning':'neutral';return <tr key={String(item.quando||item.createdAt||name)+i}><td><div className="font-semibold">{name}</div></td><td><Badge tone={tone}>{risk}</Badge></td><td>{dateLabel(item.quando||item.createdAt)}</td></tr>})}{!loading&&queue.length===0&&<tr><td colSpan={3} className="py-8 text-center muted">Nenhum registro na fila retornado pelo servidor.</td></tr>}</tbody></table></div><div className="border-t px-4 py-3 text-xs muted" style={{borderColor:'var(--border)'}}>A exibição respeita os dados retornados pelo backend e as permissões da sessão.</div></Card>
      <div className="space-y-4"><Card><div className="flex items-center justify-between border-b px-4 py-3" style={{borderColor:'var(--border)'}}><h2 className="text-sm font-bold">Alertas para acompanhamento</h2><AlertTriangle size={17} className="text-amber-600"/></div><div className="p-4">{(data?.alertas||[]).map((item,i)=><div key={String(item.id??i)} className="flex gap-3 border-b py-3 last:border-0" style={{borderColor:'var(--border)'}}><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${/crit/i.test(item.nivel||'')?'bg-red-600':/alto/i.test(item.nivel||'')?'bg-amber-500':'bg-slate-400'}`}/><div className="min-w-0"><div className="text-sm font-semibold">{item.regra||item.mensagem||'Alerta sem descrição'}</div><div className="mt-2"><Badge tone={/crit/i.test(item.nivel||'')?'danger':/alto/i.test(item.nivel||'')?'warning':'neutral'}>{item.nivel||'Em aberto'}</Badge></div></div></div>)}{!loading&&(data?.alertas||[]).length===0&&<p className="py-4 text-sm muted">Nenhum alerta em aberto retornado pelo servidor.</p>}</div><Link to="/app/alertas" className="flex items-center justify-between border-t px-4 py-3 text-xs font-semibold text-sus-700 dark:text-blue-300" style={{borderColor:'var(--border)'}}>Abrir central de alertas <ArrowRight size={14}/></Link></Card>
      <Card className="p-4"><div className="flex items-center gap-2"><Activity size={18} className="text-clinical-600"/><h2 className="text-sm font-bold">Resumo operacional</h2></div><div className="mt-4 space-y-3">{[['Consultas hoje',data?.consultasHoje],['Prescrições pendentes',data?.prescPendentes],['Exames pendentes',data?.examesPendentes],['Itens de estoque críticos',data?.estoqueCritico],['Internações ativas',data?.internados]].map(([label,value])=><div key={String(label)} className="flex items-center justify-between gap-3 text-sm"><span className="muted">{label}</span><span className="font-bold tabular-nums">{number(value)}</span></div>)}</div><div className="mt-4 text-[11px] leading-5 muted">Indicadores fornecidos pela API do Sentinela. A disponibilidade varia conforme as permissões do profissional.</div></Card></div>
    </div>
  </>;
}
