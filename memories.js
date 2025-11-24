/*
  Módulo para gerenciar o painel de memórias compartilhadas.

  Esta implementação insere dinamicamente no painel fornecido um conjunto
  de seções (login, publicação, filtros e listagem) e conecta as ações
  do usuário aos endpoints do backend (autenticação e CRUD de memórias).
  O objetivo é integrar a funcionalidade de memórias ao roteiro como
  uma aba adicional, reutilizando os estilos existentes e mantendo
  consistência visual.

  A função global `setupMemoriesPanel(container)` deve ser chamada pelo
  script principal assim que o painel de memórias for criado. Ela
  constrói toda a interface dentro do contêiner e inicializa a lógica
  necessária para login, upload, busca e exibição das memórias.
*/

(function () {
  /**
   * Monta toda a interface de memórias dentro do contêiner fornecido.
   * A UI inclui:
   *  • Seção de login com formulário simples (usuário e senha).
   *  • Botão de logout exibido após autenticação.
   *  • Seção de publicação de memória (título, texto, data, tags, local,
   *    status e upload de mídia) com barra de progresso.
   *  • Seção de filtros de busca (texto, status, intervalo de datas).
   *  • Lista de memórias renderizada em grid responsivo.
   *
   * @param {HTMLElement} container Contêiner do painel de memórias
   */
  function setupMemoriesPanel(container) {
    if (!container) return;
    // Limpa conteúdo existente
    container.innerHTML = '';

    // Título principal do painel
    const heading = document.createElement('h2');
    heading.textContent = 'Memórias Compartilhadas';
    heading.style.marginBottom = '16px';
    container.appendChild(heading);

    // Botão de logout (inicialmente oculto)
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'mem-logout-btn';
    logoutBtn.textContent = 'Sair';
    logoutBtn.className = 'logout-btn';
    logoutBtn.style.marginBottom = '16px';
    logoutBtn.style.display = 'none';
    container.appendChild(logoutBtn);

    // Login section
    const loginSection = document.createElement('section');
    loginSection.id = 'mem-login-section';
    loginSection.className = 'card';
    const loginHeading = document.createElement('h3');
    loginHeading.textContent = 'Entrar';
    const loginDesc = document.createElement('p');
    loginDesc.textContent = 'Faça login para publicar e visualizar suas memórias.';
    const loginForm = document.createElement('form');
    loginForm.id = 'mem-login-form';
    loginForm.style.display = 'flex';
    loginForm.style.flexDirection = 'column';
    loginForm.style.gap = '12px';
    // Usuário
    const userLabel = document.createElement('label');
    userLabel.textContent = 'Usuário';
    const userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.name = 'username';
    userInput.required = true;
    userLabel.appendChild(userInput);
    // Senha
    const passLabel = document.createElement('label');
    passLabel.textContent = 'Senha';
    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.name = 'password';
    passInput.required = true;
    passLabel.appendChild(passInput);
    // Submit
    const loginSubmit = document.createElement('button');
    loginSubmit.type = 'submit';
    loginSubmit.textContent = 'Entrar';
    loginSubmit.style.alignSelf = 'flex-start';
    // Error message
    const loginError = document.createElement('div');
    loginError.id = 'mem-login-error';
    loginError.style.color = '#e85d75';
    loginError.style.marginTop = '8px';
    // Assemble form
    loginForm.appendChild(userLabel);
    loginForm.appendChild(passLabel);
    loginForm.appendChild(loginSubmit);
    loginSection.appendChild(loginHeading);
    loginSection.appendChild(loginDesc);
    loginSection.appendChild(loginForm);
    loginSection.appendChild(loginError);
    container.appendChild(loginSection);

    // Publish section (hidden until authenticated)
    const publishSection = document.createElement('section');
    publishSection.id = 'mem-publish-section';
    publishSection.className = 'card';
    publishSection.style.display = 'none';
    const publishHeading = document.createElement('h3');
    publishHeading.textContent = 'Publicar memória';
    const publishForm = document.createElement('form');
    publishForm.id = 'mem-publish-form';
    publishForm.enctype = 'multipart/form-data';
    publishForm.style.display = 'flex';
    publishForm.style.flexDirection = 'column';
    publishForm.style.gap = '12px';
    // Título
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Título';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.name = 'title';
    titleInput.required = true;
    titleLabel.appendChild(titleInput);
    // Descrição
    const textLabel = document.createElement('label');
    textLabel.textContent = 'Nota / Descrição';
    const textArea = document.createElement('textarea');
    textArea.name = 'text';
    textArea.rows = 3;
    textLabel.appendChild(textArea);
    // Data
    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Data';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.name = 'date';
    dateLabel.appendChild(dateInput);
    // Tags
    const tagsLabel = document.createElement('label');
    tagsLabel.textContent = 'Tags (separadas por vírgulas)';
    const tagsInput = document.createElement('input');
    tagsInput.type = 'text';
    tagsInput.name = 'tags';
    tagsInput.placeholder = 'viagem, família, férias';
    tagsLabel.appendChild(tagsInput);
    // Local
    const locLabel = document.createElement('label');
    locLabel.textContent = 'Local';
    const locInput = document.createElement('input');
    locInput.type = 'text';
    locInput.name = 'location';
    locLabel.appendChild(locInput);
    // Status
    const statusLabel = document.createElement('label');
    statusLabel.textContent = 'Status';
    const statusSelect = document.createElement('select');
    statusSelect.name = 'status';
    const optDraft = document.createElement('option');
    optDraft.value = 'draft';
    optDraft.textContent = 'Rascunho';
    const optPrivate = document.createElement('option');
    optPrivate.value = 'private';
    optPrivate.textContent = 'Privado';
    const optPublic = document.createElement('option');
    optPublic.value = 'public';
    optPublic.textContent = 'Público';
    statusSelect.appendChild(optDraft);
    statusSelect.appendChild(optPrivate);
    statusSelect.appendChild(optPublic);
    statusLabel.appendChild(statusSelect);
    // Media
    const mediaLabel = document.createElement('label');
    mediaLabel.textContent = 'Mídia (imagens ou vídeos) – até 10 MB cada';
    const mediaInput = document.createElement('input');
    mediaInput.type = 'file';
    mediaInput.name = 'media';
    mediaInput.multiple = true;
    mediaLabel.appendChild(mediaInput);

    // Dia (vinculação ao itinerário)
    // Permite selecionar o dia do roteiro ao qual esta memória pertence. Se
    // nenhuma opção for escolhida, a memória será tratada como "Capa" (sem dia
    // específico). As opções são derivadas de window.itineraryData definida no
    // script principal. Caso não exista, não adicionamos seleção de dia.
    let dayLabel;
    let daySelect;
    if (typeof window !== 'undefined' && Array.isArray(window.itineraryData) && window.itineraryData.length > 0) {
      dayLabel = document.createElement('label');
      dayLabel.textContent = 'Dia';
      daySelect = document.createElement('select');
      daySelect.name = 'day';
      // Opção para capa (sem dia)
      const optNone = document.createElement('option');
      optNone.value = '';
      optNone.textContent = 'Capa (sem dia)';
      daySelect.appendChild(optNone);
      window.itineraryData.forEach((d) => {
        const option = document.createElement('option');
        option.value = d.id;
        option.textContent = `Dia ${d.id}`;
        daySelect.appendChild(option);
      });
      dayLabel.appendChild(daySelect);
    }
    // Progress bar
    const progress = document.createElement('progress');
    progress.id = 'mem-upload-progress';
    progress.max = 100;
    progress.value = 0;
    progress.style.display = 'none';
    progress.style.width = '100%';
    progress.style.height = '8px';
    // Submit
    const publishSubmit = document.createElement('button');
    publishSubmit.type = 'submit';
    publishSubmit.textContent = 'Salvar memória';
    publishSubmit.style.alignSelf = 'flex-start';
    // Feedback areas
    const publishError = document.createElement('div');
    publishError.id = 'mem-publish-error';
    publishError.style.color = '#e85d75';
    const publishSuccess = document.createElement('div');
    publishSuccess.id = 'mem-publish-success';
    publishSuccess.style.color = '#2a9d8f';
    // Assemble publish form
    publishForm.appendChild(titleLabel);
    publishForm.appendChild(textLabel);
    publishForm.appendChild(dateLabel);
    publishForm.appendChild(tagsLabel);
    publishForm.appendChild(locLabel);
    publishForm.appendChild(statusLabel);
    // Insere a seleção de dia logo após o status, se existir
    if (dayLabel) {
      publishForm.appendChild(dayLabel);
    }
    publishForm.appendChild(mediaLabel);
    publishForm.appendChild(progress);
    publishForm.appendChild(publishSubmit);
    publishForm.appendChild(publishError);
    publishForm.appendChild(publishSuccess);
    publishSection.appendChild(publishHeading);
    publishSection.appendChild(publishForm);
    container.appendChild(publishSection);

    // Filter section (hidden until authenticated)
    const filterSection = document.createElement('section');
    filterSection.id = 'mem-filter-section';
    filterSection.className = 'card';
    filterSection.style.display = 'none';
    const filterHeading = document.createElement('h3');
    filterHeading.textContent = 'Pesquisar e filtrar';
    const filtersWrapper = document.createElement('div');
    filtersWrapper.style.display = 'flex';
    filtersWrapper.style.flexWrap = 'wrap';
    filtersWrapper.style.gap = '12px';
    filtersWrapper.style.alignItems = 'flex-end';
    // Search text
    const searchWrap = document.createElement('div');
    searchWrap.style.display = 'flex';
    searchWrap.style.flexDirection = 'column';
    const searchLabel = document.createElement('label');
    searchLabel.setAttribute('for', 'mem-search-input');
    searchLabel.textContent = 'Busca';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'mem-search-input';
    searchInput.placeholder = 'Palavras chave';
    searchWrap.appendChild(searchLabel);
    searchWrap.appendChild(searchInput);
    // Status filter
    const statusWrap = document.createElement('div');
    statusWrap.style.display = 'flex';
    statusWrap.style.flexDirection = 'column';
    const statusLabelF = document.createElement('label');
    statusLabelF.setAttribute('for', 'mem-status-filter');
    statusLabelF.textContent = 'Status';
    const statusSelectF = document.createElement('select');
    statusSelectF.id = 'mem-status-filter';
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'Todos';
    const optFDraft = document.createElement('option');
    optFDraft.value = 'draft';
    optFDraft.textContent = 'Rascunho';
    const optFPrivate = document.createElement('option');
    optFPrivate.value = 'private';
    optFPrivate.textContent = 'Privado';
    const optFPublic = document.createElement('option');
    optFPublic.value = 'public';
    optFPublic.textContent = 'Público';
    statusSelectF.appendChild(optAll);
    statusSelectF.appendChild(optFDraft);
    statusSelectF.appendChild(optFPrivate);
    statusSelectF.appendChild(optFPublic);
    statusLabelF.appendChild(statusSelectF);
    statusWrap.appendChild(statusLabelF);
    // From date
    const fromWrap = document.createElement('div');
    fromWrap.style.display = 'flex';
    fromWrap.style.flexDirection = 'column';
    const fromLabel = document.createElement('label');
    fromLabel.setAttribute('for', 'mem-from-date');
    fromLabel.textContent = 'De';
    const fromInput = document.createElement('input');
    fromInput.type = 'date';
    fromInput.id = 'mem-from-date';
    fromLabel.appendChild(fromInput);
    fromWrap.appendChild(fromLabel);
    // To date
    const toWrap = document.createElement('div');
    toWrap.style.display = 'flex';
    toWrap.style.flexDirection = 'column';
    const toLabel = document.createElement('label');
    toLabel.setAttribute('for', 'mem-to-date');
    toLabel.textContent = 'Até';
    const toInput = document.createElement('input');
    toInput.type = 'date';
    toInput.id = 'mem-to-date';
    toLabel.appendChild(toInput);
    toWrap.appendChild(toLabel);
    // Search button
    const searchBtn = document.createElement('button');
    searchBtn.id = 'mem-search-button';
    searchBtn.textContent = 'Filtrar';
    searchBtn.style.height = '36px';
    // Assemble filters wrapper
    filtersWrapper.appendChild(searchWrap);
    filtersWrapper.appendChild(statusWrap);
    filtersWrapper.appendChild(fromWrap);
    filtersWrapper.appendChild(toWrap);
    filtersWrapper.appendChild(searchBtn);
    filterSection.appendChild(filterHeading);
    filterSection.appendChild(filtersWrapper);
    container.appendChild(filterSection);

    // Memories list (hidden until authenticated)
    const listSection = document.createElement('section');
    listSection.id = 'mem-memories-list';
    listSection.style.display = 'none';
    // Use grid layout similar to other cards
    listSection.className = 'grid';
    listSection.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
    listSection.style.gap = '16px';
    container.appendChild(listSection);

    // Helper functions
    /**
     * Exibe a UI de login e oculta outras seções.
     */
    function showLogin() {
      loginSection.style.display = '';
      publishSection.style.display = 'none';
      filterSection.style.display = 'none';
      listSection.style.display = 'none';
      logoutBtn.style.display = 'none';
      loginError.textContent = '';
      publishError.textContent = '';
      publishSuccess.textContent = '';

      // Oculta seções de memórias externas (por dia e capa) ao sair
      if (typeof window !== 'undefined') {
        if (typeof window.renderDayMemories === 'function' && Array.isArray(window.itineraryData)) {
          window.itineraryData.forEach((day) => {
            window.renderDayMemories(day.id, null);
          });
        }
        if (typeof window.renderCoverMemories === 'function') {
          window.renderCoverMemories(null);
        }
      }
    }

    /**
     * Exibe a UI da aplicação após autenticação. Também carrega as
     * memórias existentes com filtros padrão.
     */
    function showApp() {
      loginSection.style.display = 'none';
      publishSection.style.display = '';
      filterSection.style.display = '';
      listSection.style.display = '';
      logoutBtn.style.display = '';
      loginError.textContent = '';
      publishError.textContent = '';
      publishSuccess.textContent = '';
      loadMemories();
      // Após exibir a interface principal, atualizamos também os painéis de
      // itinerário (caso existam) para refletir memórias por dia. Esta
      // função é definida no script principal (script.js). Verificamos
      // sua existência antes de invocar.
      if (typeof window !== 'undefined' && typeof window.refreshAllDayMemories === 'function') {
        window.refreshAllDayMemories();
      }
      // Atualiza a capa com memórias sem dia
      if (typeof window !== 'undefined' && typeof window.loadCoverMemories === 'function') {
        window.loadCoverMemories();
      }
    }

    /**
     * Faz requisição para verificar usuário logado e exibe a UI
     * apropriada.
     */
    async function checkAuth() {
      try {
        const res = await fetch('/auth/me', { credentials: 'include' });
        const data = await res.json();
        if (data && data.user) {
          showApp();
        } else {
          showLogin();
        }
      } catch (_err) {
        showLogin();
      }
    }

    /**
     * Renderiza a lista de memórias. Cada memória é exibida como um cartão
     * com título, descrição resumida, data, tags, local e mídia (se houver).
     *
     * @param {Array} memories Lista de memórias retornada pelo backend
     */
    function renderMemories(memories) {
      listSection.innerHTML = '';
      if (!memories || memories.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'subtitle';
        emptyMsg.textContent = 'Nenhuma memória encontrada.';
        listSection.appendChild(emptyMsg);
        return;
      }
      memories.forEach((mem) => {
        const card = document.createElement('div');
        card.className = 'card memory-card';
        // Título
        const h3 = document.createElement('h3');
        h3.textContent = mem.title || '(Sem título)';
        card.appendChild(h3);
        // Data e status
        const meta = document.createElement('div');
        meta.className = 'memory-meta';
        const date = new Date(mem.date || mem.createdAt || Date.now());
        const dateStr = date.toLocaleDateString('pt-BR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
        meta.textContent = `${dateStr} • ${mem.status || 'rascunho'}`;
        meta.style.fontSize = '0.85rem';
        meta.style.color = '#555';
        card.appendChild(meta);
        // Texto/descrição (limitado)
        if (mem.text) {
          const p = document.createElement('p');
          const maxLen = 160;
          const text = String(mem.text);
          p.textContent = text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
          card.appendChild(p);
        }
        // Tags
        if (mem.tags && mem.tags.length > 0) {
          const tagsDiv = document.createElement('div');
          tagsDiv.style.marginTop = '8px';
          mem.tags.forEach((t) => {
            const span = document.createElement('span');
            span.className = 'tag';
            span.textContent = t;
            tagsDiv.appendChild(span);
          });
          card.appendChild(tagsDiv);
        }
        // Local
        if (mem.location) {
          const locDiv = document.createElement('div');
          locDiv.style.marginTop = '4px';
          locDiv.style.fontSize = '0.85rem';
          locDiv.style.color = '#555';
          locDiv.textContent = `Local: ${mem.location}`;
          card.appendChild(locDiv);
        }
        // Mídia
        if (mem.media && mem.media.length > 0) {
          const mediaContainer = document.createElement('div');
          mediaContainer.style.display = 'flex';
          mediaContainer.style.flexWrap = 'wrap';
          mediaContainer.style.gap = '8px';
          mediaContainer.style.marginTop = '8px';
          mem.media.forEach((url) => {
            const ext = String(url).split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
              const img = document.createElement('img');
              img.src = url;
              img.alt = 'Mídia da memória';
              img.style.maxWidth = '100%';
              img.style.height = 'auto';
              img.style.borderRadius = '4px';
              mediaContainer.appendChild(img);
            } else if (['mp4', 'mov', 'mkv', 'avi'].includes(ext)) {
              const vid = document.createElement('video');
              vid.src = url;
              vid.controls = true;
              vid.style.maxWidth = '100%';
              vid.style.maxHeight = '200px';
              mediaContainer.appendChild(vid);
            }
          });
          card.appendChild(mediaContainer);
        }
        listSection.appendChild(card);
      });
    }

    /**
     * Carrega as memórias com base nos filtros de busca. O backend
     * retornará apenas as memórias do usuário autenticado.
     */
    async function loadMemories() {
      const params = new URLSearchParams();
      const q = searchInput.value.trim();
      const statusVal = statusSelectF.value;
      const fromVal = fromInput.value;
      const toVal = toInput.value;
      if (q) params.set('q', q);
      if (statusVal) params.set('status', statusVal);
      if (fromVal) params.set('from', fromVal);
      if (toVal) params.set('to', toVal);
      try {
        const res = await fetch('/memories?' + params.toString(), {
          credentials: 'include',
        });
        if (res.status === 401) {
          // Se perdeu a sessão, volta ao login
          showLogin();
          return;
        }
        const data = await res.json();
        renderMemories(data);
      } catch (err) {
        // Em caso de erro, mostra mensagem simples
        listSection.innerHTML = '';
        const msg = document.createElement('p');
        msg.className = 'subtitle';
        msg.textContent = 'Erro ao carregar memórias.';
        listSection.appendChild(msg);
      }
    }

    /**
     * Envia uma nova memória ao servidor utilizando XMLHttpRequest para
     * permitir acompanhamento do progresso de upload. Exibe mensagens
     * de sucesso/erro conforme o resultado.
     *
     * @param {FormData} formData Dados do formulário de publicação
     */
    function uploadMemory(formData) {
      publishError.textContent = '';
      publishSuccess.textContent = '';
      progress.style.display = 'block';
      progress.value = 0;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/memories');
      xhr.withCredentials = true;
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          progress.value = percent;
        }
      };
      xhr.onerror = function () {
        progress.style.display = 'none';
        publishError.textContent = 'Erro ao enviar memória.';
      };
      xhr.onload = function () {
        progress.style.display = 'none';
        if (xhr.status === 200 || xhr.status === 201) {
          publishSuccess.textContent = 'Memória salva com sucesso!';
          publishForm.reset();
          // Recarrega memórias para incluir a nova
          loadMemories();
          // Atualiza memórias nos painéis de dias
          if (typeof window !== 'undefined' && typeof window.refreshAllDayMemories === 'function') {
            window.refreshAllDayMemories();
          }
          // Atualiza a capa
          if (typeof window !== 'undefined' && typeof window.loadCoverMemories === 'function') {
            window.loadCoverMemories();
          }
        } else if (xhr.status === 401) {
          // sessão expirada
          showLogin();
        } else {
          try {
            const res = JSON.parse(xhr.responseText);
            publishError.textContent = res.error || 'Falha ao salvar memória.';
          } catch (_e) {
            publishError.textContent = 'Falha ao salvar memória.';
          }
        }
      };
      xhr.send(formData);
    }

    // Event bindings
    loginForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      loginError.textContent = '';
      const username = userInput.value.trim();
      const password = passInput.value.trim();
      if (!username || !password) return;
      try {
        const res = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (res.ok) {
          // Login bem-sucedido
          showApp();
        } else {
          loginError.textContent = data.error || 'Falha no login.';
        }
      } catch (err) {
        loginError.textContent = 'Erro ao conectar.';
      }
    });

    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      } catch (_e) {
        // ignora erros
      }
      showLogin();
    });

    publishForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const formData = new FormData(publishForm);
      uploadMemory(formData);
    });

    searchBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      loadMemories();
    });

    // Inicializa verificando se já existe uma sessão válida
    checkAuth();
  }

  // Exponibiliza a função globalmente
  window.setupMemoriesPanel = setupMemoriesPanel;
})();