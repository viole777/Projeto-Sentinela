import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, AlertCircle, CheckCircle2, ClipboardList, RefreshCw, Stethoscope, Users } from 'lucide-react';
import { Badge, Button, Card, Input, PageHeader } from '../components/ui';

type Patient = { id?: number; nome?: string; cpf?: string; status?: string; tipo?: string };
type Attendance = { id?: number; pacienteNome?: string; pacienteCpf?: string; tipo?: string; createdAt?: string };
type Triage = {
  id?: number; pacienteId?: number; pacienteCpf?: string; pacienteNome?: string;
  risco?: string; status?: string; sintomas?: string; temperatura?: number | string;
  pas?: number | null; pad?: number | null; fc?: number | null; spo2?: number | null;
  createdAt?: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { credentials: 'include', ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.erro || body.error || `Falha na operação (HTTP ${response.status}).`));
  return body as T;
}
function ErrorNotice({ message }: { message: string }) {
  return message ? <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"><AlertCircle size={17}/><span>{message}</span></div> : null;
}
function SuccessNotice({ message }: { message: string }) {
  return message ? <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"><CheckCircle2 size={17}/>{message}</div> : null;
}
const fieldClass = "w-full rounded-md border bg-transparent px-3 py-2 text-sm";
const labelClass = "grid gap-1 text-xs font-semibold muted";

export function ReceptionWorkspace() {
  const [rows, setRows] = useState<Attendance[]>([]);
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [type, setType] = useState('Particular');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await api<Attendance[]>('/atendimentos')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar os atendimentos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      await api<Patient>('/atendimento', { method: 'POST', body: JSON.stringify({ nome: name.trim(), cpf: cpf.replace(/\D/g, ''), tipo }) });
      setName(''); setCpf(''); setNotice('Cadastro/atendimento registrado e encaminhado para a fila de triagem.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível registrar o atendimento.'); }
    finally { setSaving(false); }
  }
  return <>
    <PageHeader title="Recepção e abertura de atendimento" description="Identifique o paciente, registre a chegada e encaminhe o atendimento para a triagem." actions={<Button variant="secondary" onClick={() => void load()} loading={loading}><RefreshCw size={15}/> Atualizar fila</Button>}/>
    <ErrorNotice message={error}/><SuccessNotice message={notice}/>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2"><Users size={18}/><h2 className="text-sm font-bold">Novo atendimento</h2></div>
        <form className="grid gap-3" onSubmit={submit}>
          <label className={labelClass}>Nome completo<Input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Nome do paciente"/></label>
          <label className={labelClass}>CPF<Input required inputMode="numeric" maxLength={14} value={cpf} onChange={e=>setCpf(e.target.value.replace(/[^\d.-]/g,''))} placeholder="Somente números ou pontuação"/></label>
          <label className={labelClass}>Tipo de atendimento<select className={fieldClass} value={type} onChange={e=>setType(e.target.value)}><option>Particular</option><option>Convênio</option></select></label>
          <Button type="submit" loading={saving}>Registrar e enviar à triagem</Button>
        </form>
        <p className="mt-3 text-xs muted">O servidor valida os dados e mantém o registro vinculado ao paciente. Use somente dados sintéticos neste ambiente demonstrativo.</p>
      </Card>
      <Card>
        <div className="border-b p-4" style={{borderColor:'var(--border)'}}><h2 className="text-sm font-bold">Atendimentos recentes</h2><p className="mt-1 text-xs muted">{rows.length} registros carregados</p></div>
        <div className="table-wrap"><table className="clinical-table"><thead><tr><th>Paciente</th><th>Tipo</th><th>Chegada</th></tr></thead><tbody>
          {rows.map((row,i)=><tr key={String(row.id ?? i)}><td>{row.pacienteNome || 'Paciente'}</td><td>{row.tipo || '—'}</td><td>{row.createdAt ? new Date(row.createdAt).toLocaleString('pt-BR') : '—'}</td></tr>)}
          {!loading && rows.length===0 && <tr><td colSpan={3} className="p-6 text-center muted">Nenhum atendimento registrado.</td></tr>}
        </tbody></table></div>
      </Card>
    </div>
  </>;
}

export function TriageWorkspace() {
  const [patients,setPatients] = useState<Patient[]>([]);
  const [rows,setRows] = useState<Triage[]>([]);
  const [patientCpf,setPatientCpf] = useState('');
  const [symptoms,setSymptoms] = useState('');
  const [temperature,setTemperature] = useState('');
  const [pas,setPas] = useState('');
  const [pad,setPad] = useState('');
  const [fc,setFc] = useState('');
  const [spo2,setSpo2] = useState('');
  const [fr,setFr] = useState('');
  const [risk,setRisk] = useState('verde');
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [p,t] = await Promise.all([api<Patient[]>('/pacientes'),api<Triage[]>('/triagem')]);
      setPatients(p); setRows(t);
      if (!patientCpf && p[0]?.cpf) setPatientCpf(String(p[0].cpf));
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar a fila de triagem.'); }
    finally { setLoading(false); }
  }, [patientCpf]);
  useEffect(() => { void load(); }, [load]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      await api<Triage>('/triagem',{method:'POST',body:JSON.stringify({
        pacienteCpf: patientCpf, sintomas, temperatura, pas, pad, fc, spo2, fr, risco: risk
      })});
      setSymptoms(''); setTemperature(''); setPas(''); setPad(''); setFc(''); setSpo2(''); setFr('');
      setNotice('Avaliação registrada. A prioridade retornada pelo servidor deve ser revisada por profissional habilitado.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível registrar a triagem.'); }
    finally { setSaving(false); }
  }
  return <>
    <PageHeader title="Triagem e acolhimento" description="Fila de pacientes, avaliação inicial e registro de parâmetros observados." actions={<Button variant="secondary" onClick={() => void load()} loading={loading}><RefreshCw size={15}/> Atualizar fila</Button>}/>
    <ErrorNotice message={error}/><SuccessNotice message={notice}/>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2"><Activity size={18}/><h2 className="text-sm font-bold">Registrar avaliação</h2></div>
        <form className="grid gap-3" onSubmit={submit}>
          <label className={labelClass}>Paciente<select required className={fieldClass} value={patientCpf} onChange={e=>setPatientCpf(e.target.value)}><option value="">Selecione</option>{patients.map((p,i)=><option key={String(p.id ?? i)} value={p.cpf}>{p.nome || 'Paciente'}</option>)}</select></label>
          <label className={labelClass}>Sintomas relatados<textarea className={fieldClass} rows={3} maxLength={1000} value={symptoms} onChange={e=>setSymptoms(e.target.value)} placeholder="Registre o relato de forma objetiva"/></label>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <label className={labelClass}>Temperatura (°C)<Input type="number" step="0.1" value={temperature} onChange={e=>setTemperature(e.target.value)}/></label>
            <label className={labelClass}>PA sistólica<Input type="number" value={pas} onChange={e=>setPas(e.target.value)}/></label>
            <label className={labelClass}>PA diastólica<Input type="number" value={pad} onChange={e=>setPad(e.target.value)}/></label>
            <label className={labelClass}>Frequência cardíaca<Input type="number" value={fc} onChange={e=>setFc(e.target.value)}/></label>
            <label className={labelClass}>SpO₂ (%)<Input type="number" value={spo2} onChange={e=>setSpo2(e.target.value)}/></label>
            <label className={labelClass}>Frequência respiratória<Input type="number" value={fr} onChange={e=>setFr(e.target.value)}/></label>
          </div>
          <label className={labelClass}>Prioridade inicial registrada<select className={fieldClass} value={risk} onChange={e=>setRisk(e.target.value)}><option value="verde">Verde</option><option value="amarelo">Amarelo</option><option value="vermelho">Vermelho</option></select></label>
          <Button type="submit" loading={saving} disabled={!patients.length}>Salvar avaliação e encaminhar</Button>
        </form>
        <p className="mt-3 text-xs muted">A tela registra dados informados; não diagnostica nem substitui protocolo institucional de classificação de risco. A prioridade calculada pelo backend ainda requer validação clínica formal.</p>
      </Card>
      <Card>
        <div className="border-b p-4" style={{borderColor:'var(--border)'}}><h2 className="text-sm font-bold">Fila e histórico de triagem</h2><p className="mt-1 text-xs muted">{rows.length} avaliações retornadas pelo serviço</p></div>
        <div className="table-wrap"><table className="clinical-table"><thead><tr><th>Paciente</th><th>Prioridade</th><th>Status</th><th>Registro</th></tr></thead><tbody>
          {rows.slice().reverse().map((row,i)=><tr key={String(row.id ?? i)}><td>{row.pacienteNome || 'Paciente'}</td><td><Badge tone={row.risco==='vermelho'?'danger':row.risco==='amarelo'?'warning':'success'}>{row.risco || '—'}</Badge></td><td>{row.status || '—'}</td><td>{row.createdAt ? new Date(row.createdAt).toLocaleString('pt-BR') : '—'}</td></tr>)}
          {!loading && rows.length===0 && <tr><td colSpan={4} className="p-6 text-center muted">Fila vazia.</td></tr>}
        </tbody></table></div>
      </Card>
    </div>
  </>;
}

export function ConsultationWorkspace() {
  const [rows,setRows] = useState<Triage[]>([]);
  const [selected,setSelected] = useState('');
  const [diagnosis,setDiagnosis] = useState('');
  const [medication,setMedication] = useState('');
  const [notes,setNotes] = useState('');
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const list = await api<Triage[]>('/triagem');
      const pending = list.filter(item => !['atendida','encerrada'].includes(String(item.status || '').toLowerCase()));
      setRows(pending);
      if (!selected && pending[0]?.pacienteCpf) setSelected(String(pending[0].pacienteCpf));
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar os pacientes aguardando avaliação.'); }
    finally { setLoading(false); }
  }, [selected]);
  useEffect(() => { void load(); }, [load]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const result = await api<{alertasGerados?:Array<{nivel?:string;mensagem?:string}>}>('/consulta',{method:'POST',body:JSON.stringify({
        pacienteCpf:selected, diagnostico:diagnosis.trim(), medicacao:medication.trim(), obs:notes.trim()
      })});
      setNotice(result.alertasGerados?.length ? 'Consulta registrada. O Safety Engine retornou pontos de atenção para revisão.' : 'Consulta registrada e persistida pelo servidor.');
      setDiagnosis(''); setMedication(''); setNotes('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a consulta.'); }
    finally { setSaving(false); }
  }
  return <>
    <PageHeader title="Atendimento médico" description="Fila encaminhada pela triagem e registro de consulta vinculado ao paciente." actions={<Button variant="secondary" onClick={() => void load()} loading={loading}><RefreshCw size={15}/> Atualizar fila</Button>}/>
    <ErrorNotice message={error}/><SuccessNotice message={notice}/>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <div className="border-b p-4" style={{borderColor:'var(--border)'}}><div className="flex items-center gap-2"><ClipboardList size={18}/><h2 className="text-sm font-bold">Aguardando atendimento</h2></div><p className="mt-1 text-xs muted">{rows.length} pacientes na fila</p></div>
        <div className="divide-y" style={{borderColor:'var(--border)'}}>
          {rows.map((row,i)=><button type="button" key={String(row.id ?? i)} onClick={()=>setSelected(String(row.pacienteCpf || ''))} className={`flex w-full items-center justify-between gap-3 p-4 text-left text-sm hover:bg-black/5 ${selected===row.pacienteCpf?'bg-black/5':''}`}><span><strong className="block">{row.pacienteNome || 'Paciente'}</strong><small className="muted">{row.sintomas || 'Sem relato informado'}</small></span><Badge tone={row.risco==='vermelho'?'danger':row.risco==='amarelo'?'warning':'success'}>{row.risco || '—'}</Badge></button>)}
          {!loading && rows.length===0 && <p className="p-6 text-center text-sm muted">Nenhum paciente aguardando atendimento.</p>}
        </div>
      </Card>
      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2"><Stethoscope size={18}/><h2 className="text-sm font-bold">Registro da consulta</h2></div>
        <form className="grid gap-3" onSubmit={submit}>
          <label className={labelClass}>Paciente<select className={fieldClass} required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecione</option>{rows.map((row,i)=><option key={String(row.id ?? i)} value={row.pacienteCpf}>{row.pacienteNome || 'Paciente'}</option>)}</select></label>
          <label className={labelClass}>Diagnóstico / hipótese registrada<Input required maxLength={500} value={diagnosis} onChange={e=>setDiagnosis(e.target.value)}/></label>
          <label className={labelClass}>Medicação / prescrição a revisar<Input maxLength={500} value={medication} onChange={e=>setMedication(e.target.value)}/></label>
          <label className={labelClass}>Observações<textarea className={fieldClass} rows={4} maxLength={3000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
          <Button type="submit" loading={saving} disabled={!selected || !rows.length}>Salvar registro da consulta</Button>
        </form>
        <p className="mt-3 text-xs muted">A API aplica suas permissões e verificações de segurança. Este fluxo demonstrativo não substitui prontuário validado, prescrição eletrônica regulamentada nem revisão por profissional habilitado.</p>
      </Card>
    </div>
  </>;
}
