/** Public editor configuration. Credentials belong only in the OAuth service. */
export function createCmsConfig(authOrigin) {
  const origin = new URL(authOrigin);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("O serviço de acesso precisa de uma origem HTTPS válida.");
  }

  return {
    load_config_file: false,
    locale: "pt",
    backend: {
      name: "github",
      repo: "cicpmatos/cicpmatos.github.io",
      branch: "main",
      base_url: origin.origin,
      auth_endpoint: "auth",
      auth_scope: "public_repo",
      site_domain: "caiomatos.com.br",
      squash_merges: true,
    },
    publish_mode: "editorial_workflow",
    media_folder: "assets/uploads",
    public_folder: "/assets/uploads",
    site_url: "https://caiomatos.com.br",
    display_url: "https://caiomatos.com.br",
    show_preview_links: false,
    slug: { encoding: "ascii", clean_accents: true, sanitize_replacement: "-" },
    collections: [
      {
        name: "posts",
        label: "Artigos e histórias",
        label_singular: "Post",
        description: "Textos técnicos e pessoais. Salve como rascunho, revise e publique quando estiver pronto. Rascunhos no GitHub são públicos.",
        folder: "content/posts",
        create: true,
        delete: false,
        extension: "md",
        format: "frontmatter",
        slug: "{{fields.slug}}",
        summary: "{{title}} · {{category}}",
        sortable_fields: ["title", "date", "category"],
        view_groups: [
          { label: "Tema", field: "category" },
        ],
        fields: [
          { label: "Título", name: "title", widget: "string", hint: "Uma frase clara que diga o que o leitor vai encontrar." },
          { label: "Resumo", name: "description", widget: "text", hint: "Uma ou duas frases para a lista de artigos e os resultados de busca." },
          {
            label: "Endereço do post",
            name: "slug",
            widget: "string",
            pattern: ["^(?!index$)[a-z0-9]+(?:-[a-z0-9]+)*$", "Use letras minúsculas sem acento, números e hífens. O nome index é reservado."],
            hint: "Exemplo: python-ambientes-virtuais. Deve ser único. Depois de publicar, mantenha este endereço para preservar os links compartilhados.",
          },
          {
            label: "Tema",
            name: "category",
            widget: "select",
            options: ["Python", "PostgreSQL", "Power BI", "Engenharia de Dados", "Pessoal"],
          },
          {
            label: "Data do post",
            name: "date",
            widget: "datetime",
            format: "YYYY-MM-DD",
            date_format: "YYYY-MM-DD",
            time_format: false,
            default: "{{now}}",
            required: false,
            hint: "Data exibida no artigo. Não agenda a publicação automática. Posts antigos sem data podem manter este campo vazio.",
          },
          {
            label: "Imagem de capa",
            name: "image",
            widget: "image",
            required: false,
            choose_url: false,
            media_library: { config: { max_file_size: 5242880 } },
            hint: "Opcional. Use JPEG, PNG, WebP ou GIF, com até 5 MB. Envie apenas imagens que você pode publicar. Outros formatos não passam na verificação do site.",
          },
          {
            label: "Descrição da imagem",
            name: "image_alt",
            widget: "string",
            required: false,
            hint: "Descreva a informação visual para quem usa leitor de tela. Preencha quando incluir uma capa.",
          },
          {
            label: "Repositório do exemplo",
            name: "repository",
            widget: "string",
            required: false,
            pattern: ["^https://github\\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[^\\s]*)?$", "Cole o endereço completo de um repositório no GitHub, começando com https://github.com/."],
            hint: "Opcional. O link aparecerá junto ao artigo.",
          },
          {
            label: "Links de apoio",
            label_singular: "Link",
            name: "links",
            widget: "list",
            required: false,
            default: [],
            collapsed: true,
            summary: "{{fields.label}}",
            fields: [
              { label: "Nome do link", name: "label", widget: "string" },
              { label: "Endereço", name: "url", widget: "string", pattern: ["^https://[^\\s]+$", "Use um endereço completo começando com https://."] },
            ],
          },
          {
            label: "Texto",
            name: "body",
            widget: "markdown",
            hint: "Use subtítulos, listas, imagens e blocos de código. Comece direto pelo texto: o título já aparece no topo do artigo. HTML incorporado não é executado no site.",
          },
        ],
      },
    ],
  };
}
