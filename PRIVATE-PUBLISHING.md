# Separação dos bastidores e publicação gratuita

## Estado da preparação

Migração preparada, ainda não ativada. Não tornar a fonte privada antes de concluir os requisitos e a troca controlada abaixo. Enquanto isso, o site atual e o login OAuth público continuam ativos. A criação do repositório de destino não altera o domínio.

Última verificação local registrada da preparação: 153 testes aprovados, 131 arquivos finais, 12 páginas, 170 referências locais e três dashboards preservados. Build em modo GitHub App validado; a autenticação real do painel ainda não foi validada.

Após a confirmação do usuário, o GitHub App `caiomatos-site-editor` foi criado e instalado somente nos dois repositórios abaixo. A primeira chave, ID `5489448`, não teve o download localizado. Uma nova chave, ID `5489553`, foi baixada corretamente; a existência do segredo `SITE_APP_PRIVATE_KEY` na fonte foi confirmada e a variável pública `SITE_APP_CLIENT_ID` foi salva. Na interface do Cloudflare, `GITHUB_APP_CLIENT_SECRET` foi confirmado como segredo com valor criptografado, sem exposição do valor. `OAUTH_CLIENT_SECRET` e `SESSION_SECRET` foram preservados. A preparação das credenciais não significa que o login novo ou a publicação automática estejam ativos; o código novo do Worker ainda não foi implantado.

O domínio `caiomatos.com.br` consta como Verified na conta GitHub. A carga inicial do destino foi concluída no commit `a662a126cd312d922f9ae0556f3f2764a6de36b7`: **131 arquivos finais**, mais README e o workflow de publicação. O GitHub Pages do destino ainda não foi ativado. A fonte continua pública; domínio, fonte, código e modo de login do Worker de produção permanecem inalterados. A carga inicial do repositório não constitui ativação do novo site nem da publicação automática.

A verificação somente de leitura da instalação confirmou os dois repositórios selecionados. Os tokens temporários de instalação usados na preparação foram revogados. A ferramenta de preparação foi corrigida para aceitar também o formato stateless dos tokens de instalação, sem impor o formato legado de 40 caracteres.

Cobrança conferida na interface: plano **GitHub Free, US$ 0/mês**; orçamento de Actions no nível da conta com **US$ 0 gasto / US$ 0 de orçamento**, indicando **Usage blocked** para uso faturável adicional. Gastos extras permanecem bloqueados; nenhuma configuração financeira foi alterada. Builds privados continuam sujeitos à franquia incluída no plano.

- Fonte e histórico a preservar: `cicpmatos/cicpmatos.github.io`, ID `1382264698`.
- Destino público criado: `cicpmatos/caiomatos-site-publico`, ID `1469475632`.
- GitHub App: ID `5896570`; Client ID público `Iv23li1qI8KHaJxOGh3S`.
- Instalação: ID `185204783`, com seleção explícita somente da fonte `1382264698` e do destino `1469475632`.
- Endereço a preservar: `https://caiomatos.com.br`.
- Os demais projetos do usuário não são alterados.

O destino recebe somente `_site/` depois das verificações de publicação. Não recebe clones, commits, branches, PRs ou arquivos Markdown da fonte. Sua própria configuração de Pages e README permanecem públicos. HTML, CSS, JavaScript, imagens e textos publicados continuam públicos por definição.

## Autorização limitada

O GitHub App privado da conta `cicpmatos` foi instalado com acesso limitado aos dois repositórios acima. Permissões de repositório: Contents (read/write), Pull requests (read/write) e Metadata (read). Não conceder permissões de conta, Administration, Actions, Workflows ou acesso a todos os repositórios.

O login solicita um token de usuário limitado ao ID da fonte; o Worker valida conta, integração, repositório e permissões. A automação obtém outro token, de instalação, limitado ao destino e a Contents (write), revogado ao fim do job. A chave privada do aplicativo nunca vai ao navegador ou ao repositório; fica em Actions Secrets da fonte. O Client Secret do login fica em Cloudflare Secrets.

O usuário confirmou as novas permissões. Os segredos devem ser cadastrados diretamente nos serviços, sem colá-los na conversa. A configuração atual `public_repo` não deve ser ampliada para `repo` como atalho.

## Credenciais pendentes e preparação isolada

O **Client ID** identifica o aplicativo e é público. O **Client Secret** autentica a troca de código do login no Worker. A **chave privada do aplicativo** permite emitir o token de instalação usado pela automação. São valores distintos e não são intercambiáveis.

O novo segredo **`GITHUB_APP_CLIENT_SECRET`** já foi cadastrado no Cloudflare separadamente do **`OAUTH_CLIENT_SECRET`** usado pelo login atual. O código preparado usa o segredo novo apenas em `OAUTH_MODE=github_app`; em `oauth_public`, usa somente o antigo, sem fallback. Cadastrar o segredo separado não ativa a migração. A interface confirmou que `OAUTH_CLIENT_ID` continua no valor antigo `Ov23liR0imL88VYGV2qM`, `PUBLIC_ORIGIN` permanece `https://caiomatos-cms-auth.cicpmatos.workers.dev` e os segredos antigos foram preservados. Manter o modo de login atual e `SESSION_SECRET` durante essa preparação; trocar `OAUTH_CLIENT_ID` e `OAUTH_MODE` somente no corte coordenado.

- [x] Criar o App `5896570` e confirmar a instalação `185204783` nos dois repositórios exatos.
- [x] Gerar um par de chaves no App, ID `5489448`. O arquivo privado correspondente ainda não foi localizado.
- [x] Gerar a nova chave `5489553` e confirmar o download correto do `.pem`, sem revelar seu conteúdo. A geração não comprova por si só o funcionamento da automação; validar antes de revogar a chave anterior.
- [x] Cadastrar a chave privada em Actions Secrets da fonte como `SITE_APP_PRIVATE_KEY`; existência do segredo confirmada, sem revelar seu valor.
- [x] Cadastrar `SITE_APP_CLIENT_ID=Iv23li1qI8KHaJxOGh3S` em Actions Variables da fonte e conferir o valor público.
- [x] Confirmar na interface do Cloudflare o cadastro de `GITHUB_APP_CLIENT_SECRET` como segredo com valor criptografado, sem solicitar ou revelar o valor.
- [x] Confirmar na interface que `OAUTH_CLIENT_SECRET` e `SESSION_SECRET` antigos foram preservados, juntamente com o Client ID antigo e a origem pública habitual. O cadastro isolado não ativa o código novo nem substitui um teste de login.
- [ ] Conferir a configuração pública de corte: `GITHUB_APP_ID=5896570`, `CMS_REPOSITORY_ID=1382264698`, `CMS_REPOSITORY=cicpmatos/cicpmatos.github.io` e o novo Client ID. Não ativar `OAUTH_MODE=github_app`, `CMS_AUTH_MODE=github_app` ou `PUBLISH_PUBLIC_SITE=true` nesta preparação.

A chave privada não pertence ao Worker; o Client Secret não pertence ao navegador nem às variáveis públicas. Não guardar nenhum dos dois no repositório, em documentos, no diretório `_site/` ou em artefatos do workflow.

## Preparação antes da troca

1. Conferir a instalação já criada, as permissões e os dois repositórios exatos. Usar PKCE e tokens de usuário com expiração; manter webhooks desativados porque não são utilizados.
2. Concluir o checklist de credenciais acima e preparar o código compatível do Worker, com a origem/callback exatos e os IDs exigidos em `auth/README.md`. Preparar `GITHUB_APP_CLIENT_SECRET` separado, sem substituir `OAUTH_CLIENT_SECRET`, o Client ID antigo ou o modo ativo. Não substituir o serviço atual sem uma implantação recuperável.
3. Na fonte, confirmar `SITE_APP_PRIVATE_KEY` como segredo e `SITE_APP_CLIENT_ID` como variável. Configurar `CMS_AUTH_ORIGIN`, `CMS_AUTH_MODE=github_app`, `PUBLISH_PUBLIC_SITE=true` apenas na janela de ativação, junto da configuração privada do Worker.
4. Preservar o bloqueio de gastos do Actions já conferido na interface; não habilitar cobrança excedente. Builds privados consomem a franquia incluída.
5. Conferir a carga inicial já concluída no destino: `.deployment/public-pages.yml` instalado como `.github/workflows/pages.yml`, README sem informações privadas e 131 arquivos finais validados. O commit de preparação está registrado acima. Não copiar `.git` nem reutilizar o histórico da fonte.
6. Habilitar Pages via GitHub Actions no destino. Confirmar a verificação do domínio na conta antes de liberá-lo do repositório antigo, para evitar domínio desassociado vulnerável a terceiros.
7. Validar localmente os dois modos de login, a saída pública, ausência de rascunhos e imagens órfãs, links, dashboards, filtros e player. O teste de autenticação real só termina após a fonte estar privada e a instalação ativa.

## Troca controlada

- Preservar todos os dados e o histórico do repositório original; não apagar/recriar nem forçar reescrita de histórico.
- Remover a associação de Pages do repositório original e associar imediatamente `caiomatos.com.br` ao destino preparado, com domínio já verificado. Acompanhar HTTPS/DNS e a publicação.
- Tornar a fonte privada; isso esconde histórico, branches e PRs naquela origem, mas não recolhe forks, caches ou cópias antigas de terceiros.
- Ativar configuração privada e executar o workflow na main. Ele exige fonte privada e validação bem-sucedida antes de emitir credencial de publicação.
- Validar anonimamente que a fonte não abre, o destino contém apenas a versão pública e o domínio funciona. Validar login com `cicpmatos`, lista de artigos, salvamento de rascunho privado e publicação de uma alteração aprovada.
- Só então marcar a migração concluída e atualizar os guias do autor. Nenhum conteúdo editorial novo é publicado apenas para testar sem aprovação.

## Recuperação

Antes de qualquer troca, guardar os SHAs atuais e a configuração não secreta de Pages/Worker. O repositório fonte não será excluído. Se houver falha, manter a última versão estática funcionando no destino e corrigir o login/automação; não tornar os bastidores públicos automaticamente. Uma reversão que reexponha a fonte exige nova confirmação.

## Verificações locais

`pnpm check` executa a geração, testes e verificação de links. `node scripts/check-public-output.mjs` verifica allowlist, imagens referenciadas, ausência de links simbólicos, credenciais reconhecíveis, arquivos internos e mapas de código. Isso reduz exposição acidental, mas não é uma auditoria completa de segredos ou do histórico.

`scripts/publish-static.mjs` exige execução na main da fonte privada, confere o ID imutável e a visibilidade do destino, envia somente os arquivos validados e usa atualização sem força. Alterações concorrentes bloqueiam a atualização. Nenhum título de rascunho ou SHA da fonte é usado na mensagem pública de commit.
