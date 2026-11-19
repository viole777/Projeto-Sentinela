# Projeto Sentinela — instruções permanentes

## Contexto
Sistema hospitalar web (HIS/HCIS) brasileiro, a ser evoluído de protótipo para produto comercializável.
Stack atual: Node.js/Express 5 (backend), PostgreSQL, React+Vite+TypeScript+Tailwind (`frontend-v2`), frontend legado em HTML puro (`frontend/`, será descontinuado).
Leia antes de qualquer tarefa: `docs/COMMERCIAL_READINESS_AUDIT.md`, `docs/AUTHORIZATION_MATRIX.md`, `docs/CLINICAL_PLATFORM_SCOPE.md`, `docs/PR_ROADMAP_1_8_ACCEPTANCE.md` e `docs/MASTER_ROADMAP_0_7.md`.

## Regras inegociáveis
1. **Honestidade de status.** Nunca marque como concluído algo que dependa de terceiro (ANVISA, SBIS, ICP-Brasil, CADSUS, Gov.br, SINAN, SIA/SIH, operadoras TISS, pentest, validação clínica, parecer jurídico). Construa adaptadores, contratos, testes com mocks e documentação, e registre o item como "pendente de evidência externa".
2. **Não invente dado clínico ou oficial.** Proibido inventar códigos CID/SIGTAP/TUSS/CBO, interações medicamentosas, doses, protocolos, tabelas de faturamento ou leiautes oficiais. Sem base importada, a API responde indisponibilidade explícita (HTTP 503 com código de erro estável).
3. **Fail closed.** Autorização negada por padrão. Erro de banco, de permissão ou de auditoria nega a operação.
4. **Nunca enfraqueça testes, CSP, autenticação ou validações para o CI passar.**
5. **Dados reais de paciente são proibidos** em código, seeds, fixtures, testes, logs e screenshots. Apenas dados sintéticos.
6. **Sem segredos no repositório.** Tudo por variável de ambiente; atualizar `.env.example`.
7. **Sem exclusão física de registro clínico.** Correção = novo registro versionado com autor, data/hora, motivo, versão anterior e nova.
8. **Toda escrita clínica é transacional e grava auditoria na mesma transação.** Falha de auditoria aborta a operação. A cadeia de hash deve serializar escritores concorrentes com lock transacional; nunca calcular o hash anterior fora da transação da escrita.
9. **Cada endpoint** exige: autenticação, permissão explícita (`requirePermission`), escopo por unidade/paciente/vínculo assistencial, validação de entrada por schema, rate limit quando aplicável, erro padronizado e teste negativo de autorização.
10. **Minimização de dados.** Respostas retornam só os campos que o perfil precisa. CPF/CNS mascarados por padrão; log usa hash.

## Padrões de código
- Código novo em **TypeScript strict**; identificadores e rotas em inglês; textos de interface, mensagens e documentação em **pt-BR**.
- API versionada `/api/v1`, OpenAPI atualizado, paginação por cursor, idempotência (`Idempotency-Key`) em POST críticos, erros no formato `{ code, message, details?, requestId }`.
- Validação com schemas (Zod ou equivalente). Banco por migrações versionadas e reversíveis; nada de DDL fora de `database/migrations`.
- Camadas: `routes` → `services` → `repositories`. Proibido lógica de negócio em rota.
- Frontend: somente `frontend-v2`. Não criar páginas novas em `frontend/`.
- Acessibilidade WCAG 2.1 AA, responsivo (desktop, tablet, totem), estados de loading/erro/vazio em toda tela.
- Todo PR inclui: testes unitários + integração + testes negativos de autorização; atualização de docs; nota de migração; checklist de risco.

## Definição de pronto (DoD)
`npm run lint`, `npm run typecheck`, `npm run test:unit`, testes de integração com PostgreSQL real, build do frontend e varredura de segredos passando; cobertura mínima de 80% nos serviços novos; sem `any` implícito; sem TODO sem issue vinculada.
