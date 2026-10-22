# Sentinela Professional V2

Esta branch contém a segunda linha de evolução visual e funcional do Sentinela, separada da versão conservadora ligada ao Render.

## Objetivo
- Preservar fluxos e endpoints existentes enquanto a experiência visual é modernizada.
- Aplicar identidade visual clínica consistente, navegação escura, acento teal, hierarquia tipográfica e componentes uniformes.
- Melhorar responsividade, estados de foco, tabelas, cards, indicadores e suporte a movimento reduzido.
- Manter o aviso de ambiente demonstrativo e os controles de acesso existentes.
- Não reutilizar credenciais ou banco de produção em deploy de teste.

## Arquivos desta etapa
- `frontend/layout.js`: tokens visuais, navegação lateral e paleta.
- `frontend/styles.css`: sistema visual responsivo, cards, tabelas, botões, estados vazios e acessibilidade.
- `frontend/index.html`: alinhamento visual da tela de login.
- Os ajustes de segurança e testes presentes na base atual permanecem nesta branch.

## Antes de publicar
1. Corrigir XSS e handlers inline em todas as páginas restantes.
2. Revisar fluxos e papéis de acesso.
3. Executar testes automatizados, testes visuais em telas pequenas e regressão ponta a ponta.
4. Criar serviço de staging e banco isolados; não apontar esta versão ao banco de produção.
5. Configurar segredos de staging separadamente e validar o deploy.

## Estado
Branch de desenvolvimento. As mudanças de design foram commitadas, mas não devem ser consideradas testadas em produção nem prontas para uso clínico.
