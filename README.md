# Projeto Sentinela

Sistema hospitalar web em evolução, composto por backend Node.js/Express, PostgreSQL e frontend React+Vite+TypeScript.

## Visão geral

O projeto cobre protótipos de cadastro e busca de pacientes, triagem, consulta, prontuário, exames, prescrição, farmácia, estoque, atendimentos domiciliares, alertas e auditoria.

**Status regulatório:** este repositório não está aprovado para uso assistencial real, venda como sistema clínico de produção ou afirmação de conformidade regulatória. Consulte [docs/COMMERCIAL_READINESS_AUDIT.md](docs/COMMERCIAL_READINESS_AUDIT.md).

Use somente dados sintéticos em desenvolvimento, testes, seeds, logs e screenshots.

## Arquitetura

- `backend/`: API Express e serviços atuais.
- `frontend-v2/`: frontend oficial React+Vite+TypeScript.
- `frontend/`: frontend legado em HTML, CSS e JavaScript. Diretório deprecado; não receber novas páginas.
- `database/`: schema, migrations e scripts de migração.
- `docs/`: documentação técnica e auditorias.
- `scripts/` e `tests/`: testes, fixtures sintéticas e utilitários.

O backend usa PostgreSQL em produção. Detalhes em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Como rodar

Requisitos:

- Node.js 22 LTS (`.nvmrc`)
- npm 10 ou superior
- PostgreSQL

```bash
nvm use
npm ci
npm run build:frontend
cp .env.example .env
npm start
```

O servidor fica disponível em `http://localhost:3000`.

Para desenvolvimento:

```bash
npm run dev
```

O frontend React pode ser desenvolvido separadamente:

```bash
npm run dev --prefix frontend-v2
```

O comando `npm start` inicia apenas o servidor; não executa lint, testes ou build.

## Variáveis de ambiente

Copie `.env.example` e ajuste os valores locais. Consulte o arquivo para a lista atualizada.

Variáveis principais:

- `PORT`: porta HTTP.
- `NODE_ENV`: `development`, `test` ou `production`.
- `DATABASE_URL`: conexão PostgreSQL.
- `PGSSL`: configuração TLS do PostgreSQL.
- `GEMINI_API_KEY`, `AI_API_URL` e `AI_MODEL`: integração opcional de IA.

Não coloque segredos reais no repositório.

## Testes

```bash
npm run lint
npm run typecheck
npm run test:unit
npm test
npm run build:frontend
```

O CI aplica o schema com fixtures sintéticas, provisiona dados temporários e inicia o servidor para testes HTTP.

## Documentação

- [Auditoria de prontidão comercial](docs/COMMERCIAL_READINESS_AUDIT.md)
- [Matriz de autorização](docs/AUTHORIZATION_MATRIX.md)
- [Escopo da plataforma clínica](docs/CLINICAL_PLATFORM_SCOPE.md)
- [Critérios de aceite dos PRs](docs/PR_ROADMAP_1_8_ACCEPTANCE.md)
- [Roadmap mestre de implementação — Fases 0 a 7](docs/MASTER_ROADMAP_0_7.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Mapa de paridade frontend](docs/FRONTEND_PARITY.md)
- [Segurança de implantação](docs/DEPLOYMENT_SECURITY.md)
- [ADR da stack](docs/ADR/0001-stack.md)

## Frontend legado

O diretório `frontend/` está **deprecated** e será removido após a migração das páginas restantes para `frontend-v2`. Ele não deve receber páginas ou funcionalidades novas. Consulte [docs/FRONTEND_PARITY.md](docs/FRONTEND_PARITY.md).

## Licenciamento

O arquivo [LICENSE](LICENSE) permanece como decisão jurídica pendente. Não foi tomada uma decisão comercial de licenciamento: pendências estão registradas na auditoria comercial. O campo `license` do pacote aponta para a análise desse arquivo em vez de declarar uma licença incompatível.
