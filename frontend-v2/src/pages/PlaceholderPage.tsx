import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Plus, Filter, ChevronRight, ShieldAlert, Users, Activity, Pill, Boxes, FileBarChart, Settings, ClipboardList, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge, Button, Card, Input, PageHeader } from '../components/ui';

type Row = Record<string, unknown>;
type Config = { title: string; desc: string; action: string; Icon: typeof Users; endpoint: string };
const configs: Record<string, Config> = {
  pacientes: { title: 'Pacientes', desc: 'Consulte os cadastros retornados pelo serviço clínico autorizado.', action: 'Novo cadastro', Icon: Users, endpoint: '/pacientes' },
  triagem: { title: 'Triagem e acolhimento', desc: 'Fila de avaliação inicial e registros de sinais vitais.', action: 'Iniciar triagem', Icon: Activity, endpoint: '/triagem' },
  consultas: { title: 'Consultas médicas', desc: 'Atendimentos e registros disponíveis ao seu perfil.', action: 'Nova consulta', Icon: ClipboardList, endpoint: '/atendimentos' },
  farmacia: { title: 'Farmácia e dispensação', desc: 'Prescrições pendentes e dispensações registradas.', action: 'Registrar dispensação', Icon: Pill, endpoint: '/farmacia/prescricoes' },
  estoque: { title: 'Estoque de medicamentos', desc: 'Saldos de medicamentos e itens que exigem conferência.', action: 'Registrar entrada', Icon: Boxes, endpoint: '/estoque' },
  alertas: { title: 'Central de alertas', desc: 'Ocorrências de segurança retornadas pelo servidor.', action: 'Atualizar alertas', Icon: ShieldAlert, endpoint: '/alertas' },
  'safety-engine': { title: 'Safety Engine', desc: 'Regras de segurança. A API permite acesso e alteração somente ao perfil admin.', action: 'Salvar regras', Icon: ShieldAlert, endpoint: '/safety/regras' },
  relatorios: { title: 'Relatórios gerenciais', desc: 'Indicadores consolidados pelo backend para o perfil autorizado.', action: 'Atualizar relatório', Icon: FileBarChart, endpoint: '/relatorios' },
  configuracoes: { title: 'Configurações', desc: 'Usuários e perfis acessíveis conforme permissões da sessão.', action: 'Atualizar', Icon: Settings, endpoint: '/usuarios' },
};
const labels: Record<string, string> = {
  nome: 'Nome', pacienteNome: 'Paciente', pacienteCpf: 'CPF', cpf: 'CPF', risco: 'Risco', createdAt: 'Criado em',
  created_at: 'Criado em', status: 'Status', medicamento: 'Medicamento', quantidade: 'Quantidade', minimo: 'Mínimo',
  critico: 'Crítico', nivel: 'Nível', regra: 'Regra', resolvido: 'Resolvido', consultaId: 'Consulta', medicacao: 'Medicação',
  diagnostico: 'Diagnóstico', usuario: 'Usuário', role: 'Perfil', tipo: 'Tipo', ativo: 'Ativo', id: 'ID',
};
const humanize = (key: string) => labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
const display = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
function records(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Row => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}
export function PlaceholderPage({ page }: { page: string }) {
  const c = configs[page] || configs.pacientes;
  const [data, setData] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [stockName, setStockName] = useState('');
  const [stockQty, setStockQty] = useState('1');
  const [showStockForm, setShowStockForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const Icon = c.Icon;
  const load = useCallback(async () => {
    setLoading(true); setError(''); setNotice('');
    try {
      const response = await fetch(c.endpoint, { credentials: 'include', headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 401 ? 'Sua sessão expirou. Entre novamente.' : String(result.erro || result.error || `Falha ao consultar ${c.title.toLowerCase()} (HTTP ${response.status}).`));
      setData(result);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Não foi possível conectar ao servidor.');
    } finally { setLoading(false); }
  }, [c.endpoint, c.title]);
  useEffect(() => { void load(); }, [load]);
  const rows = useMemo(() => records(data).filter(row => Object.values(row).map(display).join(' ').toLowerCase().includes(query.toLowerCase())), [data, query]);
  const columns = useMemo(() => {
    if (!rows.length) return [];
    const preferred = page === 'pacientes' ? ['nome', 'cpf', 'telefone', 'createdAt'] :
      page === 'triagem' ? ['pacienteNome', 'risco', 'pressao', 'frequenciaCardiaca', 'createdAt'] :
      page === 'farmacia' ? ['consultaId', 'pacienteNome', 'medicacao', 'diagnostico', 'criadaEm'] :
      page === 'estoque' ? ['medicamento', 'categoria', 'quantidade', 'minimo', 'critico'] :
      page === 'alertas' ? ['id', 'nivel', 'regra', 'resolvido', 'quando'] : Object.keys(rows[0]).filter(k => !/senha|token|cpf/i.test(k));
    return [...preferred.filter(key => key in rows[0]), ...Object.keys(rows[0]).filter(key => !preferred.includes(key) && !/senha|token/i.test(key))].slice(0, 6);
  }, [rows, page]);
  async function postAction(url: string, body: Row, success: string) {
    setSaving(true); setNotice(''); setError('');
    try {
      const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(result.erro || result.error || `Ação recusada (HTTP ${response.status}).`));
      setNotice(success); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'A ação não foi concluída.'); }
    finally { setSaving(false); }
  }
  async function updateRule(key: string, value: boolean) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const next = { ...(data as Row), [key]: value };
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/safety/regras', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ [key]: value }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(result.erro || `Não foi possível salvar a regra (HTTP ${response.status}).`));
      setData(result); setNotice('Regra atualizada e confirmada pelo servidor.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar regra.'); setData(next); }
    finally { setSaving(false); }
  }
  const safetyObject = page === 'safety-engine' && data && typeof data === 'object' && !Array.isArray(data) ? data as Row : null;
  const reportObject = page === 'relatorios' && data && typeof data === 'object' && !Array.isArray(data) ? data as Row : null;
  const actionLabel = page === 'estoque' && showStockForm ? 'Cancelar' : c.action;
  return <>
    <PageHeader title={c.title} description={c.desc} actions={<Button variant="secondary" onClick={() => void load()} loading={loading}><RefreshCw size={15}/> Atualizar</Button>}/>
    {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"><AlertCircle size={17} className="mt-0.5 shrink-0"/><span>{error}</span></div>}
    {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><CheckCircle2 size={17}/>{notice}</div>}
    {page === 'estoque' && <div className="mb-4"><Button onClick={() => setShowStockForm(v => !v)}><Plus size={15}/>{actionLabel}</Button>{showStockForm && <Card className="mt-3 p-4"><form className="grid gap-3 sm:grid-cols-[1fr_160px_auto]" onSubmit={e => { e.preventDefault(); void postAction('/estoque/entrada', { medicamento: stockName, qtd: Number(stockQty) }, 'Entrada registrada no estoque.'); setStockName(''); setStockQty('1'); setShowStockForm(false); }}><label className="text-xs font-semibold muted">Medicamento<Input required value={stockName} onChange={e => setStockName(e.target.value)} placeholder="Nome do medicamento" className="mt-1"/></label><label className="text-xs font-semibold muted">Quantidade<Input required type="number" min="1" step="1" value={stockQty} onChange={e => setStockQty(e.target.value)} className="mt-1"/></label><div className="flex items-end"><Button type="submit" loading={saving}>Confirmar entrada</Button></div></form><p className="mt-2 text-xs muted">A API valida as permissões do perfil Farmácia antes de registrar.</p></Card>}</div>}
    {loading && !data && <Card className="p-10 text-center text-sm muted">Carregando dados do servidor…</Card>}
    {safetyObject && <Card className="mb-4 p-4"><div className="mb-3 text-sm font-bold">Regras de segurança</div><div className="grid gap-3 sm:grid-cols-2">{Object.entries(safetyObject).map(([key,value])=><label key={key} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm" style={{borderColor:'var(--border)'}}><span>{humanize(key)}</span><input type="checkbox" checked={Boolean(value)} disabled={saving} onChange={e => void updateRule(key,e.target.checked)} aria-label={`Ativar ${humanize(key)}`} className="h-4 w-4 accent-sus-700"/></label>)}</div><p className="mt-3 text-xs muted">As alterações são enviadas à API administrativa. A autorização definitiva é validada no backend.</p></Card>}
    {reportObject && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(reportObject).filter(([key,value])=>typeof value==='number').map(([key,value])=><Card key={key} className="p-4"><div className="text-xs muted">{humanize(key)}</div><div className="mt-2 text-2xl font-bold">{display(value)}</div></Card>)}</div>}
    <Card>
      <div className="flex items-center gap-3 border-b px-4 py-3" style={{borderColor:'var(--border)'}}><div className="rounded-md bg-blue-50 p-2 text-sus-900 dark:bg-slate-800 dark:text-blue-200"><Icon size={18}/></div><div><h2 className="text-sm font-bold">{c.title}</h2><p className="mt-1 text-xs muted">{loading ? 'Sincronizando com o servidor' : `${rows.length} registros retornados pela API`}</p></div></div>
      <div className="border-b p-3" style={{borderColor:'var(--border)'}}><div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[200px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 muted"/><Input value={query} onChange={e=>setQuery(e.target.value)} className="pl-9" placeholder="Pesquisar nos registros…"/></div><Button variant="secondary" onClick={() => setQuery('')}><Filter size={15}/> Limpar</Button></div></div>
      {page === 'alertas' && rows.length > 0 && <div className="px-4 pt-3 text-xs muted">Resolver um alerta exige permissão autorizada; a ação é validada pelo backend.</div>}
      <div className="table-wrap"><table className="clinical-table"><thead><tr>{columns.map(key=><th key={key}>{humanize(key)}</th>)}{page==='alertas'&&<th>Ação</th>}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??row.cpf??row.consultaId??i)}>{columns.map(key=><td key={key}>{key==='resolvido'||key==='critico'||key==='ativo'?<Badge tone={row[key]?'success':'neutral'}>{display(row[key])}</Badge>:display(row[key])}</td>)}{page==='alertas'&&<td>{row.resolvido?<Badge tone="success">Resolvido</Badge>:<Button variant="secondary" disabled={saving||row.id===undefined} onClick={() => void postAction(`/alertas/${encodeURIComponent(String(row.id))}/resolver`,{},'Alerta resolvido.')}>Resolver <ChevronRight size={14}/></Button>}</td>}</tr>)}</tbody></table></div>
      {!loading && !error && !safetyObject && !reportObject && rows.length===0 && <div className="p-10 text-center text-sm muted">Nenhum registro retornado pela API para esta tela ou filtro.</div>}
      <div className="border-t px-4 py-3 text-[11px] muted" style={{borderColor:'var(--border)'}}>Dados exibidos a partir do backend. A API é responsável por autenticação, autorização e validação das alterações.</div>
    </Card>
  </>;
}
