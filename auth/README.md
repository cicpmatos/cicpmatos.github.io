# Login do painel — ativação

Este serviço usa Cloudflare Workers. A configuração pública fica em `wrangler.jsonc`; as credenciais permanecem nos segredos do Worker. O site continua público; o painel usa sua conta GitHub, com o segundo fator configurado nela, para autenticar. O modo padrão continua sendo o OAuth público existente. O modo GitHub App abaixo é uma migração explícita: publicar apenas o código não o ativa.

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

No modo padrão, o escopo OAuth `public_repo` abrange os repositórios públicos aos quais sua conta tem acesso; ele **não se limita a este repositório**. O serviço recusa tokens com escopos diferentes ou mais amplos. Em caso de autorização antiga com escopo `repo`, revogue o aplicativo no GitHub e entre novamente. A migração para o modo GitHub App restringe o acesso aos bastidores privados, conforme a seção seguinte.

O modo OAuth público não solicita `offline_access`. Se o OAuth App estiver configurado para expirar tokens, entre novamente quando a sessão expirar. Nenhum modo implementa renovação automática por refresh token. Ao suspeitar de exposição, revogue o acesso em **GitHub → Settings → Applications** (OAuth Apps ou GitHub Apps, conforme o modo), gire o Client Secret e `SESSION_SECRET` e entre novamente. Girar `SESSION_SECRET` invalida logins em andamento; sair do CMS não revoga automaticamente a autorização do aplicativo no GitHub.

## Migração opt-in para bastidores privados

Não basta trocar `public_repo` por `repo`: isso daria ao OAuth App acesso amplo aos repositórios privados. Use um **GitHub App dedicado**, privado, sem permissões de conta, com apenas as permissões de repositório `Contents: Read and write`, `Pull requests: Read and write` e `Metadata: Read-only`. Instale-o apenas nos repositórios escolhidos para o site. Não solicite permissão de administração, ações ou workflows para o painel.

O login utiliza o **Client ID e Client Secret do GitHub App**, não a chave privada de instalação. Preserve o callback exato `PUBLIC_ORIGIN/callback` e a expiração de tokens de usuário. A chave privada usada por uma eventual automação de publicação deve ficar separada, nos segredos da automação; ela não é necessária neste Worker nem pode aparecer no navegador.

Configure estas variáveis públicas no Worker somente no corte coordenado da migração:

| Variável | Valor |
| --- | --- |
| `OAUTH_MODE` | `github_app` |
| `GITHUB_APP_ID` | ID numérico real do novo GitHub App |
| `OAUTH_CLIENT_ID` | Client ID real do novo GitHub App |
| `CMS_REPOSITORY_ID` | `1382264698` (identidade estável do repositório de origem) |
| `CMS_REPOSITORY` | `cicpmatos/cicpmatos.github.io` |

Cadastre o segredo do novo GitHub App como **`GITHUB_APP_CLIENT_SECRET`**, separado do segredo antigo **`OAUTH_CLIENT_SECRET`**. Isso pode ser preparado antes do corte sem interromper o login ativo. Não substitua nem remova o segredo antigo nessa preparação. O modo `github_app` exige o segredo novo; o modo `oauth_public` exige o antigo, sem fallback entre eles. Mude `OAUTH_CLIENT_ID` para o Client ID novo somente no corte coordenado, junto com `OAUTH_MODE`. Nunca registre os valores dos segredos em arquivos.

No build do site, `CMS_AUTH_MODE=github_app` deve gerar `authMode: "github_app"` em `runtime-config.json`, junto de `repository: "cicpmatos/cicpmatos.github.io"`. O editor usa `createCmsConfig(authOrigin, { authMode, repository })`; na ausência desses campos, mantém o modo OAuth público anterior. Não ative o modo novo enquanto a origem ainda for pública: a validação exige `private: true`. A declaração `secrets.required` do Wrangler também deve ser alinhada ao modo final antes de retirar o segredo antigo; durante a preparação, preserve a configuração de produção existente.

O Worker solicita `offline_access` para exigir token de usuário com expiração de oito horas, troca o código com `repository_id` fixo e mantém estado/PKCE. Depois verifica o ID da conta, o ID do aplicativo, a instalação com seleção explícita, as três permissões exatas e o inventário acessível ao token. Esse inventário deve conter **somente** o repositório privado esperado, com permissão de escrita. O parâmetro `repository_id` pode ser ignorado pelo GitHub quando o repositório não está acessível; por isso a checagem independente é obrigatória. Inventário maior, paginado, inesperado ou indisponível bloqueia o login. Não relaxe essa proteção para contornar um erro de instalação.

O token de usuário vai ao Decap; o refresh token é descartado. Após oito horas, salve o trabalho local pendente antes de sair e entrar novamente. O Decap 3.18 aceita o token pelo fluxo existente; `auth_scope` precisa ficar em `offline_access`, pois um valor vazio faz o Decap recorrer ao escopo amplo `repo`. O aplicativo pode ter uma instalação que inclua o destino público da automação, mas o token entregue ao painel deve continuar limitado à origem privada.

Antes de encerrar a migração, valide ao vivo: entrada no painel, listagem de artigos, criação de um rascunho **privado**, alteração, revisão e publicação controlada. Testes simulados não substituem essa confirmação. Só então remova a configuração antiga e revogue a autorização do antigo OAuth App. Os testes em `auth/test/github-app.test.mjs` cobrem modo opt-in, privilégio mínimo, sessão vinculada à configuração, expiração, limites do inventário e não divulgação de segredos.

Referências da migração: [tokens de usuário, PKCE e restrição por repositório](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [expiração de tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens), [inventário de instalações e repositórios](https://docs.github.com/en/rest/apps/installations), [autenticação do Decap 3.18](https://github.com/decaporg/decap-cms/blob/decap-cms%403.18.0/packages/decap-cms-backend-github/src/AuthenticationPage.js).

Mantenha logs de requisições e observabilidade desabilitados para estas rotas, pois o callback recebe um código temporário na URL. Os testes usam APIs simuladas e verificam criptografia, estado, expiração, PKCE, conta autorizada, protocolo do popup e caminhos de negação. O teste completo com GitHub e Cloudflare só pode ser feito após cadastrar as credenciais reais.

Falhas de sessão retornam somente um código de diagnóstico fixo na página e no cabeçalho `X-CMS-Login-Error`. Para suporte, compartilhe apenas esse código, nunca a URL do callback, cookies ou credenciais. Parâmetros de retorno desconhecidos são ignorados conforme a [RFC 6749, seção 4.1.2](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2); não são refletidos nem encaminhados. Campos reconhecidos duplicados e provedor incorreto continuam bloqueados. O destino de troca de código, o callback e a origem do painel são fixos.

As chamadas ao GitHub usam `redirect: "manual"` e recusam respostas de redirecionamento. Não use `redirect: "error"`: esse modo não é implementado pelo [runtime de Workers](https://developers.cloudflare.com/workers/runtime-apis/request/) e falha antes de enviar a requisição. As falhas de autorização também têm códigos fixos, sem copiar mensagens ou dados da API. O painel conserva o aviso depois que a notificação temporária do Decap desaparece. Os endereços HTTP/legados do painel são encaminhados no navegador para `https://caiomatos.com.br/admin/`; ativar **Enforce HTTPS** no GitHub Pages ainda é recomendado para forçar a proteção já no servidor.

Referências oficiais: [OAuth e PKCE no GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [escopos do GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps), [backend GitHub do Decap](https://decapcms.org/docs/github-backend/), [protocolo do popup no código do Decap](https://github.com/decaporg/decap-cms/blob/master/packages/decap-cms-lib-auth/src/netlify-auth.js), [segredos do Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/secrets/).
