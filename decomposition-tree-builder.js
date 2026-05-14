(function () {
  class DecompositionTreeBuilderPanel extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: "open" }); }
    connectedCallback() { this.render(); }
    render() {
      this.shadowRoot.innerHTML = `<style>:host{display:block;font-family:Arial,sans-serif;padding:12px;color:#0f172a}.hint{font-size:12px;color:#64748b;line-height:1.4}</style><strong>Decomposition Tree</strong><div class="hint">Starter builder panel. Data binding will be added in the next iteration.</div>`;
    }
  }
  customElements.define("com-company-decomposition-tree-builder", DecompositionTreeBuilderPanel);
})();
