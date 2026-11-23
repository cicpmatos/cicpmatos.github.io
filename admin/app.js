import { createCmsConfig } from "./config.js";

const title = document.querySelector("#status-title");
const description = document.querySelector("#status-description");
const button = document.querySelector("#open-editor");
const caption = document.querySelector("#access-caption");
const status = document.querySelector("#access-status");

function showPending() {
  title.textContent = "Acesso aguardando ativação";
  description.textContent = "O editor está preparado. Falta conectar o serviço de login à sua conta GitHub para liberar a entrada.";
  button.textContent = "Login ainda não ativado";
  button.disabled = true;
  caption.textContent = "Enquanto isso, consulte o guia para preparar seu primeiro post.";
  status.dataset.state = "pending";
}

function showError() {
  title.textContent = "Não foi possível abrir o editor";
  description.textContent = "Atualize a página e tente novamente. Se o problema continuar, a configuração do painel precisa ser verificada.";
  button.textContent = "Editor indisponível";
  button.disabled = true;
  status.dataset.state = "error";
}

function loadCms() {
  return new Promise((resolve, reject) => {
    window.CMS_MANUAL_INIT = true;
    const script = document.createElement("script");
    script.src = "/admin/vendor/decap-cms.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Falha ao carregar o editor."));
    document.head.append(script);
  });
}

try {
  const response = await fetch("/admin/runtime-config.json", { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error("Configuração não encontrada.");
  const runtime = await response.json();
  if (runtime.enabled !== true || !runtime.authOrigin) {
    showPending();
  } else {
    const config = createCmsConfig(runtime.authOrigin);
    title.textContent = "Entre com sua conta GitHub";
    description.textContent = "O acesso ao editor está reservado à conta autorizada do site. Sua senha será solicitada somente pelo GitHub, se necessário.";
    status.dataset.state = "ready";
    button.textContent = "Abrir editor";
    button.disabled = false;
    caption.textContent = "Na próxima tela, escolha a entrada com GitHub.";

    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Abrindo editor…";
      try {
        await loadCms();
        if (!window.CMS?.init) throw new Error("Editor não carregado.");
        document.querySelector("#editor-shell").hidden = false;
        window.CMS.registerPreviewStyle("/admin/preview.css");
        window.CMS.init({ config });
        document.querySelector("#conteudo").hidden = true;
        document.querySelector(".studio-header").hidden = true;
        document.body.classList.add("editor-is-open");
      } catch {
        document.querySelector("#editor-shell").hidden = true;
        showError();
      }
    }, { once: true });
  }
} catch {
  showError();
}
