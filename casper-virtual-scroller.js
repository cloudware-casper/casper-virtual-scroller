import { LitElement, html, css, unsafeCSS } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import 'wc-spinners/dist/spring-spinner.js';
import '@lit-labs/virtualizer'

class CasperVirtualScroller extends LitElement {

  static get properties() {
    return {
      items: {},
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
      unsafeRender: {
        type: Boolean
      },
      delaySetup: {
        type: Boolean
      },
      loading: {
        type: Boolean
      },
      _cvsItems: {
        type: Array,
        attribute: false
      }
    }
  }

  static styles = css`
    :host {
      --cvs-font-size: 0.875rem;
      
      font-size: var(--cvs-font-size);
      display: block;
      overflow: auto;
      border: 1px solid #AAA;
      background-color: white;
      border-radius: 0 0 3px 3px;
      transition: width 250ms linear;
      box-shadow: rgb(25 59 103 / 5%) 0px 0px 0px 1px, rgb(28 55 90 / 16%) 0px 2px 6px -1px, rgb(28 50 79 / 38%) 0px 8px 24px -4px;
    }

    .cvs__no-items {
      text-align: center;
      font-size: var(--cvs-font-size);
      padding: 0.715em;
    }

    .cvs__item-row {
      font-size: var(--cvs-font-size);
      padding: 0.3575em 0.715em;
      width: 100%;
    }

    .cvs__item-row[active] {
      background-color: var(--dark-primary-color);
      color: white;
    }

    .cvs__item-row[disabled] {
      pointer-events: none;
      opacity: 0.5;
    }

    .cvs__item-row:hover {
      background-color: var(--primary-color);
      color: white;
      cursor: pointer;
    }

    .cvs__placeholder {
      filter: blur(3px);
    }
  `;

  _items = [];
  set items(val) {
    let oldVal = this._items;
    if (Array.isArray(val)) {
      this._items = val;
    } else {
      this._items = [];  
    }
    this.requestUpdate('items', oldVal);
  }
  get items() { return this._items; }

  constructor () {
    super();
    this._oldScrollTop = 0;
    this._scrollDirection = 'none';
    this.idProp = 'id';
    this.textProp = 'name';
    this._firstVisibileItem = -1;
    this._lastVisibileItem = -1;
    this._setupDone = false;
  }

  connectedCallback () {
    super.connectedCallback();
    this.addEventListener('scroll', (event) => { this._onScroll(event) });

    this._renderLine = this.unsafeRender ? this._renderLineUnsafe : this._renderLineSafe;
    this.renderNoItems = this.renderNoItems || this._renderNoItems;
    this.renderPlaceholder = (this.renderPlaceholder || this._renderPlaceholder);
  }

  //***************************************************************************************//
  //                                ~~~ LIT life cycle ~~~                                 //
  //***************************************************************************************//

  render () {
    if(this.loading) {
      // Loading render spinner
      return this._renderLoading();
    }

    if (this.dataSize === 0 || (this._cvsItems && this._cvsItems.length === 0)) {
      return this.renderNoItems();
    }

    return html`
      <lit-virtualizer
        id="list"
        @visibilityChanged=${this._onVisibilityChanged}
        .items=${this._cvsItems}
        @scroll=${this._onScroll}
        .renderItem=${item => this._renderLine(item)}>
      </lit-virtualizer>
    `;
  }

  firstUpdated () {
    if (!this.delaySetup) {
      this.initialSetup();
    }
    this.addEventListener('keydown', this._handleKeyPress.bind(this));
  }

  updated (changedProperties) {
    if (changedProperties.has('items') && changedProperties.get('items') !== undefined) {
      if (JSON.stringify(this.items) !== JSON.stringify(changedProperties.get('items'))) {
        this.initialSetup();
      }
    }
  }

  //***************************************************************************************//
  //                               ~~~ Public functions~~~                                 //
  //***************************************************************************************//

  async initialSetup () {    
    this._setupDone = false;
    if (this.dataSize === undefined || this.dataSize === 0) this.dataSize = this.items.length;

    this._cvsItems = JSON.parse(JSON.stringify(this.items));
    const offset = (this.startIndex || 0);

    if (this._cvsItems.length === 0) return;

    for (let idx = 0; idx < this._cvsItems.length; idx++) {
      this._cvsItems[idx].listId = offset + idx + Math.min(this.dataSize - (offset + this._cvsItems.length) , 0);
    }

    for (let it = this._cvsItems[0].listId-1; it >= 0; it--) {
      this._cvsItems.unshift({ listId: it, placeholder: true });
    }

    for (let it = this._cvsItems[0].listId; it < this.dataSize; it++) {
      // Check if the item exists
      const elementIdx = this._itemsBinarySearch(it);
      if (elementIdx === -1) {
        // Item does not exist - add placeholder
        this._cvsItems.push({ listId: it, placeholder: true });
      }
    }

    this.requestUpdate();

    await this.updateComplete;

    await this.shadowRoot.getElementById('list').layoutComplete;
    this.scrollToIndex(this.startIndex,'start');
    this._setupDone = true;
  }

  appendBeginning (index, data) {
    for (let idx = 0; idx < data.length; idx++) {
      data[idx].listId = idx + index;
      this._cvsItems[data[idx].listId] = data[idx];
    }
    this.startIndex = index;
  }

  appendEnd (index, data) {
    for (let idx = 0; idx < data.length; idx++) {
      data[idx].listId = idx + index + Math.min(this.dataSize - (index + data.length), 0);
      this._cvsItems[data[idx].listId] = data[idx];
    }
  }

  scrollToIndex (idx, position='center') {
    const virtualList = this.shadowRoot.getElementById('list');
    if (virtualList && virtualList.childElementCount > 0) virtualList.scrollToIndex(idx, position);
  }

  scrollToId (id) {
    for (let idx = 0; idx < this._cvsItems.length; idx++) {
      if (this._cvsItems[idx][this.idProp] == id) {
        this.scrollToIndex(this._cvsItems[idx].listId);
        break;
      }
    }
  }

  //***************************************************************************************//
  //                              ~~~ Private functions~~~                                 //
  //***************************************************************************************//

  _onVisibilityChanged (event) {
    this._firstVisibileItem = event.first;
    this._lastVisibileItem = event.last;

    const visibleItems = this._getVisibleItems();
    // Request new items if we find a placeholder
    const placeholderItems = visibleItems.filter(i => i.placeholder);
    if (placeholderItems && placeholderItems.length > 0 && this._setupDone) {
      console.log('requesting items');
      this.dispatchEvent(new CustomEvent('cvs-request-items', {
        bubbles: true,
        composed: true,
        detail: {
          direction: this._scrollDirection,
          index: this._scrollDirection === 'up' ? placeholderItems[placeholderItems.length-1].listId : placeholderItems[0].listId
        }
      }));
    }
  }

  _onScroll (event) {
    if (!event || !event.currentTarget || !event.currentTarget.scrollTop) return;

    if (event.currentTarget.scrollTop < this._oldScrollTop) {
      this._scrollDirection = 'up';
    } else if (event.currentTarget.scrollTop > this._oldScrollTop) {
      this._scrollDirection = 'down';
    } else {
      this._scrollDirection = 'none';
    }
    this._oldScrollTop = event.currentTarget.scrollTop;
  }

  _renderLineUnsafe (item) {
    return html`
      <style>
        ${this.lineCss ? unsafeCSS(this.lineCss) : ''}
      </style>
      <div class="cvs__item-row" @click="${this._lineClicked.bind(this, item)}" ?active="${this.selectedItem && item[this.idProp] == this.selectedItem}" ?disabled=${item.disabled}>
        ${item.unsafeHTML ? unsafeHTML(item.unsafeHTML) : this.renderPlaceholder() }
      </div>
    `;
  }

  _renderLineSafe (item) {
    return html`
      <div class="cvs__item-row" @click="${this._lineClicked.bind(this, item)}" ?active="${this.selectedItem && item[this.idProp] == this.selectedItem}" ?disabled=${item.disabled}>
        ${this.renderLine ? this.renderLine(item) : (item[this.textProp] ? item[this.textProp] : this.renderPlaceholder()) }
      </div>
    `;
  }

  _renderPlaceholder () {
    return html`
      <div class="cvs__placeholder">
        Loading data!
      </div>
    `;
  }

  _renderNoItems () {
    return html `
      <div class="cvs__no-items">Sem resultados</div>
    `;
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
          --spring-spinner__color: var(--primary-color);
          --spring-spinner__duration: 1.2s;
          --spring-spinner__size: 60px;
        }
      </style>

      <div class="spinner-container">
        <spring-spinner class="spinner"></spring-spinner>
      </div>
    `
  }

  _getVisibleItems () {
    if (this._firstVisibileItem > -1 && this._lastVisibileItem > -1) {
      return this._cvsItems.slice(this._firstVisibileItem, this._lastVisibileItem+1);
    }
    return [];
  }

  _lineClicked (item, event) {
    this.dispatchEvent(new CustomEvent('cvs-line-selected', {
      bubbles: true,
      composed: true,
      detail: {
        id: item[this.idProp],
        name: item[this.textProp],
        item: item
      }
    }));
  }

  async _moveSelection (dir) {
    const itemList = this._getVisibleItems();

    if (dir && itemList && itemList.length > 0) {
      if (this.selectedItem === undefined || itemList.filter(e => e.id == this.selectedItem).length === 0) {
        this.selectedItem = itemList[0].id;
      } else {
        let selectedIdx = 0;
        for (let idx = 0; idx < itemList.length; idx++) {
          if (this.selectedItem == itemList[idx].id) {
            selectedIdx = idx;
            break;
          }
        }
        if (dir === 'up' && (itemList[selectedIdx].listId - 1 > -1)) {
          this.scrollToIndex(this._firstVisibileItem-1,'nearest');
          if (itemList[selectedIdx-1]) this.selectedItem = itemList[selectedIdx-1].id;
        } else if (dir === 'down' && (itemList[selectedIdx].listId + 1 <= this.dataSize-1)) {
          if (selectedIdx+1 > 1) this.scrollToIndex(this._lastVisibileItem+1,'nearest');
          if (itemList[selectedIdx+1]) this.selectedItem = itemList[selectedIdx+1].id;
        } 
      }
    }
  }

  _confirmSelection () {
    let item = this._getVisibleItems().filter(e => e.id == this.selectedItem)?.[0];

    if (item) {
      this.dispatchEvent(new CustomEvent('cvs-line-selected', {
        bubbles: true,
        composed: true,
        detail: {
          id: item.id,
          name: item?.[this.textProp],
          item: item
        }
      }));
    }
  }

  _handleKeyPress (event) {
    switch (event.key) {
      case 'ArrowUp':
        this._moveSelection('up');
        break;
      case 'ArrowDown':
        this._moveSelection('down');
        break;
      case 'Tab':
        this._confirmSelection();
        break;
      case 'Enter':
        this._confirmSelection();
        break;
      default:
        break;
    }
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
}

window.customElements.define('casper-virtual-scroller', CasperVirtualScroller);