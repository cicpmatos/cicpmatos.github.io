# Site de Caio Matos

O site continua hospedado no GitHub Pages, com o domínio `caiomatos.com.br`. Eleventy gera os artigos a partir de Markdown; o Decap CMS oferece o editor em `/admin/`. O visual, os endereços dos projetos e os três dashboards existentes são preservados.

## Escrever e publicar

Depois da ativação, entre em `https://caiomatos.com.br/admin/` com a conta GitHub `cicpmatos`. Selecione **Artigos e histórias → Novo Post**, escreva o título, resumo, tema e texto; adicione imagens e links se quiser. O guia do próprio painel está em `/admin/guia.html`.

Salvar um rascunho cria uma branch e uma pull request. Revise o texto e confira a validação do site na pull request; publicar integra a mudança à `main` e dispara a reconstrução do site. A lista de artigos e o sitemap são atualizados automaticamente. Posts da categoria **Pessoal** também aparecem em **Além dos dados**. A data é informativa: não agenda publicação. O calendário do iCloud é um lembrete para escrever, revisar e publicar.

O repositório é público: rascunhos, imagens e histórico de commits podem ser vistos no GitHub antes da publicação no site. Não use esse espaço como armazenamento privado. A senha é informada ao GitHub; nenhuma senha é guardada no site.

## Ativação necessária

O código está preparado, mas o login permanece desabilitado até existir um serviço OAuth configurado. É necessário:

1. Seguir [auth/README.md](auth/README.md) para cadastrar um OAuth App dedicado no GitHub, publicar o Worker na conta Cloudflare e salvar os segredos diretamente lá.
2. Em **Settings → Secrets and variables → Actions → Variables**, definir `CMS_AUTH_ORIGIN` com a origem HTTPS real do Worker. Esse endereço é público; não é um segredo. Não colocar Client Secret ou chave de sessão nessa variável.
3. Em **Settings → Pages → Build and deployment**, selecionar **GitHub Actions** como fonte. Só então integrar a mudança de infraestrutura à `main` e acompanhar o workflow **Validar e publicar site**. A publicação utiliza `_site/`, não os arquivos-fonte.
4. Testar o login no domínio canônico, salvar um rascunho, conferir o resultado da validação e publicar um texto de teste aprovado. O login não é habilitado em domínios de prévia ou em localhost.

Sem `CMS_AUTH_ORIGIN`, o site público é gerado normalmente e o painel mostra **Acesso aguardando ativação**. Um valor malformado faz a compilação falhar. Não se deve considerar o login de produção validado antes do teste real com GitHub e Cloudflare.

## Desenvolvimento e validação

Requisitos: Node.js 22 ou superior e pnpm 11.25.0 (fixado no projeto).

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

O site local fica em `http://localhost:8080`. `pnpm check` compila, testa a autenticação e o processamento de posts, verifica os links locais e a preservação dos dashboards. Não utiliza credenciais reais. O workflow valida pull requests sem implantar; só a `main` é publicada. Cada validação disponibiliza um artefato `site-preview` com o site completo.

## Estrutura

- `content/posts/*.md`: posts editáveis e metadados.
- `content/_includes/`: modelos compartilhados de página, artigo e cards.
- `content/artigos.njk`, `content/pessoal.njk`, `content/sitemap.njk`: índices gerados.
- `admin/`: painel, configuração pública e guia de publicação.
- `auth/`: serviço OAuth independente; nunca é incluído no site estático.
- `index.html`, `projetos/`, `tecnologias/`, `publicacoes/`, `videos/`, CSS e imagens: páginas e recursos existentes.
- `_site/`: saída gerada, ignorada pelo Git.

O estudo de caso de xadrez foi migrado para Markdown e mantém a URL `/artigos/integracao-apis-xadrez.html`, sem inventar uma data de publicação. Não foram criados artigos fictícios para preencher a agenda editorial.

O conteúdo aceita Markdown, não executa HTML nem instruções de template inseridas no texto. A validação impede slugs duplicados, caminhos fora da pasta de artigos, metadados de template e links de apoio inseguros. A imagem de capa exige descrição alternativa. Uploads aceitam PNG, JPEG, GIF e WebP de até 5 MB, com assinatura do formato verificada; HTML e SVG não são publicados. O login usa ID estável da conta autorizada; veja no guia de autenticação as permissões do token e como revogá-lo.

Referências: [Eleventy](https://www.11ty.dev/docs/), [Decap: revisão e publicação](https://decapcms.org/docs/editorial-workflows/), [GitHub Pages com Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
