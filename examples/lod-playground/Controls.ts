import { icon } from './Icons.js';

export interface NumberFieldOptions {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Change of the − and + buttons, a multiple of `step`. Defaults to about a hundredth of the range. */
  increment?: number;
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
  const stepper = createElement('div', 'stepper');
  const increment = options.increment ?? getIncrement(options);
  const decrease = createStepButton('minus', `Decrease ${options.label} by ${formatInput(increment)}`);
  const increase = createStepButton('plus', `Increase ${options.label} by ${formatInput(increment)}`);
  let range: HTMLInputElement | null = null;

  const updateButtons = (value: number): void => {
    decrease.disabled = options.disabled === true || value <= options.min;
    increase.disabled = options.disabled === true || value >= options.max;
  };

  const setValue = (value: number): void => {
    number.value = formatInput(value);
    number.setAttribute('aria-valuenow', String(value));
    if (range !== null) range.value = String(value);
    updateButtons(value);
  };

  const stepBy = (direction: number): void => {
    const parsed = parseInput(number.value);
    const current = Number.isFinite(parsed) ? parsed : options.value;
    const snapped = direction > 0 ? Math.floor(current / increment + 1e-6) : Math.ceil(current / increment - 1e-6);
    const value = Number(Math.min(Math.max((snapped + direction) * increment, options.min), options.max).toPrecision(6));

    setValue(value);
    options.onInput(value);
  };

  decrease.addEventListener('click', () => {
    stepBy(-1);
  });
  increase.addEventListener('click', () => {
    stepBy(1);
  });

  number.type = 'text';
  number.inputMode = 'decimal';
  number.autocomplete = 'off';
  number.spellcheck = false;
  number.id = id;
  number.dataset['key'] = options.label;
  number.setAttribute('role', 'spinbutton');
  number.setAttribute('aria-valuemin', String(options.min));
  number.setAttribute('aria-valuemax', String(options.max));
  number.setAttribute('aria-valuenow', String(options.value));
  number.value = formatInput(options.value);
  number.disabled = options.disabled === true;
  number.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    event.preventDefault();
    stepBy(event.key === 'ArrowUp' ? 1 : -1);
  });
  number.addEventListener('change', () => {
    const parsed = parseInput(number.value);

    setValue(Number.isFinite(parsed) ? Math.min(Math.max(parsed, options.min), options.max) : Number(range?.value ?? options.value));
  });

  if (options.slider !== false) {
    const slider = createElement('input', 'range');

    slider.type = 'range';
    slider.tabIndex = -1;
    slider.setAttribute('aria-hidden', 'true');
    setRange(slider, options);
    slider.value = String(options.value);
    slider.disabled = options.disabled === true;
    slider.addEventListener('input', () => {
      setValue(slider.valueAsNumber);
      options.onInput(slider.valueAsNumber);
    });
    number.addEventListener('input', () => {
      const parsed = parseInput(number.value);

      if (Number.isFinite(parsed)) slider.value = String(parsed);
    });
    control.append(slider);
    range = slider;
  }

  number.addEventListener('input', () => {
    const value = parseInput(number.value);

    if (!Number.isFinite(value)) return;

    updateButtons(value);

    if (value >= options.min) {
      number.setAttribute('aria-valuenow', String(Math.min(value, options.max)));
      options.onInput(Math.min(value, options.max));
    }
  });

  updateButtons(options.value);
  stepper.append(decrease, number, increase);
  control.append(stepper);
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

/**
 * Marks as pressed the button of `value` in a choice created by `createChoice` with its options in the order of `values`.
 */
export function selectChoice<T extends string | number>(choice: HTMLElement, values: readonly T[], value: T): void {
  const buttons = choice.querySelectorAll('button.segment');

  for (let i = 0; i < buttons.length; i++) buttons[i].setAttribute('aria-pressed', String(values[i] === value));
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

/**
 * Returns the change of the − and + buttons: about a hundredth of the range, rounded to 1, 2 or 5 times a power of ten, and never finer
 * than the step of the field.
 */
function getIncrement(options: NumberFieldOptions): number {
  const raw = (options.max - options.min) / 100;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * power;

  return Number((Math.max(Math.round(nice / options.step), 1) * options.step).toPrecision(6));
}

function createStepButton(name: 'minus' | 'plus', label: string): HTMLButtonElement {
  const button = createElement('button', 'step-button');

  button.type = 'button';
  button.tabIndex = -1;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon(name);

  return button;
}

function formatInput(value: number): string {
  return String(Number(value.toPrecision(6)));
}

/**
 * Reads a number typed with a dot or a comma as decimal separator, or NaN when the text is not a number.
 */
function parseInput(text: string): number {
  const trimmed = text.trim().replace(',', '.');

  return trimmed === '' ? NaN : Number(trimmed);
}
