// Layout unico do Sentinela: topbar + sidebar por permissao.
window.Sentinela = {
  async mount(active, contentHTML) {
    let me = null;
    try {
      const r = await fetch("/me");
      if (!r.ok) { location.href = "index.html"; return; }
      me = await r.json();
    } catch (e) { location.href = "index.html"; return; }
    const perms = Array.isArray(me.permissions) ? me.permissions : [];
    const can = (p) => perms.includes("*") || perms.includes(p);
    const item = (id, href, icon, label, perm) => {
      if (perm && !can(perm)) return "";
      return '<a href="' + href + '" class="' + (active === id ? "active" : "") + '">' + icon + ' ' + label + '</a>';
    };
    document.body.innerHTML =
    '<style>' +
    '.shell{display:flex;min-height:100vh;background:linear-gradient(180deg,#071b27 0%,#0b2436 100%)}' +
    '.side{width:252px;padding:20px 14px;background:linear-gradient(180deg,#0a1f2d 0%,#081b28 100%);border-right:1px solid rgba(143,218,245,.15);display:flex;flex-direction:column;gap:6px;position:sticky;top:0;height:100vh;box-shadow:inset -1px 0 0 rgba(255,255,255,.02)}' +
    '.side .logo{font-weight:900;letter-spacing:1.4px;font-size:18px;color:#edf6ff;margin:6px 8px 2px;display:flex;align-items:center;gap:8px}' +
    '.side .sub{font-size:11px;opacity:.75;margin:0 8px 16px;padding-bottom:12px;border-bottom:1px solid rgba(143,218,245,.12);letter-spacing:.12em;text-transform:uppercase;color:#a9c7d8}' +
    '.side a{display:block;padding:10px 12px;border-radius:12px;color:#eaf4ff;text-decoration:none;font-size:14px;font-weight:600;border:1px solid transparent;transition:transform .15s ease,background .15s ease,border-color .15s ease}' +
    '.side a:hover{background:rgba(255,255,255,.05);border-color:rgba(143,218,245,.12);transform:translateX(1px)}' +
    '.side a.active{background:linear-gradient(135deg, rgba(35,168,216,.24), rgba(17,120,168,.34));border-color:rgba(35,168,216,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}' +
    '.main{flex:1;min-width:0;background:radial-gradient(900px 400px at 80% 0%, rgba(35,168,216,.14), transparent 50%)}' +
    '.top{display:flex;align-items:center;gap:12px;padding:16px 22px;border-bottom:1px solid rgba(143,218,245,.10);position:sticky;top:0;background:rgba(7,27,39,.78);backdrop-filter:blur(12px);z-index:5}' +
    '.top b{font-size:15px;letter-spacing:.08em;color:#edf6ff}' +
    '.top input{max-width:320px;background:rgba(9,35,49,.66);border:1px solid rgba(143,218,245,.18);border-radius:12px;padding:10px 12px;color:#edf6ff}' +
    '.top .sp{flex:1}' +
    '.content{padding:22px;max-width:1200px}' +
    '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0}' +
    '.kpi{text-align:center}.kpi b{font-size:26px;display:block}' +
    'table.tbl{width:100%;border-collapse:collapse;font-size:14px}' +
    'table.tbl th,table.tbl td{padding:10px 12px;border-bottom:1px solid rgba(143,218,245,.10);text-align:left}' +
    '@media(max-width:860px){.side{position:static;width:100%;height:auto;display:block;padding-bottom:10px} .shell{display:block}.top{flex-wrap:wrap}.top input{max-width:none;width:100%}}' +
    '</style>' +
    '<div class="shell"><nav class="side">' +
    '<div class="logo">&#10084;&#65039; SENTINELA</div><div class="sub">Hospital de Cardiologia</div>' +
    item("dashboard","dashboard.html","&#127968;","Dashboard","dashboard.read") +
    item("pacientes","pacientes.html","&#128101;","Pacientes","patients.read") +
    item("atendimento","atendimento.html","&#128657;","Atendimento","appointments.read") +
    item("fila","fila.html","&#128203;","Fila","appointments.read") +
    item("triagem","triagem.html","&#129657;","Triagem","triage.read") +
    item("consulta","medico.html","&#10084;&#65039;","Cardiologia","consultations.read") +
    item("prontuario","prontuario.html","&#128214;","Prontuarios","consultations.read") +
    item("exames","exames.html","&#129514;","Exames","exams.read") +
    item("farmacia","farmacia.html","&#128138;","Farmacia","prescriptions.read") +
    item("estoque","estoque.html","&#128230;","Estoque","estoque.read") +
    item("internacao","internacao.html","&#128719;","Internacao","internacoes.read") +
    item("leitos","leitos.html","&#128716;","Leitos","internacoes.read") +
    item("alertas","alertas.html","&#128680;","Alertas","alerts.read") +
    item("safety","safety-engine.html","&#128737;","Safety Engine","alerts.read") +
    item("ai","sentinela-ai.html","&#129302;","Sentinela AI","ai.read") +
    item("relatorios","relatorios.html","&#128202;","Relatorios","reports.read") +
    item("profissionais","profissionais.html","&#128105;&#8205;&#9877;&#65039;","Profissionais","audit.read") +
    item("auditoria","auditoria.html","&#128272;","Auditoria","audit.read") +
    item("config","configuracoes.html","&#9881;&#65039;","Configuracoes","dashboard.read") +
    '<div style="flex:1"></div><a href="#" id="btnSair">&#128682; Sair</a></nav>' +
    '<div class="main"><div class="top"><b>&#10084;&#65039; SENTINELA</b>' +
    '<input id="buscaGlobal" placeholder="Buscar paciente (nome/CPF)...">' +
    '<div class="sp"></div><span>&#128276;</span><span>\uD83D\uDC64 ' + (me.nome || me.usuario) + ' \u00B7 ' + (me.role || "").toUpperCase() + '</span></div>' +
    '<div class="content" id="app"></div></div></div>';
    document.getElementById("app").innerHTML = contentHTML;
    document.getElementById("btnSair").onclick = () => { fetch("/logout", { method: "POST" }).then(() => location.href = "index.html"); return false; };
    const busca = document.getElementById("buscaGlobal");
    if (busca) busca.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && busca.value.trim()) {
        sessionStorage.setItem("pacienteBusca", busca.value.trim());
        if (active !== "pacientes") location.href = "pacientes.html";
        else window.dispatchEvent(new Event("sentinela:buscar"));
      }
    });
    window.Sentinela.me = me;
  },
  fmtDate(iso) { try { return new Date(iso).toLocaleString("pt-BR"); } catch (e) { return iso || "-"; } }
};
