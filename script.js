/*
  Script principal para o roteiro em formato de abas.

  Este módulo reorganiza o conteúdo estático do roteiro em um
  modelo de navegação por abas (tabs). Cada dia do itinerário é
  transformado em um painel (tabpanel) que é carregado somente
  quando o usuário seleciona a respectiva aba. O progresso por
  dia (itens concluídos) é exibido ao lado do rótulo da aba e
  persistido no localStorage. Notas pessoais também são
  armazenadas no localStorage e exibidas em um painel próprio
  chamado "Diário". As melhorias implementadas incluem:

  • Separação do conteúdo em estrutura de dados (extraído a partir
    dos cartões originais). O DOM inicial contém os cartões de
    cada dia; eles são lidos, convertidos em JSON e removidos do
    documento para reduzir o tamanho da página.
  • Navegação por abas com suporte a teclado (setas, Home/End,
    Enter/Espaço) e roles ARIA apropriados (tablist, tab,
    tabpanel). A aba ativa é refletida na URL via parâmetro
    `?dia=N` e persistida entre sessões via localStorage.
  • Carregamento lazy dos painéis: o conteúdo de cada dia só é
    criado e inserido no DOM quando a respectiva aba é ativada.
  • Botões de "Dia anterior" e "Próximo dia" dentro de cada
    painel para navegação sequencial.
  • Persistência de estado de conclusão e notas individuais por
    item, cálculo de progresso e atualização da interface em tempo
    real.
  • Painel "Diário" que reúne todas as notas salvas. Quando não
    houver notas registradas, uma mensagem informativa é exibida.

  Além disso, mantém-se funcionalidades existentes: contagem
  regressiva, alternância de tema, botão voltar ao topo e registro
  do service worker.
*/

document.addEventListener('DOMContentLoaded', () => {
  // Extrai dados dos cartões de dia presentes no HTML e remove-os do DOM.
  const itineraryData = parseItinerary();
  // Obtém a seção do diário antes de removê-la do fluxo.
  const diarySection = document.getElementById('diary');
  if (diarySection) {
    // Remove do DOM para realocação posterior no painel de diário.
    diarySection.remove();
  }

  // Inicializa funcionalidades auxiliares presentes no roteiro original.
  initCountdown();
  initTheme();
  initBackToTop();
  registerServiceWorker();

  // Atualiza o diário inicialmente para refletir notas salvas.
  updateDiary();

  // Constrói as abas de navegação e associa os painéis.
  buildTabs(itineraryData, diarySection);
  // Restaura o último dia visitado a partir da URL ou localStorage.
  restoreLastDay(itineraryData);
});

/**
 * Percorre todos os cartões de dia presentes no documento (classe
 * `.day-card`), extrai seus conteúdos para um objeto de dados e
 * remove o elemento original do DOM. Cada item do itinerário
 * contém título, subtítulo, highlight (caso exista) e uma lista
 * de atividades com horário, descrição e detalhes de transporte.
 *
 * @returns {Array<Object>} lista de objetos com dados dos dias
 */
function parseItinerary() {
  const cards = document.querySelectorAll('.day-card');
  const data = [];
  cards.forEach((card) => {
    const dayId = parseInt(card.dataset.day, 10);
    const titleEl = card.querySelector('.day-title');
    const subEl = card.querySelector('.day-sub');
    const highlightEl = card.querySelector('.highlight');
    const scheduleItems = card.querySelectorAll('.schedule > li');
    const schedule = Array.from(scheduleItems).map((li) => {
      const timeEl = li.querySelector('.time');
      const time = timeEl ? timeEl.textContent.trim() : '';
      const transportEl = li.querySelector('.transport');
      const transport = transportEl ? transportEl.innerHTML.trim() : null;
      // Clona o elemento <li> para extrair o HTML da descrição sem
      // modificar o original. Remove horário e transporte antes de
      // capturar o conteúdo restante.
      const clone = li.cloneNode(true);
      const timeClone = clone.querySelector('.time');
      if (timeClone) timeClone.remove();
      const transportClone = clone.querySelector('.transport');
      if (transportClone) transportClone.remove();
      const descriptionHtml = clone.innerHTML.trim();
      return {
        time,
        html: descriptionHtml,
        transport,
      };
    });
    data.push({
      id: dayId,
      title: titleEl ? titleEl.innerHTML.trim() : '',
      subtitle: subEl ? subEl.innerHTML.trim() : '',
      highlight: highlightEl ? highlightEl.innerHTML.trim() : null,
      schedule,
    });
    // Remove o cartão do DOM para reduzir peso da página.
    card.remove();
  });
  return data;
}

/**
 * Cria a barra de abas e associa o comportamento de cada guia ao
 * painel correspondente. O diário é tratado como uma aba adicional
 * caso exista no documento. A função também adiciona suporte de
 * navegação via teclado conforme as diretrizes de acessibilidade.
 *
 * @param {Array<Object>} itineraryData Lista de objetos de dias
 * @param {HTMLElement|null} diarySection Elemento do diário
 */
function buildTabs(itineraryData, diarySection) {
  const tabList = document.getElementById('tab-list');
  const panelsContainer = document.getElementById('tab-panels');
  if (!tabList || !panelsContainer) return;
  // Limpa qualquer conteúdo residual.
  tabList.innerHTML = '';
  panelsContainer.innerHTML = '';
  // Armazena referências globais para uso posterior.
  window.itineraryData = itineraryData;
  window.diarySection = diarySection;
  window.tabPanels = {};
  // Cria abas para cada dia.
  itineraryData.forEach((day) => {
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('id', 'tab-' + day.id);
    btn.setAttribute('aria-controls', 'panel-' + day.id);
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('aria-selected', 'false');
    // Rótulo base (progresso atualizado posteriormente).
    btn.textContent = `Dia ${day.id}`;
    btn.addEventListener('click', () => openTab(day.id.toString()));
    tabList.appendChild(btn);
    // Calcula progresso inicial antes da criação do painel.
    updateDayProgress(day.id);
  });
  // Cria a aba de diário se houver seção de diário.
  if (diarySection) {
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('id', 'tab-diary');
    btn.setAttribute('aria-controls', 'panel-diary');
    btn.setAttribute('tabindex', '-1');
    btn.setAttribute('aria-selected', 'false');
    btn.textContent = 'Diário';
    btn.addEventListener('click', () => openTab('diary'));
    tabList.appendChild(btn);
  }

  // Cria a aba de memórias compartilhadas. Esta aba permite
  // acessar o painel onde o casal pode fazer login, publicar e
  // visualizar memórias compartilhadas. A lógica e a interface deste
  // painel são definidas em memories.js e serão inicializadas ao
  // abrir o painel.
  const memBtn = document.createElement('button');
  memBtn.className = 'nav-item';
  memBtn.setAttribute('role', 'tab');
  memBtn.setAttribute('id', 'tab-memories');
  memBtn.setAttribute('aria-controls', 'panel-memories');
  memBtn.setAttribute('tabindex', '-1');
  memBtn.setAttribute('aria-selected', 'false');
  memBtn.textContent = 'Memórias';
  memBtn.addEventListener('click', () => openTab('memories'));
  tabList.appendChild(memBtn);
  // Suporte à navegação por teclado na lista de abas.
  tabList.addEventListener('keydown', handleTabKeyNav);
}

/**
 * Manipula teclas de navegação dentro da lista de abas. Permite
 * alternar entre abas usando setas esquerda/direita, ir para
 * primeira/última aba com Home/End e ativar a aba focada com
 * Enter/Espaço. A função mantém o foco no elemento de aba e
 * atualiza o painel correspondente.
 *
 * @param {KeyboardEvent} e Evento de tecla
 */
function handleTabKeyNav(e) {
  const tabs = Array.from(document.querySelectorAll('#tab-list [role="tab"]'));
  if (!tabs.length) return;
  const currentIndex = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
  let newIndex = currentIndex;
  switch (e.key) {
    case 'ArrowRight':
    case 'Right':
      newIndex = (currentIndex + 1) % tabs.length;
      break;
    case 'ArrowLeft':
    case 'Left':
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      break;
    case 'Home':
      newIndex = 0;
      break;
    case 'End':
      newIndex = tabs.length - 1;
      break;
    case 'Enter':
    case ' ': // Espaço
    case 'Spacebar':
      // Ativa a aba atualmente focada sem mudar o foco.
      if (e.target && e.target.getAttribute('role') === 'tab') {
        const id = getIdFromTab(e.target);
        openTab(id);
        e.preventDefault();
      }
      return;
    default:
      return;
  }
  e.preventDefault();
  if (newIndex < 0) newIndex = 0;
  if (newIndex >= tabs.length) newIndex = tabs.length - 1;
  const targetTab = tabs[newIndex];
  if (targetTab) {
    targetTab.focus();
    const id = getIdFromTab(targetTab);
    openTab(id);
  }
}

/**
 * Extrai o identificador associado a uma aba (tab) a partir de seu
 * atributo id, removendo o prefixo "tab-". Retorna uma string para
 * permitir suporte uniforme a dias numéricos e ao diário.
 *
 * @param {HTMLElement} tab Elemento de aba
 * @returns {string} Identificador do painel
 */
function getIdFromTab(tab) {
  if (!tab || !tab.id) return '';
  return tab.id.replace(/^tab-/, '');
}

/**
 * Ativa a aba especificada e exibe seu painel correspondente. A
 * função cria o painel sob demanda se ainda não existir. Também
 * ajusta atributos ARIA, atualiza a URL para permitir deep-link
 * (parâmetro `?dia=N` ou remoção no caso de diário) e persiste o
 * último dia visitado no localStorage.
 *
 * @param {string} id Identificador do painel (número ou 'diary')
 */
function openTab(id) {
  const tabList = document.getElementById('tab-list');
  const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
  tabs.forEach((tab) => {
    const selected = getIdFromTab(tab) === id;
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.setAttribute('tabindex', selected ? '0' : '-1');
    if (selected) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  const panelsContainer = document.getElementById('tab-panels');
  // Garante que o painel exista. Será criado sob demanda.
  if (!window.tabPanels[id]) {
    createPanel(id);
  }
  // Exibe o painel ativo e oculta os demais.
  Object.keys(window.tabPanels).forEach((key) => {
    const panel = window.tabPanels[key];
    if (key === id) {
      panel.classList.add('active');
      panel.removeAttribute('hidden');
    } else {
      panel.classList.remove('active');
      panel.setAttribute('hidden', 'true');
    }
  });
  // Persiste o último dia visitado apenas se não for o diário ou a aba de memórias.
  if (id !== 'diary' && id !== 'memories') {
    localStorage.setItem('lastDay', id);
  }
  // Atualiza a URL para permitir deep-link.
  const url = new URL(window.location);
  if (id === 'diary') {
    url.searchParams.delete('dia');
  } else {
    url.searchParams.set('dia', id);
  }
  history.replaceState(null, '', url.toString());
}

/**
 * Constrói um painel de conteúdo para o dia ou diário fornecido. O
 * painel é anexado ao contêiner de painéis e armazenado em
 * `window.tabPanels` para reutilização. Para os dias numéricos,
 * adiciona botões de navegação para dia anterior/próximo e
 * inicializa os itens da agenda (concluir/nota). Para o painel de
 * diário, anexa a seção de diário fornecida ou uma mensagem
 * indicativa caso não existam notas.
 *
 * @param {string} id Identificador do painel a ser criado
 */
function createPanel(id) {
  const panelsContainer = document.getElementById('tab-panels');
  if (!panelsContainer) return;
  // Painel do diário
  if (id === 'diary') {
    const diaryPanel = document.createElement('div');
    diaryPanel.className = 'tab-panel card';
    diaryPanel.id = 'panel-diary';
    diaryPanel.setAttribute('role', 'tabpanel');
    diaryPanel.setAttribute('aria-labelledby', 'tab-diary');
    // Se existir uma seção de diário, anexamos ao painel. Caso
    // contrário, exibimos uma mensagem informativa.
    if (window.diarySection) {
      // Remove a classe 'card' da seção de diário para evitar
      // um cartão dentro de outro cartão. A classe 'hidden'
      // será controlada por updateDiary().
      window.diarySection.classList.remove('card');
      diaryPanel.appendChild(window.diarySection);
      // Se não houver notas inicialmente, insere mensagem temporária.
      if (window.diarySection.classList.contains('hidden')) {
        const msg = document.createElement('p');
        msg.className = 'no-notes-msg subtitle';
        msg.textContent = 'Nenhuma nota registrada ainda.';
        diaryPanel.appendChild(msg);
      }
    } else {
      const msg = document.createElement('p');
      msg.className = 'no-notes-msg subtitle';
      msg.textContent = 'Nenhuma nota registrada ainda.';
      diaryPanel.appendChild(msg);
    }
    panelsContainer.appendChild(diaryPanel);
    window.tabPanels[id] = diaryPanel;
    return;
  }

  // Painel de memórias
  if (id === 'memories') {
    const memPanel = document.createElement('div');
    memPanel.className = 'tab-panel card';
    memPanel.id = 'panel-memories';
    memPanel.setAttribute('role', 'tabpanel');
    memPanel.setAttribute('aria-labelledby', 'tab-memories');
    // O conteúdo será gerado dinamicamente pelo módulo memories.js
    // quando setupMemoriesPanel for chamado. Certifique-se de que
    // memories.js esteja carregado antes de criar este painel.
    panelsContainer.appendChild(memPanel);
    window.tabPanels[id] = memPanel;
    if (typeof window.setupMemoriesPanel === 'function') {
      // Inicializa a UI de memórias dentro deste painel
      window.setupMemoriesPanel(memPanel);
    }
    return;
  }
  // Painéis dos dias numéricos
  const day = window.itineraryData.find((d) => d.id.toString() === id.toString());
  if (!day) return;
  const panel = document.createElement('div');
  panel.className = 'tab-panel card';
  panel.id = 'panel-' + day.id;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'tab-' + day.id);
  // Constrói o contêiner da agenda do dia
  const dayDiv = document.createElement('div');
  dayDiv.className = 'day';
  // Cabeçalho com título e subtítulo
  const headerDiv = document.createElement('div');
  headerDiv.className = 'day-header';
  const titleDiv = document.createElement('div');
  titleDiv.className = 'day-title';
  titleDiv.innerHTML = day.title;
  const subDiv = document.createElement('div');
  subDiv.className = 'day-sub';
  subDiv.innerHTML = day.subtitle;
  headerDiv.appendChild(titleDiv);
  headerDiv.appendChild(subDiv);
  dayDiv.appendChild(headerDiv);
  // Se houver highlight, adiciona uma caixa de destaque
  if (day.highlight) {
    const highlightDiv = document.createElement('div');
    highlightDiv.className = 'highlight';
    highlightDiv.innerHTML = day.highlight;
    dayDiv.appendChild(highlightDiv);
  }
  // Lista de atividades
  const ul = document.createElement('ul');
  ul.className = 'schedule';
  day.schedule.forEach((item) => {
    const li = document.createElement('li');
    // Horário
    if (item.time) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'time';
      timeSpan.textContent = item.time;
      li.appendChild(timeSpan);
    }
    // Descrição (conteúdo HTML)
    const descSpan = document.createElement('span');
    descSpan.innerHTML = item.html;
    li.appendChild(descSpan);
    // Transporte (opcional)
    if (item.transport) {
      const transportDiv = document.createElement('div');
      transportDiv.className = 'transport';
      transportDiv.innerHTML = item.transport;
      li.appendChild(transportDiv);
    }
    ul.appendChild(li);
  });
  dayDiv.appendChild(ul);
  // Navegação entre dias
  const navDiv = document.createElement('div');
  navDiv.className = 'tab-day-nav';
  // Botão de dia anterior
  if (day.id > 1) {
    const prevBtn = document.createElement('button');
    prevBtn.className = 'prev-day-btn';
    prevBtn.type = 'button';
    prevBtn.textContent = '← Dia anterior';
    prevBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openTab((day.id - 1).toString());
    });
    navDiv.appendChild(prevBtn);
  }
  // Botão de próximo dia
  if (day.id < window.itineraryData.length) {
    const nextBtn = document.createElement('button');
    nextBtn.className = 'next-day-btn';
    nextBtn.type = 'button';
    nextBtn.textContent = 'Próximo dia →';
    nextBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openTab((day.id + 1).toString());
    });
    navDiv.appendChild(nextBtn);
  }
  dayDiv.appendChild(navDiv);
  panel.appendChild(dayDiv);
  panelsContainer.appendChild(panel);
  // Inicializa os itens do roteiro para permitir marcação e notas.
  initScheduleItemsForDay(panel, day.id);
  // Armazena o painel criado
  window.tabPanels[id] = panel;

  // Carrega memórias para este dia, se a funcionalidade estiver definida.
  // Isso exibe as memórias associadas ao dia no final do painel. Será
  // atualizado posteriormente via refreshAllDayMemories após login.
  if (typeof window.loadMemoriesForDay === 'function') {
    window.loadMemoriesForDay(day.id);
  }
}

/**
 * Inicializa os controles interativos (concluir/nota) para cada item
 * de um dia específico. O estado de cada item é persistido no
 * localStorage com chave única baseada no número do dia e no índice
 * da atividade. Após cada modificação, o progresso do dia é
 * recalculado e o diário é atualizado conforme necessário.
 *
 * @param {HTMLElement} panel Painel que contém a lista de itens
 * @param {number} dayId Número do dia ao qual os itens pertencem
 */
function initScheduleItemsForDay(panel, dayId) {
  const listItems = panel.querySelectorAll('.schedule li');
  listItems.forEach((li, index) => {
    const itemKey = `day-${dayId}-item-${index}`;
    // Contêiner de ações
    const actions = document.createElement('span');
    actions.className = 'item-actions';
    // Botão de concluir
    const doneBtn = document.createElement('button');
    doneBtn.className = 'done-btn';
    doneBtn.innerHTML = '✔';
    actions.appendChild(doneBtn);
    // Botão de nota
    const noteBtn = document.createElement('button');
    noteBtn.className = 'note-btn';
    noteBtn.innerHTML = '📝';
    actions.appendChild(noteBtn);
    // Insere as ações no item
    li.appendChild(actions);
    // Contêiner para exibir nota
    const noteDisplay = document.createElement('div');
    noteDisplay.className = 'note-display hidden';
    li.appendChild(noteDisplay);
    // Recupera estado salvo
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(itemKey)) || {};
    } catch (e) {
      saved = {};
    }
    if (saved.completed) {
      li.classList.add('completed');
    }
    if (saved.note) {
      noteDisplay.innerHTML = `<strong>Nota:</strong> ${saved.note}`;
      noteDisplay.classList.remove('hidden');
    }
    // Manipulador de concluir
    doneBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      li.classList.toggle('completed');
      saved.completed = li.classList.contains('completed');
      localStorage.setItem(itemKey, JSON.stringify(saved));
      updateDayProgress(dayId);
    });
    // Manipulador de nota
    noteBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const current = saved.note || '';
      const note = prompt('Escreva sua nota ou memória para este momento:', current);
      if (note !== null) {
        const trimmed = note.trim();
        if (trimmed === '') {
          delete saved.note;
          noteDisplay.innerHTML = '';
          noteDisplay.classList.add('hidden');
        } else {
          saved.note = trimmed;
          noteDisplay.innerHTML = `<strong>Nota:</strong> ${saved.note}`;
          noteDisplay.classList.remove('hidden');
        }
        localStorage.setItem(itemKey, JSON.stringify(saved));
        updateDiary();
      }
    });
  });
  // Atualiza progresso inicial do dia
  updateDayProgress(dayId);
}

/**
 * Calcula o número de itens concluídos para um dia específico e
 * atualiza o rótulo da aba correspondente para refletir o progresso.
 * Quando todos os itens estão concluídos, um check (✓) substitui a
 * contagem; caso contrário, a contagem é exibida no formato
 * `(X/Y)`. Se o dia ainda não tiver itens (lista vazia), nenhuma
 * contagem é exibida.
 *
 * @param {number|string} dayId Identificador numérico do dia
 */
function updateDayProgress(dayId) {
  const day = window.itineraryData.find((d) => d.id.toString() === dayId.toString());
  if (!day) return;
  const total = day.schedule.length;
  let completed = 0;
  for (let i = 0; i < total; i++) {
    const key = `day-${dayId}-item-${i}`;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data && data.completed) completed += 1;
    } catch (e) {
      // ignora erros
    }
  }
  const tab = document.getElementById('tab-' + dayId);
  if (tab) {
    const baseLabel = `Dia ${dayId}`;
    if (total > 0) {
      if (completed === total) {
        tab.textContent = `${baseLabel} ✓`;
      } else {
        tab.textContent = `${baseLabel} (${completed}/${total})`;
      }
    } else {
      tab.textContent = baseLabel;
    }
  }
}

/**
 * Restaura a aba ativa na inicialização da página. Verifica a
 * presença de um parâmetro `dia` na URL e, caso inexistente,
 * utiliza o valor salvo no localStorage. Se nenhum valor for
 * encontrado, abre o primeiro dia do itinerário ou o diário se
 * nenhum dia existir.
 *
 * @param {Array<Object>} itineraryData Lista de objetos de dias
 */
function restoreLastDay(itineraryData) {
  let id;
  const params = new URLSearchParams(window.location.search);
  if (params.has('dia')) {
    id = params.get('dia');
  } else {
    id = localStorage.getItem('lastDay');
  }
  // Se ainda não houver id, define como primeiro dia se existir.
  if (!id) {
    if (itineraryData.length > 0) {
      id = itineraryData[0].id.toString();
    } else {
      id = 'diary';
    }
  }
  openTab(id.toString());
}

/**
 * Atualiza a seção do diário com base nas notas salvas no
 * localStorage. Agrupa as notas por dia, gera elementos de
 * exibição e controla a visibilidade do painel de diário. A
 * mensagem "Nenhuma nota registrada" é mostrada quando não
 * existem entradas salvas.
 */
function updateDiary() {
  const diarySection = document.getElementById('diary');
  const diaryList = document.getElementById('diary-list');
  if (!diarySection || !diaryList) return;
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('day-')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data && data.note) {
        const match = key.match(/^day-(\d+)-item-(\d+)$/);
        if (match) {
          entries.push({
            day: parseInt(match[1], 10),
            note: data.note,
          });
        }
      }
    } catch (e) {
      // ignora erros
    }
  }
  entries.sort((a, b) => a.day - b.day);
  diaryList.innerHTML = '';
  entries.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'diary-entry';
    const daySpan = document.createElement('span');
    daySpan.className = 'entry-day';
    daySpan.textContent = `Dia ${entry.day}:`;
    const noteSpan = document.createElement('span');
    noteSpan.className = 'entry-note';
    noteSpan.textContent = ` ${entry.note}`;
    div.appendChild(daySpan);
    div.appendChild(noteSpan);
    diaryList.appendChild(div);
  });
  // Mostra ou oculta a seção com base nas entradas
  if (entries.length > 0) {
    diarySection.classList.remove('hidden');
  } else {
    diarySection.classList.add('hidden');
  }
  // Atualiza o painel de diário se estiver criado
  const diaryPanel = window.tabPanels && window.tabPanels['diary'];
  if (diaryPanel) {
    // Remove mensagem antiga
    const oldMsg = diaryPanel.querySelector('.no-notes-msg');
    if (oldMsg) oldMsg.remove();
    if (entries.length === 0) {
      // Cria mensagem informativa
      const msg = document.createElement('p');
      msg.className = 'no-notes-msg subtitle';
      msg.textContent = 'Nenhuma nota registrada ainda.';
      diaryPanel.appendChild(msg);
    }
  }
}

/**
 * Carrega memórias associadas a um dia específico do itinerário.
 * Faz uma requisição ao backend com o parâmetro "day" para
 * recuperar somente memórias daquele dia. A resposta é então
 * renderizada na seção de memórias do painel do dia.
 *
 * @param {number|string} dayId Número do dia
 */
async function loadMemoriesForDay(dayId) {
  try {
    const res = await fetch('/memories?day=' + encodeURIComponent(dayId), {
      credentials: 'include',
    });
    if (res.status === 401) {
      // Se não autenticado, remove memórias do painel para evitar mostrar dados vazios
      renderDayMemories(dayId, null);
      return;
    }
    const data = await res.json();
    renderDayMemories(dayId, Array.isArray(data) ? data : []);
  } catch (err) {
    // Em caso de erro, não exibe memórias
    renderDayMemories(dayId, null);
  }
}

/**
 * Renderiza o conjunto de memórias em um painel de dia. Se nenhuma
 * memória for fornecida (null), remove a seção de memórias daquele dia.
 * Quando a lista estiver vazia, exibe mensagem apropriada. Cada cartão de
 * memória mostra título, data, status, descrição abreviada, tags, local e
 * miniaturas de mídias. O layout utiliza o mesmo estilo de cartões
 * definido no CSS (classes card e grid).
 *
 * @param {number|string} dayId Identificador do dia
 * @param {Array|null} memories Lista de memórias ou null para limpar
 */
function renderDayMemories(dayId, memories) {
  const panel = window.tabPanels && window.tabPanels[dayId];
  if (!panel) return;
  // Procura contêiner existente de memórias
  let memContainer = panel.querySelector('.memories-container');
  if (!memories || memories === null) {
    // Remove contêiner se existir e não há memórias
    if (memContainer) {
      memContainer.remove();
    }
    return;
  }
  if (!memContainer) {
    memContainer = document.createElement('div');
    memContainer.className = 'memories-container';
    memContainer.style.marginTop = '24px';
    panel.appendChild(memContainer);
  }
  memContainer.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = 'Memórias deste dia';
  heading.style.marginBottom = '8px';
  memContainer.appendChild(heading);
  if (!memories || memories.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'subtitle';
    msg.textContent = 'Ainda não há memórias registradas para este dia.';
    memContainer.appendChild(msg);
    return;
  }
  const listDiv = document.createElement('div');
  listDiv.className = 'grid';
  listDiv.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
  listDiv.style.gap = '16px';
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
    // Descrição abreviada
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
    listDiv.appendChild(card);
  });
  memContainer.appendChild(listDiv);
}

/**
 * Atualiza as memórias em todos os dias. Percorre a estrutura do
 * itinerário e faz a carga de memórias para cada dia. Esta função
 * pode ser chamada após login ou criação de uma nova memória para
 * sincronizar os painéis do roteiro.
 */
function refreshAllDayMemories() {
  if (!Array.isArray(window.itineraryData)) return;
  window.itineraryData.forEach((day) => {
    loadMemoriesForDay(day.id);
  });
}

// Exponibiliza globalmente as funções de memórias por dia
window.loadMemoriesForDay = loadMemoriesForDay;
window.refreshAllDayMemories = refreshAllDayMemories;
window.renderDayMemories = renderDayMemories;

/**
 * Carrega memórias que não estão vinculadas a um dia (capa). Faz
 * requisição sem filtro de "day" e seleciona apenas as memórias
 * cujo campo day seja nulo ou indefinido. O resultado é passado para
 * renderCoverMemories().
 */
async function loadCoverMemories() {
  try {
    const res = await fetch('/memories', { credentials: 'include' });
    if (res.status === 401) {
      renderCoverMemories(null);
      return;
    }
    const data = await res.json();
    const noDay = (Array.isArray(data) ? data : []).filter((mem) => mem.day === undefined || mem.day === null || String(mem.day).trim() === '');
    renderCoverMemories(noDay);
  } catch (err) {
    renderCoverMemories(null);
  }
}

/**
 * Renderiza as memórias da capa em seu contêiner dedicado.
 * Quando nenhum array de memórias é fornecido (null), limpa ou oculta o
 * contêiner. Se a lista estiver vazia, exibe uma mensagem. Caso haja
 * memórias, cria um título e um grid de cartões semelhantes ao do
 * itinerário.
 *
 * @param {Array|null} memories Lista de memórias sem dia
 */
function renderCoverMemories(memories) {
  const container = document.getElementById('cover-memories');
  if (!container) return;
  if (!memories || memories === null) {
    // Oculta a seção se não houver dados (provavelmente usuário não autenticado)
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }
  container.innerHTML = '';
  // Exibe título
  const h2 = document.createElement('h2');
  h2.textContent = 'Memórias da viagem';
  container.appendChild(h2);
  if (memories.length === 0) {
    const p = document.createElement('p');
    p.className = 'subtitle';
    p.textContent = 'Nenhuma memória adicionada ainda.';
    container.appendChild(p);
    container.classList.remove('hidden');
    return;
  }
  // Cria grid
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
  grid.style.gap = '16px';
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
    // Descrição abreviada
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
    grid.appendChild(card);
  });
  container.appendChild(grid);
  container.classList.remove('hidden');
}

// Exponibiliza globalmente as funções de capa
window.loadCoverMemories = loadCoverMemories;
window.renderCoverMemories = renderCoverMemories;

/**
 * Inicializa a contagem regressiva para o início da viagem. A data
 * alvo pode ser ajustada conforme necessário. O temporizador
 * atualiza a cada minuto para economizar recursos.
 */
function initCountdown() {
  const countdownEl = document.getElementById('countdown');
  if (!countdownEl) return;
  // Define o início da viagem (adaptar conforme necessário)
  const target = new Date('2026-01-16T00:00:00-03:00');
  function update() {
    const now = new Date();
    const diff = target.getTime() - now.getTime();
    if (diff <= 0) {
      countdownEl.textContent = 'A viagem já começou!';
      return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const parts = [];
    if (days > 0) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}min`);
    countdownEl.textContent = parts.join(' ');
  }
  update();
  // Atualiza a cada minuto
  setInterval(update, 60 * 1000);
}

/**
 * Registra o service worker para permitir uso offline da aplicação.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.error('Falha ao registrar service worker', err);
    });
  }
}

/**
 * Inicializa e aplica o tema claro/escuro. O valor inicial é
 * derivado da preferência do usuário e do valor armazenado no
 * localStorage. A alternância de tema é realizada pelo botão de
 * alternância presente no cabeçalho.
 */
function initTheme() {
  const htmlEl = document.documentElement;
  const toggleBtn = document.getElementById('theme-toggle');
  if (!toggleBtn) return;
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let theme = stored || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
  toggleBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    theme = htmlEl.classList.contains('theme-dark') ? 'light' : 'dark';
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  });
}

/**
 * Aplica a classe adequada ao elemento <html> e ajusta o ícone do
 * botão de alternância de tema.
 *
 * @param {string} theme Nome do tema ('light' ou 'dark')
 */
function applyTheme(theme) {
  const htmlEl = document.documentElement;
  const toggleBtn = document.getElementById('theme-toggle');
  if (theme === 'dark') {
    htmlEl.classList.add('theme-dark');
    if (toggleBtn) toggleBtn.textContent = '☀️';
  } else {
    htmlEl.classList.remove('theme-dark');
    if (toggleBtn) toggleBtn.textContent = '🌙';
  }
}

/**
 * Mostra ou oculta o botão flutuante de voltar ao topo conforme o
 * usuário rola a página. Ao clicar, realiza scroll suave até o topo.
 */
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
      btn.classList.add('show');
    } else {
      btn.classList.remove('show');
    }
  });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/**
 * Inicializa o diário compartilhado via Supabase. Quando a URL e a
 * anon key estão configuradas nas metas do HTML, o formulário de
 * autenticação é exibido. Após login ou cadastro, o usuário pode
 * salvar memórias que ficam disponíveis para o casal.
 */
function initCloudDiary() {
  const notice = document.getElementById('cloud-diary-notice');
  const authForm = document.getElementById('auth-form');
  const logoutBtn = document.getElementById('logout-btn');
  const area = document.getElementById('cloud-diary-area');
  const feedback = document.getElementById('auth-feedback');
  if (!notice || !authForm || !logoutBtn || !area || !feedback) return;

  const enabled = setupSupabaseClient();
  if (!enabled) {
    // Mantém apenas o aviso de configuração.
    authForm.classList.add('hidden');
    area.classList.add('hidden');
    return;
  }

  notice.textContent = 'Use e-mail e senha para entrar ou criar a conta do casal.';
  authForm.classList.remove('hidden');
  area.classList.add('hidden');

  let authAction = 'login';
  authForm.addEventListener('click', (ev) => {
    if (ev.target && ev.target.dataset && ev.target.dataset.action) {
      authAction = ev.target.dataset.action;
    }
  });

  authForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = authForm.email.value.trim();
    const password = authForm.password.value.trim();
    if (!email || !password) return;
    setFeedback(feedback, 'Conectando...');
    try {
      if (authAction === 'signup') {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        setFeedback(feedback, 'Conta criada! Veja seu e-mail para confirmar (se necessário).');
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setFeedback(feedback, 'Login realizado com sucesso.');
      }
    } catch (err) {
      setFeedback(feedback, formatSupabaseError(err), true);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    setFeedback(feedback, 'Sessão encerrada.');
  });

  supabaseClient.auth.getSession().then(({ data }) => {
    updateAuthUI(data.session ? data.session.user : null);
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateAuthUI(session ? session.user : null);
    if (session && session.user) {
      loadCloudEntries();
    } else {
      clearCloudEntries();
    }
  });

  initCloudEntryForm();
}

/**
 * Lê as metas supabase-url e supabase-anon-key e inicializa o cliente.
 *
 * @returns {boolean} Verdadeiro se o cliente foi configurado.
 */
function setupSupabaseClient() {
  const urlMeta = document.querySelector('meta[name="supabase-url"]');
  const keyMeta = document.querySelector('meta[name="supabase-anon-key"]');
  const url = urlMeta && urlMeta.content ? urlMeta.content.trim() : '';
  const key = keyMeta && keyMeta.content ? keyMeta.content.trim() : '';
  if (!url || !key) {
    return false;
  }
  supabaseClient = createClient(url, key);
  return true;
}

/**
 * Atualiza a UI de autenticação com base no usuário atual.
 *
 * @param {object|null} user Usuário autenticado ou null
 */
function updateAuthUI(user) {
  cachedUser = user;
  const area = document.getElementById('cloud-diary-area');
  const logoutBtn = document.getElementById('logout-btn');
  const authForm = document.getElementById('auth-form');
  const feedback = document.getElementById('auth-feedback');
  if (!area || !logoutBtn || !authForm || !feedback) return;
  if (user) {
    authForm.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    area.classList.remove('hidden');
    setFeedback(feedback, `Logado como ${user.email}`);
  } else {
    authForm.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    area.classList.add('hidden');
    setFeedback(feedback, '');
  }
}

/**
 * Configura o formulário de criação de entradas na nuvem.
 */
function initCloudEntryForm() {
  const form = document.getElementById('cloud-entry-form');
  const feedback = document.getElementById('entry-feedback');
  const refreshBtn = document.getElementById('refresh-entries');
  if (!form || !feedback || !refreshBtn) return;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!supabaseClient || !cachedUser) {
      setFeedback(feedback, 'Faça login para salvar na nuvem.', true);
      return;
    }
    const dayInput = form.day.value.trim();
    const note = form.note.value.trim();
    const day = dayInput ? parseInt(dayInput, 10) : null;
    if (!note) {
      setFeedback(feedback, 'Escreva algo antes de salvar.', true);
      return;
    }
    setFeedback(feedback, 'Salvando...');
    try {
      const payload = { note };
      if (!Number.isNaN(day) && day !== null) payload.day = day;
      const { error } = await supabaseClient.from('diary_entries').insert(payload);
      if (error) throw error;
      form.reset();
      setFeedback(feedback, 'Memória salva na nuvem!');
      await loadCloudEntries();
    } catch (err) {
      setFeedback(feedback, formatSupabaseError(err), true);
    }
  });

  refreshBtn.addEventListener('click', async () => {
    if (!cachedUser) {
      setFeedback(feedback, 'Faça login para carregar as memórias.', true);
      return;
    }
    await loadCloudEntries();
  });
}

/**
 * Busca e renderiza as entradas do diário armazenadas na tabela
 * diary_entries do Supabase.
 */
async function loadCloudEntries() {
  const list = document.getElementById('cloud-entry-list');
  if (!list || !supabaseClient || !cachedUser) return;
  list.innerHTML = '<p class="subtitle">Carregando entradas...</p>';
  const { data, error } = await supabaseClient
    .from('diary_entries')
    .select('id, day, note, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    list.innerHTML = `<p class="feedback error">${formatSupabaseError(error)}</p>`;
    return;
  }
  renderCloudEntries(data || []);
}

/**
 * Limpa a lista de entradas quando o usuário sai.
 */
function clearCloudEntries() {
  const list = document.getElementById('cloud-entry-list');
  if (list) list.innerHTML = '';
}

/**
 * Renderiza a lista de entradas recuperadas do Supabase.
 *
 * @param {Array<Object>} entries Lista de entradas
 */
function renderCloudEntries(entries) {
  const list = document.getElementById('cloud-entry-list');
  if (!list) return;
  list.innerHTML = '';
  if (!entries.length) {
    list.innerHTML = '<p class="subtitle">Nenhuma memória na nuvem ainda.</p>';
    return;
  }
  entries.forEach((entry) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'cloud-entry';
    const header = document.createElement('div');
    header.className = 'cloud-entry-header';
    const dayLabel = document.createElement('span');
    dayLabel.className = 'entry-day';
    dayLabel.textContent = entry.day ? `Dia ${entry.day}` : 'Diário';
    const dateLabel = document.createElement('span');
    const date = entry.created_at ? new Date(entry.created_at) : null;
    dateLabel.textContent = date ? date.toLocaleString('pt-BR') : '';
    header.appendChild(dayLabel);
    header.appendChild(dateLabel);
    const note = document.createElement('p');
    note.className = 'entry-note';
    note.textContent = entry.note;
    wrapper.appendChild(header);
    wrapper.appendChild(note);
    list.appendChild(wrapper);
  });
}

/**
 * Ajusta mensagens visuais de feedback.
 *
 * @param {HTMLElement} el Elemento de feedback
 * @param {string} text Mensagem a ser exibida
 * @param {boolean} isError Indica se a mensagem é de erro
 */
function setFeedback(el, text, isError = false) {
  el.textContent = text || '';
  el.classList.toggle('error', Boolean(isError));
}

/**
 * Formata erros do Supabase de forma amigável.
 *
 * @param {Error|object} err Erro retornado pelo Supabase
 * @returns {string} Mensagem para o usuário
 */
function formatSupabaseError(err) {
  if (!err) return 'Erro desconhecido.';
  if (typeof err.message === 'string') return err.message;
  if (typeof err === 'string') return err;
  return 'Não foi possível completar a ação.';
}
