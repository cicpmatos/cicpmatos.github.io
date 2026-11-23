import { youtubeVideoId } from './youtube-url.js';

export function registerVideoWidget(CMS, createClass, h) {
  const Control = createClass({
    isValid() {
      try { youtubeVideoId(this.props.value); return true; }
      catch { return { error: { message: 'Cole um link válido de um vídeo do YouTube. Links de canal, playlist ou IDs incompletos não são aceitos.' } }; }
    },
    render() {
      return h('input', {
        id: this.props.forID,
        className: this.props.classNameWrapper,
        type: 'text',
        value: this.props.value || '',
        placeholder: 'https://www.youtube.com/watch?v=…',
        spellCheck: false,
        onChange: event => this.props.onChange(event.target.value),
      });
    },
  });
  CMS.registerWidget('youtube-url', Control, props => h('p', {}, props.value || ''));
}
