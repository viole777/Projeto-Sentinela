# Sentinela — Frontend Clínico v1
Frontend React + TypeScript + Vite para evolução da interface do Projeto Sentinela. Este pacote é isolado do frontend legado em `frontend/` para permitir migração gradual sem interromper os fluxos atuais.

## Executar
Requisitos: Node.js 20+ e npm.
```bash
cd frontend-v2
npm install
npm run dev
```
Build de produção: `npm run build`; prévia: `npm run preview`.

## API
O login usa `POST /login` com `{ usuario, senha }` e sessão por cookie. O Vite deve ser configurado com proxy para o backend local antes de testar a autenticação local. A disponibilidade de cada módulo depende da integração e das permissões da API correspondente. A presença de uma tela não comprova validação institucional, homologação ou aptidão para atendimento real. Não utilize esta interface para decisões clínicas sem validação formal.

## Design system
Identidade própria Sentinela: grafite profundo, cobre suave e superfícies em marfim, com acentos verde-sálvia, tema escuro por classe `dark`, foco acessível, tabelas densas e componentes em `src/components/ui.tsx`.

## Estrutura
- `src/components/AppShell.tsx`: navegação, cabeçalho, sidebar colapsável e tema.
- `src/components/ui.tsx`: Button, Input, Field, Card, Badge e PageHeader.
- `src/pages/Login.tsx`: login, primeiro acesso e recuperação.
- `src/pages/Dashboard.tsx`: painel operacional demonstrativo.
