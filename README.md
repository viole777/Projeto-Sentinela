# Projeto Sentinela

O Projeto Sentinela é um sistema hospitalar de cardiologia para gestão clínica, operacional e de acompanhamento de pacientes. Ele foi mantido funcional, mas passou por uma refatoração para corrigir arquitetura, navegação, controle de acesso e consistência de dados.

## Visão geral

O Sentinela reúne os principais fluxos de um hospital de cardiologia:

- Atendimento inicial do paciente
- Triagem clínica com priorização
- Consultas médicas
- Exames e laudos
- Prescrições e farmácia
- Estoque categorizado de medicamentos cardiológicos
- Atendimento domiciliar / acompanhamento em casa
- Alertas, auditoria, relatórios e apoio da IA

## Estado atual do projeto

### Fase 1
- Correção de arquitetura, sessão e navegação
- Ajuste de permissões e perfis reais por conta
- Padronização do layout global e menu lateral
- Fluxos de login, recuperação de senha e primeiro acesso revisados

### Fase 2
- Endpoints de usuários, cargos, permissões e setores
- Suporte a setor no cadastro de profissionais
- Melhor organização da gestão administrativa

### Fase 3
- Fluxos de exames, farmácia, alertas e Safety Engine preservados
- Modo claro/escuro por usuário (botão no cabeçalho, preferência salva na conta)
- Melhorias de UX e visual institucional
- Expansão para atendimento domiciliar
- Estoque organizado por categoria clínica

## Como rodar localmente

```bash
npm install
npm start
```

A aplicação fica disponível em:

```text
http://localhost:3000
```

## Estrutura principal

- `backend/server.js` — autenticação, autorização, APIs e fluxo clínico
- `backend/src/db.js` — camada de persistência e permissões RBAC
- `backend/db.json` — dados locais de demonstração
- `frontend/layout.js` — layout global e menu lateral
- `frontend/styles.css` — identidade visual do sistema
- `frontend/atendimento-casa.html` — módulo de atendimento domiciliar
- `database.sql` — esquema principal para PostgreSQL
- `database/schema.sql`, `database/schema2.sql`, `database/seeds.sql` — arquivos complementares do PostgreSQL
- `database/migrate-json-to-postgres.js` — migração do JSON para PostgreSQL

## Usuários de demonstração

O ambiente local atual utiliza o arquivo `backend/db.json` e já contém usuários testes.

### Usuários ativos

| Usuário | Senha | Perfil |
|---|---|---|
| `admin` | `123` | administrador |
| `atendimento` | `123` | atendimento |
| `triagem` | `123` | triagem |
| `medico` | `123` | médico |
| `novo.setor` | `trocar_no_primeiro_acesso` | triagem (setor UTI) |

> O usuário `novo.setor` é um exemplo de primeiro acesso: ele precisa trocar a senha ao entrar pela primeira vez.

## Fluxo principal do sistema

1. Faça login com um usuário demo
2. O dashboard carrega conforme o perfil da conta
3. Use o módulo de atendimento para registrar o paciente
4. A triagem avalia sinais e prioridade
5. O médico realiza a consulta e finaliza o atendimento
6. Os exames, prescrições, farmácia e alertas seguem o fluxo clínico
7. O setor administrativo pode consultar relatórios e auditoria

## Tutorial completo de uso do Sentinela

### 1. Acessar o sistema

- Abra o navegador em `http://localhost:3000`
- Use um usuário demo da tabela acima
- Exemplo: `admin / 123`

### 2. Fazer login

- No campo `usuario`, informe o login do usuário
- No campo `senha`, informe a senha correspondente
- A sessão é validada pelo backend e o menu lateral é montado conforme as permissões do perfil

### 3. Navegar pela interface

O sistema tem uma navegação por módulos:

- Dashboard
- Pacientes
- Atendimento
- Atendimento Domiciliar
- Triagem
- Consultas
- Prontuários
- Exames
- Farmácia
- Estoque
- Alertas
- Safety Engine
- Relatórios
- Auditoria

### 4. Fluxo de atendimento hospitalar

#### Atendimento inicial
- Acesse `Atendimento`
- Preencha nome, CPF, dados complementares e perfil cardiovascular
- Envie a foto, se necessário
- Clique em `Enviar para triagem`

#### Triagem
- Acesse `Triagem`
- Informe sinais vitais, sintomas e níveis de risco
- O sistema calcula prioridade e pode gerar alertas clínicos

#### Consulta médica
- Acesse `Consultas`
- Selecione o paciente
- Registre diagnóstico, medicação e observações
- O Safety Engine valida prescrições e aponta inconsistências

#### Exames e laudos
- Acesse `Exames`
- Solicite exames e acompanhe laudos
- O resultado pode ser consultado pelo médico e pelo time clínico

### 5. Fluxo de farmácia e estoque

- Acesse `Farmácia` para visualizar prescrições pendentes
- Acesse `Estoque` para acompanhar medicamentos e insumos
- O estoque já vem organizado por categoria clínica, como:
  - Antiagregantes plaquetários
  - Antiarrítmicos
  - Anticoagulantes
  - Betabloqueadores
  - Diuréticos
  - Estatinas
  - Nitratos

### 6. Fluxo de atendimento domiciliar

O Sentinela agora também oferece suporte para acompanhamento em casa.

#### Como usar
- Acesse `Atend. Domiciliar`
- Informe o CPF do paciente
- Preencha endereço, motivo, observações e data
- Salve o agendamento
- O registro fica listado para acompanhamento
- Quando o atendimento for concluído, o status pode ser marcado como concluído

#### Caso prático

1. O paciente recebe alta hospitalar
2. O time de atendimento cadastra o acompanhamento domiciliar
3. A equipe registra execução do atendimento em casa
4. O módulo mantém histórico clínico e operacional do acompanhamento

### 7. Alertas e segurança clínica

- Acesse `Alertas` para visualizar eventos críticos
- O Safety Engine aponta riscos e inconsistências clínico-operacionais
- A auditoria registra ações e acessos importantes

### 8. IA do Sentinela

- Acesse `Sentinela AI`
- O sistema gera um resumo do prontuário para apoio à decisão
- A IA não substitui avaliação clínica; apenas auxilia a revisão do profissional

## Segurança e autenticação

- O backend valida usuário, sessão, perfil e permissões
- O login não depende do frontend para decidir o cargo
- Sessões são controladas em cookie HTTP-only
- A aplicação aceita JSON local e também pode operar com PostgreSQL quando `DATABASE_URL` estiver configurado

## Observações importantes

- O sistema foi mantido funcional e não substituído por uma implementação nova
- O foco foi em correção de arquitetura, segurança e consistência operacional
- O projeto pode continuar evoluindo com melhorias de UX, relatórios e integrações reais

## Dicas de uso em demonstração

- Use `admin` para explorar todos os módulos
- Use `triagem` para testar priorização e alertas
- Use `medico` para consultar e registrar prescrições
- Use `atendimento` para registrar pacientes e agendamentos
- Use `novo.setor` para testar o primeiro acesso e redefinição de senha

## Próximos passos sugeridos

- Integrar autenticação real com e-mail institucional
- Conectar o sistema a um banco PostgreSQL em produção
- Expandir relatórios de indicadores cardiológicos
- Evoluir o módulo domiciliar com escalas, vídeos e coleta de sinais
