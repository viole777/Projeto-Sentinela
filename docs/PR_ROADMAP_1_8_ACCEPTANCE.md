# PR — conclusão dos blocos 1 a 8

**Branch:** `feat/roadmap-1-8-completion`  
**Base:** `main`  
**Estado:** trabalho em andamento; esta PR deve permanecer Draft até todos os gates internos passarem.

## Regra de escopo

Esta entrega concentra exclusivamente os oito blocos do roadmap já aprovado. Não adicionar módulos de produto ou funcionalidades paralelas. Cada requisito deve ser classificado como **implementado e comprovado**, **parcial**, **ausente** ou **não verificável**. Documentação, mocks e testes isolados não comprovam implementação operacional.

## Critérios de aceite por bloco

### 1. Estabilização e segurança
- [ ] Revisar todos os endpoints para autenticação, autorização, validação, rate limit e tratamento seguro de erros.
- [ ] Remover permissões implícitas e cobrir negações com testes negativos.
- [ ] Revisar CSP, CSRF, XSS, uploads, exposição de dados e configuração de produção.
- [ ] SAST/DAST e pentest independente: anexar resultados e plano de correção; não declarar concluído sem execução externa.

### 2. Integridade clínica e auditoria
- [ ] PostgreSQL transacional em todas as operações clínicas críticas.
- [ ] Auditoria append-only obrigatória no mesmo limite transacional da operação; falha de auditoria não pode ser descartada silenciosamente.
- [ ] Correções clínicas por novo registro/versionamento, sem sobrescrever histórico.
- [ ] Testes de concorrência, rollback, falha de banco, integridade e restauração.

### 3. Arquitetura definitiva
- [ ] PostgreSQL como única fonte de verdade em produção; JSON isolado exclusivamente para desenvolvimento/testes.
- [ ] Eliminar fallback JSON e sincronizações/upserts que possam sobrescrever estado clínico em produção.
- [ ] Backend TypeScript strict por etapas, com contratos/schemas, serviços e repositórios tipados.
- [ ] API versionada com erros padronizados, paginação, idempotência e testes de contrato.
- [ ] Fixar runtime Node suportado e validar build/testes na versão definida.

### 4. Safety Engine v2
- [ ] Regras clínicas versionadas, com fonte, vigência, responsável e aprovação.
- [ ] Regras de alergia, interação, dose, contraindicação e alto risco alimentadas por bases oficiais/licenciadas.
- [ ] Regras determinísticas sem substituir julgamento profissional; bloqueios e overrides justificados e auditados.
- [ ] Validação clínica independente, conjunto de casos aprovado e avaliação de falsos positivos/negativos.
- [ ] IA minimizada/anônima quando aplicável, rastreável, resistente a prompt injection e sempre sujeita à revisão humana.

### 5. Identidade e controle de acesso
- [ ] Autorização contextual por ação, paciente, unidade, setor e vínculo assistencial.
- [ ] Testes BOLA/IDOR e de minimização de campos por perfil.
- [ ] MFA para perfis privilegiados, revogação efetiva de sessões e política de identidade.
- [ ] Criptografia de dados sensíveis e tokens de sessão com gestão/rotação de chaves revisada.

### 6. Frontend completo
- [ ] Substituir PlaceholderPage por fluxos reais ou ocultar rotas não implementadas.
- [ ] Fluxos completos, validação, estados de erro, acessibilidade e responsividade.
- [ ] Nenhuma ação clínica disponível sem salvaguardas backend.
- [ ] Testes E2E para perfis e jornadas; aceite por usuários representativos em homologação.

### 7. Validação independente
- [ ] Relatório de pentest independente e remediação dos achados.
- [ ] Validação clínica assinada por profissionais habilitados.
- [ ] Revisão de privacidade/LGPD e parecer jurídico-regulatório aplicável.
- [ ] Evidências e responsáveis anexados; não substituir por checklist interno.

### 8. Infraestrutura hospitalar
- [ ] Staging e produção isolados, com segredos e dados separados.
- [ ] Observabilidade, alertas, SLOs e controle de acesso operacional.
- [ ] Backups criptografados, restauração testada, RPO/RTO definidos e exercício de desastre.
- [ ] Alta disponibilidade, capacidade, rollback, continuidade e SBOM.
- [ ] Homologação operacional e institucional documentada.

## Limites externos que não podem ser simulados

Integrações CADSUS, Gov.br, ICP-Brasil, SINAN/e-SUS e SIA/SIH dependem de contratos, credenciais, ambientes e homologação dos respectivos provedores. Bases oficiais/licenciadas dependem de fonte e licença. Pentest, validação clínica, parecer jurídico e aprovações institucionais dependem de terceiros habilitados.

A PR pode preparar adaptadores, contratos, testes, documentação e controles, mas só pode marcar esses itens como concluídos após evidência externa verificável.

## Regra de liberação

- Não fazer merge nem deploy automaticamente.
- Não usar dados reais de pacientes em CI ou demonstrações.
- Não enfraquecer testes/controles para obter CI verde.
- Não declarar prontidão para piloto ou produção enquanto houver bloqueadores críticos ou validações independentes pendentes.

## Implementações parciais já registradas nesta PR

### Segurança e identidade (parcial)
- O guard de acesso do frontend não aceita mais `*` como permissão universal. O backend permanece como autoridade final e revalida permissões nos endpoints.
- Teste estático impede regressão do wildcard no frontend.
- A matriz de recepção/supervisor e os testes de CPF/CNS existentes foram preservados; a recepção continua limitada a dados básicos, enquanto CPF/CNS exigem permissão especial.

### Persistência (parcial)
- Em `NODE_ENV=production`, `readDB()` e `writeDB()` agora falham explicitamente se `DATABASE_URL` estiver ausente ou se a hidratação PostgreSQL ainda não tiver ocorrido. O armazenamento JSON não pode ser usado como fallback nessas condições.
- Testes isolados cobrem produção sem `DATABASE_URL` e acesso antes da hidratação; foram adicionados a `lint` e `test:unit`.

### Limitações ainda abertas
- Isso não conclui as fases 1, 2, 3 ou 5: auditoria legada, confirmação transacional de gravações, migração TypeScript, MFA, autorização contextual e testes BOLA/IDOR ainda exigem implementação e validação.
- Safety Engine, frontend completo, pentest, validação clínica, LGPD/jurídico, infraestrutura e recuperação de desastre continuam pendentes até haver código e evidências próprias.
- Nenhuma execução local dos testes foi possível por esta integração; a aprovação depende do CI da PR.

### Persistência transacional (incremento adicional)
- A sincronização do snapshot legado para PostgreSQL agora usa uma única transação com `BEGIN/COMMIT`; falhas executam `ROLLBACK` e sempre liberam o cliente.
- O método aceita um pool injetável para testes determinísticos de commit/rollback.
- `tests/db-transaction.test.js` cobre sucesso, rollback e liberação do cliente e integra `lint`/`test:unit`.
- Limite: isto torna atômica a sincronização do snapshot, mas não substitui a migração das mutações clínicas para repositórios/transações por operação nem resolve a confirmação assíncrona dos handlers legados.


## Incrementos implementados nesta continuação

### Autorização backend (implementado no código; aguarda CI)
- O middleware não interpreta mais a permissão `*` como concessão universal. A autorização depende de cada permissão explícita retornada pelo servidor.
- Testes negativos cobrem wildcard isolado e wildcard misturado a permissões explícitas.

### Auditoria legada (melhoria parcial; não equivale à transação clínica)
- O adaptador legado deixa de engolir exceções de leitura/gravação e não trunca mais o histórico em 2.000 eventos.
- Testes cobrem falha de leitura, falha de escrita e preservação do histórico.
- A sincronização legada deixa de atualizar eventos existentes por conflito de ID; a migração instala bloqueio SQL contra UPDATE/DELETE em audit_logs.
- Limite importante: handlers legados ainda chamam a auditoria fora da mesma transação da mutação. Somente o escritor de auditoria que recebe o mesmo cliente PostgreSQL da operação clínica pode oferecer atomicidade; essa migração por handler continua pendente.
