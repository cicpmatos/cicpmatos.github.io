import nunjucks from 'nunjucks';
import { markdown, categories } from './lib/content.mjs';
import { validateSources } from './lib/validate.mjs';
import { youtubeVideoId } from './lib/videos.mjs';
import { copyPublicFiles, staticPublicFiles } from './lib/public-output.mjs';

export default function (config) {
  config.on('eleventy.before', validateSources);
  config.setLibrary('md', markdown);
  config.setLibrary('njk', new nunjucks.Environment(new nunjucks.FileSystemLoader('content/_includes'), { autoescape: true }));
  config.on('eleventy.after', () => copyPublicFiles());
  for (const file of [...staticPublicFiles, 'assets/uploads']) config.addWatchTarget(file);
  config.addGlobalData('site', { title: 'Caio Matos', url: 'https://caiomatos.com.br' });
  config.addGlobalData('topics', categories);
  config.addCollection('posts', api => api.getFilteredByTag('post').sort((a, b) => {
    return (Date.parse(b.data.date || '') || 0) - (Date.parse(a.data.date || '') || 0) || a.data.title.localeCompare(b.data.title, 'pt-BR');
  }));
  config.addCollection('personal', api => api.getFilteredByTag('post').filter(post => post.data.category === 'Pessoal').sort((a, b) => (Date.parse(b.data.date || '') || 0) - (Date.parse(a.data.date || '') || 0)));
  config.addCollection('videos', api => api.getFilteredByTag('video').sort((a, b) =>
    (Date.parse(b.data.date || '') || 0) - (Date.parse(a.data.date || '') || 0) || a.data.title.localeCompare(b.data.title, 'pt-BR')));
  config.addFilter('youtubeVideoId', youtubeVideoId);
  config.addFilter('displayDate', value => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(`${value}T12:00:00Z`);
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  });
  config.addFilter('isoDate', value => value instanceof Date ? value.toISOString().slice(0, 10) : value);
  return { dir: { input: 'content', includes: '_includes', output: '_site' }, templateFormats: ['md', 'njk'], markdownTemplateEngine: false, htmlTemplateEngine: false };
}
