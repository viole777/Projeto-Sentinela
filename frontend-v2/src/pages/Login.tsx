import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button, Field, Input } from '../components/ui';

type Mode = 'login' | 'first' | 'recover' | 'reset';
export function Login({ mode: initial = 'login' }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState(() => sessionStorage.getItem('primeiroAcessoId') || localStorage.getItem('sentinelaIdentifier') || '');
  const [password, setPassword] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [remember, setRemember] = useState(Boolean(localStorage.getItem('sentinelaIdentifier')));
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMessage(''); setLoading(true);
    try {
      let response: Response;
      let result: Record<string, unknown> = {};
      if (mode === 'recover') {
        response = await fetch('/recuperar-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ email: username }) });
        result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(result.erro || 'Não foi possível solicitar a recuperação.'));
        setMessage('Solicitação registrada. A entrega do token depende da configuração do canal institucional de recuperação da unidade; contate a administração para recebê-lo. Se você já possui um token, selecione “Inserir token”.');
        return;
      }
      if (mode === 'reset') {
        response = await fetch('/redefinir-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ token: resetToken, novaSenha: password, confirmar: confirmPassword }) });
        result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(result.erro || 'Não foi possível redefinir a senha.'));
        setMessage('Senha redefinida. Você já pode entrar com a nova senha.');
        setPassword(''); setConfirmPassword(''); setResetToken(''); setMode('login');
        return;
      }
      if (mode === 'first') {
        response = await fetch('/primeiro-acesso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ usuarioId: sessionStorage.getItem('primeiroAcessoId') || username, senhaTemporaria: temporaryPassword, novaSenha: password, confirmar: confirmPassword }) });
        result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(result.erro || 'Não foi possível ativar o acesso.'));
        sessionStorage.removeItem('primeiroAcessoId'); setPassword(''); setConfirmPassword(''); setTemporaryPassword('');
        setMessage('Acesso ativado. Entre usando suas novas credenciais.'); setMode('login');
        return;
      }
      response = await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ usuario: username, senha: password }) });
      result = await response.json().catch(() => ({}));
      if (response.status === 403 && result.erro === 'primeiro_acesso') {
        sessionStorage.setItem('primeiroAcessoId', String(result.usuarioId ?? username));
        setMode('first'); setMessage('Sua conta exige a configuração da senha no primeiro acesso.'); return;
      }
      if (!response.ok) throw new Error(String(result.erro || 'Não foi possível autenticar. Verifique suas credenciais ou contate a administração.'));
      if (remember) localStorage.setItem('sentinelaIdentifier', username); else localStorage.removeItem('sentinelaIdentifier');
      sessionStorage.setItem('sentinelaRole', String(result.role ?? result.tipo ?? ''));
      sessionStorage.setItem('sentinelaNome', String(result.nome ?? result.usuario ?? ''));
      navigate('/app/dashboard');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível conectar ao servidor. Nenhuma alteração foi confirmada.');
    } finally { setLoading(false); }
  }

  const title = mode === 'login' ? 'Acesso profissional' : mode === 'first' ? 'Ativar primeiro acesso' : mode === 'recover' ? 'Recuperar senha' : 'Redefinir senha';
  const description = mode === 'login' ? 'Entre com as credenciais fornecidas pela administração da sua unidade.' : mode === 'first' ? 'Informe sua senha temporária e configure uma nova senha.' : mode === 'recover' ? 'Informe o e-mail cadastrado para solicitar as instruções de recuperação.' : 'Informe o token de recuperação e defina uma nova senha.';
  return <div className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]" style={{ background: 'var(--surface)' }}>
    <section className="relative hidden flex-col justify-between overflow-hidden bg-sus-900 p-12 text-white lg:flex"><div className="absolute -right-36 -top-28 h-[520px] w-[520px] rounded-full border border-white/10"/><div className="absolute -right-8 top-20 h-[360px] w-[360px] rounded-full border border-white/10"/>
      <div className="relative flex items-center gap-3"><img src="/brand/sentinela-mark.svg" alt="Sentinela" className="h-11 w-11 rounded-xl bg-white"/><div><div className="text-lg font-bold tracking-[.17em]">SENTINELA</div><div className="text-[10px] uppercase tracking-[.18em] text-blue-200">Informação clínica</div></div></div>
      <div className="relative max-w-xl"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-blue-100"><ShieldCheck size={15}/> Segurança e continuidade do cuidado</div><h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Informação confiável para decisões clínicas melhores.</h1><p className="mt-5 max-w-lg text-base leading-7 text-blue-100">Uma visão organizada do atendimento, dos registros clínicos e dos alertas relevantes para apoiar as equipes de saúde.</p><div className="mt-9 grid grid-cols-3 gap-3">{[['01','Cuidado integrado'],['02','Rastreabilidade'],['03','Segurança clínica']].map(([n,t])=><div key={n} className="rounded-lg border border-white/15 bg-white/5 p-3"><div className="text-xs text-blue-200">{n}</div><div className="mt-2 text-sm font-semibold">{t}</div></div>)}</div></div>
      <div className="relative flex items-center justify-between gap-4 text-xs text-blue-200"><div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2"><img src="/brand/sus-mark.svg" alt="SUS — Sistema Único de Saúde" className="h-8 w-auto max-w-[110px] object-contain"/></div><span>Sentinela · Sistema clínico</span></div>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-10" style={{ background: 'var(--bg)' }}><div className="w-full max-w-[420px]">
      <div className="mb-8 flex items-center gap-3 lg:hidden"><img src="/brand/sentinela-mark.svg" alt="Sentinela" className="h-10 w-10 rounded-lg"/><div><div className="font-bold tracking-[.14em] text-sus-900 dark:text-blue-300">SENTINELA</div><div className="text-[10px] uppercase tracking-wider muted">Sistema clínico</div></div></div>
      <div className="panel p-6 sm:p-8"><div className="mb-7"><div className="eyebrow mb-2">Portal do profissional</div><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 muted">{description}</p></div>
        <form className="space-y-5" onSubmit={submit}>
          {(mode === 'login' || mode === 'recover') && <Field label={mode === 'recover' ? 'E-mail cadastrado' : 'Usuário ou e-mail'}><Input autoComplete="username" type={mode === 'recover' ? 'email' : 'text'} required value={username} onChange={e => setUsername(e.target.value)} placeholder={mode === 'recover' ? 'nome@unidade.gov.br' : 'Seu identificador profissional'}/></Field>}
          {mode === 'first' && <><Field label="Identificador da conta"><Input required value={username} onChange={e => setUsername(e.target.value)} placeholder="Identificador fornecido pela unidade" /></Field><Field label="Senha temporária"><Input required type="password" autoComplete="current-password" value={temporaryPassword} onChange={e => setTemporaryPassword(e.target.value)} /></Field></>}
          {mode === 'reset' && <Field label="Token de recuperação"><Input required value={resetToken} onChange={e => setResetToken(e.target.value)} placeholder="Cole o token recebido"/></Field>}
          {(mode === 'login' || mode === 'first' || mode === 'reset') && <Field label={mode === 'login' ? 'Senha' : 'Nova senha'}><div className="relative"><Input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? undefined : 6} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'login' ? 'Digite sua senha' : 'Mínimo de 6 caracteres'} className="pr-11"/><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 muted">{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></Field>}
          {(mode === 'first' || mode === 'reset') && <Field label="Confirmar nova senha"><Input required type="password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></Field>}
          {mode === 'login' && <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs muted"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="accent-sus-700"/> Lembrar identificador</label><button type="button" onClick={() => { setMode('recover'); setMessage(''); }} className="text-xs font-semibold text-sus-700 hover:underline dark:text-blue-300">Esqueci a senha</button></div>}
          {message && <div role="status" aria-live="polite" className={`rounded-md border p-3 text-sm ${/não foi possível|inválid|expirad|erro/i.test(message) ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200' : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100'}`}>{message}</div>}
          <Button type="submit" className="w-full" loading={loading}>{mode === 'login' ? 'Entrar no sistema' : mode === 'first' ? 'Ativar acesso' : mode === 'recover' ? 'Solicitar recuperação' : 'Redefinir senha'}<ArrowRight size={16}/></Button>
        </form>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t pt-5 text-center text-xs muted" style={{ borderColor: 'var(--border)' }}>
          {mode !== 'login' && <button className="font-semibold text-sus-700 hover:underline dark:text-blue-300" onClick={() => { setMode('login'); setMessage(''); }}>Voltar ao login</button>}
          {mode === 'login' && <>Primeiro acesso? <button className="font-semibold text-sus-700 hover:underline dark:text-blue-300" onClick={() => { setMode('first'); setMessage(''); }}>Ativar conta</button></>}
          {mode === 'recover' && <button className="font-semibold text-sus-700 hover:underline dark:text-blue-300" onClick={() => { setMode('reset'); setMessage(''); }}>Inserir token de recuperação</button>}
        </div>
      </div><div className="mt-5 flex items-center justify-center gap-2 text-[11px] muted"><LockKeyhole size={13}/> Acesso restrito a profissionais autorizados</div><p className="mt-2 text-center text-[10px] muted">Utilize apenas dados autorizados pela unidade. Não compartilhe credenciais.</p>
    </div></section>
  </div>;
}
