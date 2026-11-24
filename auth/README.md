# Login do painel — ativação

Este serviço foi preparado para Cloudflare Workers; **a URL e as credenciais ainda precisam ser configuradas**. Não há endpoint de produção inventado nem segredo no repositório. O site continua público; o painel usa sua conta GitHub, com o segundo fator configurado nela, para autenticar.

## O que o serviço permite

Somente a conta de ID GitHub **92313515**, atualmente `cicpmatos`, recebe um token no painel de `https://caiomatos.com.br`. O nome de usuário é apenas uma sugestão na tela do GitHub; a autorização usa o ID estável consultado na API em cada login.

`GET /auth` inicia o fluxo e `GET /callback` recebe o retorno. O estado aleatório e o verificador PKCE S256 ficam em um cookie AES-GCM com `HttpOnly`, `Secure`, `SameSite=Lax`, prefixo `__Host-` e prazo de dez minutos. O callback valida a sessão, troca o código no servidor e verifica a conta. O popup só envia o resultado à origem exata do site depois de conferir a janela e a mensagem de confirmação do Decap. Respostas não são armazenáveis em cache; a página de retorno tem uma política de conteúdo restrita.

## Preparar e ativar

1. Na conta Cloudflare que hospedará o serviço, escolha a URL HTTPS real do Worker `caiomatos-cms-auth` (o subdomínio depende da conta). Preencha `vars.PUBLIC_ORIGIN` em `auth/wrangler.jsonc` com essa origem, sem `/` ao final. Nenhum domínio ou DNS é alterado por este código.
2. Crie um [OAuth App no GitHub](https://github.com/settings/developers), dedicado a este painel. Use a homepage `https://caiomatos.com.br` e, em **Authorization callback URL**, a origem real do Worker seguida de `/callback`. Registre o Client ID em `vars.OAUTH_CLIENT_ID`.
3. Cadastre o Client Secret como segredo do Worker. Gere também uma chave aleatória independente de 32 bytes, em base64url, e cadastre como `SESSION_SECRET`. Não coloque esses valores em páginas, commits, prints ou conversas.

   ```sh
   npx wrangler secret put OAUTH_CLIENT_SECRET --config auth/wrangler.jsonc
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   npx wrangler secret put SESSION_SECRET --config auth/wrangler.jsonc
   ```

4. Confira os campos públicos e publique o serviço na conta Cloudflare escolhida:

   ```sh
   node --test auth/test/*.test.mjs
   npx wrangler deploy --config auth/wrangler.jsonc
   ```

5. Configure o painel com a origem **real** do Worker e habilite-o conforme o guia principal. A configuração equivalente esperada pelo serviço é:

   ```yaml
   backend:
     name: github
     repo: cicpmatos/cicpmatos.github.io
     branch: main
     auth_scope: public_repo
     base_url: ORIGEM_HTTPS_REAL_DO_WORKER
     auth_endpoint: auth
   ```

6. Abra `https://caiomatos.com.br/admin/`, permita o popup e entre com a conta autorizada. Valide um rascunho e a pull request antes de publicar. Uma tentativa com outra conta deve falhar. O login não é habilitado para `localhost`, domínios de prévia ou `www`; use testes isolados para desenvolvimento e o domínio canônico na ativação.

Se o Worker ainda não existir, o primeiro comando de cadastro de segredo pode oferecer criá-lo. Pode-se fazer essa preparação pela interface de Workers & Pages e cadastrar os dois segredos em **Settings → Variables and Secrets**. Use uma versão atual do Wrangler que suporte `secrets.required`.

## Limites e manutenção

O backend padrão do Decap usa um token GitHub no navegador autenticado para salvar conteúdo e abrir pull requests. O **Client Secret permanece no servidor**, mas o token é persistido no armazenamento local do navegador e sobrevive ao fechamento da aba ou do navegador. Use **Sair** no CMS ao terminar em dispositivo compartilhado. Os dez minutos do cookie se referem somente à transação de login, não à sessão do editor. Use dispositivo confiável e mantenha o Decap atualizado.

O escopo OAuth `public_repo` abrange os repositórios públicos aos quais sua conta tem acesso; ele **não se limita a este repositório**. Foi escolhido pela compatibilidade do fluxo OAuth do Decap. Se for necessário restringir a autorização a um único repositório, a próxima evolução deve usar um GitHub App com permissões e instalação específicas, com a adaptação correspondente do backend. O serviço recusa tokens com escopos diferentes ou mais amplos. Em caso de autorização antiga com escopo `repo`, revogue o aplicativo no GitHub e entre novamente.

Este fluxo não solicita `offline_access` nem implementa refresh tokens. Se o OAuth App estiver configurado para expirar tokens, entre novamente quando a sessão expirar. Ao suspeitar de exposição, revogue o acesso em **GitHub → Settings → Applications → Authorized OAuth Apps**, gire o Client Secret e `SESSION_SECRET` e entre novamente. Girar `SESSION_SECRET` invalida logins em andamento; sair do CMS não revoga automaticamente a autorização do aplicativo no GitHub.

Mantenha logs de requisições e observabilidade desabilitados para estas rotas, pois o callback recebe um código temporário na URL. Os testes usam APIs simuladas e verificam criptografia, estado, expiração, PKCE, conta autorizada, protocolo do popup e caminhos de negação. O teste completo com GitHub e Cloudflare só pode ser feito após cadastrar as credenciais reais.

Falhas de sessão retornam somente um código de diagnóstico fixo na página e no cabeçalho `X-CMS-Login-Error`. Para suporte, compartilhe apenas esse código, nunca a URL do callback, cookies ou credenciais. Parâmetros de retorno desconhecidos são ignorados conforme a [RFC 6749, seção 4.1.2](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2); não são refletidos nem encaminhados. Campos reconhecidos duplicados e provedor incorreto continuam bloqueados. O destino de troca de código, o callback e a origem do painel são fixos.

As chamadas ao GitHub usam `redirect: "manual"` e recusam respostas de redirecionamento. Não use `redirect: "error"`: esse modo não é implementado pelo [runtime de Workers](https://developers.cloudflare.com/workers/runtime-apis/request/) e falha antes de enviar a requisição. As falhas de autorização também têm códigos fixos, sem copiar mensagens ou dados da API. O painel conserva o aviso depois que a notificação temporária do Decap desaparece. Os endereços HTTP/legados do painel são encaminhados no navegador para `https://caiomatos.com.br/admin/`; ativar **Enforce HTTPS** no GitHub Pages ainda é recomendado para forçar a proteção já no servidor.

Referências oficiais: [OAuth e PKCE no GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [escopos do GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps), [backend GitHub do Decap](https://decapcms.org/docs/github-backend/), [protocolo do popup no código do Decap](https://github.com/decaporg/decap-cms/blob/master/packages/decap-cms-lib-auth/src/netlify-auth.js), [segredos do Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/secrets/).
