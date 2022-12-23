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
      unlistedItem: {
        type: Object
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
      if (!this.unlistedItem) {
        // No items
        return this.renderNoItems();
      }
    }

    // Initial stuff done... Now do real work

    let hasPlaceholders = false;

    // We might need to optimize this... O((log2*this._cvsItems.length)*listSize)
    // for (let idx = 0; idx < listSize; idx++) {
    //   // Check if the item exists
    //   const elementIdx = this._itemsBinarySearch(this._currentRow + idx);
    //   if (elementIdx > -1) {
    //     // Item exists - render it
    //     this._itemList[idx] = this._cvsItems[elementIdx];
    //   } else {
    //     // Item does not exist - render placeholder
    //     hasPlaceholders = true;
    //     this._itemList[idx] = { listId: this._currentRow + idx, placeholder: true };
    //   }
    // }

    // Request new items if we find a placeholder
    // if (hasPlaceholders) {
    //   const placeholderPositions = this._itemList.filter(e => e.placeholder);
    //   this.dispatchEvent(new CustomEvent('cvs-request-items', {
    //     bubbles: true,
    //     composed: true,
    //     detail: {
    //       direction: this._scrollDirection,
    //       index: this._scrollDirection === 'up' ? placeholderPositions[placeholderPositions.length-1].listId : placeholderPositions[0].listId
    //     }
    //   }));
    // }

    return html`
      <lit-virtualizer
        id="list"
        @visibilityChanged=${this._onVisibilityChanged}
        .items=${this._cvsItems}
        scroller
        .renderItem=${item => this._renderLine(item)}>
      </lit-virtualizer>
      ${this.unlistedItem ? this._renderLine(this.unlistedItem) : ''}
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
    if (this.dataSize === undefined || this.dataSize === 0) this.dataSize = this.items.length;

    this._cvsItems = JSON.parse(JSON.stringify(this.items));
    const offset = (this.startIndex || 0);

    // If there are no items no need to calculate rowHeight, scrollTop, etc...
    if (this._cvsItems.length === 0) return;

    for (let idx = 0; idx < this._cvsItems.length; idx++) {
      this._cvsItems[idx].listId = offset + idx + Math.min(this.dataSize - (offset + this._cvsItems.length) , 0);
    }

    this.requestUpdate();

    await this.updateComplete;
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

  scrollToIndex (idx, position='center') {
    const virtualList = this.shadowRoot.getElementById('list');
    if (virtualList) virtualList.scrollToIndex(idx, position);
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
  }

  _onScroll (event) {
    if (this.scrollTop < this._oldScrollTop) {
      this._scrollDirection = 'up';
    } else if (this.scrollTop > this._oldScrollTop) {
      this._scrollDirection = 'down';
    } else {
      this._scrollDirection = 'none';
    }
    this._oldScrollTop = this.scrollTop;
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

    let listHasUnlisted = false
    if (this.unlistedItem && (!itemList || itemList.length === 0 || itemList[itemList.length-1].listId >= this.dataSize-1) )  {
      listHasUnlisted = true;
      itemList.push(this.unlistedItem);
    }

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
        if (dir === 'up' && (itemList[selectedIdx].listId - 1 > -1 || this.unlistedItem)) {
          this.scrollToIndex(this._firstVisibileItem-1,'nearest');
          if (itemList[selectedIdx-1]) this.selectedItem = itemList[selectedIdx-1].id;
        } else if (dir === 'down' && (itemList[selectedIdx].listId + 1 <= this.dataSize-1 || this.unlistedItem)) {
          if (selectedIdx+1 > 1) this.scrollToIndex(this._lastVisibileItem+1,'nearest');
          if (itemList[selectedIdx+1]) this.selectedItem = itemList[selectedIdx+1].id;
        } 
      }
    }
  }

  _confirmSelection () {
    let item = this._getVisibleItems().filter(e => e.id == this.selectedItem)?.[0];
    
    if (!item && this.unlistedItem) item = this.unlistedItem;

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