import { createElement } from './Controls.js';
import type { SourceFile } from './ModelFiles.js';

/**
 * Asks which of the models found in an opened folder to open, all checked at first. Resolves with the checked models, or with none when
 * the dialog is canceled.
 */
export async function pickModels(models: SourceFile[]): Promise<SourceFile[]> {
  const dialog = createElement('dialog', 'model-dialog');
  const form = createElement('form');
  const title = createElement('h2', 'model-dialog-title');
  const summary = createElement('p', 'model-dialog-summary');
  const list = createElement('div', 'model-dialog-list');
  const actions = createElement('div', 'model-dialog-actions');
  const selectAll = createButton('Select all', 'tool-button');
  const selectNone = createButton('Select none', 'tool-button');
  const cancel = createButton('Cancel', 'tool-button');
  const open = createButton('', 'tool-button primary');
  const inputs = models.map((model) => createModelRow(list, model));
  const update = (): void => {
    const count = inputs.filter((input) => input.checked).length;

    open.textContent = count === 1 ? 'Open 1 model' : `Open ${count} models`;
    open.disabled = count === 0;
  };

  form.method = 'dialog';
  title.textContent = 'Open models';
  summary.textContent = `${models.length} models found. Choose the ones to open, each in its own tab.`;
  open.type = 'submit';
  selectAll.addEventListener('click', () => {
    setChecked(inputs, true);
    update();
  });
  selectNone.addEventListener('click', () => {
    setChecked(inputs, false);
    update();
  });
  list.addEventListener('change', update);
  actions.append(selectAll, selectNone, createElement('span', 'spacer'), cancel, open);
  form.append(title, summary, list, actions);
  dialog.append(form);
  document.body.append(dialog);
  update();
  dialog.showModal();
  open.focus();

  const isOpen = await waitForAnswer(dialog, form, cancel);

  dialog.close();
  dialog.remove();

  return isOpen ? models.filter((_, i) => inputs[i].checked) : [];
}

/**
 * Resolves with true when the form is submitted (the open button or Enter), false when it is canceled (cancel button or Escape).
 */
async function waitForAnswer(dialog: HTMLDialogElement, form: HTMLFormElement, cancel: HTMLButtonElement): Promise<boolean> {
  return new Promise((resolve) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      resolve(true);
    });
    cancel.addEventListener('click', () => {
      resolve(false);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      resolve(false);
    });
  });
}

function createModelRow(list: HTMLElement, model: SourceFile): HTMLInputElement {
  const row = createElement('label', 'model-dialog-row');
  const input = createElement('input');
  const name = createElement('span', 'model-dialog-name');
  const folder = createElement('span', 'model-dialog-folder');
  const index = model.path.lastIndexOf('/');

  input.type = 'checkbox';
  input.checked = true;
  name.textContent = model.file.name;
  folder.textContent = index === -1 ? '' : model.path.slice(0, index + 1);
  row.title = model.path;
  row.append(input, name, folder);
  list.append(row);

  return input;
}

function createButton(text: string, className: string): HTMLButtonElement {
  const button = createElement('button', className);

  button.type = 'button';
  button.textContent = text;

  return button;
}

function setChecked(inputs: HTMLInputElement[], checked: boolean): void {
  for (const input of inputs) input.checked = checked;
}
