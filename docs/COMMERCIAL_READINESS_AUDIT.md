# Auditoria de prontidão comercial — Sentinela

**Data da consolidação:** 10/11/2026  
**Branch de trabalho:** `audit/commercial-readiness-consolidated`  
**Objetivo:** evoluir o projeto para um piloto controlado e, posteriormente, para uma solução hospitalar comercializável e certificável.

> **Status atual: NÃO APROVADO para uso assistencial real ou venda como sistema clínico de produção.** Este documento registra evidências técnicas e trabalho pendente. A presença de código, telas ou testes não comprova validação clínica, conformidade regulatória ou segurança operacional.

## 1. Escopo e limites da auditoria

A revisão considerou código-fonte da branch principal, alterações de segurança já propostas em pull requests, workflows do GitHub e metadados do serviço de hospedagem. A auditoria foi predominantemente estática e documental.

Não foram realizados nesta etapa:
- pentest independente ou exploração de produção;
- testes autenticados completos com contas de todos os perfis;
- teste de carga, failover ou recuperação de desastre;
- validação clínica com profissionais habilitados;
- parecer jurídico ou enquadramento formal pela ANVISA;
- análise completa de todos os fluxos de tratamento de dados pessoais.

Não declarar ausência de vulnerabilidades com base nesta revisão.

## 2. Alterações consolidadas nesta branch

As alterações abaixo foram reunidas de PRs anteriores e commits de consolidação. Precisam continuar passando pelo CI da PR consolidada antes de qualquer merge em `main`.

| Controle | Alteração | Limite conhecido |
|---|---|---|
| Negociação de conteúdo | Navegação HTML exige `Accept: text/html`; requisições de API não devem ser redirecionadas como páginas | Testes precisam ser mantidos em CI |
| Workflow privilegiado | Removida automação que executava correção de dependências com permissão de escrita no repositório | Revisar todos os workflows e actions pinning |
| Módulos genéricos | Endpoints genéricos não implementados respondem 501 | Ainda faltam módulos reais, com validação e autorização específicas |
| Registros de triagem | Exclusão física bloqueada; encerramento preserva histórico | Revisar retenção, correções e trilha de alterações |
| XSS legado | Valores não confiáveis escapados nas telas clínicas alteradas | Não equivale a varredura completa de XSS no frontend |
| Armazenamento em produção | Inicialização sem `DATABASE_URL` bloqueada em produção | Persistência atual ainda precisa ser transacional e awaitable |
| Alergias | Agregação de fontes do perfil e da triagem; valor vazio/“nenhuma” não deve mascarar alergia já registrada | Correspondência textual não substitui uma base clínica validada |
| Prescrição e dispensação | Alertas críticos exigem justificativa no fluxo atual; dispensação retorna 501 enquanto faltarem itens estruturados, lote, validade e baixa transacional | Nenhuma justificativa textual substitui revisão clínica estruturada |
| Segredos | Adicionado workflow de varredura do histórico Git com Gitleaks | Resultado da varredura deve ser revisado; segredo histórico exige rotação e, quando aplicável, saneamento do histórico |
| Documentação de acesso | Removidas credenciais públicas de demonstração e proposta escolar obsoleta | Verificar screenshots, issues, seeds e histórico Git |
| Dependências | Removidos adaptadores não utilizados e atualizadas dependências com advisories identificados | Reexecutar auditoria e revisar dependências transitivas |
| Monitoramento de dependências | Dependabot e workflow de auditoria somente leitura | Confirmar execução e cobertura dos diretórios/lockfiles |

### Complemento de implementação — PR #43

A branch `refactor/permissions-and-code-cleanup` acrescenta uma primeira correção estrutural do controle de acesso:

- Rotas de negócio migradas de listas amplas de cargos para permissões explícitas por ação e módulo (`requirePermission`).
- O backend resolve permissões no servidor; valores armazenados no navegador não autorizam operações.
- O papel `admin` foi convertido em administrador técnico de menor privilégio, sem acesso clínico implícito por curinga.
- A matriz de papéis embutidos é reconciliada no PostgreSQL durante a inicialização, revogando concessões antigas dos papéis padrão.
- Sessões PostgreSQL são revalidadas no banco em cada requisição protegida, incluindo estado ativo e papel atual.
- Navegação e controles de escrita dos frontends passam a usar permissões explícitas.
- Foram removidos auxiliares sem uso (`sessionCan`, `mapUserRecord`, revalidação antiga em cache e carregador duplicado de permissões), um terminador redundante e a dependência `cors`, não utilizada no código.

**Limite desta entrega:** a autorização por ação/módulo está implementada como primeira camada. A segregação por unidade, setor, vínculo assistencial e paciente ainda não está concluída. Endpoints que retornam listas clínicas ainda precisam de filtros de escopo e minimização de campos; a matriz de papéis não substitui autorização por recurso. A revisão independente de BOLA/IDOR continua obrigatória.

## 3. Bloqueadores críticos ainda abertos

### 3.1 Autorização e privacidade por função

- Implementar autorização por ação, recurso, unidade, setor e vínculo assistencial.
- Revisar `GET /pacientes`, `GET /triagem` e `GET /prontuario/:cpf` para retornar somente os campos necessários ao papel e contexto.
- Impedir acesso horizontal entre pacientes e instituições.
- Adicionar testes negativos para cada papel e endpoint sensível.
- Garantir que a autorização seja verificada no servidor, não apenas na interface.

**Critério de aceite:** matriz de permissões aprovada, testes automatizados cobrindo acesso permitido e negado e revisão independente de BOLA/IDOR.

### 3.2 Integridade de registros e auditoria

- O serviço de auditoria ainda captura falhas e pode descartá-las silenciosamente.
- O histórico tem limite de retenção em memória/armazenamento atual; isso não satisfaz uma trilha clínica durável.
- A gravação de estado por `writeDB` ainda não oferece uma promessa transacional/awaitable por operação.
- A sincronização usa operações de upsert que podem sobrescrever registros históricos.
- Implementar transações PostgreSQL por operação, controle de concorrência, trilha append-only e integridade verificável.
- Separar correção clínica de exclusão; manter autor, horário, motivo, versão anterior e versão nova.

**Critério de aceite:** testes de concorrência, falha de banco, rollback, integridade da trilha e restauração comprovada.

### 3.3 Dados sensíveis e sessões

- O schema ainda declara CPF como texto sem criptografia de campo demonstrada.
- O token de sessão ainda é armazenado como valor direto no banco.
- A revogação de sessões entre instâncias pode aguardar revalidação do cache.
- Revisar armazenamento de tokens de recuperação, política de senha, MFA e limitação de tentativas por conta e IP.
- Definir gestão de chaves, rotação, backups criptografados e controle de acesso a segredos.

**Critério de aceite:** desenho criptográfico revisado, migração compatível, testes de sessão/revogação multi-instância e política de identidade aprovada.

### 3.4 Segurança da aplicação

- A CSP ainda permite `unsafe-inline` em scripts e estilos.
- Revisar XSS em todas as páginas legadas e no React, CSRF, CORS, upload, validação de entrada, SSRF e exposição de erros.
- Revisar limites de payload, rate limiting, logs e dependências.
- Executar SAST, DAST e pentest externo autorizado.

**Critério de aceite:** CSP endurecida sem quebrar fluxos, testes automatizados, relatório independente e plano de correção dos achados.

### 3.5 Arquitetura e API

- Concluir migração para TypeScript com `strict`.
- Definir versão de runtime Node.js e política de atualização suportada.
- PostgreSQL deve ser a única fonte de verdade em produção; JSON somente em desenvolvimento isolado.
- Adotar validação de entrada com schemas, camada de persistência tipada e transações.
- Padronizar API versionada, erros, paginação, idempotência e contratos.
- Remover duplicações entre backend legado e módulos novos.

**Critério de aceite:** arquitetura documentada, migrações versionadas, testes de contrato e zero caminho de fallback JSON em produção.

### 3.6 Produto e interface

- Substituir páginas `PlaceholderPage` por fluxos funcionais ou ocultar módulos não implementados.
- Completar e testar pacientes, triagem, consultas, prontuário, exames, farmácia, estoque, internação, leitos, atendimento domiciliar, alertas e relatórios.
- Implementar validação de formulários, estados de erro, acessibilidade, responsividade e atualização de filas.
- Não expor ações de dispensação ou outros fluxos clínicos enquanto as salvaguardas não existirem.

**Critério de aceite:** especificação funcional por módulo, testes E2E e aceite de usuários representativos em ambiente de homologação.

## 4. Validação clínica e IA

- Definir finalidade pretendida de cada função clínica.
- Fazer revisão por médicos, enfermagem e farmacêuticos habilitados.
- Versionar regras clínicas, fontes, responsáveis, vigência e processo de aprovação.
- Validar sensibilidade, especificidade, falsos positivos e falsos negativos com conjunto de casos aprovado.
- A IA deve permanecer como apoio, com minimização/anonymização de dados, rastreabilidade, avaliação de qualidade, proteção contra prompt injection e revisão humana.
- Nenhuma saída de IA pode prescrever, diagnosticar ou substituir decisão profissional sem enquadramento e validação próprios.

**Critério de aceite:** protocolo de validação aprovado, resultados documentados, gestão de risco clínico e aprovação institucional.

## 5. Infraestrutura e operação

A configuração observada do serviço de hospedagem é adequada para desenvolvimento/demonstração, não como prova de disponibilidade hospitalar.

Pendências:
- ambiente de staging separado da produção, com banco e segredos isolados;
- hospedagem e região de dados compatíveis com requisitos contratuais e LGPD;
- health checks, métricas, logs centralizados e alertas;
- alta disponibilidade, capacidade e plano de escalabilidade;
- backups automáticos, criptografados e testes de restauração;
- RPO/RTO definidos e testados;
- gestão de incidentes, rollback, continuidade e suporte;
- inventário de serviços, dependências, versões e SBOM.

**Critério de aceite:** exercício de desastre/restore documentado, monitoramento ativo e SLO/SLA aprovados.

## 6. LGPD, ANVISA e comercialização

Exige revisão jurídica e regulatória especializada; não pode ser resolvido apenas por alteração de código.

- Mapear dados pessoais e sensíveis, finalidades, bases legais, retenção e compartilhamentos.
- Definir controlador, operador, contratos, suboperadores e transferências internacionais.
- Criar política de privacidade, termos, registro de operações, processo de direitos dos titulares e resposta a incidentes.
- Avaliar Relatório de Impacto à Proteção de Dados quando aplicável.
- Definir finalidade pretendida e enquadramento de cada função segundo a regulamentação aplicável da ANVISA, inclusive avaliação de possível SaMD.
- Avaliar certificação SBIS conforme escopo e estratégia comercial.
- Resolver titularidade do código, licenças de terceiros, marca, contratos, responsabilidade, suporte e SLA.
- Criar manual de instalação, administração, usuário, segurança e atualização.

**Observação sobre licença:** a remoção da licença MIT foi deliberadamente adiada. Remover um arquivo LICENSE não desfaz licenças já concedidas nem resolve titularidade. A decisão deve ser tomada após revisão jurídica de autoria e dependências.

## 7. Critérios de passagem entre etapas

### Demonstração
Permitida somente com dados sintéticos, aviso claro de protótipo e sem decisões clínicas reais.

### Piloto controlado
Somente após correções críticas, ambiente isolado, autorização institucional, validação clínica aplicável, segurança e privacidade revisadas, treinamento e plano de contingência.

### Produção comercial
Somente após evidências independentes de segurança, confiabilidade, desempenho, recuperação, conformidade jurídica/regulatória aplicável, documentação, suporte e aceite formal do cliente.

## 8. Decisão desta auditoria

**Decisão atual: NÃO APROVADO para venda como sistema hospitalar de produção.**

Esta branch consolida correções de segurança e documentação que reduzem riscos conhecidos, mas não encerra os bloqueadores descritos acima. A PR deve ser revisada, submetida ao CI e validada em ambiente isolado. Não fazer deploy automático em produção nem inserir dados reais de pacientes como parte desta consolidação.

## 9. Referências internas

- `backend/server.js`
- `backend/src/db.js`
- `backend/src/sessions.js`
- `backend/src/services/auditService.js`
- `backend/src/routes/advancedModules.js`
- `database.sql`
- `frontend-v2/src/App.tsx`
- `.github/workflows/`
