export class DecompositionTreeBuilderPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `<style>
      :host { display: block; font-family: Arial, sans-serif; padding: 12px; color: #0f172a; }
      label { display: block; font-size: 12px; margin-top: 10px; color: #334155; }
      input { width: 100%; box-sizing: border-box; padding: 6px; margin-top: 4px; border: 1px solid #cbd5e1; border-radius: 6px; }
      .hint { font-size: 11px; color: #64748b; margin-top: 8px; line-height: 1.35; }
    </style>
    <strong>Decomposition Tree Feeds</strong>
    <div class="hint">Map these logical names to the fields exposed by your SAC/BW binding payload. Replace this starter panel with SAC feed controls as needed.</div>
    <label>Hierarchy / Label field<input data-key="label" placeholder="label"></label>
    <label>Node ID field<input data-key="nodeId" placeholder="id"></label>
    <label>Parent ID field<input data-key="parentId" placeholder="parentId"></label>
    <label>Actual measure<input data-key="actual" placeholder="actual"></label>
    <label>Plan measure<input data-key="plan" placeholder="plan"></label>`;

    this.shadowRoot.querySelectorAll("input").forEach(input => {
      input.addEventListener("change", () => this.emitFeedMap());
    });
  }

  emitFeedMap() {
    const feedMap = {};
    this.shadowRoot.querySelectorAll("input").forEach(input => {
      if (input.value) feedMap[input.dataset.key] = input.value;
    });
    this.dispatchEvent(new CustomEvent("propertiesChanged", { detail: { properties: { feedMap } } }));
  }
}

customElements.define("com-company-decomposition-tree-builder", DecompositionTreeBuilderPanel);
