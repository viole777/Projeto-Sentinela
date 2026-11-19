# Bloqueadores externos — Sentinela

Este registro separa trabalho técnico controlável pelo repositório de aprovações, contratos, credenciais e avaliações que exigem terceiros. Nenhum item abaixo é considerado homologado por existir um adaptador, mock ou teste local.

| Dependência | Evidência necessária | Responsável | Status |
|---|---|---|---|
| ANVISA / enquadramento SaMD | Avaliação regulatória formal aplicável ao escopo e uso pretendido | A definir com assessoria regulatória | Pendente de evidência externa |
| SBIS / certificação | Processo e evidências de certificação aplicáveis | A definir | Pendente de evidência externa |
| Validação clínica | Protocolo de validação, casos aprovados e assinatura de profissionais habilitados | Instituição e responsáveis clínicos | Pendente de evidência externa |
| Pentest | Relatório independente, escopo autorizado e remediação dos achados | Empresa independente | Pendente de evidência externa |
| LGPD e jurídico | Revisão jurídica, papéis controlador/operador, bases legais, DPA, RIPD e contratos | Assessoria jurídica / DPO | Pendente de evidência externa |
| Licenciamento comercial | Decisão jurídica sobre LICENSE MIT e estratégia de distribuição | Titular do projeto / assessoria jurídica | Pendente de decisão |
| Catálogos CID-10 / CIAP-2 / SIGTAP / RENAME / CBO / CNES | Arquivos oficiais, versão, competência, vigência, origem e direitos de uso | Gestor de dados / instituição | Pendente de importação e validação |
| Protocolos de classificação de risco | Licença ou protocolo institucional aprovado, versionado e com responsável | Instituição / responsável clínico | Pendente de licença/aprovação |
| Bases de interações medicamentosas | Fonte oficial/licenciada, versão, licença e validação farmacêutica | Farmácia / fornecedor de base | Pendente de fonte externa |
| CADSUS | Contrato, credenciais, ambiente de integração e homologação | Órgão provedor / instituição | Não configurada |
| RNDS | Credenciamento, certificados, perfis BR Core aplicáveis e homologação | Ministério da Saúde / instituição | Não configurada |
| Gov.br | Registro do cliente, credenciais e homologação dos escopos | Provedor / instituição | Não configurada |
| ICP-Brasil | Prestador de serviço de confiança, certificados, política e homologação | Autoridade/PSC / instituição | Não configurada |
| SINAN / e-SUS Notifica | Contrato, leiautes vigentes, credenciais e autorização de transmissão | Ministério da Saúde / instituição | Não configurada |
| SIA/SIH SUS | Leiautes e tabelas oficiais por competência, credenciamento e validação | Ministério da Saúde / instituição | Não configurada |
| SNGPC / controlados | Requisitos, credenciais e homologação da transmissão aplicável | ANVISA / instituição | Não configurada |
| ANS / TISS / operadoras | Versão oficial TISS/TUSS, XSD, contratos e homologação por operadora | ANS / operadora / instituição | Pendente |
| Assinatura eletrônica | Provedor selecionado, sandbox, contrato, certificados e evidência de validação | Provedor / instituição | Adaptador não homologado |
| Infraestrutura de produção | Ambientes isolados, backup/PITR, teste de restauração, SLO, RPO/RTO e exercício de desastre | Operação / provedor de infraestrutura | Pendente de evidência operacional |
| Dispositivos e equipamentos | Equipamentos reais, protocolos do fabricante, validação de integração e segurança | Hospital / fabricantes | Simuladores não equivalem a homologação |

## Política de atualização

- Toda mudança de status deve apontar para evidência verificável e data.
- Credenciais nunca devem ser anexadas a este documento ou commitadas no repositório.
- Integrações sem credenciais e homologação devem permanecer como `not_configured` ou `sandbox`.
- Não usar dados reais de pacientes em demonstrações ou testes.
- O status global permanece **NÃO APROVADO para produção** enquanto houver bloqueadores críticos sem evidência e aceite institucional.
