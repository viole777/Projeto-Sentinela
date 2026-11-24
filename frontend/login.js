// Se já logado, vai direto ao dashboard do seu cargo
        fetch("/me").then(r => { if (r.ok) location.href = "dashboard.html"; }).catch(() => {});
        function dashboardFor(role) {
            return "dashboard.html"; // dashboard único que se adapta ao cargo
        }
        async function login() {
            const identificador = document.getElementById('email').value.trim();
            const senha = document.getElementById('senha').value;
            const err = document.getElementById('err');
            const btn = document.getElementById('loginBtn');
            err.textContent = "";
            if (!identificador || !senha) { err.textContent = "Informe e-mail e senha para entrar."; return; }
            btn.disabled = true;
            btn.textContent = "Entrando...";
            try {
                const r = await fetch("/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ usuario: identificador, senha })
                });
                const data = await r.json().catch(() => ({}));
                if (r.status === 403 && data.erro === "primeiro_acesso") {
                    sessionStorage.setItem("primeiroAcessoId", data.usuarioId);
                    location.href = "primeiro-acesso.html";
                    return;
                }
                if (!r.ok) {
                    err.textContent = data.erro || "Não foi possível entrar no sistema. Tente novamente.";
                    return;
                }
                sessionStorage.setItem("sentinelaRole", data.role || data.tipo);
                sessionStorage.setItem("sentinelaNome", data.nome || data.usuario);
                location.href = dashboardFor(data.role || data.tipo);
            } catch (e) {
                err.textContent = "Servidor indisponível. Tente novamente em instantes.";
            } finally {
                btn.disabled = false;
                btn.textContent = "Entrar";
            }
        }
        document.getElementById('loginBtn').addEventListener('click', login);
        document.getElementById('senha').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
        document.getElementById('toggleSenha').addEventListener('click', () => {
            const senhaField = document.getElementById('senha');
            const isHidden = senhaField.type === 'password';
            senhaField.type = isHidden ? 'text' : 'password';
            document.getElementById('toggleSenha').textContent = isHidden ? 'Ocultar' : 'Mostrar';
        });
