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
      this.chatArea.style.cssText = 'flex:1;overflow-y:auto;max-height:160px;min-height:80px;';
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

  // Create a dot that travels along a straight line path
  function createTravellingDot(svg, x1, y1, x2, y2, opts) {
    opts = opts || {};
    var color = opts.color || COLORS.honey;
    var duration = opts.duration || 2000;
    var radius = opts.radius || 4;

    var dot = svgEl('circle', {
      cx: x1, cy: y1, r: radius,
      fill: color,
      opacity: '0',
    });
    svg.appendChild(dot);

    var startTime = null;
    var delay = opts.delay || 0;

    function animate(ts) {
      if (!dot.parentNode) return;
      if (!startTime) startTime = ts;
      var elapsed = ts - startTime - delay;
      if (elapsed < 0) {
        dot.setAttribute('opacity', '0');
        requestAnimationFrame(animate);
        return;
      }
      var progress = (elapsed % duration) / duration;
      // Pause between loops
      if (progress > 0.7) {
        dot.setAttribute('opacity', '0');
      } else {
        var t = progress / 0.7;
        dot.setAttribute('cx', x1 + (x2 - x1) * t);
        dot.setAttribute('cy', y1 + (y2 - y1) * t);
        var fadeIn = Math.min(t / 0.15, 1);
        var fadeOut = t > 0.85 ? (1 - t) / 0.15 : 1;
        dot.setAttribute('opacity', Math.min(fadeIn, fadeOut));
      }
      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
    return dot;
  }

  // ─── Swarm Diagram ──────────────────────────────────────────────

  function buildSwarmDiagram(container) {
    container.innerHTML = '';
    var svg = svgEl('svg', { viewBox: '0 0 880 260', preserveAspectRatio: 'xMidYMid meet' });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.minHeight = '200px';

    // Static elements group
    var staticG = svgEl('g');
    var animG = svgEl('g'); // animated overlays

    // -- You node --
    staticG.appendChild(svgRect(20, 90, 110, 70, { stroke: COLORS.honey }));
    staticG.appendChild(svgText(75, 120, 'You', { fill: COLORS.honey, size: '15', weight: '600' }));
    staticG.appendChild(svgText(75, 140, 'TUI', { fill: COLORS.smoke, size: '11' }));

    // -- Arrow You → swarm --
    staticG.appendChild(svgAnimatedLine(130, 125, 200, 125, { animated: true, stroke: COLORS.slate }));

    // -- swarm node --
    staticG.appendChild(svgRect(200, 70, 140, 110, { stroke: COLORS.honey }));
    staticG.appendChild(svgText(270, 110, 'swarm', { fill: COLORS.honey, size: '15', weight: '600' }));
    staticG.appendChild(svgText(270, 132, 'multiplexer', { fill: COLORS.smoke, size: '11' }));
    staticG.appendChild(svgText(270, 148, '+ TUI', { fill: COLORS.smoke, size: '11' }));

    // -- Worker positions --
    var workerData = [
      { id: 'worktree-1', agent: 'claude agent', y: 20, targetY: 55 },
      { id: 'worktree-2', agent: 'claude agent', y: 95, targetY: 125 },
      { id: 'worktree-3', agent: 'codex agent', y: 170, targetY: 195 },
    ];

    // -- spawn arrows swarm → workers --
    workerData.forEach(function (w) {
      staticG.appendChild(svgAnimatedLine(340, 125, 400, w.y + 30, { animated: true, stroke: COLORS.slate }));
    });

    // -- "spawn" label --
    staticG.appendChild(svgText(370, 120, 'spawn', { fill: COLORS.smoke, size: '10' }));

    // -- GitHub node --
    staticG.appendChild(svgRect(710, 80, 140, 90, { stroke: COLORS.royal }));
    staticG.appendChild(svgText(780, 118, 'GitHub', { fill: COLORS.royal, size: '15', weight: '600' }));
    staticG.appendChild(svgText(780, 140, 'PRs + branches', { fill: COLORS.smoke, size: '11' }));

    // -- "push" label --
    staticG.appendChild(svgText(660, 120, 'push', { fill: COLORS.smoke, size: '10' }));

    svg.appendChild(staticG);

    // -- Worker nodes (will be animated) --
    var workerEls = [];
    workerData.forEach(function (w, i) {
      var g = svgEl('g');
      g.style.opacity = '0';
      g.appendChild(svgRect(400, w.y, 190, 55, { rx: '6', stroke: COLORS.mint, sw: '1.5' }));
      g.appendChild(svgText(495, w.y + 22, w.id, { fill: COLORS.mint, size: '13', weight: '500' }));
      g.appendChild(svgText(495, w.y + 40, w.agent, { fill: COLORS.smoke, size: '11' }));

      // Pulse ring (hidden initially)
      var pulse = svgEl('rect', {
        x: 397, y: w.y - 3, width: 196, height: 61, rx: '8',
        fill: 'none', stroke: COLORS.mint, 'stroke-width': '1', opacity: '0',
      });
      g.appendChild(pulse);

      // Push arrow to GitHub
      var pushLine = svgAnimatedLine(590, w.y + 28, 710, 125, { animated: true, stroke: COLORS.slate });
      pushLine.style.opacity = '0';
      g.appendChild(pushLine);

      // Done checkmark (hidden)
      var check = svgText(590, w.y + 8, '\u2714', { fill: COLORS.mint, size: '14' });
      check.style.opacity = '0';
      g.appendChild(check);

      svg.appendChild(g);
      workerEls.push({ g: g, pulse: pulse, pushLine: pushLine, check: check, data: w });
    });

    svg.appendChild(animG);
    container.appendChild(svg);

    // -- Animation state --
    var state = { running: true, paused: false, animFrame: null };

    async function runLoop() {
      while (state.running) {
        // Reset all workers
        workerEls.forEach(function (w) {
          w.g.style.opacity = '0';
          w.pulse.setAttribute('opacity', '0');
          w.pushLine.style.opacity = '0';
          w.check.style.opacity = '0';
        });
        // Remove old travelling dots
        animG.innerHTML = '';

        await sleep(600);
        if (!state.running) return;

        // Spawn workers one by one
        for (var i = 0; i < workerEls.length; i++) {
          if (!state.running) return;
          while (state.paused) { await sleep(100); if (!state.running) return; }

          var w = workerEls[i];
          w.g.style.opacity = '1';
          w.g.style.animation = 'nodeSpawn 0.5s ease-out';

          // Start pulsing
          w.pulse.setAttribute('opacity', '0.3');
          w.pulse.style.animation = 'pulse 2s ease-in-out infinite';

          await sleep(800);
        }

        if (!state.running) return;

        // Workers are "running" for a bit
        await sleep(2000);
        if (!state.running) return;

        // Workers push to GitHub one by one
        for (var j = 0; j < workerEls.length; j++) {
          if (!state.running) return;
          while (state.paused) { await sleep(100); if (!state.running) return; }

          var we = workerEls[j];
          we.pushLine.style.opacity = '1';

          // Travelling dot along push line
          var wd = we.data;
          createTravellingDot(animG, 590, wd.y + 28, 710, 125, {
            color: COLORS.mint, duration: 1500, radius: 3, delay: 0,
          });

          await sleep(600);
        }

        await sleep(2000);
        if (!state.running) return;

        // Workers complete one by one
        for (var k = 0; k < workerEls.length; k++) {
          if (!state.running) return;
          while (state.paused) { await sleep(100); if (!state.running) return; }

          var wk = workerEls[k];
          wk.pulse.style.animation = 'none';
          wk.pulse.setAttribute('opacity', '0');
          wk.check.style.opacity = '1';
          wk.check.style.animation = 'checkPop 0.4s ease-out';
          // Fade the worker a bit to show "done"
          wk.g.style.opacity = '0.5';

          await sleep(500);
        }

        await sleep(3000);
        if (!state.running) return;
      }
    }

    runLoop();
    return state;
  }

  // ─── Apiari Diagram ─────────────────────────────────────────────

  function buildApiariDiagram(container) {
    container.innerHTML = '';
    var svg = svgEl('svg', { viewBox: '0 0 960 420', preserveAspectRatio: 'xMidYMid meet' });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.minHeight = '280px';

    var staticG = svgEl('g');
    var animG = svgEl('g');

    // -- You node --
    staticG.appendChild(svgRect(15, 130, 110, 80, { stroke: COLORS.honey }));
    staticG.appendChild(svgText(70, 163, 'You', { fill: COLORS.honey, size: '15', weight: '600' }));
    staticG.appendChild(svgText(70, 185, 'Telegram / TUI', { fill: COLORS.smoke, size: '10' }));

    // -- Arrow You ↔ daemon --
    staticG.appendChild(svgAnimatedLine(125, 170, 200, 170, { animated: true, stroke: COLORS.slate }));
    staticG.appendChild(svgText(162, 160, 'chat', { fill: COLORS.smoke, size: '10' }));

    // -- Apiari daemon node --
    staticG.appendChild(svgRect(200, 100, 180, 155, { stroke: COLORS.honey }));
    staticG.appendChild(svgText(290, 130, 'apiari daemon', { fill: COLORS.honey, size: '14', weight: '600' }));

    // Coordinator sub-label (will glow)
    var coordText = svgText(290, 155, 'coordinator', { fill: COLORS.mint, size: '12' });
    staticG.appendChild(coordText);

    staticG.appendChild(svgText(290, 175, 'signal watchers', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(290, 192, 'swarm watcher', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(290, 209, 'auto-triage', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(290, 226, 'telegram bot', { fill: COLORS.smoke, size: '10' }));

    // Spinner circle for "thinking" (hidden initially)
    var spinner = svgEl('circle', {
      cx: '240', cy: '150', r: '8',
      fill: 'none', stroke: COLORS.honey, 'stroke-width': '2',
      'stroke-dasharray': '15 35', opacity: '0',
    });
    spinner.style.transformOrigin = '240px 150px';
    staticG.appendChild(spinner);

    // -- Arrow daemon → swarm ("dispatch") --
    staticG.appendChild(svgAnimatedLine(380, 150, 465, 110, { animated: true, stroke: COLORS.slate }));
    staticG.appendChild(svgText(422, 122, 'dispatch', { fill: COLORS.smoke, size: '10' }));

    // -- Arrow daemon ↔ signals ("poll") --
    staticG.appendChild(svgAnimatedLine(380, 210, 465, 310, { animated: true, stroke: COLORS.slate, reverse: true }));
    staticG.appendChild(svgText(410, 268, 'poll', { fill: COLORS.smoke, size: '10' }));

    // -- Swarm node --
    staticG.appendChild(svgRect(465, 55, 145, 110, { stroke: COLORS.honey, sw: '1' }));
    staticG.appendChild(svgText(537, 92, 'swarm', { fill: COLORS.honey, size: '14', weight: '600' }));
    staticG.appendChild(svgText(537, 112, 'agents + worktrees', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(537, 128, 'state.json', { fill: COLORS.smoke, size: '10' }));

    // -- Notify arrow swarm → daemon --
    var notifyLine = svgAnimatedLine(465, 140, 380, 160, { animated: true, stroke: COLORS.mint, reverse: true });
    notifyLine.setAttribute('stroke-dasharray', '4 4');
    staticG.appendChild(notifyLine);
    staticG.appendChild(svgText(422, 158, 'notify', { fill: COLORS.mint, size: '9' }));

    // -- Signals node --
    staticG.appendChild(svgRect(465, 290, 145, 95, { stroke: COLORS.nectar, sw: '1' }));
    staticG.appendChild(svgText(537, 322, 'signals', { fill: COLORS.nectar, size: '14', weight: '600' }));
    staticG.appendChild(svgText(537, 342, 'Sentry errors', { fill: COLORS.smoke, size: '10' }));
    staticG.appendChild(svgText(537, 358, 'GitHub events', { fill: COLORS.smoke, size: '10' }));

    // -- GitHub node --
    staticG.appendChild(svgRect(790, 85, 140, 80, { stroke: COLORS.royal }));
    staticG.appendChild(svgText(860, 118, 'GitHub', { fill: COLORS.royal, size: '15', weight: '600' }));
    staticG.appendChild(svgText(860, 138, 'PRs + issues', { fill: COLORS.smoke, size: '11' }));

    // -- Webhooks path: GitHub → signals --
    var whPath = svgEl('path', {
      d: 'M 860 165 L 860 340 L 610 340',
      fill: 'none', stroke: COLORS.slate, 'stroke-width': '1',
      'stroke-dasharray': '4 4',
    });
    staticG.appendChild(whPath);
    staticG.appendChild(svgText(740, 358, 'webhooks', { fill: COLORS.smoke, size: '10' }));

    // -- Agent positions --
    var agentData = [
      { id: 'agent-1', y: 30 },
      { id: 'agent-2', y: 105 },
      { id: 'agent-3', y: 180 },
    ];

    // -- spawn arrows swarm → agents --
    agentData.forEach(function (a) {
      staticG.appendChild(svgAnimatedLine(610, 110, 660, a.y + 22, { animated: true, stroke: COLORS.slate, sw: '1' }));
    });

    // -- push arrows agents → GitHub --
    agentData.forEach(function (a) {
      staticG.appendChild(svgAnimatedLine(760, a.y + 22, 790, 125, { animated: true, stroke: COLORS.slate, sw: '1' }));
    });

    svg.appendChild(staticG);

    // -- Agent nodes (animated) --
    var agentEls = [];
    agentData.forEach(function (a) {
      var g = svgEl('g');
      g.style.opacity = '0';
      g.appendChild(svgRect(660, a.y, 100, 44, { rx: '4', stroke: COLORS.mint, sw: '1' }));
      g.appendChild(svgText(710, a.y + 27, a.id, { fill: COLORS.mint, size: '11' }));

      // Pulse indicator
      var pulse = svgEl('circle', {
        cx: 670, cy: a.y + 8, r: '3',
        fill: COLORS.mint, opacity: '0',
      });
      g.appendChild(pulse);

      svg.appendChild(g);
      agentEls.push({ g: g, pulse: pulse, data: a });
    });

    // -- PR checkmark on GitHub (hidden) --
    var prCheck = svgText(930, 105, '\u2714 PR', { fill: COLORS.mint, size: '12', weight: '600' });
    prCheck.style.opacity = '0';
    svg.appendChild(prCheck);

    // -- Telegram notification bubble (hidden) --
    var telegramBubble = svgEl('g');
    telegramBubble.style.opacity = '0';
    var bubbleRect = svgRect(15, 85, 110, 30, { rx: '12', stroke: COLORS.honey, fill: COLORS.wax, sw: '1' });
    telegramBubble.appendChild(bubbleRect);
    telegramBubble.appendChild(svgText(70, 105, 'PR opened!', { fill: COLORS.honey, size: '10', weight: '500' }));
    svg.appendChild(telegramBubble);

    svg.appendChild(animG);
    container.appendChild(svg);

    // -- Animation state --
    var state = { running: true, paused: false };

    async function runLoop() {
      while (state.running) {
        // Reset
        agentEls.forEach(function (a) {
          a.g.style.opacity = '0';
          a.pulse.setAttribute('opacity', '0');
          a.pulse.style.animation = '';
        });
        prCheck.style.opacity = '0';
        telegramBubble.style.opacity = '0';
        spinner.setAttribute('opacity', '0');
        spinner.style.animation = '';
        coordText.style.animation = '';
        animG.innerHTML = '';

        await sleep(600);
        if (!state.running) return;

        // Step 1: GitHub signal comes in (orange dot → daemon)
        while (state.paused) { await sleep(100); if (!state.running) return; }
        createTravellingDot(animG, 860, 165, 537, 340, {
          color: COLORS.honey, duration: 1800, radius: 4, delay: 0,
        });

        await sleep(1000);
        if (!state.running) return;

        // Step 2: Sentry error arrives (red dot → signals → daemon)
        while (state.paused) { await sleep(100); if (!state.running) return; }
        createTravellingDot(animG, 537, 290, 380, 210, {
          color: COLORS.nectar, duration: 1500, radius: 5, delay: 0,
        });

        await sleep(1500);
        if (!state.running) return;

        // Step 3: Coordinator "thinking" — spinner + glow
        while (state.paused) { await sleep(100); if (!state.running) return; }
        spinner.setAttribute('opacity', '1');
        spinner.style.animation = 'spin 1s linear infinite';
        coordText.style.animation = 'nodeGlow 1.5s ease-in-out infinite';

        await sleep(2000);
        if (!state.running) return;

        spinner.setAttribute('opacity', '0');
        spinner.style.animation = '';

        // Step 4: Workers dispatched one by one
        for (var i = 0; i < agentEls.length; i++) {
          if (!state.running) return;
          while (state.paused) { await sleep(100); if (!state.running) return; }

          var agent = agentEls[i];
          agent.g.style.opacity = '1';
          agent.g.style.animation = 'nodeSpawn 0.5s ease-out';
          agent.pulse.setAttribute('opacity', '1');
          agent.pulse.style.animation = 'pulse 1.5s ease-in-out infinite';

          // Dispatch dot daemon → swarm → agent
          createTravellingDot(animG, 380, 150, 660, agent.data.y + 22, {
            color: COLORS.honey, duration: 1200, radius: 3,
          });

          await sleep(600);
        }

        await sleep(2000);
        if (!state.running) return;

        // Step 5: Agents push to GitHub (green dots)
        while (state.paused) { await sleep(100); if (!state.running) return; }
        agentEls.forEach(function (a, idx) {
          createTravellingDot(animG, 760, a.data.y + 22, 790, 125, {
            color: COLORS.mint, duration: 1200, radius: 3, delay: idx * 300,
          });
        });

        await sleep(2000);
        if (!state.running) return;

        // Step 6: PR checkmark appears on GitHub
        while (state.paused) { await sleep(100); if (!state.running) return; }
        prCheck.style.opacity = '1';
        prCheck.style.animation = 'checkPop 0.4s ease-out';

        await sleep(1000);
        if (!state.running) return;

        // Step 7: Telegram notification to You
        while (state.paused) { await sleep(100); if (!state.running) return; }
        // Notification dot daemon → You
        createTravellingDot(animG, 200, 170, 125, 170, {
          color: COLORS.honey, duration: 800, radius: 3,
        });

        await sleep(600);
        if (!state.running) return;

        telegramBubble.style.opacity = '1';
        telegramBubble.style.animation = 'bubbleSlide 0.4s ease-out';

        await sleep(1000);
        if (!state.running) return;

        // Stop coordinator glow
        coordText.style.animation = '';

        // Workers fade to done
        agentEls.forEach(function (a) {
          a.pulse.style.animation = 'none';
          a.pulse.setAttribute('opacity', '0');
          a.g.style.opacity = '0.5';
        });

        await sleep(4000);
        if (!state.running) return;
      }
    }

    runLoop();
    return state;
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
      new TerminalDemo(swarmEl, {
        title: 'swarm',
        agentMode: true,
        demoScript: swarmDemoScript,
      }).startDemo();
    }

    if (apiariEl) {
      new TerminalDemo(apiariEl, {
        title: 'apiari ui',
        showKpi: true,
        kpi: { workers: 3, signals: 2, prs: 1 },
        demoScript: apiariDemoScript,
      }).startDemo();
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
