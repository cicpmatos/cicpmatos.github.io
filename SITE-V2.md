# Site pessoal, versão 2 — registro histórico

> A versão 2 já está na `main`. A atualização para posts e vídeos Markdown, editor e autenticação está documentada no [README.md](README.md). As instruções manuais abaixo descrevem a estrutura anterior e não devem ser usadas para criar novos posts ou vídeos após essa atualização.

O objetivo desta versão é ampliar o portfólio para um site pessoal vivo, sem substituir os três dashboards nem alterar os respectivos links.

## Estrutura

- `index.html`: home existente, com seção "Além dos dashboards" e navegação para as novas áreas
- `tecnologias/index.html`: tecnologias organizadas por aplicação, com projetos publicados
- `artigos/index.html`: índice dos artigos
- `artigos/integracao-apis-xadrez.html`: primeiro estudo de caso, baseado no projeto de xadrez e na consulta M de países
- `videos/index.html`: seção preparada para vídeos autorais; nenhum vídeo foi inventado
- `publicacoes/index.html`: perfil do LinkedIn e espaço para publicações selecionadas; não há sincronização automática
- `alem-dos-dados/index.html`: teologia, xadrez e leituras
- `site-v2.css`: estilo complementar, sem alterar `style.css`
- `script.js`: menu mobile acessível com teclado
- `sitemap.xml` e `robots.txt`: suporte básico à descoberta por buscadores

## Como atualizar sem refazer o site

### Novo artigo

1. Crie um arquivo HTML em `artigos/` com estrutura semelhante a `integracao-apis-xadrez.html`.
2. Use `../style.css` e `../site-v2.css`.
3. Adicione um card com link para o novo artigo em `artigos/index.html`.
4. Se quiser destaque na home, atualize o card de artigos em `index.html`.
5. Acrescente a nova URL em `sitemap.xml`.

### Novo vídeo

1. Publique o vídeo no seu canal do YouTube.
2. Crie um card na página `videos/index.html`.
3. Utilize a URL de incorporação do próprio YouTube e explique o problema e a solução.
4. Não é necessário hospedar o vídeo no GitHub.

### Nova publicação do LinkedIn

1. Obtenha a URL pública da publicação.
2. Adicione um card em `publicacoes/index.html` com resumo e link; se desejar, incorpore o post usando o recurso oficial.
3. O feed automático não está implementado e pode exigir permissões específicas.

### Novo projeto ou tecnologia

Adicione a página do projeto na pasta `projetos/`, inclua um card na home e associe a tecnologia correspondente em `tecnologias/index.html`.

## Cuidados

Não publique informações internas ou sensíveis dos projetos. Os dashboards já utilizam a modalidade pública de incorporação do Power BI. Confirme sempre a autorização de publicação antes de divulgar novos relatórios.

## Validações realizadas

- Leitura da estrutura do repositório e dos três projetos existentes.
- Inspeção de 113 referências relativas nos HTMLs novos e na home, sem links locais não resolvidos.
- Confirmação de que os três HTMLs dos dashboards preservam iframes com links do Power BI.
- Ainda é necessária inspeção visual manual em navegador desktop e mobile antes de integrar a branch principal.

## Publicação

A versão 2 foi integrada à `main`. Consulte o README para o fluxo atual de publicação.
