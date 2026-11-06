import { useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, FileQuestion, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';

type Summary = {
  pacienteNome?: string; resumo?: string; avaliacaoGeral?: string;
  pontosAtencao?: string[]; dadosAusentes?: string[]; perguntasSugeridas?: string[];
  inconsistencias?: string[]; geradoEm?: string; iaDisponivel?: boolean;
  cache?: boolean; erroIA?: string | null; aviso?: string;
};

function ResultList({ title, items, icon: Icon }: { title: string; items?: string[]; icon: typeof AlertTriangle }) {
  if (!items?.length) return null;
  return <section className="mt-5"><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Icon size={16}/>{title}</h3><ul className="space-y-2">{items.map((item, i) => <li key={i} className="rounded-lg border px-3 py-2 text-sm leading-6" style={{borderColor:'var(--border)'}}>{item}</li>)}</ul></section>;
}

export function SentinelaAiPage() {
  const [cpf,setCpf]=useState(''),[result,setResult]=useState<Summary|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits=cpf.replace(/\\D/g,'');
    if(digits.length!==11){setError('Informe os 11 dígitos do CPF.');setResult(null);return;}
    setLoading(true);setError('');setResult(null);
    try {
      const response=await fetch('/ia/resumo/'+encodeURIComponent(digits),{credentials:'include',headers:{Accept:'application/json'}});
      const data=await response.json().catch(()=>({}));
      if(response.status===401) throw new Error('Sua sessão expirou. Entre novamente.');
      if(response.status===403) throw new Error('Seu perfil não possui permissão para consultar o resumo.');
      if(response.status===404) throw new Error('Paciente não encontrado. Confira o CPF cadastrado.');
      if(!response.ok) throw new Error(String(data.erro||data.error||'Não foi possível gerar o resumo.'));
      setResult(data as Summary);
    } catch(e) { setError(e instanceof Error?e.message:'Falha de conexão.'); }
    finally { setLoading(false); }
  }
  const local=result?.iaDisponivel!==true;
  return <>
    <PageHeader title="Resumo clínico com IA" description="Síntese assistida do prontuário para apoiar a revisão profissional. Não realiza diagnóstico nem substitui avaliação clínica." actions={<Badge tone="info"><BrainCircuit size={13} className="mr-1"/>Sentinela AI</Badge>}/>
    <Card className="p-4 md:p-5"><form onSubmit={generate} className="flex flex-col gap-3 md:flex-row md:items-end"><div className="flex-1"><Field label="CPF do paciente" hint="Digite os 11 números. A consulta exige uma sessão autorizada."><Input value={cpf} onChange={e=>setCpf(e.target.value)} inputMode="numeric" autoComplete="off" maxLength={18} placeholder="000.000.000-00"/></Field></div><Button type="submit" loading={loading}><BrainCircuit size={16}/>{loading?'Gerando…':'Gerar resumo'}</Button></form>
      {error&&<p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {loading&&<p className="mt-4 flex items-center gap-2 text-sm muted"><RefreshCw size={16} className="animate-spin"/>Consultando o prontuário…</p>}
    </Card>
    {result&&<Card className="mt-4 p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-wider muted">Paciente</p><h2 className="text-lg font-bold">{result.pacienteNome||'Paciente'}</h2></div><Badge tone={local?'warning':'success'}>{local?'Resumo local':'Gemini conectado'}</Badge></div>
      <p className="mt-4 whitespace-pre-line rounded-xl p-4 text-sm leading-7" style={{background:'var(--surface-muted, var(--panel))'}}>{result.resumo||'Resumo não disponível.'}</p>
      {result.avaliacaoGeral&&<section className="mt-5"><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldCheck size={16}/>Avaliação analítica</h3><p className="text-sm leading-7 muted">{result.avaliacaoGeral}</p></section>}
      <ResultList title="Pontos de atenção" items={result.pontosAtencao} icon={AlertTriangle}/>
      <ResultList title="Inconsistências" items={result.inconsistencias} icon={AlertTriangle}/>
      <ResultList title="Informações ausentes" items={result.dadosAusentes} icon={FileQuestion}/>
      <ResultList title="Perguntas para revisão profissional" items={result.perguntasSugeridas} icon={CheckCircle2}/>
      {result.erroIA&&<p className="mt-4 text-xs text-amber-700 dark:text-amber-300">IA externa indisponível: {result.erroIA} Foi exibido o resumo local.</p>}
      <p className="mt-4 border-t pt-3 text-xs muted" style={{borderColor:'var(--border)'}}>{result.geradoEm?'Gerado em '+new Date(result.geradoEm).toLocaleString('pt-BR')+' · ':''}{result.cache?'Resultado reutilizado do cache. · ':''}{result.aviso||'Apoio à decisão. Não substitui avaliação clínica.'}</p>
    </Card>}
  </>;
}
