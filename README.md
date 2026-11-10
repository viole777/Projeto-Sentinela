# Projeto Sentinela

Sistema demonstrativo de gestão hospitalar e clínica, com foco em cardiologia, triagem, prescrição e acompanhamento de pacientes.

## Visão geral

O Sentinela foi pensado como um protótipo funcional de ambiente hospitalar, com fluxo de:

- cadastro e busca de pacientes
- triagem com priorização
- consulta médica
- exames e laudos
- prescrição e farmácia
- estoque de medicamentos
- atendimento domiciliar
- alertas, auditoria e relatórios
- apoio de IA para resumo clínico

A aplicação roda em Node.js com Express e serve um frontend estático em HTML, CSS e JavaScript puro.

## Status atual

Este projeto já está em uma etapa de consolidação funcional:

- autenticação e sessões reforçadas
- permissões por perfil
- layout global mais consistente
- fluxo de login e primeiro acesso estruturado
- tema claro/escuro mais limpo e legível
- limpeza de elementos visuais excessivos, incluindo remoção de emojis na interface
- validação por smoke test e checagem de execução local

## Tecnologias

- Node.js (versão mínima declarada no `package.json`)
- Express 5
- PostgreSQL como banco de produção
- Armazenamento JSON restrito ao desenvolvimento local; produção exige `DATABASE_URL`
- HTML, CSS e JavaScript puro no frontend
- Helmet, rate limiting e validação básica de segurança no backend

## Requisitos

- Node.js 18 ou superior
- npm
- acesso ao ambiente local ou ao serviço deploy

## Início rápido

Instale as dependências:

```bash
npm install
```

Inicie a aplicação:

```bash
npm start
```

A aplicação estará disponível em:

```text
http://localhost:3000
```

Para rodar em modo de monitoramento:

```bash
npm run dev
```

## Testes

Execute a validação rápida do sistema:

```bash
npm test
```

Também é possível validar sintaxe do backend:

```bash
npm run lint
```

## Estrutura do projeto

```text
.
├── backend/
│   ├── db.json
│   ├── server.js
│   └── src/
├── database/
│   ├── migrate-json-to-postgres.js
│   ├── seeds.sql
│   └── sql/
├── docs/
│   ├── DEPLOYMENT_SECURITY.md
│   └── screenshots/
├── frontend/
│   ├── *.html
│   ├── layout.js
│   └── styles.css
├── scripts/
│   └── smoke-test.js
├── LICENSE
├── database.sql
├── db.js
├── package.json
├── README.md
└── .env.example
```

## Variáveis de ambiente

O projeto suporta ambiente local e deploy com variáveis de configuração. O mínimo esperado para execução local é:

```env
PORT=3000
NODE_ENV=development
```

Se a IA estiver habilitada, também pode ser configurado:

```env
GEMINI_API_KEY=sua_chave_aqui
AI_API_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
AI_MODEL=gemini-3.6-flash
```

Se a chave não estiver presente, o sistema continua funcionando com fallback local de resumo.

## Segurança e IA

A avaliação de prontidão comercial, os bloqueadores conhecidos e os critérios para piloto/produção estão em [docs/COMMERCIAL_READINESS_AUDIT.md](docs/COMMERCIAL_READINESS_AUDIT.md). A existência de uma funcionalidade não representa validação clínica ou autorização para uso assistencial.


A aplicação inclui um Safety Engine para avaliar prescrições e alertar sobre inconsistências. Ele funciona como apoio clínico e não substitui a decisão do profissional.

Também há integração com Gemini para resumo clínico assistido. Quando a chave não está configurada, a aplicação usa um resumo local em vez de falhar.

## Configuração de acesso

Não existe senha padrão segura para publicação. Em ambiente local, crie contas de teste com credenciais exclusivas e use somente dados sintéticos. Não publique usuários, senhas ou tokens em README, documentação, issues ou screenshots.

A configuração de autenticação e publicação está documentada em [docs/DEPLOYMENT_SECURITY.md](docs/DEPLOYMENT_SECURITY.md).

## Fluxo principal

O fluxograma detalhado com decisões, Safety Engine, IA e auditoria está em [docs/FLUXOGRAMA.md](docs/FLUXOGRAMA.md).

1. Login no sistema
2. Acesso ao painel conforme perfil
3. Cadastro ou busca de paciente
4. Triagem e classificação de prioridade
5. Consulta médica
6. Verificação de segurança e alertas
7. Exames, medicações, estoque e atendimentos
8. Relatórios e auditoria

## Observações importantes

- O projeto permanece um protótipo para demonstração e estudo; não está aprovado para uso assistencial real ou venda como sistema clínico de produção.
- Não altere credenciais de produção ou segredos reais em ambiente de execução.
- O código foi ajustado para reduzir ruído visual e melhorar consistência, sem quebrar fluxos operacionais.
- O smoke test verifica os principais caminhos básicos da aplicação.

## Licença

Este projeto está licenciado sob a licença MIT. Consulte o arquivo LICENSE para mais detalhes.

### Acessar o sistema

- **Versão online:** [Sentinela no Render](https://projeto-sentinela-rwir.onrender.com)
- **Ambiente local:** `http://localhost:3000` após iniciar o servidor.
- Use uma conta criada localmente por um administrador autorizado. Não há credenciais públicas padrão.

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
- Acesse `Safety Engine` para revisar/ligar as regras e ver as ocorrências em aberto
- O Safety Engine aponta riscos e inconsistências clínico-operacionais (detalhes em [Safety Engine e IA](#safety-engine-e-ia-gemini))
- A auditoria registra ações e acessos importantes

### 8. IA do Sentinela (Gemini)

- Acesse `Sentinela AI` ou use `Resumo IA` na tela de `Consultas`
- O sistema gera um resumo do prontuário para apoio à decisão usando a **Google Gemini**
- Sem `GEMINI_API_KEY`, o endpoint cai automaticamente no resumo local por regras (badge `Resumo local`)
- A IA não substitui avaliação clínica; apenas auxilia a revisão do profissional
- Configuração da chave e detalhes técnicos: [Safety Engine e IA](#safety-engine-e-ia-gemini)

## Segurança e autenticação

- O backend valida usuário, sessão, perfil e permissões
- O login não depende do frontend para decidir o cargo
- Sessões são controladas em cookie HTTP-only
- A aplicação aceita JSON local e também pode operar com PostgreSQL quando `DATABASE_URL` estiver configurado
- Ações sensíveis (consulta criada, alerta resolvido, alteração das regras do Safety Engine, geração de resumo de IA) ficam registradas na trilha de auditoria
- A chave da Gemini (`GEMINI_API_KEY`) nunca chega ao frontend: todas as chamadas de IA partem do backend

## Observações importantes

- O sistema foi mantido funcional e não substituído por uma implementação nova
- O foco foi em correção de arquitetura, segurança e consistência operacional
- O projeto pode continuar evoluindo com melhorias de UX, relatórios e integrações reais

## Dicas de uso em demonstração

- Utilize somente contas de teste criadas no próprio ambiente.
- Use dados sintéticos, sem informações de pessoas reais.
- Confira as permissões de cada perfil antes de demonstrar qualquer fluxo.

## Próximos passos

- Executar e manter testes automatizados para os principais fluxos
- Validar as permissões de cada perfil e o fluxo de recuperação de senha
- Configurar backup e testar restauração do PostgreSQL no Neon
- Expandir os relatórios cardiológicos e o módulo de atendimento domiciliar

**Aviso:** este repositório é um protótipo escolar/demonstrativo. Não inserir dados reais de pacientes nem utilizá-lo para decisões clínicas ou operações hospitalares reais.

## Licença

Distribuído sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE).

---

<p align="center">
  <b><a href="https://projeto-sentinela-rwir.onrender.com">▶ Acessar o Projeto Sentinela online</a></b>
</p>
