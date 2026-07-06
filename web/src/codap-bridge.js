import iframePhone from 'iframe-phone';

/**
 * Host-side bridge to an embedded CODAP v3 (?embeddedServer=yes).
 *
 * Speaks the Data Interactive API over iframe-phone exactly like a plugin
 * would. Emits:
 *   'connected'         CODAP sent codap-present
 *   'raw'               every notification, untranslated (for the log)
 *   'component:create'  { id, type, title }
 *   'component:move'    { id }        'component:resize' { id }
 *   'component:delete'  { id }
 *   'selection'         { context, count }
 *   'cases:change'      { context, operation }
 *   'drag'              { phase, attribute, position }   attribute drags
 *   'activity'          fires on any user-driven event (for idle timers)
 *
 * Tile geometry: CODAP reports tile position/dimensions in document
 * coordinates; `calibration` maps those to host-page pixels (the tile
 * container sits below CODAP's menu bar + tool shelf).
 */
export class CodapBridge extends EventTarget {
  constructor(iframeEl) {
    super();
    this.iframe = iframeEl;
    this.connected = false;
    // doc -> screen mapping: screen = offset + scale * doc. CODAP v3 can
    // render its workspace scaled down at smaller viewports, so scale is
    // calibratable too. Persisted across reloads.
    this.calibration = JSON.parse(
      localStorage.getItem('spirit-animal-calibration') ?? 'null',
    ) ?? { x: 0, y: 98, scale: 1 };
    const origin = new URL(iframeEl.src).origin;
    this.phone = new iframePhone.IframePhoneRpcEndpoint(
      (msg, callback) => { this._onMessage(msg); callback?.({ success: true }); },
      'data-interactive', iframeEl, origin,
    );
  }

  request(action, resource, values) {
    return new Promise((resolve) =>
      this.phone.call({ action, resource, values }, resolve));
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  _onMessage(msg) {
    if (msg?.message === 'codap-present') {
      this.connected = true;
      this._emit('connected', {});
      // send one request so CODAP marks the phone in-use and starts
      // broadcasting notifications to us
      this.request('get', 'interactiveFrame');
      return;
    }
    this._emit('raw', msg);
    const { resource = '', values } = msg ?? {};
    const op = values?.operation;
    if (resource === 'component' || resource.startsWith('component[')) {
      const kind = { create: 'component:create', delete: 'component:delete',
                     move: 'component:move', resize: 'component:resize' }[op];
      if (kind) this._emit(kind, { id: values?.id, type: values?.type, title: values?.title });
    } else if (resource.startsWith('dataContextChangeNotice')) {
      const context = resource.match(/\[(.*)\]/)?.[1];
      if (op === 'selectCases') {
        this._emit('selection', { context, count: values?.result?.cases?.length });
      } else {
        this._emit('cases:change', { context, operation: op });
      }
    } else if (resource.startsWith('dragDrop')) {
      this._emit('drag', { phase: op, attribute: values?.text ?? values?.attribute?.name,
                           position: values?.position });
    }
    this._emit('activity', { resource, operation: op });
  }

  /** All components with screen-space bounds (host-page pixels). */
  async components() {
    const list = await this.request('get', 'componentList');
    if (!list?.success) return [];
    const out = [];
    for (const item of list.values) {
      const c = await this.request('get', `component[${item.id}]`);
      if (!c?.success) continue;
      const { position, dimensions } = c.values ?? {};
      out.push({
        id: item.id, type: item.type, title: item.title || item.name || item.type,
        bounds: position && dimensions ? this.docToScreen(position, dimensions) : null,
      });
    }
    return out;
  }

  saveCalibration() {
    localStorage.setItem('spirit-animal-calibration', JSON.stringify(this.calibration));
  }

  docToScreen(position, dimensions) {
    const r = this.iframe.getBoundingClientRect();
    const { x, y, scale } = this.calibration;
    return {
      x: r.left + x + (position.left ?? 0) * scale,
      y: r.top + y + (position.top ?? 0) * scale,
      w: (dimensions.width ?? 0) * scale,
      h: (dimensions.height ?? 0) * scale,
    };
  }
}
