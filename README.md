# Projeto Sentinela

O Projeto Sentinela é um sistema hospitalar de cardiologia com foco em fluxo clínico integrado, gestão de pacientes e apoio ao atendimento. A base atual já continha um núcleo funcional, e a refatoração da Fase 1 foi feita para corrigir a arquitetura, a navegação e o controle de acesso sem remover módulos existentes.

## Estado da refatoração

### Fase 1 concluída
- Corrigida a arquitetura de navegação e sessão.
- Ajustadas rotas e permissões para refletir o cargo real da conta.
- Padronizada a leitura do layout global e do menu lateral por perfil.
- Melhorados os fluxos de login, recuperação de senha e primeiro acesso.
- Adicionado exemplo de configuração de ambiente e script de teste não quebrado.

### Fase 2 concluída
- Expandidos endpoints de usuários, cargos, permissões e setores.
- Adicionado suporte a `setor` no cadastro de profissionais.
- Melhorada a visão de perfis e acesso ao painel administrativo.

### Fase 3 concluída
- Validados e preservados os fluxos de exames, farmácia, alertas e Safety Engine.
- Ajustada a tela de regras do Safety Engine para edição e persistência.
- Mantido o fluxo clínico principal e o suporte operacional sem remover módulos existentes.

### Base SQL principal concluída
- Preenchido o arquivo [database.sql](database.sql) com esquema principal, seed inicial e estrutura de apoio para PostgreSQL.

## Fluxo principal

1. Login por e-mail institucional.
2. Sessão autenticada em cookie HttpOnly.
3. Carregamento do dashboard conforme permissões do perfil.
4. Atendimento → triagem → consulta cardíaca → exames → prescrições → farmácia → internação → alta.
5. Central de alertas, auditoria e segurança clínica com apoio do Safety Engine.

## Segurança e autenticação

- Login com e-mail institucional e senha.
- Sessão apoiada por cookie `HttpOnly` e validação no backend.
- Cargos e permissões validadas no servidor, nunca dependentes do frontend.
- Compatibilidade com JSON local e PostgreSQL (`DATABASE_URL`) quando disponível.
- Arquivos de ambiente protegidos por `.env` e `.env.example`.

## Estrutura principal

- `backend/server.js`: autenticação, autorização, APIs e fluxo clínico.
- `backend/src/db.js`: camada de persistência e mapa de permissões.
- `frontend/layout.js`: layout global e sidebar por permissão.
- `frontend/styles.css`: identidade visual hospitalar do projeto.
- `database.sql`: esquema principal e seed inicial para PostgreSQL.
- `database/schema.sql`, `database/schema2.sql`, `database/seeds.sql`: arquivos complementares do PostgreSQL sugerido.
- `database/migrate-json-to-postgres.js`: migração do JSON atual para PostgreSQL.

## Execução local

```bash
npm install
npm start
```

A aplicação fica disponível em `http://localhost:3000`.

## Observações

- O projeto foi mantido funcional e não substituído por uma implementação nova.
- Não foram removidas funcionalidades já existentes; a mudança foi focada na correção da arquitetura e na consistência de segurança.
- O projeto foi expandido até a Fase 3 com foco em segurança, organização de perfis e suporte clínico/operacional.
- A manutenção futura pode seguir em novas melhorias de UX, integração real com banco e refinamento de relatórios.
