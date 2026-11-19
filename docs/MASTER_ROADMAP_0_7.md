# Roadmap mestre de implementação — Fases 0 a 7

**Branch:** `feat/sentinela-roadmap-completo`  
**Base:** `main`  
**Estado:** em execução; esta é uma entrega abrangente em uma única PR, com commits e validações por etapa.  
**Liberação:** não aprovada para uso assistencial real, piloto com pacientes ou produção.

Este documento acompanha o escopo solicitado em `Markdown colado.md`. A PR deve concentrar as implementações das Fases 0–7, sem dividir o trabalho em PRs menores. Os commits podem ser organizados por fase. Cada requisito deve ser classificado como **implementado e comprovado**, **parcial**, **ausente** ou **pendente de evidência externa**.

## Regras de execução

- Não declarar concluído um fluxo apenas porque existe tela, rota, schema, mock ou documentação.
- Não inventar CID, SIGTAP, TUSS, CBO, protocolos, interações, doses, tabelas ou leiautes oficiais. Sem catálogo importado e validado, responder indisponibilidade explícita.
- PostgreSQL é a única fonte de verdade em produção. JSON fica restrito a testes/desenvolvimento isolado.
- Escritas clínicas e seus eventos de auditoria devem compartilhar a mesma transação. Falha de auditoria aborta a escrita.
- Registros clínicos e auditoria são append-only; correção é novo evento versionado.
- Toda rota sensível exige autenticação, permissão explícita, escopo por instituição/unidade/setor/paciente/vínculo, schema de entrada, minimização de resposta e teste negativo.
- Apenas dados sintéticos em testes, seeds, logs e screenshots. Nenhum segredo no Git.
- Não enfraquecer CSP, autenticação, autorização ou testes para obter CI verde.
- Integrações, certificações, validação clínica, pentest, parecer jurídico e homologações externas só podem ser marcados como concluídos com evidência verificável.

## Fase 0 — Higiene e decisões

- [x] Campo de licença do pacote aponta para `SEE LICENSE IN LICENSE`; a licença jurídica permanece pendente.
- [x] README descreve arquitetura, execução, variáveis, testes, documentação e status regulatório.
- [x] `npm start` inicia o servidor sem executar testes/build; Node 22 está fixado em `.nvmrc` e `engines`.
- [x] Frontend legado está marcado como deprecated e existe mapa de paridade.
- [x] ADR de stack e arquitetura C4 inicial existem.
- [ ] Confirmar CI verde nesta branch e revisar a paridade de todas as páginas HTML contra fluxos React efetivamente operacionais.
- [ ] Registrar issue para decisão jurídica sobre licenciamento comercial e confirmar que screenshots contêm somente dados sintéticos.

## Fase 1 — Fundação: dados, segurança e identidade

### Persistência e arquitetura
- [ ] Eliminar todos os caminhos de produção que usem `readDB/writeDB`, JSON ou sincronização de snapshots como mecanismo de persistência operacional.
- [ ] Migrar mutações legadas de pacientes, triagem, atendimentos, farmácia, estoque, alertas, relatórios e atendimento domiciliar para `routes → services → repositories` TypeScript strict.
- [ ] Usar transação por operação, concorrência otimista e HTTP 409 em conflito; não sobrescrever histórico.
- [ ] Reduzir `backend/server.js` a composição/configuração da aplicação.

### Auditoria
- [ ] Escrita clínica e auditoria atômicas em todos os handlers, incluindo operações de leitura auditadas.
- [ ] Cadeia de hash serializada, verificável e sem bifurcações concorrentes.
- [ ] Campos de auditoria: ator, papel, unidade, hash do paciente, ação, recurso, antes/depois redigidos, IP, user-agent, requestId e motivo.
- [ ] Break-glass com justificativa, alerta e revisão posterior.

### Autorização e identidade
- [ ] Escopo SQL por instituição, unidade, setor, vínculo assistencial e paciente em todas as consultas e mutações.
- [ ] Remover CRUD genérico e garantir schemas/permissões próprios para cada recurso.
- [ ] Testes BOLA/IDOR horizontais entre pacientes, unidades e instituições para todos os endpoints sensíveis.
- [ ] MFA TOTP obrigatório para perfis privilegiados, códigos de recuperação com hash, política de senha, revogação de sessões multi-instância e logout global.
- [ ] Preparar OIDC como adaptador opcional.

### Dados sensíveis e segurança de aplicação
- [ ] AES-256-GCM com envelope encryption, blind index HMAC, interface de provedor de chaves e rotação compatível.
- [ ] Retenção/anonimização parametrizáveis e módulo LGPD com consentimentos, direitos do titular, RoPA e fluxo de incidentes.
- [ ] CSP sem `unsafe-inline`, CSRF, CORS allowlist, limites de payload, upload validado/antivírus por adaptador, proteção SSRF e erros sem stack trace.
- [ ] IA com minimização/pseudonimização, defesa contra prompt injection, trilha de prompt/modelo/resposta, revisão humana e kill-switch.
- [ ] CI com SAST, SCA, SBOM, secret scanning e DAST baseline.

## Fase 2 — Núcleo clínico

- [ ] PEP com linha do tempo, SOAP, sinais vitais, alergias, problemas, diagnósticos ligados a catálogo importado, plano de cuidados, anexos e documentos versionados.
- [ ] Prescrição estruturada, validação farmacêutica/médica append-only e adaptador de assinatura com sandbox/mock; sem emissão legal sem homologação.
- [ ] Recepção, cadastro único, deduplicação/merge auditado e fila/painéis TV em tempo real.
- [ ] Motor de triagem parametrizável e versionado; exemplos sintéticos claramente não clínicos, sem copiar protocolos proprietários sem licença.
- [ ] Internação, mapa de leitos, transferência, alta e higienização com permissões e auditoria.
- [ ] Centro cirúrgico/obstétrico: agenda, conflitos, checklist com bloqueio, tempos, ficha anestésica, contagem, OPME, SRPA, partograma e vínculo mãe-bebê.
- [ ] Safety Engine v2: regras determinísticas versionadas, fonte/vigência/responsável/aprovação, alergia por substância/classe, interações de catálogo importado, validação de dose baseada em fonte, overrides justificados e avaliação sintética.
- [ ] Beira-leito/PWA: checagem de paciente/medicamento, MAR, offline com reconciliação segura e etiquetas.

## Fase 3 — Diagnóstico, farmácia e suprimentos

- [ ] LIS: pedidos, coleta, rastreio, validação, resultados versionados, críticos com confirmação, laudos e simuladores HL7 v2/ASTM.
- [ ] RIS/PACS: agenda, DICOM/DICOMweb, integração Orthanc/dcm4chee e OHIF por adaptador seguro.
- [ ] Farmácia: triagem farmacêutica, reconciliação, dose unitária, rastreabilidade de lote até administração, recall e fluxos de controlados dependentes de credenciais.
- [ ] Estoque/compras: RENAME/CATMAT importados, lote/validade, FEFO, inventário, requisição/cotação/aprovação/recebimento, OPME e custo.
- [ ] CME: rastreio de instrumentais, caixas, esterilização, indicadores, recall e vínculo com cirurgia.
- [ ] SND: avaliação nutricional, restrições do PEP, mapa de dietas, produção e distribuição.

## Fase 4 — Faturamento e financeiro

- [ ] Captação de custos por atendimento/internação sem redigitação.
- [ ] Operadoras, planos, cobertura, autorização, elegibilidade por adaptador e pacotes.
- [ ] TISS/TUSS e SUS: exportação apenas conforme XSD/leiautes oficiais importados e vigentes; sem transmissão sem credenciamento.
- [ ] Auditoria pré-faturamento, pendências, glosas, recursos e indicadores.
- [ ] Contas a pagar/receber, conciliação, fluxo de caixa, repasse, centros de custo e exportações contábeis/fiscais por adaptadores.
- [ ] Teste E2E com conta sintética do início ao recurso/conciliação.

## Fase 5 — Interoperabilidade

- [ ] Serviço `integration-hub` desacoplado com outbox, retries/backoff, dead-letter, idempotência, correlação e painel de saúde.
- [ ] FHIR R4 com recursos de domínio, CapabilityStatement, busca, Bundle transaction, SMART on FHIR e validação contra perfis brasileiros somente quando importados.
- [ ] HL7 v2 MLLP/HTTP para ADT, ORM/OML, ORU, SIU, MDM e DFT, com ACK/NACK, mapeamento e reprocessamento.
- [ ] DICOMweb, Modality Worklist, MPPS, C-STORE por adaptador e auditoria.
- [ ] Gateway de dispositivos com simuladores, validação de plausibilidade e confirmação humana.
- [ ] Adaptadores CADSUS, RNDS, Gov.br, ICP-Brasil, e-SUS/SINAN, SIA/SIH, SNGPC, CNES e ANS/TISS; estado deve permanecer não configurado/sandbox até evidência de homologação.

## Fase 6 — Plataforma, operação, BI e frontend

- [ ] Docker multi-stage não-root, compose, Helm/Kubernetes, Terraform AWS/Azure e ambientes isolados.
- [ ] Aplicação stateless, health checks, graceful shutdown, migrações seguras, feature flags, blue/green/canary e rollback.
- [ ] Backup criptografado, PITR, restauração testada, RPO/RTO, runbooks, observabilidade, métricas, tracing, SLOs e k6.
- [ ] Downtime read-only e procedimento de contingência.
- [ ] Migrar todas as páginas legadas para React; remover `frontend/` somente após paridade comprovada.
- [ ] Remover rotas 501, menus sem função e `PlaceholderPage`; design system acessível, responsivo, i18n e estados completos.
- [ ] E2E por papel cobrindo recepção → triagem → consulta → prescrição → farmácia → administração → alta → faturamento.
- [ ] BI separado com dados pseudonimizados; indicadores hospitalares e CCIH/IRAS.
- [ ] Modelos preditivos somente após governança, avaliação de viés/calibração, monitoramento de drift e validação clínica/regulatória.

## Fase 7 — Documentação e pacote comercial

- [ ] Manuais de instalação, administração, usuário por perfil, segurança e atualização.
- [ ] Especificação funcional e rastreabilidade requisito → teste por módulo.
- [ ] Gestão de riscos e documentos de usabilidade/ciclo de vida como rascunhos para revisão regulatória.
- [ ] Modelos de privacidade, termos, contrato controlador/operador, DPA, RoPA, RIPD e resposta a incidentes para revisão jurídica.
- [ ] SLA, suporte, versionamento, SBOM e inventário de dependências/licenças.
- [ ] `docs/EXTERNAL_BLOCKERS.md` com responsável, status e evidência de cada dependência externa.
- [ ] Atualizar a auditoria comercial após cada fase. Manter **NÃO APROVADO para produção** até anexar evidências externas necessárias.

## Alterações já iniciadas nesta PR

1. A cadeia de auditoria agora adquire um advisory lock transacional antes de ler o hash anterior. Isso serializa os escritores concorrentes e evita que dois eventos confirmados apontem para o mesmo hash anterior. O chamador deve manter a operação dentro de uma transação PostgreSQL.
2. Criação de paciente agora grava o registro e o evento de auditoria no mesmo cliente/transação; falha de auditoria provoca rollback.
3. Cadastro de lote de medicamento agora valida o catálogo e grava o lote + auditoria na mesma transação.
4. Testes estáticos/regressivos foram adicionados para verificar a ordem do lock e a atomicidade das duas operações.

**Validação pendente nesta branch:** executar `npm run lint`, `npm run typecheck`, `npm run test:unit`, integração com PostgreSQL real, build frontend, secret scan e workflows completos. A integração GitHub utilizada para esta edição não executa o ambiente local do projeto.

## Gate final

A PR só pode ser considerada pronta para revisão final quando todos os gates internos aplicáveis passarem. Itens dependentes de terceiros permanecem explicitamente pendentes. Não fazer merge nem deploy automaticamente.