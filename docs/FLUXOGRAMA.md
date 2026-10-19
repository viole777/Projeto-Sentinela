# Fluxograma do Sentinela

Este fluxo descreve o comportamento esperado da aplicação demonstrativa. As setas de decisão representam validações; nenhum resultado da IA substitui a decisão do profissional.

```mermaid
flowchart TD
    A[Início / Login] --> B{Credenciais válidas?}
    B -- Não --> C[Mensagem de erro e limite de tentativas]
    C --> A
    B -- Sim --> D[Carregar perfil e permissões]
    D --> E[Dashboard por função]
    E --> F[Cadastro ou busca do paciente]
    F --> G{Paciente encontrado / dados válidos?}
    G -- Não --> F
    G -- Sim --> H[Registrar atendimento]
    H --> I[Triagem e sinais vitais]
    I --> J{Sinal crítico ou alerta?}
    J -- Sim --> K[Gerar alerta e exigir revisão profissional]
    J -- Não --> L[Fila para avaliação médica]
    K --> L
    L --> M[Consulta médica]
    M --> N[Safety Engine: alergia, alto risco, duplicidade e dados incompletos]
    N --> O{Há achados de segurança?}
    O -- Sim --> P[Exibir achados e registrar auditoria]
    O -- Não --> Q[Continuar revisão profissional]
    P --> Q
    Q --> R[Profissional confirma decisão]
    R --> S{Destino do atendimento}
    S -- Exames --> T[Solicitar exame e registrar resultado]
    S -- Prescrição --> U[Farmácia verifica prescrição e estoque]
    S -- Internação --> V[Selecionar leito e registrar internação]
    S -- Alta --> W[Registrar alta e orientações]
    T --> X[Atualizar histórico e auditoria]
    U --> X
    V --> X
    W --> X
    X --> Y[Relatórios / acompanhamento domiciliar]
    Y --> Z[Fim do ciclo ou retorno agendado]
    
    M -. opcional .-> AI[Resumo assistido por IA]
    AI --> AJ[Contexto minimizado, sem nome/CPF para o provedor]
    AJ --> AK[Resumo e inconsistências como apoio, não diagnóstico]
    AK --> Q
```

## Avaliação do fluxo

- **Ordem geral:** cadastro/identificação → triagem → consulta → checagem de segurança → decisão clínica → exames, prescrição, internação ou alta.
- **Ponto obrigatório:** o Safety Engine deve rodar no backend, não apenas na tela, e seus achados precisam ser apresentados antes da conclusão do fluxo.
- **Auditoria:** registrar alterações e ações sensíveis, sem gravar senhas, tokens ou prontuários completos nos logs técnicos.
- **IA:** é uma etapa auxiliar e não um gate clínico. O fluxo principal precisa continuar disponível quando a chave externa estiver ausente ou a IA falhar.
- **Limitação atual:** este diagrama descreve o fluxo-alvo e a navegação documentada. A cobertura integral de cada ramificação precisa ser confirmada por testes de integração no ambiente implantado.
