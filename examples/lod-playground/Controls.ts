export interface NumberFieldOptions {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  slider?: boolean;
  disabled?: boolean;
  onInput: (value: number) => void;
}

export interface ToggleOptions {
  label: string;
  tooltip: string;
  checked: boolean;
  disabled?: boolean;
  onInput: (checked: boolean) => void;
}

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  tooltip?: string;
}

export interface ChoiceOptions<T extends string | number> {
  label?: string;
  tooltip: string;
  value: T;
  options: ChoiceOption<T>[];
  onInput: (value: T) => void;
}

let nextId = 0;

export function createSection(parent: HTMLElement, title: string, tooltip?: string): HTMLElement {
  const section = createElement('section', 'section');
  const heading = createElement('h3', 'section-title');
  const body = createElement('div', 'section-body');

  heading.textContent = title;

  if (tooltip !== undefined) heading.dataset['tooltip'] = tooltip;

  section.append(heading, body);
  parent.append(section);

  return body;
}

export function createNumberField(parent: HTMLElement, options: NumberFieldOptions): HTMLInputElement {
  const id = `field-${nextId++}`;
  const field = createElement('div', 'field');
  const label = createLabel(options.label, options.tooltip, id);
  const control = createElement('div', 'field-control');
  const number = createElement('input', 'number');

  number.type = 'number';
  number.id = id;
  number.dataset['key'] = options.label;
  setRange(number, options);
  number.value = formatInput(options.value);
  number.disabled = options.disabled === true;

  if (options.slider !== false) {
    const range = createElement('input', 'range');

    range.type = 'range';
    range.tabIndex = -1;
    range.setAttribute('aria-hidden', 'true');
    setRange(range, options);
    range.value = String(options.value);
    range.disabled = options.disabled === true;
    range.addEventListener('input', () => {
      number.value = formatInput(range.valueAsNumber);
      options.onInput(range.valueAsNumber);
    });
    number.addEventListener('input', () => {
      range.value = number.value;
    });
    control.append(range);
  }

  number.addEventListener('input', () => {
    const value = number.valueAsNumber;

    if (Number.isFinite(value) && value >= options.min) options.onInput(Math.min(value, options.max));
  });

  control.append(number);
  field.append(label, control);
  field.classList.toggle('is-disabled', options.disabled === true);
  parent.append(field);

  return number;
}

export function createToggle(parent: HTMLElement, options: ToggleOptions): HTMLInputElement {
  const id = `field-${nextId++}`;
  const field = createElement('div', 'field toggle');
  const input = createElement('input', 'switch');

  input.type = 'checkbox';
  input.id = id;
  input.dataset['key'] = options.label;
  input.checked = options.checked;
  input.disabled = options.disabled === true;
  input.addEventListener('change', () => {
    options.onInput(input.checked);
  });

  field.classList.toggle('is-disabled', options.disabled === true);
  field.append(createLabel(options.label, options.tooltip, id), input);
  parent.append(field);

  return input;
}

export function createFlag(parent: HTMLElement, options: ToggleOptions): void {
  const label = createElement('label', 'flag');
  const input = createElement('input');
  const text = createElement('span');

  input.type = 'checkbox';
  input.dataset['key'] = `flag:${options.label}`;
  input.checked = options.checked;
  input.disabled = options.disabled === true;
  input.addEventListener('change', () => {
    options.onInput(input.checked);
  });
  text.textContent = options.label;
  label.dataset['tooltip'] = options.tooltip;
  label.classList.toggle('is-disabled', options.disabled === true);
  label.append(input, text);
  parent.append(label);
}

export function createChoice<T extends string | number>(parent: HTMLElement, options: ChoiceOptions<T>): HTMLElement {
  const group = createElement('div', 'segmented');
  const buttons: HTMLButtonElement[] = [];

  group.setAttribute('role', 'group');

  for (const option of options.options) {
    const button = createElement('button', 'segment');

    button.type = 'button';
    button.textContent = option.label;
    button.dataset['key'] = `${options.label ?? options.tooltip}:${option.label}`;
    button.setAttribute('aria-pressed', String(option.value === options.value));

    if (option.tooltip !== undefined) button.dataset['tooltip'] = option.tooltip;

    button.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      options.onInput(option.value);
    });
    buttons.push(button);
    group.append(button);
  }

  if (options.label === undefined) {
    group.dataset['tooltip'] ??= options.tooltip;
    parent.append(group);

    return group;
  }

  const field = createElement('div', 'field stacked');
  const label = createElement('span', 'field-label');

  label.textContent = options.label;
  label.dataset['tooltip'] = options.tooltip;
  group.setAttribute('aria-label', options.label);
  field.append(label, group);
  parent.append(field);

  return field;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  if (className !== undefined) element.className = className;

  return element;
}

function createLabel(text: string, tooltip: string, id: string): HTMLLabelElement {
  const label = createElement('label', 'field-label');

  label.htmlFor = id;
  label.textContent = text;
  label.dataset['tooltip'] = tooltip;

  return label;
}

function setRange(input: HTMLInputElement, options: NumberFieldOptions): void {
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
}

function formatInput(value: number): string {
  return String(Number(value.toPrecision(6)));
}
