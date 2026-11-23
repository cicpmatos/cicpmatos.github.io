import test from 'node:test';
import assert from 'node:assert/strict';
import { initTopicFilters } from '../assets/topic-filters.js';

// Small DOM double: exercises public behavior without adding a browser dependency.
class Element {
  constructor(dataset = {}, children = []) {
    this.dataset = dataset;
    this.children = children;
    this.hidden = false;
    this.attributes = new Map();
    this.listeners = new Map();
    this.attributeChanges = [];
    this._textContent = '';
  }

  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = String(value); }

  querySelectorAll(selector) {
    const results = [];
    for (const child of this.children) {
      if (child.matches(selector)) results.push(child);
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  matches(selector) {
    if (selector === 'iframe[src]') return this.tagName === 'IFRAME' && this.hasAttribute('src');
    const attribute = selector.match(/^\[data-([a-z-]+)\]$/)?.[1];
    if (!attribute) throw new Error(`Unexpected test selector: ${selector}`);
    const property = attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Object.hasOwn(this.dataset, property);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this.attributeChanges.push({ name, value: String(value) });
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }

  removeAttribute(name) {
    this.attributes.delete(name);
    this.attributeChanges.push({ name, value: null });
  }

  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }

  click() {
    if (this.disabled) return;
    for (const listener of this.listeners.get('click') ?? []) {
      listener({ type: 'click', target: this, currentTarget: this, preventDefault() {} });
    }
  }
}

const themes = ['', 'Python', 'PostgreSQL', 'Power BI', 'Engenharia de Dados', 'Pessoal'];

function browser(categories, { singular = 'artigo', plural = 'artigos', empty = true, videos = false } = {}) {
  const buttons = themes.map(topic => new Element({ topic }, [new Element({ topicCount: '' })]));
  const controls = new Element({ topicControls: '' }, buttons);
  controls.hidden = true;
  const cards = categories.map((category, index) => {
    const frames = [];
    if (videos) {
      const frame = new Element();
      frame.tagName = 'IFRAME';
      frame.setAttribute('src', `https://www.youtube-nocookie.com/embed/Abc_123-xY${index}?playsinline=1`);
      frame.attributeChanges = [];
      frames.push(frame);
    }
    return new Element({ topicCard: category }, frames);
  });
  const status = new Element({ topicStatus: '' });
  status.setAttribute('role', 'status');
  const emptyMessage = empty ? new Element({ topicEmpty: '' }) : null;
  if (emptyMessage) emptyMessage.hidden = true;
  const container = new Element({ topicBrowser: '', topicSingular: singular, topicPlural: plural }, [
    controls, ...cards, status, ...(emptyMessage ? [emptyMessage] : []),
  ]);
  return {
    container, controls, cards, buttons, status, emptyMessage,
    choose(topic) { buttons.find(button => button.dataset.topic === topic).click(); },
    count(topic) { return buttons.find(button => button.dataset.topic === topic).querySelector('[data-topic-count]').textContent; },
  };
}

const documentWith = (...browsers) => new Element({}, browsers.map(item => item.container));
const visibleTopics = instance => instance.cards.filter(card => !card.hidden).map(card => card.dataset.topicCard);
const selectedTopics = instance => instance.buttons.filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.dataset.topic);

test('filtros contam os cartões reais e só aparecem após a inicialização', () => {
  const instance = browser(['Python', 'Python', 'PostgreSQL', 'Power BI']);
  assert.equal(instance.controls.hidden, true);
  assert.deepEqual(visibleTopics(instance), ['Python', 'Python', 'PostgreSQL', 'Power BI']);

  initTopicFilters(documentWith(instance));

  assert.equal(instance.controls.hidden, false);
  assert.deepEqual(themes.map(topic => instance.count(topic)), ['4', '2', '1', '1', '0', '0']);
  assert.deepEqual(selectedTopics(instance), ['']);
  assert.match(instance.status.textContent, /4 artigos/);
  assert.equal(instance.emptyMessage.hidden, true);
  for (const button of instance.buttons) {
    assert.ok(['true', 'false'].includes(button.getAttribute('aria-pressed')));
    assert.match(button.getAttribute('aria-label'), new RegExp(instance.count(button.dataset.topic)));
  }
});

test('selecionar um tema usa correspondência exata e mantém a contagem total de cada opção', () => {
  const instance = browser(['Python', 'Python avançado', 'PostgreSQL']);
  initTopicFilters(documentWith(instance));
  instance.choose('Python');

  assert.deepEqual(visibleTopics(instance), ['Python']);
  assert.deepEqual(selectedTopics(instance), ['Python']);
  assert.equal(instance.count(''), '3');
  assert.equal(instance.count('Python'), '1');
  assert.match(instance.status.textContent, /1 artigo\b/);
  assert.match(instance.status.textContent, /Python/);
  assert.equal(instance.emptyMessage.hidden, true);
});

test('tema sem resultados mostra aviso e Todos restaura todos os cartões', () => {
  const instance = browser(['Python', 'Power BI']);
  initTopicFilters(documentWith(instance));
  instance.choose('Pessoal');

  assert.deepEqual(visibleTopics(instance), []);
  assert.deepEqual(selectedTopics(instance), ['Pessoal']);
  assert.equal(instance.emptyMessage.hidden, false);
  assert.match(instance.status.textContent, /0 artigos/);
  assert.match(instance.status.textContent, /Pessoal/);

  instance.choose('');
  assert.deepEqual(visibleTopics(instance), ['Python', 'Power BI']);
  assert.deepEqual(selectedTopics(instance), ['']);
  assert.equal(instance.emptyMessage.hidden, true);
  assert.match(instance.status.textContent, /2 artigos/);
});

test('seção vazia funciona com ou sem mensagem adicional de resultados', () => {
  for (const empty of [true, false]) {
    const instance = browser([], { singular: 'vídeo', plural: 'vídeos', empty });
    initTopicFilters(documentWith(instance));
    assert.deepEqual(themes.map(topic => instance.count(topic)), ['0', '0', '0', '0', '0', '0']);
    assert.match(instance.status.textContent, /0 vídeos/);
    assert.equal(instance.controls.hidden, false);
    if (empty) assert.equal(instance.emptyMessage.hidden, false);
    assert.doesNotThrow(() => instance.choose('Python'));
    assert.doesNotThrow(() => instance.choose(''));
  }
  assert.doesNotThrow(() => initTopicFilters(documentWith()));
});

test('cada conjunto de filtros afeta somente sua própria seção', () => {
  const articles = browser(['Python', 'Power BI']);
  const videos = browser(['PostgreSQL'], { singular: 'vídeo', plural: 'vídeos' });
  initTopicFilters(documentWith(articles, videos));
  articles.choose('Python');

  assert.deepEqual(visibleTopics(articles), ['Python']);
  assert.deepEqual(visibleTopics(videos), ['PostgreSQL']);
  assert.deepEqual(selectedTopics(videos), ['']);
  assert.match(videos.status.textContent, /1 vídeo\b/);

  videos.choose('Pessoal');
  assert.deepEqual(visibleTopics(videos), []);
  assert.deepEqual(visibleTopics(articles), ['Python']);
  assert.deepEqual(selectedTopics(articles), ['Python']);
});

test('ocultar vídeo interrompe o player e restaurar recupera a mesma URL sem recargas repetidas', () => {
  const instance = browser(['Python', 'PostgreSQL'], { singular: 'vídeo', plural: 'vídeos', videos: true });
  const [pythonFrame, sqlFrame] = instance.cards.map(card => card.children[0]);
  const originalUrl = sqlFrame.getAttribute('src');
  initTopicFilters(documentWith(instance));
  assert.equal(pythonFrame.attributeChanges.length, 0);
  assert.equal(sqlFrame.attributeChanges.length, 0);

  instance.choose('Python');
  assert.equal(sqlFrame.getAttribute('src'), null);
  assert.equal(instance.cards[1].hidden, true);
  assert.equal(pythonFrame.attributeChanges.length, 0);
  assert.deepEqual(sqlFrame.attributeChanges, [{ name: 'src', value: null }]);

  instance.choose('Python');
  assert.equal(sqlFrame.attributeChanges.length, 1);
  assert.equal(pythonFrame.attributeChanges.length, 0);

  instance.choose('');
  assert.equal(sqlFrame.getAttribute('src'), originalUrl);
  assert.equal(instance.cards[1].hidden, false);
  assert.deepEqual(sqlFrame.attributeChanges, [
    { name: 'src', value: null }, { name: 'src', value: originalUrl },
  ]);

  instance.choose('');
  assert.equal(sqlFrame.attributeChanges.length, 2);
  assert.equal(pythonFrame.attributeChanges.length, 0);
  instance.choose('Python');
  instance.choose('');
  assert.equal(sqlFrame.getAttribute('src'), originalUrl);
  assert.equal(sqlFrame.attributeChanges.length, 4);
});

test('reinicializar não duplica listeners nem altera o filtro ativo', () => {
  const instance = browser(['Python', 'Power BI']);
  const documentRoot = documentWith(instance);
  initTopicFilters(documentRoot);
  instance.choose('Python');
  initTopicFilters(documentRoot);

  assert.deepEqual(selectedTopics(instance), ['Python']);
  assert.deepEqual(visibleTopics(instance), ['Python']);
  for (const button of instance.buttons) assert.equal(button.listeners.get('click').length, 1);
});
