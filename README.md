# Site de Caio Matos

O site continua hospedado no GitHub Pages, com o domínio `caiomatos.com.br`. Eleventy gera os artigos a partir de Markdown; o Decap CMS oferece o editor em `/admin/`. O visual, os endereços dos projetos e os três dashboards existentes são preservados.

## Escrever e publicar

Depois da ativação, entre em `https://caiomatos.com.br/admin/` com a conta GitHub `cicpmatos`. Selecione **Artigos e histórias → Novo Post**, escreva o título, resumo, tema e texto; adicione imagens e links se quiser. O guia do próprio painel está em `/admin/guia.html`.

Salvar um rascunho cria uma branch e uma pull request. Revise o texto e confira a validação do site na pull request; publicar integra a mudança à `main` e dispara a reconstrução do site. A lista de artigos e o sitemap são atualizados automaticamente. Posts da categoria **Pessoal** também aparecem em **Além dos dados**. A data é informativa: não agenda publicação. O calendário do iCloud é um lembrete para escrever, revisar e publicar.

O repositório é público: rascunhos, imagens e histórico de commits podem ser vistos no GitHub antes da publicação no site. Não use esse espaço como armazenamento privado. A senha é informada ao GitHub; nenhuma senha é guardada no site.

## Publicar vídeos

No painel, escolha **Vídeos → Novo Vídeo**. Preencha título, descrição, endereço, tema e **Link do YouTube**; data e notas em Markdown são opcionais. Não é necessário criar um artigo nem colar HTML. Salve, revise e publique pelo mesmo fluxo editorial.

O site gera automaticamente `/videos/`, com players na própria lista, e `/videos/{slug}.html`, com o player e as notas. Vídeos novos aparecem primeiro pela data informada. O sitemap inclui as páginas individuais. Sem vídeos cadastrados, a seção exibe uma mensagem honesta de estado vazio, sem demonstrações fictícias.

O arquivo de vídeo permanece no YouTube. URLs HTTPS de vídeos convencionais, links curtos, Shorts e lives são normalizadas para um ID validado; a URL fornecida nunca é colocada diretamente no iframe. Os players usam `youtube-nocookie.com`, carregamento adiado, sem autoplay e com `referrerpolicy="strict-origin-when-cross-origin"` para preservar o Referer exigido pelo YouTube. Esse modo não significa ausência de conexões ou coleta pelo YouTube. Links diretos oferecem uma alternativa quando o player não estiver disponível.

Confirme que o vídeo permite incorporação. Vídeos privados, indisponíveis ou com restrições podem não reproduzir. Publicar o link de um vídeo não listado torna esse link encontrável. Parâmetros de compartilhamento e marcações de tempo são ignorados. A prévia padrão do editor mostra o conteúdo, não o player final. Consulte também o [guia oficial de incorporação](https://support.google.com/youtube/answer/171780).

## Ativação necessária

O workflow já configura o painel com o serviço de login `https://caiomatos-cms-auth.cicpmatos.workers.dev`. Não é necessário criar uma variável no GitHub para usar esse endereço. Antes de publicar a migração, é necessário:

1. Seguir [auth/README.md](auth/README.md) para cadastrar um OAuth App dedicado no GitHub, publicar o Worker na conta Cloudflare e salvar os segredos diretamente lá.
2. Em **Settings → Pages → Build and deployment**, selecionar **GitHub Actions** como fonte. Faça isso antes de integrar a migração: a publicação utiliza `_site/`, não os arquivos-fonte.
3. Integrar a mudança de infraestrutura à `main` e acompanhar o workflow **Validar e publicar site**. Antes de enviar o site para publicação, ele verifica que o painel foi gerado com o login habilitado e a origem configurada.
4. Testar o login no domínio canônico, salvar um rascunho, conferir o resultado da validação e publicar um texto de teste aprovado. O login não é habilitado em domínios de prévia ou em localhost.

Para substituir o endereço padrão, defina opcionalmente a variável de repositório `CMS_AUTH_ORIGIN` em **Settings → Secrets and variables → Actions → Variables**. Use somente a origem HTTPS real do novo serviço, sem caminho ou parâmetros, e ajuste o Worker e o callback do OAuth App de acordo. A variável tem prioridade sobre o endereço padrão; ausente ou vazia, usa o endereço acima. Esse endereço é público: nunca coloque Client Secret ou chave de sessão nessa variável. Um valor malformado faz a compilação falhar.

A verificação do workflow confirma a configuração gerada, não a autenticação real. Não se deve considerar o login de produção validado antes do teste com GitHub e Cloudflare.

## Desenvolvimento e validação

Requisitos: Node.js 22 ou superior e pnpm 11.25.0 (fixado no projeto).

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

O site local fica em `http://localhost:8080`. `pnpm check` compila, testa a autenticação e o processamento de posts, verifica os links locais e a preservação dos dashboards. Não utiliza credenciais reais. O workflow valida pull requests sem implantar; só a `main` é publicada. Cada validação disponibiliza um artefato `site-preview` com o site completo.

Em builds locais sem `CMS_AUTH_ORIGIN`, o site público é gerado normalmente e o painel mostra **Acesso aguardando ativação**. O endereço padrão é aplicado apenas pelo workflow do GitHub; a verificação obrigatória de login habilitado também fica restrita ao workflow.

## Estrutura

- `content/posts/*.md`: posts editáveis e metadados.
- `content/videos/*.md`: vídeos editáveis, URL do YouTube e notas opcionais.
- `content/_includes/`: modelos compartilhados de página, artigo e cards.
- `content/artigos.njk`, `content/pessoal.njk`, `content/videos.njk`, `content/sitemap.njk`: índices gerados.
- `admin/`: painel, configuração pública e guia de publicação.
- `auth/`: serviço OAuth independente; nunca é incluído no site estático.
- `index.html`, `projetos/`, `tecnologias/`, `publicacoes/`, CSS e imagens: páginas e recursos existentes.
- `_site/`: saída gerada, ignorada pelo Git.

O estudo de caso de xadrez foi migrado para Markdown e mantém a URL `/artigos/integracao-apis-xadrez.html`, sem inventar uma data de publicação. Não foram criados artigos fictícios para preencher a agenda editorial.

O conteúdo aceita Markdown, não executa HTML nem instruções de template inseridas no texto. A validação impede slugs duplicados, caminhos fora da pasta de artigos, metadados de template e links de apoio inseguros. A imagem de capa exige descrição alternativa. Uploads aceitam PNG, JPEG, GIF e WebP de até 5 MB, com assinatura do formato verificada; HTML e SVG não são publicados. O login usa ID estável da conta autorizada; veja no guia de autenticação as permissões do token e como revogá-lo.

Referências: [Eleventy](https://www.11ty.dev/docs/), [Decap: revisão e publicação](https://decapcms.org/docs/editorial-workflows/), [GitHub Pages com Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
