/**
 * Sorte — gerador de jogos das loterias brasileiras.
 * Sem dependências: apenas DOM + localStorage para o tema.
 */
(function () {
  'use strict';

  /** Regras oficiais de cada modalidade (quantidade mínima/máxima de dezenas). */
  const GAMES = [
    { id: 'megasena',  name: 'Mega-Sena',  color: '#0f9b6c', max: 60,  min: 6,  maxPick: 15, defaultPick: 6 },
    { id: 'quina',     name: 'Quina',      color: '#5b4bd6', max: 80,  min: 5,  maxPick: 15, defaultPick: 5 },
    { id: 'lotofacil', name: 'Lotofácil',  color: '#8e24aa', max: 25,  min: 15, maxPick: 20, defaultPick: 15 },
    { id: 'lotomania', name: 'Lotomania',  color: '#e07b1e', max: 100, min: 50, maxPick: 50, defaultPick: 50 },
    { id: 'duplasena', name: 'Dupla Sena', color: '#c2185b', max: 50,  min: 6,  maxPick: 15, defaultPick: 6 },
    { id: 'timemania', name: 'Timemania',  color: '#1c8f3f', max: 80,  min: 10, maxPick: 10, defaultPick: 10 },
  ];

  const THEME_KEY = 'sorte:theme';

  const el = {
    picker: document.getElementById('game-picker'),
    qtd: document.getElementById('qtd'),
    qtdOutput: document.getElementById('qtd-output'),
    qtdRange: document.getElementById('qtd-range'),
    jogos: document.getElementById('jogos'),
    gerar: document.getElementById('gerar'),
    limpar: document.getElementById('limpar'),
    resultados: document.getElementById('resultados'),
    contador: document.getElementById('contador'),
    empty: document.getElementById('empty'),
    theme: document.getElementById('theme-toggle'),
  };

  let selected = GAMES[0];

  /* ----------------------------------------------------------------
     Sorteio
     ---------------------------------------------------------------- */

  /** Inteiro em [0, limite) usando a fonte criptográfica quando disponível. */
  function randomBelow(limit) {
    if (window.crypto && window.crypto.getRandomValues) {
      // Descarta valores na cauda para evitar viés de módulo.
      const ceiling = Math.floor(0xffffffff / limit) * limit;
      const buffer = new Uint32Array(1);
      let value;
      do {
        window.crypto.getRandomValues(buffer);
        value = buffer[0];
      } while (value >= ceiling);
      return value % limit;
    }
    return Math.floor(Math.random() * limit);
  }

  /** Sorteia `count` dezenas distintas de 1 a `max`, em ordem crescente. */
  function draw(count, max) {
    const pool = Array.from({ length: max }, (_, i) => i + 1);
    for (let i = 0; i < count; i++) {
      const j = i + randomBelow(max - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count).sort((a, b) => a - b);
  }

  /* ----------------------------------------------------------------
     Seletor de loteria
     ---------------------------------------------------------------- */

  function renderPicker() {
    el.picker.replaceChildren(...GAMES.map((game) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'game-option';
      option.role = 'radio';
      option.style.setProperty('--game-color', game.color);
      option.setAttribute('aria-checked', String(game.id === selected.id));
      option.dataset.id = game.id;
      option.innerHTML =
        '<span class="game-option__name"></span>' +
        '<span class="game-option__meta"></span>';
      option.querySelector('.game-option__name').textContent = game.name;
      option.querySelector('.game-option__meta').textContent =
        game.defaultPick + ' de ' + game.max;
      option.addEventListener('click', () => selectGame(game));
      return option;
    }));
  }

  function selectGame(game) {
    selected = game;
    // A cor da modalidade guia slider, badge e cartelas.
    document.documentElement.style.setProperty('--game-color', game.color);
    for (const option of el.picker.children) {
      option.setAttribute('aria-checked', String(option.dataset.id === game.id));
    }
    syncSlider();
  }

  /** Ajusta o range de dezenas às regras da loteria selecionada. */
  function syncSlider() {
    el.qtd.min = String(selected.min);
    el.qtd.max = String(selected.maxPick);
    el.qtd.value = String(selected.defaultPick);
    el.qtdRange.textContent =
      selected.min === selected.maxPick
        ? 'A ' + selected.name + ' aceita apenas ' + selected.min + ' dezenas.'
        : 'De ' + selected.min + ' a ' + selected.maxPick + ' dezenas (1 a ' + selected.max + ').';
    el.qtd.disabled = selected.min === selected.maxPick;
    syncOutput();
  }

  function syncOutput() {
    el.qtdOutput.textContent = el.qtd.value;
  }

  /* ----------------------------------------------------------------
     Resultados
     ---------------------------------------------------------------- */

  function buildTicket(numbers, index) {
    const ticket = document.createElement('article');
    ticket.className = 'ticket';
    ticket.role = 'listitem';
    ticket.style.setProperty('--game-color', selected.color);

    const header = document.createElement('div');
    header.className = 'ticket__header';

    const title = document.createElement('h3');
    title.className = 'ticket__title';
    title.textContent = selected.name + ' · jogo ' + index;

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ticket__copy';
    copy.textContent = 'Copiar';
    copy.addEventListener('click', async () => {
      const text = numbers.map(format).join(' ');
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copiado!';
      } catch {
        copy.textContent = 'Falhou';
      }
      setTimeout(() => { copy.textContent = 'Copiar'; }, 1600);
    });

    header.append(title, copy);

    const balls = document.createElement('ul');
    balls.className = 'balls';
    numbers.forEach((n, i) => {
      const ball = document.createElement('li');
      ball.className = 'ball';
      ball.style.setProperty('--delay', (i * 35) + 'ms');
      ball.textContent = format(n);
      balls.append(ball);
    });

    ticket.append(header, balls);
    return ticket;
  }

  function format(n) {
    return String(n).padStart(2, '0');
  }

  function generate() {
    const perGame = Number(el.qtd.value);
    const total = Math.min(Math.max(Number(el.jogos.value) || 1, 1), 20);
    el.jogos.value = String(total);

    const tickets = Array.from({ length: total }, (_, i) =>
      buildTicket(draw(perGame, selected.max), i + 1)
    );

    el.resultados.replaceChildren(...tickets);
    el.empty.hidden = true;
    el.contador.hidden = false;
    el.contador.textContent = total + (total === 1 ? ' jogo' : ' jogos');
  }

  function clear() {
    el.resultados.replaceChildren();
    el.empty.hidden = false;
    el.contador.hidden = true;
  }

  /* ----------------------------------------------------------------
     Tema
     ---------------------------------------------------------------- */

  function applyTheme(theme) {
    if (theme) {
      document.documentElement.dataset.theme = theme;
    } else {
      delete document.documentElement.dataset.theme;
    }
    const isDark = theme
      ? theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    el.theme.setAttribute('aria-label', isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro');
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch { /* modo privado: mantém apenas na sessão */ }
    applyTheme(next);
  }

  /* ----------------------------------------------------------------
     Inicialização
     ---------------------------------------------------------------- */

  let stored = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch { /* storage indisponível */ }

  applyTheme(stored === 'dark' || stored === 'light' ? stored : null);
  renderPicker();
  selectGame(selected);
  clear();

  el.qtd.addEventListener('input', syncOutput);
  el.gerar.addEventListener('click', generate);
  el.limpar.addEventListener('click', clear);
  el.theme.addEventListener('click', toggleTheme);
})();
