// G01 executable contract probe only; not the production G03 implementation.
export class HYSelectionController {
  #key; #props; #emit; #view; #off; #applying = false; #disposed = false;
  #generation = 0; #transaction = 0; #lastApplied;
  constructor(key, props, emit) {
    if (!key) throw new Error('A stable node key is required');
    this.#key = key; this.#emit = emit; this.update(props);
  }
  update(props) {
    if (this.#disposed) return;
    const values = props.options.map(option => option.value);
    if (new Set(values).size !== values.length) throw new Error('Duplicate option value');
    if (!values.includes(props.value)) throw new Error('Unknown controlled value');
    const next = { value: props.value, disabled: !!props.disabled,
      options: props.options.map(option => ({...option})) };
    if (JSON.stringify(next) === JSON.stringify(this.#props)) return;
    this.#props = next; this.#generation++; this.#apply();
  }
  #apply() {
    if (!this.#view) return;
    const signature = JSON.stringify(this.#props);
    if (signature === this.#lastApplied) return;
    this.#applying = true;
    try { this.#view.apply(this.#props); this.#lastApplied = signature; } finally { this.#applying = false; }
  }
  attach(view) {
    if (this.#disposed) throw new Error('Selection disposed');
    if (this.#view) throw new Error('Selection already attached');
    this.#view = view;
    this.#off = view.listen((value, reason = 'pointer') => this.choose(value, reason));
    this.#apply();
  }
  choose(value, reason = 'pointer') {
    if (this.#disposed || this.#applying || this.#props.disabled) return false;
    const option = this.#props.options.find(item => item.value === value);
    if (!option || option.disabled) return false;
    if (value === this.#props.value) return false;
    this.#lastApplied = undefined;
    const transaction = ++this.#transaction;
    // Application commits exactly once, on commit. valueChange is a preview event.
    this.#emit({type:'valueChange', key:this.#key, value, reason, transaction});
    if (this.#disposed) return false;
    this.#emit({type:'commit', key:this.#key, value, reason, transaction});
    // State remains controlled: rejected changes restore the accepted value.
    this.#apply();
    return true;
  }
  async pick(open, reason = 'pointer') {
    if (this.#disposed || this.#props.disabled) return false;
    const generation = ++this.#generation;
    const value = await open();
    if (this.#disposed || generation !== this.#generation || value === null) return false;
    return this.choose(value, reason);
  }
  cancel() { this.#generation++; }
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true; this.cancel(); this.#off?.(); this.#off = undefined; this.#view = undefined;
  }
}
