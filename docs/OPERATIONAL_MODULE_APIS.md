# APIs dos módulos operacionais

## Contrato

Os módulos abaixo possuem rotas HTTP próprias, permissões RBAC explícitas, validação de payload por lista de campos permitidos, escopo obrigatório pela unidade da sessão, persistência PostgreSQL e auditoria na mesma transação.

A tabela `operational_module_records` é um registro versionado e append-only. Não há `PUT` ou `DELETE`: correções são enviadas para `POST /rota/:id/corrections`, preservando o original. As listagens aceitam `limit` (máximo 100) e `cursor`.

### Rotas implementadas

| Rota | Leitura | Escrita | Observação |
|---|---|---|---|
| `/incidentes` | `alerts.read` | `alerts.resolve` | Registro de evento, gravidade, setor e ação |
| `/escalas` | `professionals.read` | `professionals.write` | Impede duplicidade por profissional/data |
| `/escalas/trocas` | `professionals.read` | `professionals.write` | Solicitante e substituto devem ser diferentes |
| `/frequencia` | `professionals.read` | `professionals.write` | Impede duplicidade por profissional/data |
| `/indicadores/qualidade` | `reports.read` | `settings.manage` | Registro manual de indicador apurado |
| `/notificacoes` | `alerts.read` | `notifications.write` | Registro operacional; não representa entrega push/e-mail |
| `/comunicados` | `settings.manage` | `settings.manage` | Registro interno por unidade |
| `/agenda/disponibilidade` | `appointments.read` | `appointments.write` | Rejeita intervalos sobrepostos por profissional/data |
| `/configuracoes/modulos` | `modules.manage` | `modules.manage` | Histórico de solicitações; não ativa rotas automaticamente |
| `/configuracoes/unidades` | `settings.manage` | `settings.manage` | Registro versionado de parâmetros; não aplica configuração runtime |
| `/compras` | `inventory.read` | `inventory.write` | Registro de solicitação; não emite pedido de compra externo |
| `/ccih` | `settings.manage` | `settings.manage` | Registro operacional de vigilância; não substitui validação epidemiológica |
| `/faturamento/glosas` | `billing.read` | `billing.write` | Registro de glosa; não transmite recurso ou leiaute oficial |

### Rotas e fluxos que continuam bloqueados

Rotas clínicas e administrativas que exigem modelo de domínio próprio, vínculo profissional, catálogo oficial, autorização legal ou homologação externa continuam retornando `501 WORKFLOW_REQUIRES_VALIDATION`. Isso inclui, entre outras, prescrição avançada, alta hospitalar, administração de medicamentos, alergias, exames de imagem, protocolos clínicos, LGPD/consentimentos, portal do paciente, integração SUS e transmissão de faturamento.

Esse bloqueio é intencional: não é seguro transformar esses fluxos em registros JSON genéricos e apresentá-los como prontuário, prescrição, assinatura, integração ou processo hospitalar completo.

## APIs clínicas já conectadas ao frontend React

Além das APIs operacionais acima, as telas clínicas abaixo foram ligadas aos endpoints versionados e seus contratos específicos:

| Endpoint | Tela conectada |
|---|---|
| `/api/v1/appointments` | Agenda médica |
| `/api/v1/hospitalizations` | Internações |
| `/api/v1/discharges` | Alta hospitalar |
| `/api/v1/prescriptions` | Prescrição eletrônica estruturada |
| `/api/v1/vital-signs` | Sinais vitais |
| `/api/v1/soap-notes` | Evolução médica SOAP |
| `/api/v1/nursing-evolutions` | Evolução de enfermagem |
| `/api/v1/care-plans` | Plano de cuidados |
| `/api/v1/exam-orders` | Solicitação de exames, imagem e cardiologia |
| `/api/v1/exam-results` | Resultados laboratoriais |
| `/api/v1/patient-allergies` | Histórico de alergias |

Esses endpoints pertencem ao contrato clínico versionado, com validação de payload e escopo por unidade. As rotas que exigem vínculo CNS/CBO dependem de cadastro profissional ativo. A existência da tela não substitui o cadastro e a validação dos catálogos oficiais.

## Persistência e implantação

1. Aplicar `database/migrations/20261112_clinical_platform.sql`.
2. Aplicar `database/migrations/20261119_operational_modules.sql`.
3. O script `node scripts/apply-clinical-platform-migration.js` executa e verifica as duas migrações.
4. As rotas exigem PostgreSQL; não há fallback JSON.
5. Cada escrita e seu evento de auditoria são confirmados ou revertidos juntos.

## Formato de resposta

Listagem:

```json
{
  "items": [],
  "nextCursor": null
}
```

Criação:

```json
{
  "item": {},
  "appendOnly": true
}
```

Os exemplos acima descrevem somente o envelope HTTP. Os campos de cada módulo são definidos e validados individualmente em `backend/src/routes/advancedModules.js`.
