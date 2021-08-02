import { LitElement, html, css, unsafeCSS } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

class CasperVirtualScroller extends LitElement {

  static get properties() {
    return {
      items: {
        type: Array
      },
      startIndex: {
        type: Number
      },
      dataSize: {
        type: Number
      },
      selectedItem: {
        type: String
      },
      textProp: {
        type: String
      },
      idProp: {
        type: String
      },
      lineCss: {
        type: String
      },
      renderPlaceholder: {
        type: Function
      },
      renderLine: {
        type: Function
      },
      renderNoItems: {
        type: Function
      },
      height: {
        type: Number
      },
      width: {
        type: Number
      },
      unsafeRender: {
        type: Boolean
      },
      delaySetup: {
        type: Boolean
      },
      loading: {
        type: Boolean
      },
      _currentRow: {
        type: Number,
        attribute: false
      },
      _cvsItems: {
        type: Array,
        attribute: false
      }
    }
  }

  constructor () {
    super();
    this._oldScrollTop = 0;
    this._scrollDirection = 'none';
    this.idProp = 'id';
    this.textProp = 'name';
  }

  connectedCallback () {
    super.connectedCallback();
    this.addEventListener('scroll', (event) => { this._onScroll(event) });

    this._renderLine = this.unsafeRender ? this._renderLineUnsafe : this._renderLineSafe;
    this.renderNoItems = this.renderNoItems || this._renderNoItems;
    this.renderPlaceholder = (this.renderPlaceholder || this._renderPlaceholder);
  }

  updated (changedProperties) {
    if (changedProperties.has('items') && changedProperties.get('items') !== undefined) {
      if (JSON.stringify(this.items) !== JSON.stringify(changedProperties.get('items'))) {
        this.initialSetup();
      }
    }
  }

  async initialSetup () {
    this._currentRow = 0;
    this._rowHeight = -1;
    this._setupDone = false;
    if (this.dataSize === undefined) this.dataSize = this.items.length;

    this._cvsItems = JSON.parse(JSON.stringify(this.items));
    const offset = (this.startIndex || 0);

    this._wrapperHeight = (this.height || Math.round(Number(this.style.maxHeight.slice(0,-2))) || 300 );

    // If there are no items no need to calculate rowHeight, scrollTop, etc...
    if (this._cvsItems.length === 0) return;

    for (let idx = 0; idx < this._cvsItems.length; idx++) {
      this._cvsItems[idx].listId = offset + idx + Math.min(this.dataSize - (offset + this._cvsItems.length) , 0);
    }

    await this.updateComplete;

    this._rowHeight = this.shadowRoot.querySelector('.item-row').getBoundingClientRect().height;

    this.requestUpdate();

    await this.updateComplete;

    this.scrollTop = (offset * this._rowHeight);

    // Current row cant go higher than this.dataSize-listSize and lower than 0
    this._currentRow = Math.max(0, Math.min(this.dataSize, Math.round(this.scrollTop / this._rowHeight)));

    this._wrapperHeight = Math.min(this._rowHeight*this.items.length, this._wrapperHeight);

    this.requestUpdate();

    await this.updateComplete;
  }

  updateHeight (height) {
    this._wrapperHeight = height;
    this.requestUpdate();
  }

  refreshHeight () {
    this._wrapperHeight = (this.height || Math.round(Number(this.style.maxHeight.slice(0,-2))) || 300 );
    this.requestUpdate();
  }

  appendBeginning (index, data) {
    for (let idx = 0; idx < data.length; idx++) {
      data[idx].listId = idx + index;
    }

    const sortedArray = data.concat(this._cvsItems).sort((a,b) => (a.listId > b.listId) ? 1 : ((b.listId > a.listId) ? -1 : 0));
    const simpleUniqueArray = [...new Set(sortedArray.map(i => i.listId))];

    let uniqueArray = [];
    let lastIdx = 0;
    for (const it of simpleUniqueArray) {
      for (let idx = lastIdx; idx < sortedArray.length; idx++) {
        if (it == sortedArray[idx].listId) {
          uniqueArray.push(sortedArray[idx]);
          lastIdx = idx;
          break;
        };
      }
    }

    this._cvsItems = uniqueArray;
    this.startIndex = index;
  }

  appendEnd (index, data) {
    for (let idx = 0; idx < data.length; idx++) {
      data[idx].listId = idx + index + Math.min(this.dataSize - (index + data.length), 0);
    }

    const sortedArray = this._cvsItems.concat(data).sort((a,b) => (a.listId > b.listId) ? 1 : ((b.listId > a.listId) ? -1 : 0));
    const simpleUniqueArray = [...new Set(sortedArray.map(i => i.listId))];

    let uniqueArray = [];
    let lastIdx = 0;
    for (const it of simpleUniqueArray) {
      for (let idx = lastIdx; idx < sortedArray.length; idx++) {
        if (it == sortedArray[idx].listId) {
          uniqueArray.push(sortedArray[idx]);
          lastIdx = idx;
          break;
        };
      }
    }

    this._cvsItems = uniqueArray;
  }

  getCurrentRow () {
    return this._currentRow;
  }

  scrollToIndex (idx) {
    this.scrollTop = idx * this._rowHeight;
  }

  scrollToId (id) {
    for (let idx = 0; idx < this._cvsItems.length; idx++) {
      if (this._cvsItems[idx][this.idProp] == id) {
        this.scrollToIndex(this._cvsItems[idx].listId);
        break;
      }
    }
  }

  _onScroll (event) {
    if (this._scrollTicking) {
      window.cancelAnimationFrame(this._scrollTicking);
      this._scrollTicking = null;
    }
    this._scrollTicking = window.requestAnimationFrame(() => {
      // Current row cant go higher than this.dataSize-listSize and lower than 0
      this._currentRow = Math.max(0, Math.min(this.dataSize, Math.round(this.scrollTop / this._rowHeight)));
    });

    if (this.scrollTop < this._oldScrollTop) {
      this._scrollDirection = 'up';
    } else if (this.scrollTop > this._oldScrollTop) {
      this._scrollDirection = 'down';
    } else {
      this._scrollDirection = 'none';
    }

    this._oldScrollTop = this.scrollTop;
  }

  _lineCommonStyle () {
    return css`
      .item-row {
        padding: 5px 5px 5px 10px;
        white-space: nowrap;
      }
    `
  }

  _renderLineUnsafe (item) {
    return html`
      <style>
        ${this._lineCommonStyle()}
        ${this.lineCss ? unsafeCSS(this.lineCss) : ''}
      </style>
      <div class="item-row" @click="${this._lineClicked.bind(this, item)}" ?active="${this.selectedItem && item[this.idProp] == this.selectedItem}">
        ${item.unsafeHTML ? unsafeHTML(item.unsafeHTML) : this.renderPlaceholder() }
      </div>
    `;
  }

  _renderLineSafe (item) {
    return html`
      <style>
        ${this._lineCommonStyle()}
      </style>
      <div class="item-row" @click="${this._lineClicked.bind(this, item)}" ?active="${this.selectedItem && item[this.idProp] == this.selectedItem}">
        ${this.renderLine ? this.renderLine(item) : (item[this.textProp] ? item[this.textProp] : this.renderPlaceholder()) }
      </div>
    `;
  }

  _renderPlaceholder () {
    return html`
      <style>
        .placeholder-row {
          filter: blur(3px);
        }
      </style>
      <div class="placeholder-row">
        Loading data!
      </div>
    `;
  }

  _renderContainerWithoutItems () {
    const listSize = Math.min(this.dataSize, Math.round(this._wrapperHeight / this._rowHeight));

    return html`
      <style>
        :host {
          display: block;
          overflow: auto;
          width: ${this.width ? (this.width+'px') : 'fit-content'};
          height: ${(this._rowHeight * listSize) + 'px'};
        }
        :host .top-padding {
          height: ${(this._currentRow * this._rowHeight) + 'px'};
        }
        :host .bottom-padding {
          height: ${(((this.dataSize - listSize - this._currentRow) * this._rowHeight) + this._wrapperHeight) + 'px'};
        }
      </style>
      <div class="top-padding"></div>
      <div class="bottom-padding"></div>
    `;
  }

  _renderNoItems () {
    return html `
      <style>
        .no-item-div {
          text-align: center;
          padding: 20px;
        }
      </style>
      <div class="no-item-div">No items</div>
    `
  }

  _renderLoading () {
    return html `
      <style>
        .spinner-container {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100%;
          padding: 20px;
          min-width: 150px;
          min-height: 100px;
        }
        .spinner {
          --paper-spinner-stroke-width: 5px;
          --paper-spinner-layer-1-color: var(--primary-color);
          --paper-spinner-layer-2-color: var(--primary-color);
          --paper-spinner-layer-3-color: var(--primary-color);
          --paper-spinner-layer-4-color: var(--primary-color);
          width: 60px;
          height: 60px;
        }
      </style>

      <div class="spinner-container">
        <paper-spinner class="spinner" active></paper-spinner>
      </div>
    `
  }

  _lineClicked (item, event) {
    this.dispatchEvent(new CustomEvent('cvs-line-clicked', {
      bubbles: true,
      composed: true,
      detail: {
        id: item[this.idProp],
        name: item[this.textProp]
      }
    }));
  }

  _itemsBinarySearch (id) {
    let start = 0;
    let end = this._cvsItems.length - 1;

    while (start <= end) {
      const middle = Math.floor((start + end) / 2);
      if (this._cvsItems[middle].listId === id) {
        // Found the id
        return middle;
      } else if (this._cvsItems[middle].listId < id) {
        // Continue searching to the right
        start = middle + 1;
      } else {
        // Continue searching to the left
        end = middle - 1;
      }
    }
	  // id wasn't found
    return -1;
  }

  firstUpdated () {
    if (!this.delaySetup) {
      this.initialSetup();
    }
  }

  render () {
    console.log('render');

    if(this.loading) {
      // Loading render spinner
      return this._renderLoading();
    }

    if (this.dataSize === 0 || (this._cvsItems && this._cvsItems.length === 0)) {
      // No items
      return this._renderNoItems();
    }

    if (this._rowHeight === -1) {
      // Initial render to calculate row height
      return this._renderLine(this._cvsItems[0]);
    }

    if (this._setupDone === false) {
      // Initial render to setup scroll height
      this._setupDone = true;
      return this._renderContainerWithoutItems();
    }

    // Initial stuff done... Now do real work

    // List size cant be bigger than dataSize
    const listSize = Math.min(this.dataSize, Math.round(this._wrapperHeight / this._rowHeight));
    if (!listSize) return;

    // Current row cant go higher than this.dataSize-listSize and lower than 0
    this._currentRow = Math.max(0, Math.min(this._currentRow,this.dataSize-listSize));

    this._itemList = [];
    let hasPlaceholders = false;

    // We might need to optimize this... O((log2*this._cvsItems.length)*listSize)
    for (let idx = 0; idx < listSize; idx++) {
      // Check if the item exists
      const elementIdx = this._itemsBinarySearch(this._currentRow + idx);
      if (elementIdx > -1) {
        // Item exists - render it
        this._itemList[idx] = this._cvsItems[elementIdx];
      } else {
        // Item does not exist - render placeholder
        hasPlaceholders = true;
        this._itemList[idx] = { listId: this._currentRow + idx, placeholder: true };
      }
    }

    // Request new items if we find a placeholder
    if (hasPlaceholders) {
      const placeholderPositions = this._itemList.filter(e => e.placeholder);
      this.dispatchEvent(new CustomEvent('cvs-request-items', {
        bubbles: true,
        composed: true,
        detail: {
          direction: this._scrollDirection,
          index: this._scrollDirection === 'up' ? placeholderPositions[placeholderPositions.length-1].listId : placeholderPositions[0].listId
        }
      }));
    }

    return html`
      <style>
        :host {
          display: block;
          overflow: auto;
          width: ${this.width ? (this.width+'px') : 'fit-content'};
          height: ${(this._rowHeight * listSize) + 'px'};
        }
        :host .top-padding {
          height: ${(this._currentRow * this._rowHeight) + 'px'};
        }
        :host .bottom-padding {
          height: ${((this.dataSize - listSize - this._currentRow) * this._rowHeight) + 'px'};
        }
      </style>

      <div class="top-padding"></div>
        ${repeat(this._itemList, a => a.listId, this._renderLine.bind(this))}
      <div class="bottom-padding"></div>
    `;
  }
}

window.customElements.define('casper-virtual-scroller', CasperVirtualScroller);