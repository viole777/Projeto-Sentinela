# 🔐 Credenciales de Acesso — Sentinela

> Sistema Hospitalar de Cardiologia · ❤️ SENTINELA

Este documento lista todos os usuários e senhas do projeto (ambiente de demonstração).

---

## 1. Usuários ativos no ambiente local atual

A persistência atual está em `backend/db.json` (JSON local). Hoje o arquivo contém
os usuários abaixo:

| Usuário        | Senha real                         | Cargo (função) | Observação                                      |
|----------------|-----------------------------------|----------------|-------------------------------------------------|
| `admin`        | `123`                             | admin          | perfil administrativo completo                   |
| `atendimento`  | `123`                             | atendimento    | senha armazenada em texto no JSON local          |
| `triagem`      | `123`                             | triagem        | senha armazenada como hash `scrypt` no JSON     |
| `medico`       | `123`                             | medico         | senha armazenada como hash `scrypt` no JSON     |
| `novo.setor`   | `trocar_no_primeiro_acesso`        | triagem        | usuário criado pela UI, com `setor = UTI`       |

```text
URL:       http://localhost:3000
Tela:      index.html (login principal)
```

> O login atual aceita o identificador do usuário no campo `usuario` (ex.: `triagem`,
> `medico`, `atendimento`), e também aceita `email` quando a conta possui esse campo
> preenchido. O usuário **nunca escolhe seu perfil** no login: o cargo e as permissões
> vêm da conta.

---

## 2. Cargos e permissões (RBAC)

O backend valida `usuário → sessão → role → permissão → rota`. A tabela de
permissões vive em `backend/src/db.js → ROLE_PERMISSIONS` e no PostgreSQL em
`roles` / `permissions` / `role_permissions` (`database/seeds.sql`).

| Role             | Acessos (resumo)                                                           |
|------------------|-----------------------------------------------------------------------------|
| `admin`          | Tudo (`*`)                                                                  |
| `cardiologist`   | Dashboard, pacientes, consultas, exames, prescrições, alertas, IA, auditoria|
| `medico`         | Igual a cardiologist (demo)                                                 |
| `enfermagem`     | Dashboard, pacientes, triagem (leitura/escrita), internações, exames, alertas |
| `triagem`        | Dashboard, pacientes (leitura), agendamentos, triagem (leitura/escrita), alertas |
| `farmacia`       | Dashboard, pacientes (leitura), prescrições + dispensar, estoque, alertas   |
| `atendimento`    | Dashboard, pacientes (leitura/escrita), agendamentos (leitura/escrita)         |
| `recepcao`       | Igual a atendimento                                                         |
| `direcao`        | Dashboard, relatórios, auditoria, pacientes (leitura), alertas              |

> **Nota sobre `enfermagem` e `triagem`:** em `ROLE_PERMISSIONS` (dev) são
> `triage.read/triage.write` + `appointments.read`; a nomenclatura da tabela
> é de referência. A autoridade real de cada rota está no backend
> (`requireAuth` + `requirePermission`), nunca no CSS.

---

## 3. Usuários criados pela UI (primeiro acesso)

Um profissional criado desde `frontend/profissionais.html` (`POST /profissionais`)
**não inicia com uma senha real definida**. O cadastro atual do ambiente local
criou o usuário abaixo:

| Usuário      | Senha inicial                   | Cargo | Setor | Requisito |
|--------------|-------------------------------|-------|-------|-----------|
| `novo.setor` | `trocar_no_primeiro_acesso`    | triagem | UTI | deve trocar a senha na primeira entrada |

Ao entrar pela primeira vez o sistema retorna `403 primeiro_acesso` e
redireciona a `primeiro-acesso.html`, onde o usuário **define sua própria senha**
(mínimo 6 caracteres). Não existe uma senha padrão permanente para estas contas:
a senha é definida pelo próprio profissional.

---

## 4. PostgreSQL (produção / Render)

Em produção o JSON **não** é o banco. Se usa PostgreSQL via `DATABASE_URL`:

| Variável       | Valor                                         |
|----------------|-----------------------------------------------|
| `DATABASE_URL` | `postgres://...` fornecida por Render         |
| `NODE_ENV`     | `production` (cookie `Secure`, hash `scrypt`) |

Os usuários no PostgreSQL são criados migrando `db.json`:

```bash
psql $DATABASE_URL -f database/schema.sql
psql $DATABASE_URL -f database/schema2.sql
psql $DATABASE_URL -f database/seeds.sql
DATABASE_URL=... npm run db:migrate   # copia usuarios/pacientes/… ao PostgreSQL
```

As senhas viajam no campo `password_hash` (em dev se re-hashean com
`scrypt` na primeira vez que o usuário entra).

---

## 5. ⚠️ Segurança — obrigatório antes de produção

1. **Trocar as senhas demo** (`123` para os três usuários) ou criar uma conta
   `admin` real antes de expor o sistema com dados reais.
2. **Nunca** usar o JSON como banco no Render (filesystem efímero).
3. **HTTPS obrigatório** (fornecido pelo Render no domínio do serviço).
4. **LGPD**: na demo usar só dados fictícios/sintéticos; todo acesso
   fica registrado em `audit_logs` / `auditoria`.
5. **Recuperação de senha**: em produção enviar o link por e-mail real;
   o token de demo (`?debug=1`) é só para desenvolvimento.

---

## 6. Verificação rápida

```bash
npm start
# → http://localhost:3000
# Login: triagem / 123       → dashboard TRIAGEM
# Login: medico / 123        → dashboard MÉDICO
# Login: atendimento / 123   → dashboard ATENDIMENTO
```

Qualquer usuário pode ver suas permissões na resposta de `/me`
(painel esquerdo do dashboard).