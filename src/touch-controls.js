const DEAD_ZONE = .07;
const ACTIONS = { Space: 'jump', ShiftLeft: 'dive', KeyE: 'grab' };

/** Keep touch pointers independent from keyboard input, including simultaneous fingers. */
export function createTouchControls({ stick, buttons, isEnabled }) {
  const owners = new Map();
  const buttonPointers = new Map(Array.from(buttons, button => [button, new Set()]));
  let stickPointer = null;
  let movement = { x: 0, forward: 0 };

  function centerStick() {
    movement = { x: 0, forward: 0 };
    stick.style.setProperty('--stick-x', '0px');
    stick.style.setProperty('--stick-y', '0px');
    stick.classList.remove('active');
  }

  function updateStick(event) {
    const bounds = stick.getBoundingClientRect();
    const thumb = stick.querySelector('.stick-thumb');
    const thumbSize = thumb?.getBoundingClientRect().width || 0;
    const radius = Math.max(1, (Math.min(bounds.width, bounds.height) - thumbSize) / 2);
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    const distance = Math.hypot(dx, dy);
    const length = Math.min(distance / radius, 1);
    const strength = Math.pow(Math.max(0, (length - DEAD_ZONE) / (1 - DEAD_ZONE)), .75);
    const directionX = distance ? dx / distance : 0;
    const directionY = distance ? dy / distance : 0;
    movement = { x: directionX * strength, forward: -directionY * strength };
    stick.style.setProperty('--stick-x', `${directionX * length * radius}px`);
    stick.style.setProperty('--stick-y', `${directionY * length * radius}px`);
  }

  function capture(element, pointerId) {
    // Synthetic test events and a pointer already cancelled by the browser cannot be captured.
    try { element.setPointerCapture(pointerId); } catch { /* Window listeners handle release. */ }
  }

  function release(pointerId) {
    const element = owners.get(pointerId);
    if (!element) return;
    owners.delete(pointerId);
    if (element === stick) {
      stickPointer = null;
      centerStick();
    } else {
      const pointers = buttonPointers.get(element);
      pointers.delete(pointerId);
      element.classList.toggle('pressed', pointers.size > 0);
      element.setAttribute('aria-pressed', String(pointers.size > 0));
    }
    try {
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    } catch { /* It may have been released automatically on pointerup. */ }
  }

  function reset() {
    for (const pointerId of [...owners.keys()]) release(pointerId);
    centerStick();
    for (const [button, pointers] of buttonPointers) {
      pointers.clear();
      button.classList.remove('pressed');
      button.setAttribute('aria-pressed', 'false');
    }
  }

  function begin(event, element) {
    if (!isEnabled() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.cancelable) event.preventDefault();
    if (owners.has(event.pointerId)) return;
    if (element === stick && stickPointer !== null) return;
    owners.set(event.pointerId, element);
    if (element === stick) {
      stickPointer = event.pointerId;
      stick.classList.add('active');
      updateStick(event);
    } else {
      buttonPointers.get(element).add(event.pointerId);
      element.classList.add('pressed');
      element.setAttribute('aria-pressed', 'true');
    }
    capture(element, event.pointerId);
  }

  for (const element of [stick, ...buttonPointers.keys()]) {
    element.addEventListener('pointerdown', event => begin(event, element));
    element.addEventListener('lostpointercapture', event => {
      if (owners.get(event.pointerId) === element) release(event.pointerId);
    });
    element.addEventListener('contextmenu', event => event.preventDefault());
  }

  // Captured events bubble here; this also covers synthetic events without native capture.
  window.addEventListener('pointermove', event => {
    if (event.pointerId !== stickPointer) return;
    if (!isEnabled()) { reset(); return; }
    updateStick(event);
  });
  window.addEventListener('pointerup', event => release(event.pointerId));
  window.addEventListener('pointercancel', event => release(event.pointerId));

  reset();
  return {
    reset,
    read() {
      if (!isEnabled()) reset();
      const input = { ...movement, jump: false, dive: false, grab: false };
      for (const [button, pointers] of buttonPointers) {
        const action = ACTIONS[button.dataset.key];
        if (action && pointers.size) input[action] = true;
      }
      return input;
    },
  };
}
