export type IconName = 'open' | 'play' | 'pause' | 'plus' | 'minus' | 'copy' | 'link' | 'upload' | 'download' | 'focus' | 'alert' | 'close' | 'layers' | 'undo' | 'redo';

const paths: Record<IconName, string> = {
  open: '<path d="M2.5 12.5v-8a1 1 0 0 1 1-1h3l1.5 1.5h4.5a1 1 0 0 1 1 1v1"/><path d="M2.5 12.5 4.25 7.5h10l-1.75 5z"/>',
  play: '<path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M5.5 3.5v9M10.5 3.5v9"/>',
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  minus: '<path d="M3.5 8h9"/>',
  copy: '<rect x="5.5" y="5.5" width="7" height="7" rx="1"/><path d="M10.5 5.5v-2h-7v7h2"/>',
  link: '<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.75.75M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.75-.75"/>',
  upload: '<path d="M8 10.5v-7M5 6l3-3 3 3M3.5 10.5v2h9v-2"/>',
  download: '<path d="M8 3.5v7M5 7.5l3 3 3-3M3.5 10.5v2h9v-2"/>',
  focus: '<path d="M3.5 6V3.5H6M10 3.5h2.5V6M12.5 10v2.5H10M6 12.5H3.5V10"/><circle cx="8" cy="8" r="1.5"/>',
  alert: '<path d="M8 2.75 14 13.25H2z"/><path d="M8 6.5v3M8 11.25v.25"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  layers: '<path d="M8 2.5 13.5 5.5 8 8.5 2.5 5.5z"/><path d="M2.5 8.25 8 11.25l5.5-3M2.5 10.75 8 13.75l5.5-3"/>',
  undo: '<path d="M5.5 3.5 3 6l2.5 2.5"/><path d="M3 6h6.5a3 3 0 0 1 0 6H7"/>',
  redo: '<path d="M10.5 3.5 13 6l-2.5 2.5"/><path d="M13 6H6.5a3 3 0 0 0 0 6H9"/>'
};

export function icon(name: IconName): string {
  return `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
