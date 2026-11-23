const initialized = new WeakSet();

// All cards remain in the HTML: filtering is a progressive enhancement.
export function initTopicFilters(documentRoot) {
  documentRoot.querySelectorAll('[data-topic-browser]').forEach(container => {
    if (initialized.has(container)) return;
    const controls = container.querySelector('[data-topic-controls]');
    const status = container.querySelector('[data-topic-status]');
    if (!controls || !status) return;
    const buttons = [...container.querySelectorAll('[data-topic]')];
    const cards = [...container.querySelectorAll('[data-topic-card]')];
    const empty = container.querySelector('[data-topic-empty]');
    const suspendedPlayers = new WeakMap();
    const noun = count => count === 1 ? container.dataset.topicSingular : container.dataset.topicPlural;
    const matches = (card, topic) => !topic || card.dataset.topicCard === topic;

    function selectTopic(topic) {
      let visible = 0;
      cards.forEach(card => {
        const show = matches(card, topic);
        if (show) visible++;
        // Unload hidden players so audio cannot continue behind the filter.
        // The original validated embed URL is restored without autoplay.
        if (!show && !card.hidden) {
          suspendedPlayers.set(card, [...card.querySelectorAll('iframe[src]')].map(frame => {
            const src = frame.getAttribute('src');
            frame.removeAttribute('src');
            return { frame, src };
          }));
        } else if (show && card.hidden) {
          for (const { frame, src } of suspendedPlayers.get(card) || []) frame.setAttribute('src', src);
          suspendedPlayers.delete(card);
        }
        card.hidden = !show;
      });
      buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.topic === topic)));
      status.textContent = `${visible} ${noun(visible)} em ${topic || 'todos os temas'}.`;
      if (empty) empty.hidden = visible !== 0;
    }

    buttons.forEach(button => {
      const topic = button.dataset.topic;
      const count = cards.filter(card => matches(card, topic)).length;
      button.querySelector('[data-topic-count]').textContent = String(count);
      button.setAttribute('aria-label', `${topic || 'Todos'}: ${count} ${noun(count)}`);
      button.addEventListener('click', () => selectTopic(topic));
    });
    selectTopic('');
    initialized.add(container);
    controls.hidden = false;
  });
}

if (typeof document !== 'undefined') initTopicFilters(document);
