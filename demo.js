// demo.js — Interactive terminal demos for apiari.run
// No external dependencies. Pure vanilla JS.

(function () {
  'use strict';

  const COLORS = {
    honey: '#F5A623', mint: '#7EC8A0', frost: '#A8B5C4',
    smoke: '#6B5E54', comb: '#1A1614', slate: '#3A3530',
    nectar: '#FF6B35', royal: '#8B7EC8', white: '#fff', wax: '#2A2420',
  };

  const STATUS = {
    running: { icon: '\u25CF', color: COLORS.mint, label: 'running' },
    waiting: { icon: '\u25CB', color: COLORS.honey, label: 'waiting' },
    done:    { icon: '\u25C6', color: COLORS.smoke, label: 'done' },
    failed:  { icon: '\u2717', color: COLORS.nectar, label: 'failed' },
    merging: { icon: '\u22EF', color: COLORS.honey, label: 'merging' },
  };

  const TOOL = {
    done:     { icon: '\u2714', color: COLORS.mint },
    progress: { icon: '\u22EF', color: COLORS.honey },
    failed:   { icon: '\u2717', color: COLORS.nectar },
  };

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function el(tag, cls, html) {
    const e = document.createElement(tag || 'div');
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  // ─── TerminalDemo ───────────────────────────────────────────────

  class TerminalDemo {
    constructor(id, config) {
      this.root = typeof id === 'string' ? document.getElementById(id) : id;
      if (!this.root) return;
      this.cfg = Object.assign({
        title: 'apiari ui', showKpi: false, kpi: {},
        agentMode: false, demoScript: null,
      }, config);
      this.workers = new Map();
      this.userMode = false;
      this.aborted = false;
      this.inactivityTimer = null;
      this.loopCount = 0;
      this.hintShown = false;
      this._toolEls = [];
      this._build();
      this._bind();
    }

    // ── DOM construction ──────────────────────────────────────────

    _build() {
      const r = this.root;
      r.innerHTML = '';
      r.style.cursor = 'pointer';
      r.style.position = 'relative';
      r.style.minWidth = '0';
      r.style.boxSizing = 'border-box';

      // Title bar
      r.appendChild(el('div', 'flex items-center gap-2 mb-3 pb-2 border-b border-slate',
        `<span class="w-3 h-3 rounded-full" style="background:rgba(255,107,53,0.6)"></span>
         <span class="w-3 h-3 rounded-full" style="background:rgba(245,166,35,0.6)"></span>
         <span class="w-3 h-3 rounded-full" style="background:rgba(126,200,160,0.6)"></span>
         <span class="ml-2 text-smoke text-xs">${this.cfg.title}</span>`));

      // KPI strip
      if (this.cfg.showKpi) {
        this.kpiEl = el('div', 'flex gap-4 text-xs mb-3 pb-2 border-b border-slate');
        this._renderKpi();
        r.appendChild(this.kpiEl);
      }

      // Main grid: workers | chat
      const grid = el('div', 'grid gap-3');
      grid.style.gridTemplateColumns = '130px 1fr';
      grid.style.minWidth = '0';
      grid.style.overflow = 'hidden';

      // Workers panel
      const wp = el('div', 'border border-slate rounded p-2');
      this.workersTitle = el('div', 'text-honey text-xs mb-2', 'Workers (0)');
      wp.appendChild(this.workersTitle);
      this.workersList = el('div', 'space-y-1');
      wp.appendChild(this.workersList);
      grid.appendChild(wp);

      // Chat panel
      const cp = el('div', '');
      cp.style.cssText = `border:1px solid ${COLORS.honey};border-radius:4px;padding:8px;display:flex;flex-direction:column;`;

      if (this.cfg.agentMode) {
        this.agentLabel = el('div', 'text-honey text-xs mb-2', 'hive-1');
        cp.appendChild(this.agentLabel);
      }

      this.chatArea = el('div', 'space-y-2 text-xs');
      this.chatArea.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;max-height:160px;min-height:80px;word-break:break-word;overflow-wrap:anywhere;';
      cp.appendChild(this.chatArea);

      // Input line
      this.inputLine = el('div', 'flex items-center mt-2 border-t border-slate pt-2');
      this._renderInput('');
      cp.appendChild(this.inputLine);

      grid.appendChild(cp);
      r.appendChild(grid);

      // Hint
      this.hintEl = el('div', 'text-center mt-2', 'try typing below \u2193');
      this.hintEl.style.cssText = `color:${COLORS.smoke};font-size:10px;opacity:0;transition:opacity 0.5s;`;
      r.appendChild(this.hintEl);
    }

    _renderKpi() {
      const k = this.cfg.kpi;
      this.kpiEl.innerHTML =
        `<span><span class="text-white font-semibold">Workers:</span> <span class="text-frost" data-kpi="workers">${k.workers || 0}</span></span>
         <span><span class="text-white font-semibold">Signals:</span> <span class="text-frost" data-kpi="signals">${k.signals || 0}</span></span>
         <span><span class="text-white font-semibold">PRs:</span> <span class="text-frost" data-kpi="prs">${k.prs || 0}</span></span>
         <span class="ml-auto"><span class="text-mint">\u25CF</span> <span class="text-mint">up 2h</span></span>`;
    }

    _renderInput(text) {
      this.inputLine.innerHTML =
        `<span style="color:${COLORS.smoke}">&gt;</span>` +
        `<span style="color:${COLORS.frost}" class="ml-1 _itext">${text}</span>` +
        `<span class="cursor-blink" style="color:${COLORS.honey}">\u2502</span>`;
    }

    // ── Event binding ─────────────────────────────────────────────

    _bind() {
      // Hidden input for keyboard capture
      this._input = document.createElement('input');
      this._input.type = 'text';
      this._input.setAttribute('autocomplete', 'off');
      this._input.setAttribute('autocorrect', 'off');
      this._input.setAttribute('autocapitalize', 'off');
      this._input.style.cssText = 'position:absolute;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
      this.root.appendChild(this._input);

      this.root.addEventListener('click', () => this.activateUserInput());

      // Global keydown: if this terminal is in viewport and user types, activate
      this._onKey = (e) => {
        if (!this._isInViewport()) return;
        if (e.target.tagName === 'INPUT' && e.target !== this._input) return;
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (!this.userMode) this.activateUserInput();
          this._input.focus();
        }
      };
      document.addEventListener('keydown', this._onKey);

      this._input.addEventListener('input', () => {
        if (!this.userMode) this.activateUserInput();
        this._renderInput(this._input.value);
        this._resetTimer();
      });

      this._input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const v = this._input.value.trim();
          if (v) {
            this._input.value = '';
            this._renderInput('');
            this._handleUserInput(v);
          }
          e.preventDefault();
        }
      });
    }

    _isInViewport() {
      const r = this.root.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }

    // ── User interaction ──────────────────────────────────────────

    activateUserInput() {
      if (this.userMode) { this._input.focus(); return; }
      this.userMode = true;
      this.aborted = true;
      this._input.focus();
      this._resetTimer();
    }

    _resetTimer() {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => this.resumeDemo(), 8000);
    }

    async _handleUserInput(text) {
      this._addMsg('you', text);
      const lower = text.toLowerCase();
      let resp;

      if (/\b(status|workers)\b/.test(lower)) {
        resp = '3 workers active. hive-1 is running auth middleware, hive-2 opened PR #42, cli-1 is done.';
      } else if (/\bmerge\b/.test(lower)) {
        this.updateWorker('hive-2', 'merging');
        await sleep(1000);
        this.updateWorker('hive-2', 'done');
        resp = '\u2714 PR #42 merged. Branch deleted.';
      } else if (/\b(dispatch|new task|create)\b/.test(lower)) {
        this.addWorker('hive-3', 'running');
        resp = 'Spawned hive-3 on a new worktree. Task: implement rate limiting.';
      } else if (/\b(pr|pull request|review)\b/.test(lower)) {
        resp = 'PR #42 looks good \u2014 adds JWT middleware, tests pass, CI green. Want me to merge?';
      } else if (/\b(sentry|errors)\b/.test(lower)) {
        resp = '2 Sentry errors in the last hour: NullPointerException in auth handler (\u00D712), timeout in DB pool (\u00D73). Want me to dispatch a fix?';
      } else if (/\b(github|ci)\b/.test(lower)) {
        resp = 'CI is green on PR #42. hive-1\u2019s branch has 3 commits, 2 files changed.';
      } else if (/\bhelp\b/.test(lower)) {
        resp = "Try: 'status', 'merge', 'dispatch a task', 'review pr', 'check sentry'";
      } else {
        resp = 'Got it. In a live session I\u2019d coordinate that with your codebase \u2014 for this demo try: status, merge, or dispatch a task.';
      }

      await sleep(400);
      this._addMsg('bee', resp);
      this._resetTimer();
    }

    // ── Public API (used by demo scripts) ─────────────────────────

    addWorker(id, status, opts) {
      opts = opts || {};
      const s = STATUS[status] || STATUS.running;
      const row = el('div', 'flex items-center gap-1.5 flex-wrap');
      row.dataset.id = id;
      row.style.cssText = 'transition:all 0.3s ease;opacity:0;';
      if (opts.active) {
        row.style.borderLeft = `2px solid ${COLORS.honey}`;
        row.style.paddingLeft = '4px';
      }
      const nameColor = status === 'done' ? COLORS.smoke : COLORS.white;
      row.innerHTML =
        `<span class="_wi" style="color:${s.color}">${s.icon}</span>` +
        `<span class="_wn text-xs" style="color:${nameColor}">${id}</span>` +
        `<span class="_ws text-[10px] ml-auto" style="color:${s.color}">${s.label}</span>`;
      if (opts.prUrl) {
        row.innerHTML += `<div class="_wp text-[9px] w-full" style="color:${COLORS.smoke};padding-left:16px;">${opts.prUrl}</div>`;
      }
      this.workersList.appendChild(row);
      this.workers.set(id, { status, el: row });
      this._updateCount();
      requestAnimationFrame(() => { row.style.opacity = '1'; });
    }

    updateWorker(id, status, prUrl) {
      const w = this.workers.get(id);
      if (!w) return;
      const s = STATUS[status] || STATUS.running;
      w.status = status;
      const wi = w.el.querySelector('._wi');
      const ws = w.el.querySelector('._ws');
      const wn = w.el.querySelector('._wn');
      if (wi) { wi.textContent = s.icon; wi.style.color = s.color; }
      if (ws) { ws.textContent = s.label; ws.style.color = s.color; }
      if (wn) wn.style.color = status === 'done' ? COLORS.smoke : COLORS.white;
      if (prUrl) {
        let wp = w.el.querySelector('._wp');
        if (!wp) {
          wp = el('div', '_wp text-[9px] w-full');
          wp.style.cssText = `color:${COLORS.smoke};padding-left:16px;`;
          w.el.appendChild(wp);
        }
        wp.textContent = prUrl;
      }
    }

    removeWorker(id) {
      const w = this.workers.get(id);
      if (!w) return;
      w.el.style.opacity = '0';
      setTimeout(() => { w.el.remove(); this.workers.delete(id); this._updateCount(); }, 300);
    }

    _updateCount() {
      this.workersTitle.textContent = `Workers (${this.workers.size})`;
    }

    updateKpi(key, value) {
      if (!this.kpiEl) return;
      const e = this.kpiEl.querySelector(`[data-kpi="${key}"]`);
      if (!e) return;
      e.style.transition = 'color 0.3s';
      e.style.color = COLORS.honey;
      e.textContent = value;
      setTimeout(() => { e.style.color = COLORS.frost; }, 800);
    }

    // Add a chat message with typewriter effect
    async addMessage(role, text, speed) {
      speed = speed || 25;
      if (this.aborted) { this._addMsg(role, text); return; }
      const m = this._makeMsgEl(role, '');
      this.chatArea.appendChild(m);
      this._scroll();
      const t = m.querySelector('._mt');
      for (let i = 0; i < text.length; i++) {
        if (this.aborted) { t.textContent = text; return; }
        t.textContent = text.slice(0, i + 1);
        this._scroll();
        await sleep(speed);
      }
    }

    // Instant message (no typewriter)
    _addMsg(role, text) {
      const m = this._makeMsgEl(role, text);
      m.style.animation = 'tdSlideIn 0.2s ease';
      this.chatArea.appendChild(m);
      this._scroll();
    }

    _makeMsgEl(role, text) {
      const colors = {
        you: { l: 'You', c: COLORS.honey },
        bee: { l: 'Bee', c: COLORS.mint },
        tool: { l: 'Tool', c: COLORS.royal },
      };
      const r = colors[role] || colors.bee;
      return el('div', '', `<span style="color:${r.c}" class="font-semibold">${r.l}:</span> <span style="color:${COLORS.frost}" class="_mt">${text}</span>`);
    }

    // Add a tool-call line
    async addToolCall(status, text, delay) {
      const s = TOOL[status] || TOOL.done;
      const d = el('div', 'text-[11px]');
      d.style.cssText = `padding-left:12px;animation:tdSlideIn 0.2s ease;`;
      d.innerHTML = `<span class="_ti" style="color:${s.color}">${s.icon}</span> <span style="color:${COLORS.slate}">${text}</span>`;
      this.chatArea.appendChild(d);
      this._toolEls.push(d);
      this._scroll();
      if (delay && !this.aborted) await sleep(delay);
      return this._toolEls.length - 1;
    }

    updateToolCall(idx, status) {
      const e = this._toolEls[idx];
      if (!e) return;
      const s = TOOL[status] || TOOL.done;
      const i = e.querySelector('._ti');
      if (i) { i.textContent = s.icon; i.style.color = s.color; }
    }

    // Simulate typing into the input
    async setInput(text, speed) {
      speed = speed || 45;
      for (let i = 0; i <= text.length; i++) {
        if (this.aborted) { this._renderInput(text); return; }
        this._renderInput(text.slice(0, i));
        await sleep(speed);
      }
    }

    clearInput() { this._renderInput(''); }

    // "Send" the current input text as a user message
    sendInput() {
      const t = this.inputLine.querySelector('._itext');
      const text = t ? t.textContent : '';
      if (text) { this._addMsg('you', text); this.clearInput(); }
    }

    // ── Demo control ──────────────────────────────────────────────

    _clearAll() {
      this.chatArea.innerHTML = '';
      this.workersList.innerHTML = '';
      this.workers.clear();
      this._toolEls = [];
      this.clearInput();
      this._updateCount();
    }

    async resumeDemo() {
      if (!this.userMode) return;
      const note = el('div', 'text-center', 'resuming demo\u2026');
      note.style.cssText = `color:${COLORS.smoke};font-size:10px;opacity:0;transition:opacity 0.5s;`;
      this.chatArea.appendChild(note);
      requestAnimationFrame(() => { note.style.opacity = '1'; });
      await sleep(1500);
      this.userMode = false;
      note.remove();
      this.startDemo();
    }

    async startDemo() {
      if (!this.cfg.demoScript) return;
      while (true) {
        this.aborted = false;
        this._clearAll();
        await sleep(100);
        if (this.aborted) return;

        await this.cfg.demoScript(this);
        if (this.aborted) return;

        this.loopCount++;
        if (this.loopCount === 1 && !this.hintShown) {
          this.hintShown = true;
          this.hintEl.style.opacity = '1';
          setTimeout(() => { if (this.hintEl) this.hintEl.style.opacity = '0'; }, 5000);
        }

        // Fade-out transition between loops
        this.root.style.transition = 'opacity 0.5s';
        this.root.style.opacity = '0.4';
        await sleep(800);
        if (this.aborted) { this.root.style.opacity = '1'; return; }
        this.root.style.opacity = '1';
      }
    }

    _scroll() {
      this.chatArea.scrollTop = this.chatArea.scrollHeight;
    }
  }

  // ─── Demo Scripts ───────────────────────────────────────────────

  async function heroDemoScript(t) {
    t.addWorker('hive-1', 'running', { active: true });
    t.addWorker('hive-2', 'waiting');
    await t.addMessage('bee', '2 workers active. hive-2 finished and is waiting for review.');
    if (t.aborted) return;

    await sleep(2000); if (t.aborted) return;

    await t.addMessage('bee', 'hive-2 opened PR #42 \u2014 auth middleware. CI is green. Want me to review it?');
    if (t.aborted) return;

    await sleep(3000); if (t.aborted) return;

    await t.setInput('yes review it');
    if (t.aborted) return;

    await sleep(1000); if (t.aborted) return;
    t.sendInput();
    if (t.aborted) return;

    await t.addMessage('bee', 'Reviewing now\u2026');
    if (t.aborted) return;

    await t.addToolCall('done', 'gh pr view 42', 500);
    if (t.aborted) return;
    await t.addToolCall('done', 'Read src/middleware.rs', 800);
    if (t.aborted) return;

    await t.addMessage('bee', 'Looks solid. Adds JWT validation, 94% test coverage. Ready to merge when you are.');
    if (t.aborted) return;

    await sleep(4000);
  }

  async function swarmDemoScript(t) {
    t.addWorker('hive-1', 'running', { active: true });
    t.addWorker('cli-1', 'done');

    await t.addMessage('bee', "I'll implement the auth middleware. Let me check the existing routes first.");
    if (t.aborted) return;

    await t.addToolCall('done', 'Read src/routes/mod.rs', 600);
    if (t.aborted) return;
    await t.addToolCall('done', 'Read src/main.rs', 500);
    if (t.aborted) return;

    var editIdx = await t.addToolCall('progress', 'Edit src/middleware.rs');
    if (t.aborted) return;

    await sleep(2000); if (t.aborted) return;
    t.updateToolCall(editIdx, 'done');

    await t.addToolCall('done', 'Write tests/middleware_test.rs', 700);
    if (t.aborted) return;

    await t.addMessage('bee', 'Done. Auth middleware implemented with JWT validation and tests. Committing\u2026');
    if (t.aborted) return;

    await t.addToolCall('done', 'git commit -m "feat: add JWT auth middleware"', 600);
    if (t.aborted) return;
    await t.addToolCall('done', 'gh pr create \u2192 PR #43 opened', 500);
    if (t.aborted) return;

    t.updateWorker('hive-1', 'waiting', 'github.com/\u2026/pull/43');

    await sleep(3000);
  }

  async function apiariDemoScript(t) {
    t.addWorker('hive-1', 'running', { active: true });
    t.addWorker('hive-2', 'waiting');
    t.addWorker('cli-1', 'done');
    t.cfg.kpi = { workers: 3, signals: 2, prs: 1 };
    t._renderKpi();

    await t.addMessage('bee', 'Morning. hive-2 is waiting \u2014 opened PR #41 for the caching layer.');
    if (t.aborted) return;

    await sleep(3000); if (t.aborted) return;

    await t.addMessage('bee', 'Also picked up a Sentry alert \u2014 NullPointerException in auth handler, 12 occurrences in the last hour.');
    if (t.aborted) return;

    t.updateKpi('signals', 3);
    if (t.aborted) return;

    await sleep(2000); if (t.aborted) return;

    await t.setInput('dispatch a fix for the sentry error');
    if (t.aborted) return;

    await sleep(1000); if (t.aborted) return;
    t.sendInput();

    t.addWorker('hive-3', 'running');
    t.updateKpi('workers', 4);

    await t.addMessage('bee', "On it. Spawned hive-3 to fix the NullPointerException. I'll notify you when it opens a PR.");
    if (t.aborted) return;

    await sleep(4000);
  }

  // ─── Animated Architecture Diagrams ────────────────────────────

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function svgText(x, y, text, opts) {
    opts = opts || {};
    var t = svgEl('text', {
      x: x, y: y,
      'text-anchor': opts.anchor || 'middle',
      fill: opts.fill || COLORS.smoke,
      'font-size': opts.size || '13',
      'font-weight': opts.weight || 'normal',
    });
    t.textContent = text;
    return t;
  }

  function svgRect(x, y, w, h, opts) {
    opts = opts || {};
    return svgEl('rect', {
      x: x, y: y, width: w, height: h,
      rx: opts.rx || '8',
      fill: opts.fill || COLORS.comb,
      stroke: opts.stroke || COLORS.honey,
      'stroke-width': opts.sw || '1.5',
    });
  }

  // Create a line with animated dashes
  function svgAnimatedLine(x1, y1, x2, y2, opts) {
    opts = opts || {};
    var line = svgEl('line', {
      x1: x1, y1: y1, x2: x2, y2: y2,
      stroke: opts.stroke || COLORS.slate,
      'stroke-width': opts.sw || '1.5',
    });
    if (opts.animated) {
      line.setAttribute('class', 'arch-arrow-animated');
      line.style.animationDirection = opts.reverse ? 'reverse' : 'normal';
    }
    if (opts.dashed) {
      line.setAttribute('stroke-dasharray', '4 4');
    }
    return line;
  }

  // (travelling dot helpers moved to diagram section below)

  // ─── Swarm Diagram ──────────────────────────────────────────────

  // Create a one-shot dot that travels a straight line then removes itself
  function fireOnceDot(svg, x1, y1, x2, y2, opts) {
    opts = opts || {};
    var color = opts.color || COLORS.honey;
    var duration = opts.duration || 1000;
    var radius = opts.radius || 4;
    var dot = svgEl('circle', { cx: x1, cy: y1, r: radius, fill: color, opacity: '0' });
    // glow filter
    dot.style.filter = 'drop-shadow(0 0 4px ' + color + ')';
    svg.appendChild(dot);
    var start = null;
    function tick(ts) {
      if (!dot.parentNode) return;
      if (!start) start = ts;
      var t = (ts - start) / duration;
      if (t >= 1) { dot.remove(); return; }
      dot.setAttribute('cx', x1 + (x2 - x1) * t);
      dot.setAttribute('cy', y1 + (y2 - y1) * t);
      // fade in first 15%, fade out last 15%
      var alpha = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
      dot.setAttribute('opacity', Math.max(0, alpha));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return dot;
  }

  // Brief glow pulse on an SVG element (rect or text)
  function glowPulse(el, color, duration) {
    duration = duration || 800;
    var start = null;
    function tick(ts) {
      if (!start) start = ts;
      var t = (ts - start) / duration;
      if (t >= 1) { el.style.filter = ''; return; }
      var intensity = Math.sin(t * Math.PI) * 10;
      el.style.filter = 'drop-shadow(0 0 ' + intensity + 'px ' + color + ')';
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function buildSwarmDiagram(container) {
    container.innerHTML = '';
    var svg = svgEl('svg', { viewBox: '0 0 880 260', preserveAspectRatio: 'xMidYMid meet' });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.minHeight = '200px';

    var staticG = svgEl('g');
    var animG = svgEl('g');

    // -- You node --
    var youRect = svgRect(20, 90, 110, 70, { stroke: COLORS.honey });
    staticG.appendChild(youRect);
    staticG.appendChild(svgText(75, 120, 'You', { fill: COLORS.honey, size: '15', weight: '600' }));
    staticG.appendChild(svgText(75, 140, 'TUI', { fill: COLORS.smoke, size: '11' }));

    // -- Line You → swarm (flowing dashes, always on) --
    staticG.appendChild(svgAnimatedLine(130, 125, 200, 125, { animated: true, stroke: COLORS.slate }));

    // -- swarm node --
    var swarmRect = svgRect(200, 70, 140, 110, { stroke: COLORS.honey });
    staticG.appendChild(swarmRect);
    staticG.appendChild(svgText(270, 110, 'swarm', { fill: COLORS.honey, size: '15', weight: '600' }));
    staticG.appendChild(svgText(270, 132, 'multiplexer', { fill: COLORS.smoke, size: '11' }));
    staticG.appendChild(svgText(270, 148, '+ TUI', { fill: COLORS.smoke, size: '11' }));

    // -- Worker positions (always visible) --
    var workerData = [
      { id: 'worktree-1', agent: 'claude agent', y: 20 },
      { id: 'worktree-2', agent: 'claude agent', y: 95 },
      { id: 'worktree-3', agent: 'codex agent', y: 170 },
    ];

    // -- Lines swarm → workers (flowing dashes) --
    workerData.forEach(function (w) {
      staticG.appendChild(svgAnimatedLine(340, 125, 400, w.y + 30, { animated: true, stroke: COLORS.slate }));
    });
    staticG.appendChild(svgText(370, 120, 'spawn', { fill: COLORS.smoke, size: '10' }));

    // -- Worker nodes (always visible) --
    var workerRects = [];
    workerData.forEach(function (w) {
      var r = svgRect(400, w.y, 190, 55, { rx: '6', stroke: COLORS.mint, sw: '1.5' });
      staticG.appendChild(r);
      staticG.appendChild(svgText(495, w.y + 22, w.id, { fill: COLORS.mint, size: '13', weight: '500' }));
      staticG.appendChild(svgText(495, w.y + 40, w.agent, { fill: COLORS.smoke, size: '11' }));
      workerRects.push(r);
    });

    // -- Lines workers → GitHub (flowing dashes) --
    workerData.forEach(function (w) {
      staticG.appendChild(svgAnimatedLine(590, w.y + 28, 710, 125, { animated: true, stroke: COLORS.slate }));
    });
    staticG.appendChild(svgText(660, 120, 'push', { fill: COLORS.smoke, size: '10' }));

    // -- GitHub node (always visible) --
    var ghRect = svgRect(710, 80, 140, 90, { stroke: COLORS.royal });
    staticG.appendChild(ghRect);
    staticG.appendChild(svgText(780, 118, 'GitHub', { fill: COLORS.royal, size: '15', weight: '600' }));
    staticG.appendChild(svgText(780, 140, 'PRs + branches', { fill: COLORS.smoke, size: '11' }));

    // -- PR checkmark (hidden, shown per-step) --
    var prCheck = svgText(780, 163, '\u2714', { fill: COLORS.mint, size: '14', weight: '600' });
    prCheck.style.opacity = '0';

    // -- Notification line GitHub → You (for result notification) --
    staticG.appendChild(svgAnimatedLine(710, 125, 130, 125, { animated: true, stroke: COLORS.slate, reverse: true }));

    svg.appendChild(staticG);
    svg.appendChild(prCheck);
    svg.appendChild(animG);
    container.appendChild(svg);

    var state = { running: true, paused: false };

    async function runLoop() {
      while (state.running) {
        // Reset transient visuals
        prCheck.style.opacity = '0';
        animG.innerHTML = '';

        await sleep(800);
        if (!state.running) return;

        // Step 1: You send a task → swarm (honey dot)
        while (state.paused) { await sleep(100); if (!state.running) return; }
        fireOnceDot(animG, 130, 125, 200, 125, { color: COLORS.honey, duration: 800, radius: 5 });
        await sleep(900);
        if (!state.running) return;

        // Step 2: Swarm "thinking" pulse
        while (state.paused) { await sleep(100); if (!state.running) return; }
        glowPulse(swarmRect, COLORS.honey, 800);
        await sleep(900);
        if (!state.running) return;

        // Step 3: Dispatch dots swarm → each worker (staggered)
        while (state.paused) { await sleep(100); if (!state.running) return; }
        workerData.forEach(function (w, i) {
          setTimeout(function () {
            if (!state.running) return;
            fireOnceDot(animG, 340, 125, 400, w.y + 30, { color: COLORS.honey, duration: 800, radius: 4 });
          }, i * 300);
        });
        await sleep(1200);
        if (!state.running) return;

        // Step 4: Workers highlight (green pulse) one by one
        while (state.paused) { await sleep(100); if (!state.running) return; }
        for (var i = 0; i < workerRects.length; i++) {
          glowPulse(workerRects[i], COLORS.mint, 600);
          await sleep(400);
          if (!state.running) return;
        }
        await sleep(600);
        if (!state.running) return;

        // Step 5: Workers push to GitHub (mint dots, staggered)
        while (state.paused) { await sleep(100); if (!state.running) return; }
        workerData.forEach(function (w, i) {
          setTimeout(function () {
            if (!state.running) return;
            fireOnceDot(animG, 590, w.y + 28, 710, 125, { color: COLORS.mint, duration: 1000, radius: 4 });
          }, i * 400);
        });
        await sleep(1800);
        if (!state.running) return;

        // Step 6: PR checkmark on GitHub
        while (state.paused) { await sleep(100); if (!state.running) return; }
        prCheck.style.opacity = '1';
        prCheck.style.animation = 'checkPop 0.4s ease-out';
        glowPulse(ghRect, COLORS.mint, 600);
        await sleep(1200);
        if (!state.running) return;

        // Step 7: Notification dot GitHub → You
        while (state.paused) { await sleep(100); if (!state.running) return; }
        fireOnceDot(animG, 710, 125, 130, 125, { color: COLORS.honey, duration: 1000, radius: 4 });
        await sleep(1100);
        if (!state.running) return;
        glowPulse(youRect, COLORS.honey, 600);

        // Step 8: Pause then repeat
        await sleep(2000);
        if (!state.running) return;
      }
    }

    runLoop();
    return state;
  }

  // ─── Apiari Diagram ─────────────────────────────────────────────

  function buildApiariDiagram(container) {
    container.innerHTML = '';
    var svg = svgEl('svg', { viewBox: '0 0 1060 400', preserveAspectRatio: 'xMidYMid meet' });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.minHeight = '280px';

    var staticG = svgEl('g');
    var animG = svgEl('g');

    // -- You node --
    var youRect = svgRect(15, 100, 110, 70, { stroke: COLORS.honey });
    staticG.appendChild(youRect);
    staticG.appendChild(svgText(70, 130, 'You', { fill: COLORS.honey, size: '15', weight: '600' }));
    staticG.appendChild(svgText(70, 148, 'Telegram / TUI', { fill: COLORS.smoke, size: '10' }));

    // -- Line You → daemon --
    staticG.appendChild(svgAnimatedLine(125, 135, 195, 135, { animated: true, stroke: COLORS.slate }));
    staticG.appendChild(svgText(160, 125, 'chat', { fill: COLORS.smoke, size: '10' }));

    // -- Apiari daemon node --
    var daemonRect = svgRect(195, 60, 170, 155, { stroke: COLORS.honey });
    staticG.appendChild(daemonRect);
    staticG.appendChild(svgText(280, 90, 'apiari daemon', { fill: COLORS.honey, size: '14', weight: '600' }));

    var coordText = svgText(280, 115, 'coordinator', { fill: COLORS.mint, size: '12' });
    staticG.appendChild(coordText);
    staticG.appendChild(svgText(280, 135, 'signal watchers', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(280, 152, 'swarm watcher', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(280, 169, 'auto-triage', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(280, 186, 'telegram bot', { fill: COLORS.smoke, size: '10' }));

    // -- Line daemon → swarm --
    staticG.appendChild(svgAnimatedLine(365, 105, 440, 75, { animated: true, stroke: COLORS.slate }));
    staticG.appendChild(svgText(402, 82, 'dispatch', { fill: COLORS.smoke, size: '10' }));

    // -- Line signals → daemon --
    staticG.appendChild(svgAnimatedLine(365, 185, 440, 300, { animated: true, stroke: COLORS.slate, reverse: true }));
    staticG.appendChild(svgText(390, 248, 'read', { fill: COLORS.smoke, size: '10' }));

    // -- Swarm node --
    var swarmRect = svgRect(440, 30, 145, 95, { stroke: COLORS.honey, sw: '1' });
    staticG.appendChild(swarmRect);
    staticG.appendChild(svgText(512, 65, 'swarm', { fill: COLORS.honey, size: '14', weight: '600' }));
    staticG.appendChild(svgText(512, 85, 'agents + worktrees', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(512, 100, 'multiplexer', { fill: COLORS.smoke, size: '10' }));

    // -- Signals node --
    var signalsRect = svgRect(440, 265, 145, 80, { stroke: COLORS.nectar, sw: '1' });
    staticG.appendChild(signalsRect);
    staticG.appendChild(svgText(512, 295, 'signals', { fill: COLORS.nectar, size: '14', weight: '600' }));
    staticG.appendChild(svgText(512, 315, 'aggregator', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(512, 332, 'queue', { fill: COLORS.smoke, size: '10' }));

    // -- Line swarm → signals (swarm events) --
    staticG.appendChild(svgAnimatedLine(512, 125, 512, 265, { animated: true, stroke: COLORS.slate, sw: '1' }));
    staticG.appendChild(svgText(525, 198, 'events', { fill: COLORS.smoke, size: '9', anchor: 'start' }));

    // -- Worker nodes --
    var workerData = [
      { id: 'worker-1', y: 15 },
      { id: 'worker-2', y: 72 },
      { id: 'worker-3', y: 129 },
    ];

    var workerRects = [];
    workerData.forEach(function (a) {
      // Lines swarm → worker
      staticG.appendChild(svgAnimatedLine(585, 77, 640, a.y + 22, { animated: true, stroke: COLORS.slate, sw: '1' }));
      // Lines worker → GitHub PRs
      staticG.appendChild(svgAnimatedLine(740, a.y + 22, 845, 142, { animated: true, stroke: COLORS.slate, sw: '1' }));

      var r = svgRect(640, a.y, 100, 44, { rx: '4', stroke: COLORS.mint, sw: '1' });
      staticG.appendChild(r);
      staticG.appendChild(svgText(690, a.y + 27, a.id, { fill: COLORS.mint, size: '11' }));
      workerRects.push(r);
    });
    staticG.appendChild(svgText(620, 195, 'spawn', { fill: COLORS.smoke, size: '9' }));
    staticG.appendChild(svgText(790, 105, 'push', { fill: COLORS.smoke, size: '9' }));

    // -- Sentry node (nectar/orange) --
    var sentryRect = svgRect(845, 40, 140, 50, { stroke: COLORS.nectar, sw: '1.5' });
    staticG.appendChild(sentryRect);
    staticG.appendChild(svgText(915, 70, 'Sentry', { fill: COLORS.nectar, size: '13', weight: '600' }));

    // -- GitHub PRs node (royal/purple) --
    var ghPrRect = svgRect(845, 115, 140, 55, { stroke: COLORS.royal, sw: '1.5' });
    staticG.appendChild(ghPrRect);
    staticG.appendChild(svgText(915, 140, 'GitHub PRs', { fill: COLORS.royal, size: '13', weight: '600' }));
    staticG.appendChild(svgText(915, 157, 'branches + CI', { fill: COLORS.smoke, size: '10' }));

    // -- GitHub Issues node (frost/blue) --
    var ghIssueRect = svgRect(845, 200, 140, 50, { stroke: COLORS.frost, sw: '1.5' });
    staticG.appendChild(ghIssueRect);
    staticG.appendChild(svgText(915, 230, 'GitHub Issues', { fill: COLORS.frost, size: '13', weight: '600' }));

    // -- Arrows from sources → signals --
    // Sentry → signals (errors) — route down then left
    var sentryPath = svgEl('path', {
      d: 'M 845 65 L 800 65 L 800 285 L 585 285',
      fill: 'none', stroke: COLORS.slate, 'stroke-width': '1',
    });
    sentryPath.setAttribute('class', 'arch-arrow-animated');
    staticG.appendChild(sentryPath);
    staticG.appendChild(svgText(812, 175, 'errors', { fill: COLORS.smoke, size: '9', anchor: 'end' }));

    // GitHub PRs → signals (events) — route down then left
    var ghPrPath = svgEl('path', {
      d: 'M 845 155 L 815 155 L 815 305 L 585 305',
      fill: 'none', stroke: COLORS.slate, 'stroke-width': '1',
    });
    ghPrPath.setAttribute('class', 'arch-arrow-animated');
    staticG.appendChild(ghPrPath);

    // GitHub Issues → signals (webhooks) — route down then left
    var ghIssuePath = svgEl('path', {
      d: 'M 845 225 L 830 225 L 830 325 L 585 325',
      fill: 'none', stroke: COLORS.slate, 'stroke-width': '1',
    });
    ghIssuePath.setAttribute('class', 'arch-arrow-animated');
    staticG.appendChild(ghIssuePath);
    staticG.appendChild(svgText(725, 340, 'webhooks', { fill: COLORS.smoke, size: '9' }));

    // -- PR checkmark on GitHub PRs (hidden, toggled per step) --
    var prCheck = svgText(915, 157, '\u2714', { fill: COLORS.mint, size: '14', weight: '600' });
    prCheck.style.opacity = '0';

    // -- Notification bubble (hidden, toggled per step) --
    var telegramBubble = svgEl('g');
    telegramBubble.style.opacity = '0';
    var bubbleRect = svgRect(15, 55, 110, 30, { rx: '12', stroke: COLORS.honey, fill: COLORS.wax, sw: '1' });
    telegramBubble.appendChild(bubbleRect);
    var bubbleText = svgText(70, 75, 'PR opened!', { fill: COLORS.honey, size: '10', weight: '500' });
    telegramBubble.appendChild(bubbleText);

    svg.appendChild(staticG);
    svg.appendChild(prCheck);
    svg.appendChild(telegramBubble);
    svg.appendChild(animG);
    container.appendChild(svg);

    var state = { running: true, paused: false };
    var cycleCount = 0;

    function setBubble(text, color) {
      bubbleText.textContent = text;
      bubbleText.setAttribute('fill', color);
      bubbleRect.setAttribute('stroke', color);
    }

    // Wait while paused, return false if stopped
    async function waitIfPaused() {
      while (state.paused) { await sleep(100); if (!state.running) return false; }
      return state.running;
    }

    // Fire a dot along an L-shaped path (array of [x1,y1,x2,y2,duration] legs)
    async function fireLPath(legs, color, radius) {
      for (var i = 0; i < legs.length; i++) {
        if (!(await waitIfPaused())) return false;
        var l = legs[i];
        fireOnceDot(animG, l[0], l[1], l[2], l[3], { color: color, duration: l[4], radius: radius || 5 });
        await sleep(l[4] + 100);
        if (!state.running) return false;
      }
      return true;
    }

    // Cycle 1: Sentry error → signals → daemon → notify you (nectar)
    async function runSentryCycle() {
      if (!(await waitIfPaused())) return;
      // Sentry → signals via L-path
      glowPulse(sentryRect, COLORS.nectar, 600);
      if (!(await fireLPath([
        [845, 65, 800, 65, 400],
        [800, 65, 800, 285, 700],
        [800, 285, 585, 285, 600],
      ], COLORS.nectar))) return;
      glowPulse(signalsRect, COLORS.nectar, 600);
      if (!(await waitIfPaused())) return;
      await sleep(400); if (!state.running) return;

      // signals → daemon
      if (!(await waitIfPaused())) return;
      fireOnceDot(animG, 440, 300, 365, 185, { color: COLORS.nectar, duration: 800, radius: 5 });
      await sleep(900); if (!state.running) return;

      // coordinator thinks
      if (!(await waitIfPaused())) return;
      glowPulse(daemonRect, COLORS.honey, 1000);
      glowPulse(coordText, COLORS.honey, 1000);
      await sleep(1100); if (!state.running) return;

      // daemon → You
      if (!(await waitIfPaused())) return;
      fireOnceDot(animG, 195, 135, 125, 135, { color: COLORS.nectar, duration: 800, radius: 4 });
      await sleep(900); if (!state.running) return;

      if (!(await waitIfPaused())) return;
      setBubble('Sentry error', COLORS.nectar);
      telegramBubble.style.opacity = '1';
      telegramBubble.style.animation = 'bubbleSlide 0.4s ease-out';
      glowPulse(youRect, COLORS.nectar, 600);
      await sleep(1200); if (!state.running) return;
    }

    // Cycle 2: GitHub Issue → signals → daemon → dispatch → swarm → workers → GitHub PRs → notify
    async function runIssueCycle() {
      if (!(await waitIfPaused())) return;
      // GitHub Issues → signals via L-path
      glowPulse(ghIssueRect, COLORS.frost, 600);
      if (!(await fireLPath([
        [845, 225, 830, 225, 300],
        [830, 225, 830, 325, 500],
        [830, 325, 585, 325, 600],
      ], COLORS.frost))) return;
      glowPulse(signalsRect, COLORS.frost, 600);
      if (!(await waitIfPaused())) return;
      await sleep(400); if (!state.running) return;

      // signals → daemon
      if (!(await waitIfPaused())) return;
      fireOnceDot(animG, 440, 300, 365, 185, { color: COLORS.frost, duration: 800, radius: 5 });
      await sleep(900); if (!state.running) return;

      // coordinator thinks
      if (!(await waitIfPaused())) return;
      glowPulse(daemonRect, COLORS.honey, 1000);
      glowPulse(coordText, COLORS.honey, 1000);
      await sleep(1100); if (!state.running) return;

      // daemon → swarm (dispatch)
      if (!(await waitIfPaused())) return;
      fireOnceDot(animG, 365, 105, 440, 75, { color: COLORS.honey, duration: 800, radius: 5 });
      await sleep(900); if (!state.running) return;

      if (!(await waitIfPaused())) return;
      glowPulse(swarmRect, COLORS.honey, 600);
      await sleep(700); if (!state.running) return;

      // swarm → workers (spawn)
      if (!(await waitIfPaused())) return;
      workerData.forEach(function (a, i) {
        setTimeout(function () {
          if (!state.running) return;
          fireOnceDot(animG, 585, 77, 640, a.y + 22, { color: COLORS.honey, duration: 700, radius: 4 });
        }, i * 250);
      });
      await sleep(1000); if (!state.running) return;

      for (var i = 0; i < workerRects.length; i++) {
        if (!(await waitIfPaused())) return;
        glowPulse(workerRects[i], COLORS.mint, 500);
        await sleep(300); if (!state.running) return;
      }
      if (!(await waitIfPaused())) return;
      await sleep(500); if (!state.running) return;

      // workers → GitHub PRs (push, honey dots)
      if (!(await waitIfPaused())) return;
      workerData.forEach(function (a, i) {
        setTimeout(function () {
          if (!state.running) return;
          fireOnceDot(animG, 740, a.y + 22, 845, 142, { color: COLORS.honey, duration: 900, radius: 4 });
        }, i * 350);
      });
      await sleep(1600); if (!state.running) return;

      // PR check on GitHub PRs
      if (!(await waitIfPaused())) return;
      prCheck.style.opacity = '1';
      prCheck.style.animation = 'checkPop 0.4s ease-out';
      glowPulse(ghPrRect, COLORS.mint, 600);
      await sleep(1000); if (!state.running) return;

      // GitHub PRs fires event → signals via L-path → daemon → You
      if (!(await fireLPath([
        [845, 155, 815, 155, 300],
        [815, 155, 815, 305, 500],
        [815, 305, 585, 305, 600],
      ], COLORS.honey, 4))) return;
      glowPulse(signalsRect, COLORS.honey, 600);
      if (!(await waitIfPaused())) return;
      await sleep(400); if (!state.running) return;

      if (!(await waitIfPaused())) return;
      fireOnceDot(animG, 440, 300, 365, 185, { color: COLORS.honey, duration: 800, radius: 4 });
      await sleep(900); if (!state.running) return;

      if (!(await waitIfPaused())) return;
      glowPulse(daemonRect, COLORS.honey, 800);
      await sleep(600); if (!state.running) return;

      if (!(await waitIfPaused())) return;
      fireOnceDot(animG, 195, 135, 125, 135, { color: COLORS.honey, duration: 800, radius: 4 });
      await sleep(900); if (!state.running) return;

      if (!(await waitIfPaused())) return;
      setBubble('PR opened!', COLORS.honey);
      telegramBubble.style.opacity = '1';
      telegramBubble.style.animation = 'bubbleSlide 0.4s ease-out';
      glowPulse(youRect, COLORS.honey, 600);
      await sleep(1200); if (!state.running) return;
    }

    // Cycle 3: Swarm event → signals → daemon → notify you (mint)
    async function runSwarmCycle() {
      if (!(await waitIfPaused())) return;
      // swarm → signals (vertical)
      glowPulse(swarmRect, COLORS.mint, 600);
      fireOnceDot(animG, 512, 125, 512, 265, { color: COLORS.mint, duration: 800, radius: 5 });
      await sleep(900); if (!state.running) return;

      if (!(await waitIfPaused())) return;
      glowPulse(signalsRect, COLORS.mint, 600);
      await sleep(400); if (!state.running) return;

      // signals → daemon
      if (!(await waitIfPaused())) return;
      fireOnceDot(animG, 440, 300, 365, 185, { color: COLORS.mint, duration: 800, radius: 5 });
      await sleep(900); if (!state.running) return;

      // coordinator thinks
      if (!(await waitIfPaused())) return;
      glowPulse(daemonRect, COLORS.honey, 1000);
      glowPulse(coordText, COLORS.honey, 1000);
      await sleep(1100); if (!state.running) return;

      // daemon → You
      if (!(await waitIfPaused())) return;
      fireOnceDot(animG, 195, 135, 125, 135, { color: COLORS.mint, duration: 800, radius: 4 });
      await sleep(900); if (!state.running) return;

      if (!(await waitIfPaused())) return;
      setBubble('Worker done', COLORS.mint);
      telegramBubble.style.opacity = '1';
      telegramBubble.style.animation = 'bubbleSlide 0.4s ease-out';
      glowPulse(youRect, COLORS.mint, 600);
      await sleep(1200); if (!state.running) return;
    }

    var cycles = [runSentryCycle, runIssueCycle, runSwarmCycle];

    async function runLoop() {
      while (state.running) {
        prCheck.style.opacity = '0';
        telegramBubble.style.opacity = '0';
        animG.innerHTML = '';

        await sleep(800);
        if (!state.running) return;

        await cycles[cycleCount % cycles.length]();
        if (!state.running) return;

        cycleCount++;
        await sleep(2000);
        if (!state.running) return;
      }
    }

    runLoop();
    return state;
  }

  // ─── Fullscreen Modal ─────────────────────────────────────────

  function openFullscreen(terminalInstance) {
    if (terminalInstance._fullscreenOverlay) return;

    var overlay = el('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;';
    terminalInstance._fullscreenOverlay = overlay;

    var modal = el('div');
    modal.style.cssText = 'position:relative;width:100%;max-width:900px;height:80vh;margin:20px;';

    var closeBtn = el('button', '', '\u00D7');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close fullscreen');
    closeBtn.style.cssText = 'position:absolute;top:-36px;right:0;background:none;border:none;color:' + COLORS.smoke + ';font-size:28px;cursor:pointer;z-index:10;padding:4px 8px;';
    closeBtn.onmouseenter = function () { closeBtn.style.color = COLORS.white; };
    closeBtn.onmouseleave = function () { closeBtn.style.color = COLORS.smoke; };

    var origParent = terminalInstance.root.parentNode;
    var origNext = terminalInstance.root.nextSibling;
    var origStyles = {
      height: terminalInstance.root.style.height,
      minHeight: terminalInstance.root.style.minHeight,
      maxHeight: terminalInstance.root.style.maxHeight,
    };

    terminalInstance.root.style.height = '100%';
    terminalInstance.root.style.minHeight = '100%';
    terminalInstance.root.style.maxHeight = '100%';
    modal.appendChild(terminalInstance.root);
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Resize conversation areas
    var chatAreas = terminalInstance.root.querySelectorAll('[data-chat-area]');
    chatAreas.forEach(function (ca) { ca.style.maxHeight = '60vh'; });

    function close() {
      terminalInstance._fullscreenOverlay = null;
      terminalInstance.root.style.height = origStyles.height;
      terminalInstance.root.style.minHeight = origStyles.minHeight;
      terminalInstance.root.style.maxHeight = origStyles.maxHeight;
      chatAreas.forEach(function (ca) { ca.style.maxHeight = ''; });
      if (origNext) origParent.insertBefore(terminalInstance.root, origNext);
      else origParent.appendChild(terminalInstance.root);
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    function escHandler(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', escHandler);
  }

  // ─── SwarmTerminal ──────────────────────────────────────────────

  class SwarmTerminal {
    constructor(container) {
      this.root = typeof container === 'string' ? document.getElementById(container) : container;
      if (!this.root) return;
      this.workers = new Map();
      this.selectedId = null;
      this.conversations = new Map();
      this.aborted = false;
      this.loopCount = 0;
      this._build();
    }

    _build() {
      var r = this.root;
      r.innerHTML = '';
      r.style.cssText = 'position:relative;display:flex;flex-direction:column;height:100%;min-width:0;box-sizing:border-box;font-family:"JetBrains Mono","SF Mono","Fira Code",monospace;font-size:12px;line-height:1.4;background:' + COLORS.comb + ';color:' + COLORS.frost + ';overflow:hidden;';

      // Title bar with macOS dots
      var titleBar = el('div');
      titleBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid ' + COLORS.slate + ';flex-shrink:0;';

      var dots = el('div');
      dots.style.cssText = 'display:flex;gap:6px;';

      var redDot = el('span');
      redDot.style.cssText = 'width:12px;height:12px;border-radius:50%;background:rgba(255,107,53,0.6);display:inline-block;';
      var yellowDot = el('span');
      yellowDot.style.cssText = 'width:12px;height:12px;border-radius:50%;background:rgba(245,166,35,0.6);display:inline-block;';
      var greenDot = el('span');
      greenDot.style.cssText = 'width:12px;height:12px;border-radius:50%;background:rgba(126,200,160,0.6);display:inline-block;cursor:pointer;';
      greenDot.title = 'Expand fullscreen';
      var self = this;
      greenDot.addEventListener('click', function (e) { e.stopPropagation(); openFullscreen(self); });

      dots.appendChild(redDot);
      dots.appendChild(yellowDot);
      dots.appendChild(greenDot);
      titleBar.appendChild(dots);

      var titleText = el('span', '', 'swarm \u2014 parallel agent execution');
      titleText.style.cssText = 'color:' + COLORS.smoke + ';font-size:11px;margin-left:8px;';
      titleBar.appendChild(titleText);

      r.appendChild(titleBar);

      // Main layout: sidebar | conversation
      var main = el('div');
      main.style.cssText = 'display:flex;flex:1;min-height:0;min-width:0;overflow:hidden;';

      // Left sidebar
      var sidebar = el('div');
      sidebar.style.cssText = 'width:220px;min-width:0;max-width:220px;flex-shrink:0;border-right:1px solid ' + COLORS.slate + ';display:flex;flex-direction:column;overflow:hidden;';

      this.sidebarHeader = el('div', '', 'WORKERS (0)');
      this.sidebarHeader.style.cssText = 'padding:8px 10px;color:' + COLORS.honey + ';font-size:11px;font-weight:600;letter-spacing:0.5px;';
      sidebar.appendChild(this.sidebarHeader);

      var divider = el('div');
      divider.style.cssText = 'height:1px;background:' + COLORS.slate + ';margin:0 10px;';
      sidebar.appendChild(divider);

      this.workerList = el('div');
      this.workerList.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;';
      sidebar.appendChild(this.workerList);

      var bottomDiv = el('div');
      bottomDiv.style.cssText = 'height:1px;background:' + COLORS.slate + ';margin:0 10px;';
      sidebar.appendChild(bottomDiv);

      var statusBar = el('div');
      statusBar.style.cssText = 'padding:6px 10px;color:' + COLORS.smoke + ';font-size:10px;';
      statusBar.innerHTML = ' n:new  d:dispatch  q:quit  <span style="color:' + COLORS.mint + '">\u25CF</span><span style="color:' + COLORS.mint + '">daemon</span>';
      sidebar.appendChild(statusBar);

      main.appendChild(sidebar);

      // Right panel
      var rightPanel = el('div');
      rightPanel.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;';

      this.convHeader = el('div');
      this.convHeader.style.cssText = 'padding:8px 12px;border-bottom:1px solid ' + COLORS.slate + ';color:' + COLORS.white + ';font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      this.convHeader.textContent = 'Select a worker';
      rightPanel.appendChild(this.convHeader);

      this.convArea = el('div');
      this.convArea.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 12px;word-break:break-word;overflow-wrap:anywhere;';
      this.convArea.setAttribute('data-chat-area', '1');
      rightPanel.appendChild(this.convArea);

      main.appendChild(rightPanel);
      r.appendChild(main);
    }

    addWorker(id, opts) {
      opts = opts || {};
      var status = opts.status || 'running';
      var s = STATUS[status] || STATUS.running;
      var workerEl = el('div');
      workerEl.style.cssText = 'padding:4px 10px;cursor:pointer;transition:background 0.15s;';

      // Line 1: bar + dot + id + branch
      var line1 = el('div');
      line1.style.cssText = 'display:flex;align-items:center;gap:4px;';
      var bar = el('span', '', '\u258C');
      bar.style.cssText = 'color:' + (opts.color || COLORS.smoke) + ';';
      bar.className = '_wbar';
      var dot = el('span');
      dot.className = '_wdot';
      dot.style.color = s.color;
      dot.textContent = s.icon;
      var nameSpan = el('span', '', id);
      nameSpan.style.cssText = 'color:' + COLORS.white + ';font-size:12px;';
      nameSpan.className = '_wname';
      line1.appendChild(bar);
      line1.appendChild(dot);
      line1.appendChild(nameSpan);
      if (opts.branch) {
        var brSpan = el('span', '', opts.branch);
        brSpan.style.cssText = 'color:' + COLORS.smoke + ';font-size:10px;margin-left:auto;';
        line1.appendChild(brSpan);
      }
      workerEl.appendChild(line1);

      // Line 2: agent + ago
      var line2 = el('div');
      line2.style.cssText = 'padding-left:20px;color:' + COLORS.smoke + ';font-size:10px;';
      line2.textContent = '  agent: ' + (opts.agent || 'claude') + '  ' + (opts.ago || '0m ago');
      line2.className = '_wline2';
      workerEl.appendChild(line2);

      // Line 3: task
      if (opts.task) {
        var line3 = el('div');
        line3.style.cssText = 'padding-left:20px;color:' + COLORS.frost + ';font-size:10px;';
        line3.textContent = '  feat: ' + opts.task;
        line3.className = '_wline3';
        workerEl.appendChild(line3);
      }

      var self = this;
      workerEl.addEventListener('click', function () { self.setSelectedWorker(id); });

      this.workerList.appendChild(workerEl);
      this.workers.set(id, { el: workerEl, status: status, opts: opts });
      this.conversations.set(id, []);
      this._updateCount();

      // Animate in
      workerEl.style.opacity = '0';
      requestAnimationFrame(function () { workerEl.style.transition = 'opacity 0.3s'; workerEl.style.opacity = '1'; });
    }

    setSelectedWorker(id) {
      this.selectedId = id;
      // Highlight selected
      this.workers.forEach(function (w, wid) {
        if (wid === id) {
          w.el.style.background = 'rgba(245,166,35,0.1)';
          w.el.style.borderLeft = '2px solid ' + COLORS.honey;
        } else {
          w.el.style.background = '';
          w.el.style.borderLeft = '2px solid transparent';
        }
      });
      // Update header
      var w = this.workers.get(id);
      var headerText = id;
      if (w && w.prUrl) headerText += '  \u2192 ' + w.prUrl;
      this.convHeader.textContent = headerText;
      // Render conversation
      this._renderConversation(id);
    }

    appendConversation(text, type) {
      if (!this.selectedId) return -1;
      var conv = this.conversations.get(this.selectedId);
      if (!conv) return -1;
      conv.push({ text: text, type: type || 'text' });
      this._renderConversation(this.selectedId);
      return conv.length - 1;
    }

    updateConversationAt(index, text, type) {
      if (!this.selectedId) return;
      var conv = this.conversations.get(this.selectedId);
      if (!conv || index < 0 || index >= conv.length) return;
      conv[index] = { text: text, type: type || 'tool' };
      this._renderConversation(this.selectedId);
    }

    _renderConversation(id) {
      var conv = this.conversations.get(id);
      if (!conv) return;
      this.convArea.innerHTML = '';
      var self = this;
      conv.forEach(function (item) {
        var line = el('div');
        line.style.cssText = 'padding:1px 0;animation:tdSlideIn 0.2s ease;';
        if (item.type === 'tool') {
          line.style.color = COLORS.smoke;
          line.innerHTML = item.text;
        } else if (item.type === 'output') {
          line.style.color = COLORS.frost;
          line.style.paddingLeft = '16px';
          line.textContent = item.text;
        } else {
          line.style.color = COLORS.frost;
          line.textContent = item.text;
        }
        self.convArea.appendChild(line);
      });
      this.convArea.scrollTop = this.convArea.scrollHeight;
    }

    setWorkerStatus(id, status) {
      var w = this.workers.get(id);
      if (!w) return;
      var s = STATUS[status] || STATUS.running;
      w.status = status;
      var dot = w.el.querySelector('._wdot');
      if (dot) { dot.textContent = s.icon; dot.style.color = s.color; }
      var name = w.el.querySelector('._wname');
      if (name) name.style.color = status === 'done' ? COLORS.smoke : COLORS.white;
    }

    updateLastConversation(text, type) {
      if (!this.selectedId) return;
      var conv = this.conversations.get(this.selectedId);
      if (!conv || conv.length === 0) return;
      conv[conv.length - 1] = { text: text, type: type || 'tool' };
      this._renderConversation(this.selectedId);
    }

    setPrUrl(id, url) {
      var w = this.workers.get(id);
      if (!w) return;
      w.prUrl = url;
      if (this.selectedId === id) {
        this.convHeader.textContent = id + '  \u2192 ' + url;
      }
    }

    _updateCount() {
      this.sidebarHeader.textContent = 'WORKERS (' + this.workers.size + ')';
    }

    _clearAll() {
      this.workerList.innerHTML = '';
      this.workers.clear();
      this.conversations.clear();
      this.selectedId = null;
      this.convHeader.textContent = 'Select a worker';
      this.convArea.innerHTML = '';
      this._updateCount();
    }

    async startDemo() {
      while (true) {
        this.aborted = false;
        this._clearAll();
        await sleep(100);
        if (this.aborted) return;
        await swarmTerminalScript(this);
        if (this.aborted) return;
        this.loopCount++;
        this.root.style.transition = 'opacity 0.5s';
        this.root.style.opacity = '0.4';
        await sleep(800);
        if (this.aborted) { this.root.style.opacity = '1'; return; }
        this.root.style.opacity = '1';
      }
    }
  }

  // ─── ApiariTerminal ─────────────────────────────────────────────

  class ApiariTerminal {
    constructor(container) {
      this.root = typeof container === 'string' ? document.getElementById(container) : container;
      if (!this.root) return;
      this.workers = new Map();
      this.aborted = false;
      this.loopCount = 0;
      this._build();
    }

    _build() {
      var r = this.root;
      r.innerHTML = '';
      r.style.cssText = 'position:relative;display:flex;flex-direction:column;height:100%;min-width:0;box-sizing:border-box;font-family:"JetBrains Mono","SF Mono","Fira Code",monospace;font-size:11px;line-height:1.35;background:' + COLORS.comb + ';color:' + COLORS.frost + ';overflow:hidden;';

      // Title bar with macOS dots
      var titleBar = el('div');
      titleBar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid ' + COLORS.slate + ';flex-shrink:0;';

      var dots = el('div');
      dots.style.cssText = 'display:flex;gap:6px;';
      var redDot = el('span');
      redDot.style.cssText = 'width:12px;height:12px;border-radius:50%;background:rgba(255,107,53,0.6);display:inline-block;';
      var yellowDot = el('span');
      yellowDot.style.cssText = 'width:12px;height:12px;border-radius:50%;background:rgba(245,166,35,0.6);display:inline-block;';
      var greenDot = el('span');
      greenDot.style.cssText = 'width:12px;height:12px;border-radius:50%;background:rgba(126,200,160,0.6);display:inline-block;cursor:pointer;';
      greenDot.title = 'Expand fullscreen';
      var self = this;
      greenDot.addEventListener('click', function (e) { e.stopPropagation(); openFullscreen(self); });
      dots.appendChild(redDot);
      dots.appendChild(yellowDot);
      dots.appendChild(greenDot);
      titleBar.appendChild(dots);
      var titleText = el('span', '', 'apiari \u2014 coordinator dashboard');
      titleText.style.cssText = 'color:' + COLORS.smoke + ';font-size:11px;margin-left:8px;';
      titleBar.appendChild(titleText);
      r.appendChild(titleBar);

      // Tab bar
      var tabBar = el('div');
      tabBar.style.cssText = 'padding:2px 10px;color:' + COLORS.smoke + ';font-size:10px;border-bottom:1px solid ' + COLORS.slate + ';background:' + COLORS.wax + ';flex-shrink:0;';
      tabBar.innerHTML = ' * apiari --- <span style="color:' + COLORS.honey + '">[ apiari ]</span>   n/p q:quit';
      r.appendChild(tabBar);

      // KPI strip
      this.kpiStrip = el('div');
      this.kpiStrip.style.cssText = 'padding:6px 10px;border-bottom:1px solid ' + COLORS.slate + ';display:flex;gap:12px;flex-wrap:wrap;flex-shrink:0;';
      this._renderKpi({ github: 'ok', swarm: 'ok', sentry: 'ok' });
      r.appendChild(this.kpiStrip);

      // Main area
      var mainArea = el('div');
      mainArea.style.cssText = 'display:flex;flex:1;min-height:0;min-width:0;overflow:hidden;';

      // Left: Workers panel (40%)
      var workersPanel = el('div');
      workersPanel.style.cssText = 'width:40%;min-width:0;border-right:1px solid ' + COLORS.slate + ';display:flex;flex-direction:column;overflow:hidden;';
      var wpTitle = el('div');
      wpTitle.style.cssText = 'padding:4px 8px;color:' + COLORS.smoke + ';font-size:10px;border-bottom:1px solid ' + COLORS.slate + ';';
      this.wpTitleEl = wpTitle;
      wpTitle.textContent = '\u250C\u2500 Workers (0) \u2500\u2510';
      workersPanel.appendChild(wpTitle);
      this.aWorkerList = el('div');
      this.aWorkerList.style.cssText = 'flex:1;overflow-y:auto;padding:2px 0;';
      workersPanel.appendChild(this.aWorkerList);
      mainArea.appendChild(workersPanel);

      // Right: stacked panels (60%)
      var rightStack = el('div');
      rightStack.style.cssText = 'width:60%;min-width:0;display:flex;flex-direction:column;overflow:hidden;';

      // Reviews panel
      var reviewsPanel = el('div');
      reviewsPanel.style.cssText = 'flex:35;border-bottom:1px solid ' + COLORS.slate + ';display:flex;flex-direction:column;overflow:hidden;min-height:0;';
      var rpTitle = el('div');
      rpTitle.style.cssText = 'padding:4px 8px;color:' + COLORS.smoke + ';font-size:10px;border-bottom:1px solid ' + COLORS.slate + ';';
      rpTitle.textContent = '\u250C\u2500 Reviews \u2500\u2510';
      reviewsPanel.appendChild(rpTitle);
      this.reviewsList = el('div');
      this.reviewsList.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 8px;word-break:break-word;overflow-wrap:anywhere;';
      reviewsPanel.appendChild(this.reviewsList);
      rightStack.appendChild(reviewsPanel);

      // Signals panel
      var signalsPanel = el('div');
      signalsPanel.style.cssText = 'flex:30;border-bottom:1px solid ' + COLORS.slate + ';display:flex;flex-direction:column;overflow:hidden;min-height:0;';
      this.signalsPanelEl = signalsPanel;
      var spTitle = el('div');
      spTitle.style.cssText = 'padding:4px 8px;color:' + COLORS.smoke + ';font-size:10px;border-bottom:1px solid ' + COLORS.slate + ';';
      spTitle.textContent = '\u250C\u2500 Signals \u2500\u2510';
      signalsPanel.appendChild(spTitle);
      this.signalsList = el('div');
      this.signalsList.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 8px;word-break:break-word;overflow-wrap:anywhere;';
      signalsPanel.appendChild(this.signalsList);
      rightStack.appendChild(signalsPanel);

      // Feed panel
      var feedPanel = el('div');
      feedPanel.style.cssText = 'flex:35;display:flex;flex-direction:column;overflow:hidden;min-height:0;';
      var fpTitle = el('div');
      fpTitle.style.cssText = 'padding:4px 8px;color:' + COLORS.smoke + ';font-size:10px;border-bottom:1px solid ' + COLORS.slate + ';';
      fpTitle.textContent = '\u250C\u2500 Feed \u2500\u2510';
      feedPanel.appendChild(fpTitle);
      this.feedList = el('div');
      this.feedList.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 8px;word-break:break-word;overflow-wrap:anywhere;';
      feedPanel.appendChild(this.feedList);
      rightStack.appendChild(feedPanel);

      mainArea.appendChild(rightStack);
      r.appendChild(mainArea);

      // Chat panel
      var chatPanel = el('div');
      chatPanel.style.cssText = 'border-top:1px solid ' + COLORS.slate + ';display:flex;flex-direction:column;flex-shrink:0;';
      var chatTitle = el('div');
      chatTitle.style.cssText = 'padding:4px 8px;color:' + COLORS.smoke + ';font-size:10px;border-bottom:1px solid ' + COLORS.slate + ';display:flex;justify-content:space-between;';
      chatTitle.innerHTML = '\u250C\u2500 Chat (Bee) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 daemon <span style="color:' + COLORS.mint + '">\u25CF</span> \u2500\u2510';
      chatPanel.appendChild(chatTitle);

      this.chatArea = el('div');
      this.chatArea.style.cssText = 'max-height:60px;overflow-y:auto;overflow-x:hidden;padding:4px 8px;word-break:break-word;overflow-wrap:anywhere;';
      this.chatArea.setAttribute('data-chat-area', '1');
      chatPanel.appendChild(this.chatArea);

      // Input line
      this.chatInput = el('div');
      this.chatInput.style.cssText = 'padding:4px 8px;border-top:1px solid ' + COLORS.slate + ';color:' + COLORS.frost + ';font-size:11px;';
      this.chatInput.innerHTML = '<span style="color:' + COLORS.smoke + '">&gt;</span> <span class="_itext" style="color:' + COLORS.frost + '"></span><span class="cursor-blink" style="color:' + COLORS.honey + '">\u2502</span>';
      chatPanel.appendChild(this.chatInput);

      r.appendChild(chatPanel);

      // Status bar
      var statusBar = el('div');
      statusBar.style.cssText = 'padding:4px 10px;color:' + COLORS.smoke + ';font-size:10px;border-top:1px solid ' + COLORS.slate + ';background:' + COLORS.wax + ';flex-shrink:0;';
      statusBar.textContent = ' tab:switch  enter:select  c:chat  q:quit';
      r.appendChild(statusBar);
    }

    _renderKpi(kpiData) {
      this.kpiStrip.innerHTML = '';
      var items = kpiData || {};
      var keys = Object.keys(items);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var val = items[key];
        var pill = el('span');
        var dotColor = val === 'ok' ? COLORS.mint : COLORS.nectar;
        pill.style.cssText = 'color:' + dotColor + ';font-size:11px;';
        pill.innerHTML = '\u25CF <span style="color:' + COLORS.frost + '">' + key + '</span>';
        if (typeof val === 'number') {
          pill.innerHTML += ' <span style="color:' + COLORS.smoke + '">(' + val + ')</span>';
        }
        this.kpiStrip.appendChild(pill);
      }
    }

    addWorker(id, opts) {
      opts = opts || {};
      var status = opts.status || 'running';
      var s = STATUS[status] || STATUS.running;
      var row = el('div');
      row.style.cssText = 'padding:2px 8px;font-size:11px;display:flex;align-items:center;gap:6px;animation:tdSlideIn 0.2s ease;';
      row.innerHTML = '<span class="_wdot" style="color:' + s.color + '">' + s.icon + '</span>' +
        '<span class="_wname" style="color:' + COLORS.white + '">' + id + '</span>' +
        '<span style="color:' + COLORS.smoke + ';margin-left:auto;font-size:10px;">' + (opts.task || '') + '</span>';
      this.aWorkerList.appendChild(row);
      this.workers.set(id, { el: row, status: status });
      this.wpTitleEl.textContent = '\u250C\u2500 Workers (' + this.workers.size + ') \u2500\u2510';
    }

    setWorkerStatus(id, status) {
      var w = this.workers.get(id);
      if (!w) return;
      var s = STATUS[status] || STATUS.running;
      w.status = status;
      var dot = w.el.querySelector('._wdot');
      if (dot) { dot.textContent = s.icon; dot.style.color = s.color; }
      var name = w.el.querySelector('._wname');
      if (name) name.style.color = status === 'done' ? COLORS.smoke : COLORS.white;
    }

    addSignal(text, opts) {
      opts = opts || {};
      var row = el('div');
      row.style.cssText = 'padding:2px 0;font-size:10px;color:' + (opts.color || COLORS.nectar) + ';animation:tdSlideIn 0.2s ease;';
      row.textContent = text;
      this.signalsList.appendChild(row);
      this.signalsList.scrollTop = this.signalsList.scrollHeight;
      if (opts.flash) this._flashPanel(this.signalsPanelEl);
    }

    addReview(text) {
      var row = el('div');
      row.style.cssText = 'padding:2px 0;font-size:10px;color:' + COLORS.frost + ';animation:tdSlideIn 0.2s ease;';
      row.textContent = text;
      this.reviewsList.appendChild(row);
      this.reviewsList.scrollTop = this.reviewsList.scrollHeight;
    }

    addFeed(text) {
      var row = el('div');
      row.style.cssText = 'padding:2px 0;font-size:10px;color:' + COLORS.smoke + ';animation:tdSlideIn 0.2s ease;';
      row.textContent = text;
      this.feedList.appendChild(row);
      this.feedList.scrollTop = this.feedList.scrollHeight;
    }

    async addChat(role, text, speed) {
      speed = speed || 20;
      var line = el('div');
      line.style.cssText = 'padding:1px 0;font-size:11px;animation:tdSlideIn 0.2s ease;';
      var labelColor = role === 'bee' ? COLORS.mint : COLORS.honey;
      var label = role === 'bee' ? 'Bee' : 'You';
      line.innerHTML = '<span style="color:' + labelColor + ';font-weight:600;">' + label + ':</span> <span class="_ct" style="color:' + COLORS.frost + '"></span>';
      this.chatArea.appendChild(line);

      var ct = line.querySelector('._ct');
      if (this.aborted) { ct.textContent = text; return; }
      for (var i = 0; i < text.length; i++) {
        if (this.aborted) { ct.textContent = text; return; }
        ct.textContent = text.slice(0, i + 1);
        this.chatArea.scrollTop = this.chatArea.scrollHeight;
        await sleep(speed);
      }
    }

    async simulateInput(text, speed) {
      speed = speed || 40;
      var itext = this.chatInput.querySelector('._itext');
      if (!itext) return;
      for (var i = 0; i <= text.length; i++) {
        if (this.aborted) { itext.textContent = text; return; }
        itext.textContent = text.slice(0, i);
        await sleep(speed);
      }
    }

    clearInput() {
      var itext = this.chatInput.querySelector('._itext');
      if (itext) itext.textContent = '';
    }

    sendInput() {
      var itext = this.chatInput.querySelector('._itext');
      var text = itext ? itext.textContent : '';
      if (text) {
        this.addChat('you', text, 0);
        this.clearInput();
      }
    }

    _flashPanel(panelEl) {
      panelEl.style.transition = 'box-shadow 0.15s';
      panelEl.style.boxShadow = '0 0 8px ' + COLORS.nectar + ', inset 0 0 4px rgba(255,107,53,0.2)';
      setTimeout(function () {
        panelEl.style.boxShadow = '';
      }, 600);
    }

    _clearAll() {
      this.aWorkerList.innerHTML = '';
      this.workers.clear();
      this.signalsList.innerHTML = '';
      this.reviewsList.innerHTML = '';
      this.feedList.innerHTML = '';
      this.chatArea.innerHTML = '';
      this.clearInput();
      this.wpTitleEl.textContent = '\u250C\u2500 Workers (0) \u2500\u2510';
    }

    async startDemo() {
      while (true) {
        this.aborted = false;
        this._clearAll();
        await sleep(100);
        if (this.aborted) return;
        await apiariTerminalScript(this);
        if (this.aborted) return;
        this.loopCount++;
        this.root.style.transition = 'opacity 0.5s';
        this.root.style.opacity = '0.4';
        await sleep(800);
        if (this.aborted) { this.root.style.opacity = '1'; return; }
        this.root.style.opacity = '1';
      }
    }
  }

  // ─── New Demo Scripts ───────────────────────────────────────────

  async function swarmTerminalScript(t) {
    // Add workers
    t.addWorker('hive-1', { status: 'running', branch: 'swarm/auth-middleware', agent: 'claude', ago: '2m ago', task: 'add JWT auth middleware', color: COLORS.honey });
    t.addWorker('hive-2', { status: 'waiting', branch: 'swarm/caching-layer', agent: 'claude', ago: '8m ago', task: 'implement caching', color: COLORS.mint });
    t.addWorker('cli-1', { status: 'done', branch: 'swarm/readme-update', agent: 'claude', ago: '14m ago', task: 'update README', color: COLORS.smoke });
    t.setPrUrl('hive-2', 'github.com/\u2026/pull/42');

    await sleep(400); if (t.aborted) return;

    // Select hive-1
    t.setSelectedWorker('hive-1');
    await sleep(600); if (t.aborted) return;

    // Stream conversation for hive-1
    var readIdx = t.appendConversation('<span style="color:' + COLORS.mint + '">\u22EF</span> <span style="color:' + COLORS.smoke + '">Read src/routes/mod.rs</span>', 'tool');
    await sleep(800); if (t.aborted) return;

    // Update to done
    t.updateConversationAt(readIdx, '<span style="color:' + COLORS.mint + '">\u2714</span> <span style="color:' + COLORS.smoke + '">Read src/routes/mod.rs</span>', 'tool');

    t.appendConversation('<span style="color:' + COLORS.mint + '">\u2714</span> <span style="color:' + COLORS.smoke + '">Read src/main.rs</span>', 'tool');
    await sleep(600); if (t.aborted) return;

    var editIdx = t.appendConversation('<span style="color:' + COLORS.honey + '">\u22EF</span> <span style="color:' + COLORS.smoke + '">Edit src/middleware.rs \u2026</span>', 'tool');
    await sleep(500); if (t.aborted) return;

    t.appendConversation('Adding JWT validation layer\u2026', 'output');
    await sleep(800); if (t.aborted) return;

    t.appendConversation('Writing token extraction logic\u2026', 'output');
    await sleep(1000); if (t.aborted) return;

    // Mark edit done
    t.updateConversationAt(editIdx, '<span style="color:' + COLORS.mint + '">\u2714</span> <span style="color:' + COLORS.smoke + '">Edit src/middleware.rs</span>', 'tool');
    await sleep(400); if (t.aborted) return;

    t.appendConversation('<span style="color:' + COLORS.mint + '">\u2714</span> <span style="color:' + COLORS.smoke + '">Write tests/middleware_test.rs</span>', 'tool');
    await sleep(600); if (t.aborted) return;

    t.appendConversation('Running: cargo test', 'output');
    await sleep(1200); if (t.aborted) return;

    t.appendConversation('<span style="color:' + COLORS.mint + '">\u2714</span> <span style="color:' + COLORS.smoke + '">cargo test \u2014 47 passed</span>', 'tool');
    await sleep(500); if (t.aborted) return;

    var commitIdx = t.appendConversation('<span style="color:' + COLORS.honey + '">\u22EF</span> <span style="color:' + COLORS.smoke + '">git commit -m "feat: add JWT auth middleware"</span>', 'tool');
    await sleep(800); if (t.aborted) return;

    t.updateConversationAt(commitIdx, '<span style="color:' + COLORS.mint + '">\u2714</span> <span style="color:' + COLORS.smoke + '">git commit -m "feat: add JWT auth middleware"</span>', 'tool');
    await sleep(400); if (t.aborted) return;

    t.appendConversation('<span style="color:' + COLORS.mint + '">\u2714</span> <span style="color:' + COLORS.smoke + '">gh pr create \u2192 PR #43 opened</span>', 'tool');
    await sleep(600); if (t.aborted) return;

    t.setWorkerStatus('hive-1', 'waiting');
    t.setPrUrl('hive-1', 'github.com/\u2026/pull/43');

    await sleep(3000);
  }

  async function apiariTerminalScript(t) {
    // Initial state
    t._renderKpi({ github: 'ok', swarm: 'ok', sentry: 'ok' });
    t.addWorker('hive-1', { status: 'running', task: 'add caching layer' });
    t.addWorker('hive-2', { status: 'waiting', task: 'update auth tests' });
    t.addReview('\u25CB PR #41 \u2014 caching layer (hive-1)');
    t.addFeed('\u25CF hive-2 opened PR #40 \u2014 auth tests');
    t.addFeed('\u25CF cli-1 completed \u2014 README update');

    await sleep(800); if (t.aborted) return;

    // Sentry signal arrives
    t.addSignal('\u26A0 Sentry: NullPointerException in auth (\u00D712)', { flash: true, color: COLORS.nectar });
    await sleep(300); if (t.aborted) return;
    t._renderKpi({ github: 'ok', swarm: 'ok', sentry: 12 });
    t.addFeed('\u25CF Signal: Sentry error NullPointerException');

    await sleep(1200); if (t.aborted) return;

    // Coordinator responds
    await t.addChat('bee', 'Picked up a Sentry error \u2014 NullPointerException in auth (\u00D712). Want me to dispatch a fix?');
    if (t.aborted) return;

    await sleep(2000); if (t.aborted) return;

    // User types response
    await t.simulateInput('yes dispatch it');
    if (t.aborted) return;
    await sleep(500); if (t.aborted) return;
    t.sendInput();

    await sleep(400); if (t.aborted) return;

    // Spawn new worker
    t.addWorker('hive-3', { status: 'running', task: 'fix NullPointerException' });
    t.addFeed('\u25CF Spawned hive-3 \u2014 fix NullPointerException');

    await t.addChat('bee', 'Spawned hive-3. I\'ll ping you when the PR is ready.');
    if (t.aborted) return;

    await sleep(3000); if (t.aborted) return;

    // Worker finishes
    t.setWorkerStatus('hive-3', 'waiting');
    t.addReview('\u25CB PR #44 \u2014 fix auth NPE (hive-3)');
    t.addFeed('\u25CF hive-3 opened PR #44');

    await t.addChat('bee', 'hive-3 opened PR #44 \u2014 fixes the NullPointerException. CI is green. Ready for review.');
    if (t.aborted) return;

    await sleep(3000);
  }

  // ─── Init ───────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var heroEl = document.getElementById('hero-terminal');
    var swarmEl = document.getElementById('swarm-terminal');
    var apiariEl = document.getElementById('apiari-terminal');

    if (heroEl) {
      new TerminalDemo(heroEl, {
        title: 'apiari ui',
        showKpi: true,
        kpi: { workers: 2, signals: 2, prs: 1 },
        demoScript: heroDemoScript,
      }).startDemo();
    }

    if (swarmEl) {
      new SwarmTerminal(swarmEl).startDemo();
    }

    if (apiariEl) {
      new ApiariTerminal(apiariEl).startDemo();
    }

    // ── Architecture diagrams ──
    var swarmDiagramEl = document.getElementById('swarm-diagram');
    var apiariDiagramEl = document.getElementById('apiari-diagram');

    if (swarmDiagramEl) {
      var swarmState = buildSwarmDiagram(swarmDiagramEl);
      var swarmBtn = document.getElementById('swarm-diagram-toggle');
      if (swarmBtn) {
        swarmBtn.addEventListener('click', function () {
          swarmState.paused = !swarmState.paused;
          swarmBtn.innerHTML = swarmState.paused ? '&#9654; Play' : '&#9654; Pause';
        });
      }
    }

    if (apiariDiagramEl) {
      var apiariState = buildApiariDiagram(apiariDiagramEl);
      var apiariBtn = document.getElementById('apiari-diagram-toggle');
      if (apiariBtn) {
        apiariBtn.addEventListener('click', function () {
          apiariState.paused = !apiariState.paused;
          apiariBtn.innerHTML = apiariState.paused ? '&#9654; Play' : '&#9654; Pause';
        });
      }
    }
  });

  window.TerminalDemo = TerminalDemo;
})();
