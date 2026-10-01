// Shell visual e controle de acesso do Sentinela.
window.Sentinela = {
  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  },

  async mount(active, contentHTML) {
    let me;
    try {
      const response = await fetch("/me", { cache: "no-store" });
      if (!response.ok) { location.href = "index.html"; return; }
      me = await response.json();
    } catch (_) {
      location.href = "index.html";
      return;
    }

    const role = String(me.role || me.tipo || "").toLowerCase();
    const perms = Array.isArray(me.permissions) ? me.permissions : [];
    const isAdmin = role === "admin";
    const can = (permission) => perms.includes("*") || perms.includes(permission);

    // Configurações e Safety Engine são áreas de governança do sistema.
    // A regra é repetida no backend para não depender apenas da interface.
    if ((active === "config" || active === "safety") && !isAdmin) {
      location.replace("dashboard.html");
      return;
    }

    const item = (id, href, label, permission, adminOnly = false) => {
      if (adminOnly && !isAdmin) return "";
      if (permission && !can(permission) && !adminOnly) return "";
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
        item("relatorios", "relatorios.html", "Relatórios", "reports.read"),
        item("profissionais", "profissionais.html", "Profissionais", "audit.read"),
        item("auditoria", "auditoria.html", "Auditoria", "audit.read"),
        item("safety", "safety-engine.html", "Safety Engine", null, true),
        item("config", "configuracoes.html", "Configurações", null, true)
      ]]
    ];

    const navHTML = groups.map(([label, items]) => {
      const visible = items.filter(Boolean).join("");
      return visible
        ? '<div class="nav-group"><div class="nav-label">' + this.escapeHtml(label) + '</div>' + visible + '</div>'
        : "";
    }).join("");

    const storedTheme = me.theme === "light" || me.theme === "dark"
      ? me.theme
      : (localStorage.getItem("sentinela-theme") || "light");

    document.body.dataset.theme = storedTheme;
    localStorage.setItem("sentinela-theme", storedTheme);

    const pageTitles = {
      dashboard:"Dashboard", atendimento:"Atendimento", casa:"Atendimento Domiciliar",
      triagem:"Triagem", pacientes:"Pacientes", farmacia:"Farmácia", estoque:"Estoque",
      exames:"Exames", config:"Configurações", safety:"Safety Engine",
      consulta:"Consultas", prontuario:"Prontuários", fila:"Fila", internacao:"Internações",
      leitos:"Leitos", alertas:"Alertas", relatorios:"Relatórios",
      profissionais:"Profissionais", auditoria:"Auditoria", ai:"Sentinela AI"
    };

    document.body.innerHTML =
      '<div class="shell">' +
        '<aside class="side">' +
          '<div class="brand"><div class="brand-mark">S</div><div><div class="brand-name">SENTINELA</div><div class="brand-sub">Cardiologia</div></div></div>' +
          navHTML +
          '<div class="nav-spacer"></div>' +
          '<a href="#" class="nav-logout" id="btnSair">Sair da sessão</a>' +
        '</aside>' +
        '<div class="main">' +
          '<header class="top">' +
            '<button class="sidebar-toggle" id="sidebarToggle" type="button" aria-label="Recolher menu" aria-expanded="true">≡</button>' +
            '<div class="page-meta"><div class="page-path">Sistema / ' + this.escapeHtml(active || "Sentinela") + '</div><div class="page-title">' + this.escapeHtml(pageTitles[active] || "Sentinela") + '</div></div>' +
            '<div class="top-search"><input id="buscaGlobal" aria-label="Buscar paciente" placeholder="Buscar paciente por nome ou CPF"></div>' +
            '<button class="theme-toggle" id="themeToggle" type="button" aria-label="Alternar tema">' + (storedTheme === "dark" ? "Modo claro" : "Modo escuro") + '</button>' +
            '<div class="user-badge"><div class="user-avatar">' + this.escapeHtml((me.nome || me.usuario || "U").charAt(0).toUpperCase()) + '</div><div class="user-text"><span class="user-name">' + this.escapeHtml(me.nome || me.usuario) + '</span><span class="user-role">' + this.escapeHtml(role) + '</span></div></div>' +
          '</header>' +
          '<main class="content" id="app"></main>' +
        '</div>' +
      '</div>';

    document.getElementById("app").innerHTML = contentHTML;

    const shell = document.querySelector(".shell");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const collapsed = localStorage.getItem("sentinela-sidebar-collapsed") === "true";
    const setSidebar = (value) => {
      shell.classList.toggle("sidebar-collapsed", value);
      sidebarToggle.setAttribute("aria-expanded", String(!value));
      sidebarToggle.setAttribute("aria-label", value ? "Expandir menu" : "Recolher menu");
      sidebarToggle.textContent = value ? "≡" : "←";
      localStorage.setItem("sentinela-sidebar-collapsed", String(value));
    };
    setSidebar(collapsed);
    sidebarToggle.addEventListener("click", () => setSidebar(!shell.classList.contains("sidebar-collapsed")));

    const themeToggle = document.getElementById("themeToggle");
    const applyTheme = (theme) => {
      document.body.dataset.theme = theme;
      localStorage.setItem("sentinela-theme", theme);
      if (themeToggle) themeToggle.textContent = theme === "dark" ? "Modo claro" : "Modo escuro";
      fetch("/me/tema", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ tema:theme })
      }).catch(() => {});
    };
    themeToggle?.addEventListener("click", () => applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark"));

    document.getElementById("btnSair").onclick = (event) => {
      event.preventDefault();
      fetch("/logout", { method:"POST" }).finally(() => { location.href = "index.html"; });
    };

    const busca = document.getElementById("buscaGlobal");
    busca?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && busca.value.trim()) {
        sessionStorage.setItem("pacienteBusca", busca.value.trim());
        if (active !== "pacientes") location.href = "pacientes.html";
        else window.dispatchEvent(new Event("sentinela:buscar"));
      }
    });

    window.Sentinela.me = me;
  },

  fmtDate(iso) {
    try { return new Date(iso).toLocaleString("pt-BR"); }
    catch (_) { return iso || "-"; }
  }
};
