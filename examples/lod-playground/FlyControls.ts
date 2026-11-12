import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';

type DragMode = 'pan' | 'vertical' | 'look';

/** Keyboard speed, in scene scales per second. */
const moveSpeed = 0.5;
const fastFactor = 4;
/** Wheel step of one notch, in scene scales. */
const wheelStep = 0.08;
const maxWheelNotches = 3;
/** Look sensitivity, in radians per pixel. */
const lookSpeed = 0.0035;
const maxPitch = Math.PI / 2 - 0.01;

const moveKeys: Record<string, [number, number, number]> = {
  KeyW: [0, 0, 1],
  KeyS: [0, 0, -1],
  KeyA: [-1, 0, 0],
  KeyD: [1, 0, 0],
  KeyE: [0, 1, 0],
  KeyQ: [0, -1, 0]
};

const direction = new Vector3();
const forward = new Vector3();
const right = new Vector3();

/**
 * Game-like camera controls: the camera moves at constant speed and turns on itself, without a target. W A S D move on the ground plane,
 * E and Q up and down, Shift is faster. Drag moves on the ground plane, Alt + drag up and down, right drag or Shift + drag looks around.
 * The wheel moves a fixed step along the ray under the cursor. With touch, one finger moves, two fingers pinch forward and twist to turn.
 */
export class FlyControls {
  /** Called when the user starts moving the camera. */
  onStart: (() => void) | null = null;
  /** Called after every camera change. */
  onChange: (() => void) | null = null;
  /** Lowest height of the camera. */
  minHeight = 0;
  /** Largest distance of the camera from the origin. */
  maxDistance = Infinity;
  private isEnabled = true;
  private scale = 1;
  private yaw = 0;
  private pitch = 0;
  private dragMode: DragMode | null = null;
  private readonly pressed = new Set<string>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private fast = false;

  constructor(private readonly camera: PerspectiveCamera, private readonly element: HTMLElement) {
    camera.rotation.order = 'YXZ';
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  set enabled(value: boolean) {
    this.isEnabled = value;

    if (!value) this.onBlur();
  }

  /**
   * Sets the size of the scene that the speeds refer to, usually the distance of the default view from what it looks at.
   */
  setScale(scale: number): void {
    this.scale = scale;
  }

  /**
   * Places the camera at `position`, looking at `target`.
   */
  setView(position: Vector3, target: Vector3): void {
    direction.subVectors(target, position).normalize();
    this.camera.position.copy(position);
    this.yaw = Math.atan2(-direction.x, -direction.z);
    this.pitch = Math.asin(MathUtils.clamp(direction.y, -1, 1));
    this.apply();
  }

  /**
   * Moves the camera by the keys held, with `delta` in seconds. Returns whether the camera moved.
   */
  update(delta: number): boolean {
    if (this.pressed.size === 0 || delta === 0) return false;

    let x = 0;
    let y = 0;
    let z = 0;

    for (const code of this.pressed) {
      const move = moveKeys[code];

      x += move[0];
      y += move[1];
      z += move[2];
    }

    const length = Math.hypot(x, y, z);

    if (length === 0) return false;

    const distance = (moveSpeed * this.scale * (this.fast ? fastFactor : 1) * delta) / length;

    this.moveHorizontal(x * distance, z * distance);
    this.camera.position.y += y * distance;
    this.apply();

    return true;
  }

  dispose(): void {
    const element = this.element;

    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('pointermove', this.onPointerMove);
    element.removeEventListener('pointerup', this.onPointerUp);
    element.removeEventListener('pointercancel', this.onPointerUp);
    element.removeEventListener('wheel', this.onWheel);
    element.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  /**
   * Moves the camera `sideways` to its right and `ahead` on the ground plane, whatever its pitch.
   */
  private moveHorizontal(sideways: number, ahead: number): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    forward.set(-sin, 0, -cos);
    right.set(cos, 0, -sin);
    this.camera.position.addScaledVector(right, sideways).addScaledVector(forward, ahead);
  }

  /**
   * Keeps the camera inside its bounds and writes its orientation.
   */
  private apply(): void {
    const position = this.camera.position;

    if (position.y < this.minHeight) position.y = this.minHeight;
    if (position.length() > this.maxDistance) position.setLength(this.maxDistance);

    this.pitch = MathUtils.clamp(this.pitch, -maxPitch, maxPitch);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.updateMatrixWorld();
    this.onChange?.();
  }

  /** World units moved by one pixel of drag: the ground at the scene scale follows the pointer. */
  private getPanPerPixel(): number {
    return (2 * this.scale * Math.tan(MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(this.element.clientHeight, 1);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.isEnabled || (event.pointerType !== 'touch' && event.button > 2)) return;

    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (event.pointerType === 'touch') this.dragMode = this.pointers.size === 1 ? 'pan' : null;
    else if (event.button === 2 || event.shiftKey) this.dragMode = 'look';
    else this.dragMode = event.altKey ? 'vertical' : 'pan';

    this.onStart?.();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);

    if (!this.isEnabled || previous === undefined) return;

    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;

    if (this.pointers.size === 2) {
      this.onTwoPointers(event.pointerId, event.clientX, event.clientY);

      return;
    }

    previous.x = event.clientX;
    previous.y = event.clientY;

    if (this.dragMode === null) return;

    switch (this.dragMode) {
      case 'pan': {
        const step = this.getPanPerPixel();

        this.moveHorizontal(-dx * step, dy * step);
        break;
      }
      case 'vertical':
        this.camera.position.y += dy * this.getPanPerPixel();
        break;
      case 'look':
        this.yaw -= dx * lookSpeed;
        this.pitch -= dy * lookSpeed;
        break;
    }

    this.apply();
  };

  /**
   * Moves forward by the change of distance between two touches, and turns by the change of their angle.
   */
  private onTwoPointers(id: number, x: number, y: number): void {
    let other: { x: number; y: number } | null = null;

    for (const [key, value] of this.pointers) {
      if (key !== id) other = value;
    }

    const current = this.pointers.get(id)!;

    if (other === null) return;

    const before = Math.hypot(current.x - other.x, current.y - other.y);
    const after = Math.hypot(x - other.x, y - other.y);
    const angleBefore = Math.atan2(current.y - other.y, current.x - other.x);
    const angleAfter = Math.atan2(y - other.y, x - other.x);

    current.x = x;
    current.y = y;
    this.camera.getWorldDirection(direction);
    this.camera.position.addScaledVector(direction, (after - before) * this.getPanPerPixel());
    this.yaw += MathUtils.euclideanModulo(angleAfter - angleBefore + Math.PI, Math.PI * 2) - Math.PI;
    this.apply();
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);

    if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);

    this.dragMode = this.pointers.size === 1 && event.pointerType === 'touch' ? 'pan' : null;
  };

  /**
   * Moves a fixed step along the ray under the cursor for every wheel notch, whatever the device reports per notch.
   */
  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.isEnabled) return;

    event.preventDefault();

    const perNotch = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 3 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 1 : 100;
    const notches = MathUtils.clamp((event.deltaY / perNotch) * (event.ctrlKey ? 10 : 1), -maxWheelNotches, maxWheelNotches);

    if (notches === 0) return;

    const bounds = this.element.getBoundingClientRect();

    direction.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1, 0.5);
    direction.unproject(this.camera).sub(this.camera.position).normalize();

    this.onStart?.();
    this.camera.position.addScaledVector(direction, -notches * wheelStep * this.scale);
    this.apply();
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.fast = event.shiftKey;

    if (!this.isEnabled || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
    if (!Object.hasOwn(moveKeys, event.code)) return;

    event.preventDefault();

    if (this.pressed.size === 0) this.onStart?.();

    this.pressed.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.fast = event.shiftKey;
    this.pressed.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.pressed.clear();
    this.fast = false;
  };
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}
