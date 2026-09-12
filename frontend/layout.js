// Layout unico do Sentinela: topbar + sidebar por permissao.
window.Sentinela = {
  async mount(active, contentHTML) {
    let me = null;
    try {
      const r = await fetch("/me");
      if (!r.ok) { location.href = "index.html"; return; }
      me = await r.json();
    } catch (e) { location.href = "index.html"; return; }
    const perms = me.permissions || [];
    const can = (p) => perms.includes("*") || perms.includes(p);
    const item = (id, href, icon, label, perm) => {
      if (perm && !can(perm)) return "";
      return '<a href="' + href + '" class="' + (active === id ? "active" : "") + '">' + icon + ' ' + label + '</a>';
    };
    document.body.innerHTML =
    '<style>' +
    '.shell{display:flex;min-height:100vh}' +
    '.side{width:230px;padding:18px 12px;background:rgba(255,255,255,.04);border-right:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;gap:4px;position:sticky;top:0;height:100vh}' +
    '.side .logo{font-weight:800;letter-spacing:1px}' +
    '.side .sub{font-size:11px;opacity:.65;margin-bottom:14px}' +
    '.side a{display:block;padding:9px 12px;border-radius:10px;color:#e5e7eb;text-decoration:none;font-size:14px}' +
    '.side a:hover{background:rgba(255,255,255,.07)}' +
    '.side a.active{background:rgba(37,99,235,.25);border:1px solid rgba(37,99,235,.4)}' +
    '.main{flex:1;min-width:0}.top{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.1);position:sticky;top:0;background:rgba(11,18,32,.95);z-index:5}' +
    '.top input{max-width:320px}.top .sp{flex:1}.content{padding:20px;max-width:1200px}' +
    '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0}' +
    '.kpi{text-align:center}.kpi b{font-size:26px;display:block}' +
    'table.tbl{width:100%;border-collapse:collapse;font-size:14px}' +
    'table.tbl th,table.tbl td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1);text-align:left}' +
    '@media(max-width:860px){.side{display:none}}' +
    '</style>' +
    '<div class="shell"><nav class="side">' +
    '<div class="logo">&#10084;&#65039; SENTINELA</div><div class="sub">Hospital de Cardiologia</div>' +
    item("dashboard","dashboard.html","&#127968;","Dashboard","dashboard.read") +
    item("pacientes","pacientes.html","&#128101;","Pacientes","patients.read") +
    item("atendimento","atendimento.html","&#128657;","Atendimento","appointments.read") +
    item("triagem","triagem.html","&#129657;","Triagem","triage.read") +
    item("consulta","medico.html","&#10084;&#65039;","Cardiologia","consultations.read") +
    item("exames","exames.html","&#129514;","Exames","exams.read") +
    item("farmacia","farmacia.html","&#128138;","Farmacia","prescriptions.read") +
    item("estoque","estoque.html","&#128230;","Estoque","estoque.read") +
    item("internacao","internacao.html","&#128719;","Internacao","dashboard.read") +
    item("alertas","alertas.html","&#128680;","Alertas","alerts.read") +
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
