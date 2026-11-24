// Displays progress only. It never authorizes a user or reads/stores OAuth tokens.
const messages = {
  authorization_cancelled: 'A autorização no GitHub foi cancelada. Você pode tentar novamente.',
  oauth_code_missing: 'O GitHub não retornou a autorização. Inicie uma nova tentativa.',
  oauth_client_credentials: 'A chave do aplicativo precisa ser corrigida no serviço de login.',
  oauth_redirect_mismatch: 'O endereço de retorno precisa ser corrigido no aplicativo do GitHub.',
  oauth_code_invalid: 'A autorização expirou ou já foi usada. Inicie uma nova tentativa.',
  oauth_email_unverified: 'Confirme seu endereço de e-mail no GitHub e tente novamente.',
  oauth_exchange_failed: 'Não foi possível concluir a autorização com o GitHub. Tente novamente.',
  oauth_exchange_unreachable: 'O serviço não conseguiu se conectar ao GitHub. Tente novamente.',
  oauth_exchange_denied: 'O GitHub recusou a conexão do serviço de acesso. A configuração precisa ser verificada.',
  oauth_redirect_rejected: 'O serviço recusou um redirecionamento inesperado durante o login.',
  oauth_response_format: 'O serviço recebeu uma resposta inesperada do GitHub. Tente novamente.',
  oauth_token_invalid: 'O GitHub retornou uma autorização incompatível com o painel.',
  oauth_scope: 'Revogue a autorização antiga deste aplicativo em GitHub → Settings → Applications e entre novamente.',
  github_identity_failed: 'Não foi possível confirmar sua conta no GitHub. Tente novamente.',
  github_account_denied: 'Entre com a conta cicpmatos, que é a conta autorizada deste painel.',
};

export function readLoginError(event, authOrigin) {
  const prefix = 'authorization:github:error:';
  if (event.origin !== authOrigin || typeof event.data !== 'string' || !event.data.startsWith(prefix) || event.data.length > 4096) return null;
  try {
    const payload = JSON.parse(event.data.slice(prefix.length));
    const code = payload?.code;
    return Object.hasOwn(messages, code) ? `${messages[code]} Código: ${code}.` : 'O GitHub não concluiu a autorização. Inicie uma nova tentativa pelo painel.';
  } catch { return null; }
}

export function installLoginFeedback(authOrigin) {
  const root = document.querySelector('#nc-root');
  const notice = document.querySelector('#login-feedback');
  const message = document.querySelector('#login-feedback-message');
  let timer;
  let attempt = false;
  let detailedError = false;
  const clear = () => { clearTimeout(timer); notice.hidden = true; };
  const show = (text, state) => {
    message.textContent = text;
    notice.dataset.state = state;
    notice.hidden = false;
  };
  const loginButton = () => [...root.querySelectorAll('button')].find(button => /(?:Entrar|Login|Log in|Sign in).*GitHub/i.test(button.textContent));
  document.querySelector('#login-feedback-dismiss').addEventListener('click', clear);
  root.addEventListener('click', event => {
    if (event.target.closest('button') !== loginButton()) return;
    clearTimeout(timer);
    attempt = true;
    detailedError = false;
    show('Conclua a entrada na janela do GitHub. O editor abrirá depois da confirmação.', 'pending');
    timer = setTimeout(() => {
      if (attempt && !detailedError) show('A entrada ainda não terminou. Confira a janela do GitHub e permita janelas de login neste navegador. Código: login_not_completed.', 'error');
    }, 45000);
  }, true);
  window.addEventListener('message', event => {
    if (!attempt) return;
    const error = readLoginError(event, authOrigin);
    if (error) {
      clearTimeout(timer);
      detailedError = true;
      show(error, 'error');
    }
  });
  new MutationObserver(() => {
    if (!attempt) return;
    if (root.querySelector('.Toastify__toast--error') && !detailedError) {
      clearTimeout(timer);
      show('O editor não conseguiu confirmar o acesso ao GitHub ou ao repositório. O aviso ficará aqui até você fechá-lo. Código: editor_access_failed.', 'error');
      detailedError = true;
    }
    if (!loginButton() && root.querySelector('a[href*="/collections/posts"]')) {
      attempt = false;
      clear();
    }
  }).observe(root, {childList:true, subtree:true, characterData:true});
}
