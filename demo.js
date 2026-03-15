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

  // ─── Init ───────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var heroEl = document.getElementById('hero-terminal');
    var swarmEl = document.getElementById('swarm-terminal');
    var apiariEl = document.getElementById('apiari-terminal');

    if (heroEl) {
      new TerminalDemo(heroEl, {
        title: 'apiari ui',
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
  });

  window.TerminalDemo = TerminalDemo;
})();
