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

    const storedTheme = (me.theme === "light" || me.theme === "dark") ? me.theme : (localStorage.getItem("sentinela-theme") || "light");
    document.body.dataset.theme = storedTheme;
    localStorage.setItem("sentinela-theme", storedTheme);

    document.body.innerHTML =
      '<style>' +
      '.shell{display:flex;height:100vh;overflow:hidden;background:var(--bg);color:var(--text)}' +
      '.theme-toggle{border:1px solid var(--border);background:var(--panel);color:var(--text);padding:8px 10px;border-radius:var(--radius-sm);font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-width:110px;justify-content:center;}' +
      '.theme-toggle:hover{background:var(--panel-alt)}' +
      '.side{width:260px;flex:0 0 260px;background:var(--panel);border-right:1px solid var(--border);padding:18px 14px 12px;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;transition:width .2s ease,flex-basis .2s ease,padding .2s ease;}' +
      '.shell.sidebar-collapsed .side{width:72px;flex-basis:72px;padding-inline:10px}.shell.sidebar-collapsed .brand{justify-content:center;padding-inline:0}.shell.sidebar-collapsed .brand>div:last-child,.shell.sidebar-collapsed .nav-label,.shell.sidebar-collapsed .nav-link,.shell.sidebar-collapsed .nav-logout{font-size:0}.shell.sidebar-collapsed .nav-link{height:40px;padding:0;margin:3px 0}.shell.sidebar-collapsed .nav-link::before{content:"•";font-size:22px;line-height:38px;color:var(--muted);display:block;text-align:center}.shell.sidebar-collapsed .nav-link.active::before{color:var(--brand)}.shell.sidebar-collapsed .nav-logout{height:40px;padding:0}.shell.sidebar-collapsed .nav-logout::before{content:"↪";font-size:20px;line-height:38px;display:block;text-align:center}.shell.sidebar-collapsed .nav-group{margin-bottom:8px}' +
      '.brand{display:flex;align-items:center;gap:10px;padding:8px 10px 14px;border-bottom:1px solid var(--border);margin-bottom:12px}' +
      '.brand-mark{width:30px;height:30px;border-radius:8px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex:0 0 auto;}' +
      '.brand-name{font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--text)}' +
      '.brand-sub{font-size:11px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}' +
      '.nav-group{margin-bottom:12px}' +
      '.nav-label{padding:8px 10px 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}' +
      '.nav-link{display:block;padding:9px 10px;border-radius:var(--radius-sm);color:var(--text);font-size:14px;border:1px solid transparent;}' +
      '.nav-link:hover{background:var(--panel-alt);border-color:var(--border)}' +
      '.nav-link.active{background:var(--brand-soft);color:var(--brand-strong);border-color:#bfe7df;font-weight:700}' +
      '.nav-spacer{flex:1}' +
      '.nav-logout{display:block;padding:9px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--panel);color:var(--text);font-size:14px;font-weight:600;margin-top:8px}' +
      '.main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--bg)}' +
      '.top{display:flex;align-items:center;gap:16px;padding:14px 22px;border-bottom:1px solid var(--border);background:var(--panel);flex:0 0 auto;z-index:5}' +
      '.page-meta{flex:1;min-width:0}' +
      '.page-path{font-size:11px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;font-weight:700}' +
      '.page-title{font-size:18px;font-weight:800;color:var(--text);margin-top:2px}' +
      '.top-search{max-width:360px;width:100%}' +
      '.top-search input{background:var(--panel);border:1px solid var(--border);border-radius:4px;padding:9px 10px;color:var(--text)}' +
      '.user-badge{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:4px;border:1px solid var(--border);background:var(--panel)}' +
      '.user-avatar{width:28px;height:28px;border-radius:50%;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}' +
      '.user-text{display:flex;flex-direction:column;gap:2px;line-height:1.1}' +
      '.user-name{font-size:13px;font-weight:700}' +
      '.user-role{font-size:11px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}' +
      '.sidebar-toggle{width:34px;height:34px;padding:0;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel);color:var(--text);font-size:18px;line-height:1;cursor:pointer}.sidebar-toggle:hover{background:var(--panel-alt)}' +
      '.content{flex:1;min-height:0;overflow-y:auto;padding:22px;max-width:none;width:100%}.content>*{max-width:1280px;margin-left:auto;margin-right:auto}.dashboard-page{padding-bottom:32px}.dashboard-page .panel{box-shadow:0 1px 2px rgba(16,24,40,.04)}' +
      '@media(max-width:860px){body{overflow:auto}.shell{display:block;height:auto;overflow:visible}.side{position:static;width:100%;height:auto;max-height:none;overflow:visible}.shell.sidebar-collapsed .side{width:100%;padding:18px 14px 12px}.shell.sidebar-collapsed .brand{justify-content:flex-start;padding-inline:10px}.shell.sidebar-collapsed .brand>div:last-child,.shell.sidebar-collapsed .nav-label,.shell.sidebar-collapsed .nav-link,.shell.sidebar-collapsed .nav-logout{font-size:inherit}.shell.sidebar-collapsed .nav-link{height:auto;padding:9px 10px;margin:0}.shell.sidebar-collapsed .nav-link::before,.shell.sidebar-collapsed .nav-logout::before{display:none}.top{flex-wrap:wrap}.top-search{max-width:none}.content{overflow:visible;padding:16px}}' +
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
            '<button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Recolher menu" aria-expanded="true">☰</button>' +
            '<div class="page-meta">' +
              '<div class="page-path">Sistema / ' + (active || 'Sentinela') + '</div>' +
              '<div class="page-title">' + (active === 'dashboard' ? 'Dashboard' : active === 'atendimento' ? 'Atendimento' : active === 'casa' ? 'Atendimento Domiciliar' : active === 'triagem' ? 'Triagem' : active === 'pacientes' ? 'Pacientes' : active === 'farmacia' ? 'Farmácia' : active === 'estoque' ? 'Estoque' : active === 'exames' ? 'Exames' : active === 'config' ? 'Configurações' : 'Sentinela') + '</div>' +
            '</div>' +
            '<div class="top-search"><input id="buscaGlobal" placeholder="Buscar paciente por nome ou CPF"></div>' +
            '<button class="theme-toggle" id="themeToggle" type="button">' + (storedTheme === 'dark' ? '☀️ Modo claro' : '🌙 Modo escuro') + '</button>' +
            '<div class="user-badge">' +
              '<div class="user-avatar">' + ((me.nome || me.usuario || 'U').charAt(0).toUpperCase()) + '</div>' +
              '<div class="user-text"><span class="user-name">' + (me.nome || me.usuario) + '</span><span class="user-role">' + (me.role || '').toUpperCase() + '</span></div>' +
            '</div>' +
          '</header>' +
          '<main class="content" id="app"></main>' +
        '</div>' +
      '</div>';

    document.getElementById("app").innerHTML = contentHTML;

    const shell = document.querySelector(".shell");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebarCollapsed = localStorage.getItem("sentinela-sidebar-collapsed") === "true";
    const setSidebar = (collapsed) => {
      shell.classList.toggle("sidebar-collapsed", collapsed);
      sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
      sidebarToggle.setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
      sidebarToggle.textContent = collapsed ? "☰" : "‹";
      localStorage.setItem("sentinela-sidebar-collapsed", String(collapsed));
    };
    setSidebar(sidebarCollapsed);
    sidebarToggle.addEventListener("click", () => setSidebar(!shell.classList.contains("sidebar-collapsed")));

    const themeToggle = document.getElementById("themeToggle");
    const applyTheme = (theme) => {
      document.body.dataset.theme = theme;
      localStorage.setItem("sentinela-theme", theme);
      me.theme = theme; // el login de la próxima vez usará esta preferencia
      if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️ Modo claro' : '🌙 Modo escuro';
      }
      // Persiste por usuario en el servidor (vale en todos los dispositivos)
      try {
        fetch("/me/tema", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tema: theme })
        }).catch(() => {});
      } catch (_) { /* la preferencia local sigue funcionando */ }
    };

    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
      });
    }

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
