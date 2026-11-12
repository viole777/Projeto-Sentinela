# Matriz de autorização — Sentinela

**Status:** primeira camada RBAC implementada na PR #54. Não representa certificação nem autorização clínica.

## Princípios

1. A sessão autentica a identidade; o backend decide a autorização.
2. Cada rota protegida de negócio exige uma permissão explícita.
3. A interface pode ocultar opções, mas nunca é a fronteira de segurança.
4. O papel técnico `admin` não recebe acesso clínico por curinga.
5. Se a consulta de permissões no PostgreSQL falhar, a operação é negada.
6. Os papéis padrão são reconciliados com esta matriz na inicialização. Concessões antigas dos papéis padrão são revogadas.
7. A matriz ainda não aplica escopo por unidade, setor, paciente ou vínculo assistencial. Esse é um bloqueador aberto.

## Papéis e responsabilidades

| Papel | Escopo de responsabilidade |
|---|---|
| `admin` | Administração técnica, usuários, perfis, unidades, módulos e configuração de segurança |
| `medico` / `cardiologist` | Fluxos médicos, consulta, prontuário, prescrição, exames e revisão clínica |
| `enfermagem` | Triagem, internação, exames e rotinas de enfermagem |
| `triagem` | Cadastro e leitura operacional de triagem, alertas e fila |
| `farmacia` | Prescrições, dispensação, estoque e compras |
| `atendimento` / `recepcao` | Cadastro/atendimento, agendamentos e acompanhamento domiciliar |
| `direcao` | Relatórios, auditoria e visões administrativas limitadas |

## Permissões por domínio

| Domínio | Permissões |
|---|---|
| Painel | `dashboard.read` |
| Pacientes | `patients.read`, `patients.write`, `records.read` |
| Agendamento | `appointments.read`, `appointments.write` |
| Triagem | `triage.read`, `triage.write`, `triage.close` |
| Consultas | `consultations.read`, `consultations.write`, `consultations.finalize` |
| Exames | `exams.read`, `exams.write`, `exams.results.write` |
| Prescrições | `prescriptions.read`, `prescriptions.write`, `prescriptions.dispense`, `prescriptions.validate` |
| Farmácia/estoque | `inventory.read`, `inventory.write`, `medications.read`, `purchasing.read` |
| Internação | `beds.read`, `hospitalizations.read`, `hospitalizations.write`, `internacoes.read`, `internacoes.write` |
| Atendimento domiciliar | `homecare.read`, `homecare.write`, `homecare.complete` |
| Alertas e IA | `alerts.read`, `alerts.resolve`, `ai.read` |
| Auditoria e relatórios | `audit.read`, `reports.read` |
| Fila e arquivos | `queue.call`, `files.read` |
| Administração | `users.read`, `users.write`, `professionals.read`, `professionals.write`, `roles.read`, `roles.write`, `permissions.read`, `units.read`, `units.write`, `settings.manage`, `modules.manage`, `safety.configure` |

## Enforcement no backend

O middleware `backend/src/middleware/auth.js` fornece:

- `requireAuth()`: valida a sessão e, quando solicitado, restringe papéis sem permitir que um curinga contorne a lista.
- `requirePermission("dominio.acao")`: consulta a matriz efetiva no servidor e nega acesso quando a permissão não existe ou a fonte de autorização está indisponível.

As rotas de negócio do `backend/server.js` usam permissões específicas. O roteador de módulos ainda não implementados continua falhando fechado com HTTP 501 e não deve ser tratado como funcionalidade disponível.

## Testes

`tests/authorization.test.js` cobre:

- negação de acesso clínico ao administrador técnico sem permissão clínica;
- impossibilidade de curinga de sessão contornar restrição explícita de papel;
- autorização de ação permitida;
- rejeição de permissões antigas armazenadas na sessão;
- falha fechada quando a fonte de autorização está indisponível;
- tratamento de cookie malformado.

## Pendências para completar autorização contextual

- Escopos por unidade e setor associados ao usuário.
- Vínculo assistencial explícito com o paciente e validade temporal desse vínculo.
- Filtros de linha no PostgreSQL para pacientes, triagens, prontuários, consultas, exames, internações e arquivos.
- Minimização de campos retornados por papel e finalidade.
- Testes negativos BOLA/IDOR para cada endpoint e tentativa entre unidades.
- Processo de concessão, revisão periódica e revogação de permissões individuais.

**Não usar dados reais de pacientes para validar a matriz.** Usar contas e registros sintéticos em ambiente isolado.
