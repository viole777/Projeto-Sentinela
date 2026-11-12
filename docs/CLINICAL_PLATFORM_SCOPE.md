# Sentinela — expansão da plataforma clínica (PR #58)

## Migração

Aplicar em ambiente de desenvolvimento/staging, com backup e revisão de DBA:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/20261112_clinical_platform.sql
```

A migração é idempotente e adiciona CNS/CBO, unidade do paciente, agenda, registros clínicos versionados, catálogo oficial versionado, lotes de medicamentos, consentimentos, trilha de auditoria append-only e estado de integrações.

## APIs implementadas

Base versionada: `/api/v1`.

- Pacientes e identidade: `/patients`, `/patient-identities`, `/patient-summary/:cpf`.
- Agenda: `/appointments` e transições de estado.
- Prontuário: `/soap-notes`, `/vital-signs`, `/diagnoses`, `/nursing-evolutions`, `/care-plans`.
- Prescrição: `/prescriptions`, validação profissional append-only e dispensação FEFO por lote.
- Exames: `/exam-orders`, `/exam-results`.
- Internação: `/beds`, `/bed-map`, `/hospitalizations`, `/discharges`.
- Linhas de cuidado: `/maternal-child`, `/chronic-care`, `/immunizations`.
- Regulação e vigilância: `/referrals`, `/notifications` (rascunhos).
- Faturamento: `/billing`, `/billing-batches` (lotes em conferência, sem exportação oficial).
- LGPD e auditoria: `/patient-consents`, `/clinical-audit`.
- Catálogos: `/catalogs/:catalog` e importação versionada CID-10, CIAP-2, SIGTAP, RENAME, CBO e CNES.
- Integrações: `/integrations/status`.

## Segurança e integridade

- Escopo por unidade nas consultas e gravações da nova API.
- Registros clínicos, eventos de consentimento e eventos de auditoria são append-only; correções devem gerar novos eventos.
- Acesso a resumos e listas clínicas registra auditoria com hash do CPF, sem copiar o CPF para o log.
- CNS/CBO são exigidos para operações clínicas que precisam de autoria profissional.
- Dispensação usa bloqueio transacional de lotes e FEFO; exige a decisão profissional mais recente como aprovada e respeita quantidade prescrita.
- A matriz de papéis revoga privilégios antigos e mantém médico fora da tela/API de triagem.

## Limitações deliberadas — não declarar como integração concluída

- CADSUS, Gov.br, ICP-Brasil, SINAN/e-SUS Notifica, SIA/SIH SUS ainda não possuem adaptadores de produção, credenciais ou homologação.
- O endpoint de assinatura não assina documentos: retorna indisponibilidade ou adaptador não implementado.
- Catálogos oficiais começam vazios. É necessário importar a versão oficial e validar fonte, competência e vigência. Sem dados, a API retorna indisponibilidade explícita.
- Não existe ainda algoritmo homologado de Manchester/ESI, interação medicamentosa oficial, curvas OMS, exportador BPA/AIH/APAC ou transmissão externa. A aplicação não inventa códigos, alertas ou resultados.
- A prescrição é um registro estruturado pendente de validação; não equivale a receituário legal.
- Integração de resultados de exames é manual no fluxo atual; conectores de laboratório e imagem ainda não foram homologados.

## Validação exigida antes de qualquer piloto

Usar apenas dados sintéticos em staging. Antes de qualquer uso com pacientes, exigir revisão clínica multidisciplinar, revisão de segurança independente, testes de autorização por unidade/paciente (BOLA/IDOR), pentest autorizado, recuperação de backup, DPIA/LGPD, contratos de operador/controlador, avaliação regulatória aplicável e homologação dos serviços oficiais.
