# Acesso de demonstração — Sentinela

> **Aviso de segurança:** este documento não publica senhas, tokens ou credenciais reutilizáveis. O Sentinela é um protótipo escolar e deve usar somente dados sintéticos.

## Ambiente local

1. Instale as dependências conforme o README e configure as variáveis de ambiente a partir de `.env.example`.
2. Inicialize o banco de desenvolvimento com os scripts documentados no repositório.
3. Use somente contas de demonstração criadas localmente por um administrador autorizado.
4. Antes de compartilhar a aplicação, altere qualquer credencial inicial e confirme que nenhuma conta de demonstração permanece ativa no ambiente público.
5. Não use senhas de demonstração em Render ou em qualquer serviço acessível pela internet.

Este repositório possui arquivos de fixture legados usados pelo fluxo de desenvolvimento e CI. Eles devem ser tratados como **dados públicos de teste**, não como fonte de contas reais. Antes de publicar uma nova instância, audite e recrie as contas com credenciais novas. Não importe fixtures legadas para uma base com dados reais.

## Perfis e autorização

O backend define os papéis e permissões. A interface não é uma fronteira de segurança: cada rota deve verificar a sessão e a autorização no servidor. A configuração do Safety Engine é restrita ao perfil administrador.

## PostgreSQL e ambiente hospedado

- Configure `DATABASE_URL` no painel de segredos do provedor; nunca registre seu valor no repositório.
- Mantenha `NODE_ENV=production` no ambiente publicado.
- Use HTTPS e confirme que o cookie de sessão está marcado como `Secure`.
- Verifique a rota `/health` e os logs do serviço após a migração.
- Não habilite recuperação de senha em produção até existir um canal real e seguro de entrega de token (por exemplo, e-mail verificado), expiração curta e testes de uso único.
- Nunca use `?debug=1` ou logs para revelar tokens de redefinição em produção.

## Privacidade e segurança

- Utilize apenas registros fictícios/sintéticos na demonstração.
- Não carregue dados identificáveis de pacientes, mesmo para testes informais.
- Audite logs e permissões antes de qualquer demonstração externa.
- Em caso de credencial exposta, revogue-a e gere outra; apagar o texto do repositório não invalida a credencial.
- O protótipo não foi validado clinicamente nem autorizado para atendimento real.

## Antes de compartilhar uma instância

- [ ] Confirmar que todas as contas têm credenciais novas e fortes.
- [ ] Confirmar que a base é de demonstração e contém apenas dados sintéticos.
- [ ] Confirmar que o banco hospedado é PostgreSQL e que não há fallback silencioso para JSON.
- [ ] Testar login, logout, expiração e autorização para cada perfil.
- [ ] Testar recuperação de senha sem revelar tokens na resposta ou nos logs.
- [ ] Conferir cabeçalhos de segurança, política CSP, upload e arquivos estáticos.
- [ ] Registrar que a instância é um protótipo não oficial, sem validação clínica.
