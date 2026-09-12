// Layout unico do Sentinela: sidebar + header operacionais.
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

    const item = (id, href, label, perm) => {
      if (perm && !can(perm)) return "";
      return '<a href="' + href + '" class="nav-link ' + (active === id ? "active" : "") + '">' + label + '</a>';
    };

    const groups = [
      ["Geral", [
        item("dashboard", "dashboard.html", "Dashboard", "dashboard.read"),
        item("pacientes", "pacientes.html", "Pacientes", "patients.read")
      ]],
      ["Operação", [
        item("atendimento", "atendimento.html", "Atendimento", "appointments.read"),
        item("casa", "atendimento-casa.html", "Atend. Domiciliar", "appointments.read"),
        item("fila", "fila.html", "Fila", "appointments.read"),
        item("triagem", "triagem.html", "Triagem", "triage.read"),
        item("consulta", "medico.html", "Consultas", "consultations.read"),
        item("prontuario", "prontuario.html", "Prontuários", "consultations.read")
      ]],
      ["Cardiologia", [
        item("exames", "exames.html", "Exames", "exams.read"),
        item("ai", "sentinela-ai.html", "Sentinela AI", "ai.read")
      ]],
      ["Farmácia", [
        item("farmacia", "farmacia.html", "Prescrições", "prescriptions.read"),
        item("estoque", "estoque.html", "Estoque", "estoque.read")
      ]],
      ["Internação", [
        item("internacao", "internacao.html", "Internações", "internacoes.read"),
        item("leitos", "leitos.html", "Leitos", "internacoes.read")
      ]],
      ["Gestão", [
        item("alertas", "alertas.html", "Alertas", "alerts.read"),
        item("safety", "safety-engine.html", "Safety Engine", "alerts.read"),
        item("relatorios", "relatorios.html", "Relatórios", "reports.read"),
        item("profissionais", "profissionais.html", "Profissionais", "audit.read"),
        item("auditoria", "auditoria.html", "Auditoria", "audit.read"),
        item("config", "configuracoes.html", "Configurações", "dashboard.read")
      ]]
    ];

    const navHTML = groups.map(([label, items]) => {
      const visibleItems = items.filter(Boolean).join("");
      return visibleItems ? '<div class="nav-group"><div class="nav-label">' + label + '</div>' + visibleItems + '</div>' : "";
    }).join("");

    document.body.innerHTML =
      '<style>' +
      '.shell{display:flex;min-height:100vh;background:var(--bg);color:var(--text)}' +
      '.side{width:240px;background:#f7f9fb;border-right:1px solid var(--border);padding:18px 14px 12px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;}' +
      '.brand{display:flex;align-items:center;gap:10px;padding:8px 10px 14px;border-bottom:1px solid var(--border);margin-bottom:12px}' +
      '.brand-mark{width:28px;height:28px;border-radius:4px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;}' +
      '.brand-name{font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--text)}' +
      '.brand-sub{font-size:11px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}' +
      '.nav-group{margin-bottom:12px}' +
      '.nav-label{padding:8px 10px 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}' +
      '.nav-link{display:block;padding:8px 10px;border-radius:4px;color:var(--text);font-size:14px;border:1px solid transparent;}' +
      '.nav-link:hover{background:#edf3f8;border-color:var(--border)}' +
      '.nav-link.active{background:var(--brand-soft);color:var(--brand-strong);border-color:#cfe0f6;font-weight:700}' +
      '.nav-spacer{flex:1}' +
      '.nav-logout{display:block;padding:8px 10px;border-radius:4px;border:1px solid var(--border);background:#fff;color:var(--text);font-size:14px;font-weight:600;margin-top:8px}' +
      '.main{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg)}' +
      '.top{display:flex;align-items:center;gap:16px;padding:14px 22px;border-bottom:1px solid var(--border);background:#f7f9fb;position:sticky;top:0;z-index:5}' +
      '.page-meta{flex:1;min-width:0}' +
      '.page-path{font-size:11px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;font-weight:700}' +
      '.page-title{font-size:18px;font-weight:800;color:var(--text);margin-top:2px}' +
      '.top-search{max-width:360px;width:100%}' +
      '.top-search input{background:#fff;border:1px solid var(--border);border-radius:4px;padding:9px 10px;color:var(--text)}' +
      '.user-badge{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:4px;border:1px solid var(--border);background:#fff}' +
      '.user-avatar{width:28px;height:28px;border-radius:50%;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}' +
      '.user-text{display:flex;flex-direction:column;gap:2px;line-height:1.1}' +
      '.user-name{font-size:13px;font-weight:700}' +
      '.user-role{font-size:11px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}' +
      '.content{padding:22px;max-width:1280px;width:100%;margin:0 auto}' +
      '@media(max-width:860px){.shell{display:block}.side{position:static;width:100%;height:auto}.top{flex-wrap:wrap}.top-search{max-width:none}.content{padding:16px}}' +
      '</style>' +
      '<div class="shell">' +
        '<aside class="side">' +
          '<div class="brand">' +
            '<div class="brand-mark">S</div>' +
            '<div><div class="brand-name">SENTINELA</div><div class="brand-sub">Cardiologia</div></div>' +
          '</div>' +
          navHTML +
          '<div class="nav-spacer"></div>' +
          '<a href="#" class="nav-logout" id="btnSair">Sair</a>' +
        '</aside>' +
        '<div class="main">' +
          '<header class="top">' +
            '<div class="page-meta">' +
              '<div class="page-path">Sistema / ' + (active || 'Sentinela') + '</div>' +
              '<div class="page-title">' + (active === 'dashboard' ? 'Dashboard' : active === 'atendimento' ? 'Atendimento' : active === 'casa' ? 'Atendimento Domiciliar' : active === 'triagem' ? 'Triagem' : active === 'pacientes' ? 'Pacientes' : active === 'farmacia' ? 'Farmácia' : active === 'estoque' ? 'Estoque' : active === 'exames' ? 'Exames' : active === 'config' ? 'Configurações' : 'Sentinela') + '</div>' +
            '</div>' +
            '<div class="top-search"><input id="buscaGlobal" placeholder="Buscar paciente por nome ou CPF"></div>' +
            '<div class="user-badge">' +
              '<div class="user-avatar">' + ((me.nome || me.usuario || 'U').charAt(0).toUpperCase()) + '</div>' +
              '<div class="user-text"><span class="user-name">' + (me.nome || me.usuario) + '</span><span class="user-role">' + (me.role || '').toUpperCase() + '</span></div>' +
            '</div>' +
          '</header>' +
          '<main class="content" id="app"></main>' +
        '</div>' +
      '</div>';

    document.getElementById("app").innerHTML = contentHTML;

    document.getElementById("btnSair").onclick = () => {
      fetch("/logout", { method: "POST" }).then(() => location.href = "index.html");
      return false;
    };

    const busca = document.getElementById("buscaGlobal");
    if (busca) {
      busca.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && busca.value.trim()) {
          sessionStorage.setItem("pacienteBusca", busca.value.trim());
          if (active !== "pacientes") location.href = "pacientes.html";
          else window.dispatchEvent(new Event("sentinela:buscar"));
        }
      });
    }

    window.Sentinela.me = me;
  },
  fmtDate(iso) { try { return new Date(iso).toLocaleString("pt-BR"); } catch (e) { return iso || "-"; } }
};
