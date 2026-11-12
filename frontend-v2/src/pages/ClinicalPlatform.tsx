import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, AlertTriangle, RefreshCw, Search, ShieldCheck, PlusCircle } from 'lucide-react';
import { Badge, Button, Card, Input, PageHeader } from '../components/ui';
import { ClinicalPlatformAdmin } from './ClinicalPlatformAdmin';

type Field = { key:string; label:string; type?:string; required?:boolean; options?:string[]; multiline?:boolean };
type ModuleDef = { key:string; title:string; description:string; read:string; write:string; fields:Field[] };
type Row = { id:number; status:string; patient_cpf?:string; created_at:string; data:Record<string,unknown> };
const field=(key:string,label:string,required=true,type='text'):Field=>({key,label,required,type});
const area=(key:string,label:string,required=true):Field=>({key,label,required,multiline:true});
const choice=(key:string,label:string,options:string[],required=true):Field=>({key,label,required,options});
const modules:ModuleDef[]=[
 {key:'soap-notes',title:'Prontuário estruturado · SOAP',description:'Subjetivo, objetivo, avaliação codificada e plano. Registros são imutáveis; correções devem gerar novo evento.',read:'records.read',write:'records.write',fields:[field('patientCpf','CPF do paciente'),area('subjective','Subjetivo · queixa e HDA'),area('objective','Objetivo · exame físico e observações'),area('assessment','Avaliação'),area('plan','Plano e orientações'),choice('diagnosisSystem','Sistema diagnóstico',['CID-10','CIAP-2']),field('diagnosisCode','Código CID-10 / CIAP-2'),field('diagnosisDescription','Descrição do diagnóstico',false)]},
 {key:'vital-signs',title:'Sinais vitais e antropometria',description:'Registro de medidas observadas. O IMC pode ser calculado como dado antropométrico, sem interpretação clínica automática.',read:'records.read',write:'records.write',fields:[field('patientCpf','CPF do paciente'),field('recordedAt','Data e hora',true,'datetime-local'),field('systolic','Pressão sistólica',false,'number'),field('diastolic','Pressão diastólica',false,'number'),field('temperatureC','Temperatura °C',false,'number'),field('heartRate','Frequência cardíaca',false,'number'),field('respiratoryRate','Frequência respiratória',false,'number'),field('oxygenSaturation','Saturação %',false,'number'),field('glucose','Glicemia',false,'number'),field('weightKg','Peso kg',false,'number'),field('heightCm','Altura cm',false,'number'),area('notes','Observações',false)]},
 {key:'diagnoses',title:'Diagnósticos · CID-10 / CIAP-2',description:'O código é validado estruturalmente. A validação contra o catálogo oficial depende da importação da versão vigente.',read:'records.read',write:'records.write',fields:[field('patientCpf','CPF do paciente'),choice('system','Sistema',['CID-10','CIAP-2']),field('code','Código'),field('description','Descrição')]},
 {key:'prescriptions',title:'Prescrição eletrônica',description:'Prescrição fica pendente de validação profissional. Não emite receita legal nem substitui conferência farmacêutica.',read:'prescriptions.read',write:'prescriptions.write',fields:[field('patientCpf','CPF do paciente'),field('medicationName','Medicamento'),field('medicationCode','Código RENAME',false),field('dose','Dose'),field('route','Via'),field('frequency','Frequência'),field('duration','Duração',false),field('quantity','Quantidade',false,'number'),area('instructions','Orientações',false)]},
 {key:'exam-orders',title:'Solicitação de exames · SADT',description:'Solicitações ficam registradas. SIGTAP e integração de resultados exigem catálogo e contrato externo homologados.',read:'exams.read',write:'exams.write',fields:[field('patientCpf','CPF do paciente'),field('code','Código SIGTAP / exame'),field('label','Nome do exame'),choice('modality','Modalidade',['Laboratorial','Imagem','Cardiologia','Outro']),area('clinicalJustification','Justificativa clínica'),choice('priority','Prioridade',['routine','urgent','high','emergency'])]},
 {key:'documents',title:'Documentos clínicos',description:'Gera rascunhos estruturados. Atestados, laudos e receitas só são válidos após revisão, assinatura e regras institucionais.',read:'records.read',write:'records.write',fields:[field('patientCpf','CPF do paciente'),choice('documentType','Tipo',['Atestado','Declaração','Laudo','Termo de consentimento']),area('content','Conteúdo'),field('cidCode','CID (opcional)',false)]},
 {key:'hospitalizations',title:'Internação',description:'Registra admissão vinculada ao paciente e leito; a movimentação física deve ser conciliada com o mapa de leitos da unidade.',read:'hospitalizations.read',write:'hospitalizations.write',fields:[field('patientCpf','CPF do paciente'),field('bedCode','Código do leito'),area('admissionReason','Motivo da internação'),field('attendingProfessional','Profissional responsável',false)]},
 {key:'discharges',title:'Sumário de alta',description:'Registra resumo, reconciliação medicamentosa e plano de continuidade. Não substitui assinatura profissional.',read:'hospitalizations.read',write:'hospitalizations.write',fields:[field('patientCpf','CPF do paciente'),field('hospitalizationId','ID da internação'),area('summary','Resumo de alta'),area('medicationReconciliation','Reconciliação medicamentosa'),area('instructions','Orientações'),area('followUp','Retorno e encaminhamentos')]},
 {key:'maternal-child',title:'Saúde materno-infantil',description:'Registra acompanhamento pré-natal e puericultura. Cálculos e curvas oficiais exigem parâmetros clínicos validados.',read:'maternal.read',write:'maternal.write',fields:[field('patientCpf','CPF do paciente'),choice('kind','Linha de cuidado',['prenatal','puericulture']),field('recordedAt','Data e hora',true,'datetime-local'),field('lastMenstrualPeriod','Data da última menstruação',false,'date'),field('estimatedDueDate','Data provável do parto',false,'date'),field('gestationalAgeWeeks','Idade gestacional em semanas',false,'number'),field('childAgeMonths','Idade da criança em meses',false,'number'),area('developmentNotes','Observações de acompanhamento',false)]},
 {key:'chronic-care',title:'Acompanhamento de condições crônicas',description:'Registros longitudinais para hipertensão, diabetes e outras condições, sem recomendar ajustes terapêuticos automaticamente.',read:'chronic.read',write:'chronic.write',fields:[field('patientCpf','CPF do paciente'),field('condition','Condição'),field('recordedAt','Data e hora',true,'datetime-local'),area('measurements','Medidas e observações'),area('medicationReview','Revisão medicamentosa',false),area('carePlan','Plano de acompanhamento',false),field('nextReviewAt','Próxima revisão',false,'date')]},
 {key:'immunizations',title:'Imunização',description:'Rastreabilidade por vacina, dose, lote e fabricante. Calendário oficial depende de catálogo atualizado.',read:'immunizations.read',write:'immunizations.write',fields:[field('patientCpf','CPF do paciente'),field('vaccine','Vacina'),field('dose','Dose'),field('lot','Lote'),field('manufacturer','Fabricante'),field('administeredAt','Data de aplicação',true,'date'),field('nextDoseAt','Próxima dose',false,'date'),field('site','Local de aplicação',false)]},
 {key:'referrals',title:'Regulação e encaminhamentos',description:'Solicita referência com justificativa e prioridade. Não consulta centrais de regulação externas.',read:'referrals.read',write:'referrals.write',fields:[field('patientCpf','CPF do paciente'),field('destination','Unidade de destino'),field('destinationCnes','CNES de destino',false),field('specialty','Especialidade'),area('reason','Justificativa clínica'),choice('priority','Prioridade',['routine','urgent','high','emergency'])]},
 {key:'notifications',title:'Vigilância epidemiológica',description:'Registra rascunho para notificação. Envio SINAN/e-SUS Notifica está bloqueado até integração e homologação.',read:'records.read',write:'notifications.write',fields:[field('patientCpf','CPF do paciente'),field('diseaseCode','Código da doença / agravo'),field('caseDate','Data do caso',true,'date'),field('notificationType','Tipo de notificação',false),area('epidemiologicalNotes','Observações epidemiológicas',false)]},
 {key:'billing',title:'Produção e faturamento SUS',description:'Registra dados para conferência. Exportação BPA/AIH/APAC não é liberada sem leiaute oficial vigente e validação de consistência.',read:'billing.read',write:'billing.write',fields:[choice('instrument','Instrumento',['BPA-C','BPA-I','AIH','APAC']),field('competence','Competência AAAAMM'),field('sigtapCode','Código SIGTAP'),field('cboCode','CBO'),field('cidCode','CID-10'),field('patientCpf','CPF do paciente',false),field('quantity','Quantidade',false,'number'),field('professionalCns','CNS profissional',false),field('cnes','CNES',false)]},
 {key:'nursing-evolutions',title:'Evolução de enfermagem',description:'Registro estruturado de avaliação, intervenções e resposta.',read:'records.read',write:'nursing.write',fields:[field('patientCpf','CPF do paciente'),area('assessment','Avaliação'),area('interventions','Intervenções'),area('response','Resposta',false),area('carePlan','Continuidade do cuidado',false),field('recordedAt','Data e hora',true,'datetime-local')]},
 {key:'care-plans',title:'Plano de cuidados',description:'Objetivos, intervenções e data de revisão.',read:'records.read',write:'careplans.write',fields:[field('patientCpf','CPF do paciente'),area('goals','Objetivos'),area('interventions','Intervenções'),field('reviewAt','Data de revisão',true,'date'),field('responsibleTeam','Equipe responsável',false)]}
];
function getPermissions(){try{const x=JSON.parse(sessionStorage.getItem('sentinelaPermissions')||'[]');return Array.isArray(x)?x:[];}catch{return[];}}
export function ClinicalPlatformPage(){
 const permissions=useMemo(()=>new Set(getPermissions()),[]);
 const visible=useMemo(()=>modules.filter(m=>permissions.has(m.read)||permissions.has(m.write)),[permissions]);
 const [selected,setSelected]=useState('');
 const [rows,setRows]=useState<Row[]>([]);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [form,setForm]=useState<Record<string,string>>({});
 const [catalog,setCatalog]=useState('CID10');
 const [catalogResult,setCatalogResult]=useState('');
 const [patientLookup,setPatientLookup]=useState('');
 const [patientResult,setPatientResult]=useState('');
 const current=visible.find(m=>m.key===selected)||visible[0];
 const canWrite=!!current&&permissions.has(current.write);
 const load=useCallback(async()=>{
  if(!current)return;setLoading(true);setError('');
  try{const r=await fetch('/api/v1/'+current.key,{credentials:'include',headers:{Accept:'application/json'}});const b=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(String(b.erro||'Não foi possível carregar o módulo.'));
   setRows(Array.isArray(b.items)?b.items:[]);
  }catch(e){setRows([]);setError(e instanceof Error?e.message:'Falha de comunicação.');}
  finally{setLoading(false);}
 },[current]);
 useEffect(()=>{setSelected(v=>visible.some(m=>m.key===v)?v:(visible[0]?.key||''));},[visible]);
 useEffect(()=>{void load();},[load]);
 async function submit(e:FormEvent){
  e.preventDefault();if(!current||!canWrite)return;setSaving(true);setError('');setNotice('');
  const body:Record<string,unknown>={...form};
  for(const k of ['systolic','diastolic','temperatureC','heartRate','respiratoryRate','oxygenSaturation','glucose','weightKg','heightCm','gestationalAgeWeeks','childAgeMonths','quantity'])if(body[k])body[k]=Number(body[k]);
  try{const r=await fetch('/api/v1/'+current.key,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});const b=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(String(b.erro||'O servidor recusou o registro.'));
   setNotice('Registro recebido pela API. Status: '+String(b.item?.status||'registrado')+'.');setForm({});await load();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar.');}
  finally{setSaving(false);}
 }
 async function searchPatient(e:FormEvent){
  e.preventDefault();setPatientResult('');try{const r=await fetch('/api/v1/patient-identities?identifier='+encodeURIComponent(patientLookup),{credentials:'include',headers:{Accept:'application/json'}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.erro||'Busca indisponível.');setPatientResult(JSON.stringify(b.patients||[],null,2));}catch(e){setPatientResult(e instanceof Error?e.message:'Falha na busca.');}
 }
 async function loadCatalog(){setCatalogResult('');try{const r=await fetch('/api/v1/catalogs/'+catalog,{credentials:'include',headers:{Accept:'application/json'}});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.erro||'Catálogo indisponível.');setCatalogResult(JSON.stringify(b.items||[],null,2));}catch(e){setCatalogResult(e instanceof Error?e.message:'Catálogo indisponível.');}}
 if(!visible.length)return <div className="space-y-4"><Card className="p-6"><p className="text-sm">Seu perfil possui acesso apenas aos recursos de identificação e administração autorizados.</p></Card><ClinicalPlatformAdmin permissions={permissions}/></div>;
 return <div className="space-y-5">
  <PageHeader title="Plataforma clínica" description="Fluxos estruturados, registros versionados e APIs clínicas com autorização no servidor." actions={<Button variant="secondary" onClick={()=>void load()} loading={loading}><RefreshCw size={15}/> Atualizar</Button>}/>
  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"><div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16}/> Ambiente em validação</div><p className="mt-1">Esta área não está liberada para assistência real. Protocolos, catálogos oficiais, assinatura, integrações externas e homologação clínica/regulatória ainda precisam ser concluídos.</p></div>
  <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
   <Card className="h-fit p-3"><h2 className="px-2 pb-2 text-xs font-bold uppercase tracking-wide muted">Módulos disponíveis</h2><div className="space-y-1">{visible.map(m=><button key={m.key} onClick={()=>{setSelected(m.key);setForm({});setNotice('');setError('');}} className={'w-full rounded-md px-3 py-2 text-left text-sm '+((current?.key===m.key)?'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900':'hover:bg-slate-100 dark:hover:bg-slate-800')}>{m.title}</button>)}</div></Card>
   <div className="space-y-4">
    {current&&<Card className="p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold">{current.title}</h2><p className="mt-1 text-sm muted">{current.description}</p></div><Badge tone={canWrite?'success':'neutral'}>{canWrite?'Leitura e escrita':'Somente leitura'}</Badge></div>
     {error&&<div role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>}
     {notice&&<div role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{notice}</div>}
     {canWrite&&<form onSubmit={submit} className="mb-5 grid gap-3 sm:grid-cols-2">
      {current.fields.map(f=><label key={f.key} className={f.multiline?'sm:col-span-2':''}><span className="label">{f.label}{f.required?' *':''}</span>{f.options?<select className="field" required={f.required} value={form[f.key]||''} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))}><option value="">Selecione…</option>{f.options.map(o=><option key={o} value={o}>{o}</option>)}</select>:f.multiline?<textarea className="field min-h-20" required={f.required} value={form[f.key]||''} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))}/>:<Input type={f.type||'text'} required={f.required} value={form[f.key]||''} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))}/>}</label>)}
      <div className="sm:col-span-2"><Button type="submit" loading={saving}><PlusCircle size={15}/> Registrar evento</Button></div>
     </form>}
     <div className="border-t pt-4" style={{borderColor:'var(--border)'}}><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">Histórico recente</h3><span className="text-xs muted">{rows.length} registros</span></div>
      {loading?<p className="py-6 text-center text-sm muted">Carregando…</p>:rows.length===0?<p className="py-6 text-center text-sm muted">Nenhum registro retornado pela API.</p>:<div className="space-y-2">{rows.map(row=><div key={row.id} className="rounded-md border p-3 text-sm" style={{borderColor:'var(--border)'}}><div className="flex flex-wrap justify-between gap-2"><strong>#{row.id} · {row.patient_cpf||'Registro institucional'}</strong><Badge tone={row.status==='recorded'?'success':'warning'}>{row.status}</Badge></div><p className="mt-1 text-xs muted">{new Date(row.created_at).toLocaleString('pt-BR')} · {String(row.created_by||'')}</p><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-xs muted">{JSON.stringify(row.data,null,2)}</pre></div>)}</div>}
     </div>
    </Card>}
   </div>
  </div>
  <div className="grid gap-4 lg:grid-cols-2">
   {permissions.has('patients.identity.read')&&<Card className="p-4"><h2 className="mb-2 text-sm font-bold">Identificação do paciente · CPF</h2><form onSubmit={searchPatient} className="flex gap-2"><Input value={patientLookup} onChange={e=>setPatientLookup(e.target.value)} placeholder="CPF do paciente"/><Button type="submit"><Search size={15}/> Buscar</Button></form>{patientResult&&<pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">{patientResult}</pre>}<p className="mt-2 text-xs muted">Busca em cadastro local. CADSUS não está conectado.</p></Card>}
   {permissions.has('clinical.catalogs.read')&&<Card className="p-4"><h2 className="mb-2 text-sm font-bold">Catálogos oficiais</h2><div className="flex gap-2"><select className="field" value={catalog} onChange={e=>setCatalog(e.target.value)}><option value="CID10">CID-10</option><option value="CIAP2">CIAP-2</option><option value="SIGTAP">SIGTAP</option><option value="RENAME">RENAME</option><option value="CBO">CBO</option><option value="CNES">CNES</option></select><Button onClick={()=>void loadCatalog()}>Consultar</Button></div>{catalogResult&&<pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">{catalogResult}</pre>}<p className="mt-2 text-xs muted">A API informa indisponibilidade até a importação da fonte oficial versionada.</p></Card>}
  </div>
  <ClinicalPlatformAdmin permissions={permissions}/>
  <Card className="p-4"><div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17}/> Segurança e rastreabilidade</div><p className="mt-2 text-sm muted">Os eventos clínicos são append-only; correções geram novos registros relacionados. Leituras e gravações são registradas em trilha de auditoria com referência pseudonimizada do paciente. A API exige unidade e vínculo profissional CNS/CBO para operações clínicas qualificadas.</p></Card>
 </div>;
}
