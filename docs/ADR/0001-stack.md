# ADR 0001 — Stack da plataforma

- **Status:** aceito
- **Data:** 2026-11-19

## Decisão

1. Código novo de backend e frontend deve ser desenvolvido em TypeScript com configuração strict.
2. PostgreSQL é a única fonte de verdade em produção; adaptadores em memória são reservados a testes.
3. React+Vite+TypeScript é o único frontend da plataforma; o HTML legado é deprecado e será removido após migração.

## Consequências

- Migrations versionadas e reversíveis passam a ser o mecanismo de evolução do banco.
- Testes precisam cobrir comportamento com PostgreSQL real.
- Rotas e componentes legados devem ser migrados para `frontend-v2` antes da retirada de `frontend/`.
