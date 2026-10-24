// Layout unico do Sentinela: sidebar + header operacionais.
window.Sentinela = {
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },
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
      return visibleItems ? '<div class="nav-group"><div class="nav-label">' + window.Sentinela.escapeHtml(label) + '</div>' + visibleItems + '</div>' : "";
    }).join("");

    const storedTheme = (me.theme === "light" || me.theme === "dark") ? me.theme : (localStorage.getItem("sentinela-theme") || "light");
    document.body.dataset.theme = storedTheme;
    localStorage.setItem("sentinela-theme", storedTheme);

    document.body.innerHTML =
      '<style>' +
      ':root{--bg:#f3f5f4;--panel:#ffffff;--panel-alt:#f5f8f6;--text:#172b2a;--muted:#647875;--border:#dce7e2;--brand:#087f73;--brand-strong:#075e56;--brand-soft:#dff5ef;--shadow:0 18px 44px rgba(18,49,44,.07)}' +
      'body[data-theme="dark"]{--bg:#0b1717;--panel:#102322;--panel-alt:#17302e;--text:#e9f6f1;--muted:#a0bbb3;--border:#284440;--brand:#64e3c4;--brand-strong:#8bf0d4;--brand-soft:#173c36;--shadow:0 18px 44px rgba(0,0,0,.24)}' +
      '.shell{display:flex;height:100vh;overflow:hidden;background:var(--bg);color:var(--text)}' +
      '.theme-toggle{border:1px solid var(--border);background:var(--panel);color:var(--text);padding:8px 12px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;min-width:118px;justify-content:center;box-shadow:0 1px 2px rgba(15,23,42,.04)}' +
      '.theme-toggle:hover{background:var(--panel-alt)}' +
      '.side{width:260px;flex:0 0 260px;background:var(--panel);border-right:1px solid var(--border);padding:18px 14px 12px;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;transition:width .2s ease,flex-basis .2s ease,padding .2s ease}' +
      '.shell.sidebar-collapsed .side{width:72px;flex-basis:72px;padding-inline:10px}.shell.sidebar-collapsed .brand{justify-content:center;padding-inline:0}.shell.sidebar-collapsed .brand>div:last-child,.shell.sidebar-collapsed .nav-label,.shell.sidebar-collapsed .nav-link,.shell.sidebar-collapsed .nav-logout{font-size:0}.shell.sidebar-collapsed .nav-link{height:40px;padding:0;margin:3px 0}.shell.sidebar-collapsed .nav-link::before{content:"•";font-size:22px;line-height:38px;color:var(--muted);display:block;text-align:center}.shell.sidebar-collapsed .nav-link.active::before{color:var(--brand)}.shell.sidebar-collapsed .nav-logout{height:40px;padding:0}.shell.sidebar-collapsed .nav-logout::before{content:"<";font-size:20px;line-height:38px;display:block;text-align:center}.shell.sidebar-collapsed .nav-group{margin-bottom:8px}' +
      '.brand{display:flex;align-items:center;gap:10px;padding:8px 10px 14px;border-bottom:1px solid var(--border);margin-bottom:12px}' +
      '.brand-mark{width:30px;height:30px;border-radius:10px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex:0 0 auto;box-shadow:var(--shadow)}' +
      '.brand-name{font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--text)}' +
      '.brand-sub{font-size:11px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}' +
      '.nav-group{margin-bottom:12px}' +
      '.nav-label{padding:8px 10px 6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}' +
      '.nav-link{display:block;padding:9px 10px;border-radius:10px;color:var(--text);font-size:14px;border:1px solid transparent;}' +
      '.nav-link:hover{background:var(--panel-alt);border-color:var(--border)}' +
      '.nav-link.active{background:var(--brand-soft);color:var(--brand-strong);border-color:#cfe3fb;font-weight:700}' +
      '.nav-spacer{flex:1}' +
      '.nav-logout{display:block;padding:9px 10px;border-radius:10px;border:1px solid var(--border);background:var(--panel);color:var(--text);font-size:14px;font-weight:600;margin-top:8px}' +
      '.main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--bg)}' +
      '.top{display:flex;align-items:center;gap:16px;padding:14px 22px;border-bottom:1px solid var(--border);background:var(--panel);flex:0 0 auto;z-index:5}' +
      '.page-meta{flex:1;min-width:0}' +
      '.page-path{font-size:11px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;font-weight:700}' +
      '.page-title{font-size:18px;font-weight:800;color:var(--text);margin-top:2px}' +
      '.top-search{max-width:360px;width:100%}' +
      '.top-search input{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:9px 10px;color:var(--text)}' +
      '.user-badge{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:10px;border:1px solid var(--border);background:var(--panel)}' +
      '.user-avatar{width:28px;height:28px;border-radius:50%;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}' +
      '.user-text{display:flex;flex-direction:column;gap:2px;line-height:1.1}' +
      '.user-name{font-size:13px;font-weight:700}' +
      '.user-role{font-size:11px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}' +
      '.sidebar-toggle{width:34px;height:34px;padding:0;border:1px solid var(--border);border-radius:10px;background:var(--panel);color:var(--text);font-size:18px;line-height:1;cursor:pointer}.sidebar-toggle:hover{background:var(--panel-alt)}' +
      '.content{flex:1;min-height:0;overflow-y:auto;padding:22px;max-width:none;width:100%}.content>*{max-width:1280px;margin-left:auto;margin-right:auto}.dashboard-page{padding-bottom:32px}.dashboard-page .panel{box-shadow:0 1px 2px rgba(16,24,40,.04)}' +
      '.demo-notice{padding:10px 22px;background:#fff8e8;border-bottom:1px solid #ead7a3;color:#604b18;font-size:12px;line-height:1.5}.demo-notice strong{font-weight:800}.demo-notice a{color:#604b18;text-decoration:underline;font-weight:700;margin-left:5px}body[data-theme="dark"] .demo-notice{background:#302a1a;border-color:#63552d;color:#f6e6b3}body[data-theme="dark"] .demo-notice a{color:#f6e6b3}@media(max-width:860px){.demo-notice{padding:10px 16px}}' +
      '@media(max-width:860px){body{overflow:auto}.shell{display:block;height:auto;overflow:visible}.side{position:static;width:100%;height:auto;max-height:none;overflow:visible}.shell.sidebar-collapsed .side{width:100%;padding:18px 14px 12px}.shell.sidebar-collapsed .brand{justify-content:flex-start;padding-inline:10px}.shell.sidebar-collapsed .brand>div:last-child,.shell.sidebar-collapsed .nav-label,.shell.sidebar-collapsed .nav-link,.shell.sidebar-collapsed .nav-logout{font-size:inherit}.shell.sidebar-collapsed .nav-link{height:auto;padding:9px 10px;margin:0}.shell.sidebar-collapsed .nav-link::before,.shell.sidebar-collapsed .nav-logout::before{display:none}.top{flex-wrap:wrap}.top-search{max-width:none}.content{overflow:visible;padding:16px}}' +
      'body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:-.01em}.shell{background:radial-gradient(ellipse at 75% 0%,rgba(8,127,115,.07),transparent 38%),var(--bg)}.side{background:linear-gradient(180deg,#102a28 0%,#0b211f 100%);border-right:1px solid #20413c;color:#e9f6f1;padding:22px 14px 16px}.brand{border-bottom:1px solid rgba(222,247,239,.13);padding:10px 10px 22px;margin-bottom:18px}.brand-mark{width:38px;height:38px;border-radius:13px;background:linear-gradient(145deg,#67e6c5,#0a8b7b);color:#082a25;font-size:16px;box-shadow:0 8px 22px rgba(25,198,160,.18)}.brand-name{color:#f2fff9;font-size:14px;letter-spacing:.16em}.brand-sub{color:#88b7aa;font-size:10px;letter-spacing:.16em;margin-top:4px}.nav-group{margin-bottom:18px}.nav-label{color:#77a79a;font-size:10px;letter-spacing:.18em;padding:8px 12px}.nav-link{position:relative;color:#d2e7df;border:1px solid transparent;border-radius:11px;padding:10px 12px;margin:3px 0;font-size:13px;transition:background .18s,border-color .18s,color .18s}.nav-link:hover{background:rgba(231,255,246,.07);border-color:rgba(231,255,246,.08);color:#fff}.nav-link.active{background:linear-gradient(90deg,rgba(74,218,183,.19),rgba(74,218,183,.06));color:#8df2d5;border-color:rgba(100,227,196,.2);font-weight:750}.nav-link.active:before{content:"";position:absolute;left:-1px;top:8px;bottom:8px;width:3px;border-radius:0 4px 4px 0;background:#64e3c4}.nav-logout{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.12);color:#d7eae3}.nav-logout:hover{background:rgba(255,255,255,.09)}.main{background:transparent}.top{background:rgba(255,255,255,.84);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);padding:16px 26px;gap:18px}body[data-theme="dark"] .top{background:rgba(16,35,34,.88)}.page-path{font-size:10px;letter-spacing:.16em;color:var(--muted)}.page-title{font-size:22px;letter-spacing:-.04em;font-weight:780}.top-search input{border-radius:12px;padding:11px 14px;background:var(--panel-alt);border-color:var(--border);transition:box-shadow .18s,border-color .18s}.top-search input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px rgba(8,127,115,.1)}.user-badge{border-radius:14px;padding:7px 12px;background:var(--panel-alt)}.user-avatar{width:34px;height:34px;border-radius:11px;background:var(--brand-soft);color:var(--brand-strong)}.theme-toggle,.sidebar-toggle{border-radius:12px;transition:transform .18s,background .18s}.theme-toggle:hover,.sidebar-toggle:hover{transform:translateY(-1px)}.content{padding:28px;scrollbar-color:var(--border) transparent}.content>*{max-width:1380px}.content .panel,.content .card,.content section,.content .stat-card{border-radius:18px}.demo-notice{background:#e6f7ef;border-bottom:1px solid #c4e8da;color:#245b4e;padding:10px 26px;font-size:11px;letter-spacing:.005em}.demo-notice a{color:#087f73}body[data-theme="dark"] .demo-notice{background:#18352f;border-color:#2b574b;color:#c6eee1}body[data-theme="dark"] .demo-notice a{color:#8df2d5}@media(max-width:860px){.side{background:#102a28}.top{padding:14px 16px}.page-title{font-size:20px}.content{padding:16px}}' +
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
            '<button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Recolher menu" aria-expanded="true">=</button>' +
            '<div class="page-meta">' +
              '<div class="page-path">Sistema / ' + window.Sentinela.escapeHtml(active || 'Sentinela') + '</div>' +
              '<div class="page-title">' + window.Sentinela.escapeHtml(active === 'dashboard' ? 'Dashboard' : active === 'atendimento' ? 'Atendimento' : active === 'casa' ? 'Atendimento Domiciliar' : active === 'triagem' ? 'Triagem' : active === 'pacientes' ? 'Pacientes' : active === 'farmacia' ? 'Farmácia' : active === 'estoque' ? 'Estoque' : active === 'exames' ? 'Exames' : active === 'config' ? 'Configurações' : 'Sentinela') + '</div>' +
            '</div>' +
            '<div class="top-search"><input id="buscaGlobal" placeholder="Buscar paciente por nome ou CPF"></div>' +
            '<button class="theme-toggle" id="themeToggle" type="button">' + (storedTheme === 'dark' ? 'Modo claro' : 'Modo escuro') + '</button>' +
            '<div class="user-badge">' +
              '<div class="user-avatar">' + window.Sentinela.escapeHtml((me.nome || me.usuario || 'U').charAt(0).toUpperCase()) + '</div>' +
              '<div class="user-text"><span class="user-name">' + window.Sentinela.escapeHtml(me.nome || me.usuario) + '</span><span class="user-role">' + window.Sentinela.escapeHtml((me.role || '').toUpperCase()) + '</span></div>' +
            '</div>' +
          '</header>' +
          '<div class="demo-notice" role="note"><strong>Ambiente demonstrativo.</strong> Não insira dados reais de pacientes. Este protótipo acadêmico não substitui prontuário oficial nem decisão profissional. <a href="privacidade.html">Privacidade e uso de dados</a></div>' +
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
      sidebarToggle.textContent = collapsed ? "=" : "<";
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
        themeToggle.textContent = theme === 'dark' ? 'Modo claro' : 'Modo escuro';
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
