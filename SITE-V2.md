# Site pessoal, versão 2

Esta branch acrescenta páginas de Tecnologias, Artigos, Vídeos, Publicações e Além dos dados. Os três dashboards existentes continuam nas mesmas URLs, e o CSS original é preservado. A nova folha `site-v2.css` contém apenas os estilos das seções acrescentadas.

## Publicação de conteúdo

- **Tecnologias:** atualize `tecnologias/index.html` com links de projetos e exemplos concretos. Não atribua trabalhos não realizados.
- **Artigos:** publique textos originais em `artigos/`. Para uma nova publicação, crie um arquivo HTML próprio e adicione um link em `artigos/index.html`.
- **Vídeos:** quando tiver vídeos públicos no YouTube, adicione cartões em `videos/index.html`, usando a URL oficial de incorporação do YouTube.
- **LinkedIn:** use `publicacoes/index.html` para posts específicos publicados e links públicos. Um feed automático exige integração adicional e não está implementado.
- **Além dos dados:** adicione artigos e links sobre teologia, xadrez e leituras em `alem-dos-dados/index.html`.

## Validação antes de integrar na main

1. Conferir todos os novos links de navegação em desktop e no celular.
2. Abrir as páginas dos três dashboards e verificar os embeds.
3. Conferir o conteúdo e substituir os textos de "em preparação" quando houver material real.
4. Fazer merge da PR apenas depois de aprovar a versão.
