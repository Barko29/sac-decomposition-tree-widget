(function () {
  class DecompositionTreeStylingPanel extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: "open" }); }
    connectedCallback() { this.render(); }
    render() {
      this.shadowRoot.innerHTML = `<style>:host{display:block;font-family:Arial,sans-serif;padding:12px;color:#0f172a}label{display:block;font-size:12px;margin-top:10px;color:#334155}input{width:100%;box-sizing:border-box;padding:6px;margin-top:4px;border:1px solid #cbd5e1;border-radius:6px}</style><strong>Decomposition Tree Styling</strong><label>Amber threshold<input type="number" step="0.01" data-key="thresholdAmber" value="0.9"></label><label>Green threshold<input type="number" step="0.01" data-key="thresholdGreen" value="1.0"></label><label>Green color<input type="color" data-key="greenColor" value="#16a34a"></label><label>Amber color<input type="color" data-key="amberColor" value="#f59e0b"></label><label>Red color<input type="color" data-key="redColor" value="#dc2626"></label>`;
      this.shadowRoot.querySelectorAll("input").forEach(input => input.addEventListener("change", () => this.emitProperties()));
    }
    emitProperties() {
      const properties = {};
      this.shadowRoot.querySelectorAll("input").forEach(input => { properties[input.dataset.key] = input.type === "number" ? Number(input.value) : input.value; });
      this.dispatchEvent(new CustomEvent("propertiesChanged", { detail: { properties } }));
    }
  }
  customElements.define("com-company-decomposition-tree-styling", DecompositionTreeStylingPanel);
})();
