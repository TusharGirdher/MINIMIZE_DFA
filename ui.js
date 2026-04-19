/**
 * UI Controller — Auto-playing minimization with speed slider,
 * cell-by-cell comparison highlighting, and multiple DFA examples.
 */

class UIController {
  constructor() {
    this.currentDFA = null;
    this.engineResult = null;
    this.currentStep = 0;
    this.totalSteps = 0;
    this.displaySteps = [];
    this.vizOriginal = new DFAVisualizer('graph-original');
    this.vizOrigFinal = new DFAVisualizer('graph-orig-final');
    this.vizMinimal = new DFAVisualizer('graph-minimal');

    // Animation state
    this.animationTimer = null;
    this.isPlaying = false;
    this.animationSpeed = 1500; // ms per step (default medium)
    this.subStepQueue = [];     // queue of micro-steps for cell-by-cell fill
    this.subStepTimer = null;

    // Example cycling
    this.exampleKeys = Object.keys(EXAMPLE_DFAS);
    this.currentExampleIndex = this.exampleKeys.indexOf('textbook');
    if (this.currentExampleIndex < 0) this.currentExampleIndex = 0;

    this._init();
  }

  _init() {
    this._loadExample(this.exampleKeys[this.currentExampleIndex]);

    // Button bindings
    document.getElementById('btn-start').addEventListener('click', () => this._startMinimization());
    document.getElementById('btn-skip').addEventListener('click', () => this._skipToFinal());
    document.getElementById('btn-another').addEventListener('click', () => this._loadNextExample());

    // Speed slider
    const slider = document.getElementById('speed-slider');
    if (slider) {
      slider.addEventListener('input', (e) => this._onSpeedChange(e.target.value));
      this._onSpeedChange(slider.value);
    }
  }

  _onSpeedChange(val) {
    // val: 1 (slowest) to 5 (fastest)
    const v = parseInt(val);
    const speeds = {
      1: 3000,  // slowest — every detail
      2: 2000,
      3: 1200,
      4: 700,
      5: 300    // fastest
    };
    this.animationSpeed = speeds[v] || 1200;

    // Update label
    const labels = { 1: 'Slowest — Every Detail', 2: 'Slow', 3: 'Medium', 4: 'Fast', 5: 'Fastest' };
    const lbl = document.getElementById('speed-label');
    if (lbl) lbl.textContent = labels[v] || 'Medium';
  }

  _loadExample(key) {
    const dfa = EXAMPLE_DFAS[key];
    if (!dfa) return;

    // Stop any running animation
    this._stopAnimation();

    this.currentDFA = { ...dfa };
    this.engineResult = null;
    document.getElementById('example-state-count').textContent = `${dfa.states.length} states`;
    document.getElementById('example-dfa-name').textContent = dfa.name;

    // Render original DFA graph
    this.vizOriginal.render(dfa);

    // Render transition table
    this._renderTransitionTable(dfa);

    // Hide walkthrough and final sections
    document.getElementById('walkthrough-section').classList.remove('visible');
    document.getElementById('final-section').classList.remove('visible');

    // Reset buttons
    const startBtn = document.getElementById('btn-start');
    startBtn.innerHTML = '<span>▶</span> Start Minimization';
    startBtn.disabled = false;
  }

  _loadNextExample() {
    this.currentExampleIndex = (this.currentExampleIndex + 1) % this.exampleKeys.length;
    this._loadExample(this.exampleKeys[this.currentExampleIndex]);

    // Scroll to example section
    setTimeout(() => {
      document.getElementById('sec-example').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  _renderTransitionTable(dfa) {
    const wrap = document.getElementById('transition-table-wrap');
    let html = '<table class="trans-table"><thead><tr>';
    html += '<th>State</th>';
    dfa.alphabet.forEach(a => (html += `<th>δ(·, ${a})</th>`));
    html += '</tr></thead><tbody>';

    dfa.states.forEach(s => {
      html += '<tr>';
      let indicator = '';
      if (s === dfa.startState && dfa.acceptStates.includes(s))
        indicator = '<span class="indicator both"></span>';
      else if (s === dfa.startState) indicator = '<span class="indicator start"></span>';
      else if (dfa.acceptStates.includes(s)) indicator = '<span class="indicator accept"></span>';

      html += `<td><span class="state-badge">${indicator} ${s}`;
      if (s === dfa.startState) html += ' <small style="color:var(--gold);font-size:10px">(start)</small>';
      if (dfa.acceptStates.includes(s))
        html += ' <small style="color:#6bcf7f;font-size:10px">(accept)</small>';
      html += '</span></td>';

      dfa.alphabet.forEach(a => {
        const tgt = dfa.transitions[s] ? dfa.transitions[s][a] : '—';
        html += `<td>${tgt || '—'}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  /* ─────────────────────────────────────────────────────────
     START MINIMIZATION — auto-playing animation
     ───────────────────────────────────────────────────────── */
  _startMinimization() {
    if (!this.currentDFA) return;

    // Run engine
    const engine = new DFAEngine(this.currentDFA);
    this.engineResult = engine.minimize();

    // Build display steps
    this._buildDisplaySteps();

    // Show walkthrough section
    const ws = document.getElementById('walkthrough-section');
    ws.classList.add('visible');

    // Hide final section
    document.getElementById('final-section').classList.remove('visible');

    // Render progress bar
    this._renderProgressBar();

    // Disable start button during animation
    const startBtn = document.getElementById('btn-start');
    startBtn.innerHTML = '<span>⏸</span> Playing...';
    startBtn.disabled = true;

    // Start auto-play from step 0
    this.currentStep = -1;
    this.isPlaying = true;

    setTimeout(() => {
      ws.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => this._playNextStep(), 600);
    }, 100);
  }

  _stopAnimation() {
    this.isPlaying = false;
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    if (this.subStepTimer) {
      clearTimeout(this.subStepTimer);
      this.subStepTimer = null;
    }
    this.subStepQueue = [];
  }

  _playNextStep() {
    if (!this.isPlaying) return;

    const nextIdx = this.currentStep + 1;
    if (nextIdx >= this.totalSteps) {
      // Finished all steps → show final result
      this.isPlaying = false;
      const startBtn = document.getElementById('btn-start');
      startBtn.innerHTML = '<span>▶</span> Start Minimization';
      startBtn.disabled = false;

      this._renderFinal();
      document.getElementById('final-section').classList.add('visible');
      setTimeout(() => {
        document.getElementById('final-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
      return;
    }

    this._showStep(nextIdx);

    const step = this.displaySteps[nextIdx];

    // For base/propagation steps, do cell-by-cell animation
    if ((step.type === 'base' || step.type === 'propagation') && step._cellSteps && step._cellSteps.length > 0) {
      this._playCellAnimation(step, () => {
        // After cell animation, wait then advance
        this.animationTimer = setTimeout(() => this._playNextStep(), this.animationSpeed);
      });
    } else {
      // Simple step — wait and advance
      this.animationTimer = setTimeout(() => this._playNextStep(), this.animationSpeed);
    }
  }

  /* ─────────────────────────────────────────────────────────
     CELL-BY-CELL ANIMATION for pair table
     ───────────────────────────────────────────────────────── */
  _playCellAnimation(step, onComplete) {
    const cellSteps = step._cellSteps;
    let idx = 0;

    // Determine sub-step delay based on speed
    const slider = document.getElementById('speed-slider');
    const speedVal = slider ? parseInt(slider.value) : 3;
    const subDelay = speedVal <= 2 ? Math.max(400, this.animationSpeed / 3) : Math.max(150, this.animationSpeed / 4);

    const playNext = () => {
      if (!this.isPlaying || idx >= cellSteps.length) {
        onComplete();
        return;
      }

      const cs = cellSteps[idx];
      idx++;

      // Highlight the cell being compared
      const cellEl = document.getElementById(cs.cellId);
      if (cellEl) {
        // Remove previous comparing highlights
        document.querySelectorAll('.pair-table td.comparing').forEach(el => el.classList.remove('comparing'));

        if (cs.action === 'compare') {
          cellEl.classList.add('comparing');

          // Show comparison info
          const infoEl = document.getElementById('comparison-info');
          if (infoEl && cs.info) {
            infoEl.innerHTML = `<span class="compare-arrow">⟶</span> ${cs.info}`;
            infoEl.classList.add('visible');
          }
        } else if (cs.action === 'mark') {
          cellEl.classList.remove('comparing');
          cellEl.classList.add('just-marked');
          cellEl.textContent = '×';

          const infoEl = document.getElementById('comparison-info');
          if (infoEl && cs.info) {
            infoEl.innerHTML = `<span class="compare-check">✗</span> ${cs.info}`;
          }
        } else if (cs.action === 'skip') {
          cellEl.classList.add('comparing');
          setTimeout(() => cellEl.classList.remove('comparing'), subDelay * 0.7);

          const infoEl = document.getElementById('comparison-info');
          if (infoEl && cs.info) {
            infoEl.innerHTML = `<span class="compare-check">✓</span> ${cs.info}`;
          }
        }
      }

      this.subStepTimer = setTimeout(playNext, subDelay);
    };

    playNext();
  }

  /* ─────────────────────────────────────────────────────────
     SKIP TO FINAL RESULT
     ───────────────────────────────────────────────────────── */
  _skipToFinal() {
    if (!this.currentDFA) return;
    this._stopAnimation();

    if (!this.engineResult) {
      const engine = new DFAEngine(this.currentDFA);
      this.engineResult = engine.minimize();
      this._buildDisplaySteps();
    }

    // Hide walkthrough
    document.getElementById('walkthrough-section').classList.remove('visible');

    // Reset start button
    const startBtn = document.getElementById('btn-start');
    startBtn.innerHTML = '<span>▶</span> Start Minimization';
    startBtn.disabled = false;

    // Show final
    this._renderFinal();
    const fs = document.getElementById('final-section');
    fs.classList.add('visible');
    setTimeout(() => fs.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  /* ─────────────────────────────────────────────────────────
     BUILD DISPLAY STEPS — with micro-steps for cell animation
     ───────────────────────────────────────────────────────── */
  _buildDisplaySteps() {
    const r = this.engineResult;
    const engineSteps = r.steps;
    const mt = r.markedTable;
    const ws = r.workingStates;
    this.displaySteps = [];

    // Step 1: Reachability
    const reachStep = engineSteps.find(s => s.phase === 'reachability');
    this.displaySteps.push({
      title: 'Remove Unreachable States',
      explanation:
        `We start by finding all states reachable from the start state "${this.currentDFA.startState}". ` +
        `We traverse the transition function beginning at the initial state and follow every possible transition. ` +
        (reachStep.removed && reachStep.removed.length > 0
          ? `States ${reachStep.removed.map(s => `"${s}"`).join(', ')} are unreachable and are removed.`
          : `All ${reachStep.reachable.length} states are reachable — none need to be removed.`),
      reachable: reachStep.reachable,
      removed: reachStep.removed,
      type: 'reachability',
    });

    // Step 2: Base case — build cell-by-cell micro-steps
    const baseStep = engineSteps.find(s => s.phase === 'base');
    const basePairNames = (baseStep.markedPairs || []).map(k => {
      const parts = k.split(',');
      return `(${parts[0]}, ${parts[1]})`;
    });

    // Build cell steps for base case
    const baseCellSteps = [];
    for (let j = 1; j < ws.length; j++) {
      for (let i = 0; i < j; i++) {
        const a = ws[i], b = ws[j];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const cellId = `cell-base-${i}-${j}`;
        const entry = mt[key];

        if (entry && entry.marked && entry.iteration === 0) {
          baseCellSteps.push({
            cellId,
            action: 'compare',
            info: `Comparing (${a}, ${b}): one is accept, the other is not`,
          });
          baseCellSteps.push({
            cellId,
            action: 'mark',
            info: `Marked (${a}, ${b}) — distinguished by ε (empty string)`,
          });
        } else {
          baseCellSteps.push({
            cellId,
            action: 'skip',
            info: `(${a}, ${b}): both same type — not yet distinguishable`,
          });
        }
      }
    }

    this.displaySteps.push({
      title: 'Base Case — ε-Distinguishability',
      explanation:
        `Now we examine every pair of states and ask: "Is one an accept state and the other not?" ` +
        `If yes, they are immediately distinguishable — the empty string ε separates them. ` +
        `We mark these pairs with "×". ` +
        (basePairNames.length > 0
          ? `Pairs marked: ${basePairNames.join(', ')}.`
          : `No pairs marked at base case.`),
      type: 'base',
      markedUpTo: 0,
      _cellSteps: baseCellSteps,
    });

    // Step 3+: Propagation rounds
    const propStep = engineSteps.find(s => s.phase === 'propagation');
    if (propStep && propStep.iterations) {
      propStep.iterations.forEach((iter, idx) => {
        const pairs = iter.newlyMarked.map(k => {
          const parts = k.split(',');
          return `(${parts[0]}, ${parts[1]})`;
        });

        const details = iter.newlyMarked.map(k => {
          const entry = mt[k];
          return entry ? entry.reason : '';
        });

        // Build cell steps for propagation
        const propCellSteps = [];
        for (let j = 1; j < ws.length; j++) {
          for (let i = 0; i < j; i++) {
            const a = ws[i], b = ws[j];
            const key = a < b ? `${a},${b}` : `${b},${a}`;
            const cellId = `cell-prop${idx}-${i}-${j}`;
            const entry = mt[key];

            // Already marked in a previous step?
            if (entry && entry.marked && entry.iteration < iter.iteration) {
              continue; // skip already marked, they show with ×
            }
            // Newly marked in this iteration?
            if (iter.newlyMarked.includes(key)) {
              // Show what we're checking
              for (const sym of this.currentDFA.alphabet) {
                const dp = this.currentDFA.transitions[a] ? this.currentDFA.transitions[a][sym] : null;
                const dq = this.currentDFA.transitions[b] ? this.currentDFA.transitions[b][sym] : null;
                if (dp && dq && dp !== dq) {
                  const transKey = dp < dq ? `${dp},${dq}` : `${dq},${dp}`;
                  if (mt[transKey] && mt[transKey].marked && mt[transKey].iteration < iter.iteration) {
                    propCellSteps.push({
                      cellId,
                      action: 'compare',
                      info: `Checking (${a}, ${b}) on symbol '${sym}': δ(${a},'${sym}')=${dp}, δ(${b},'${sym}')=${dq} → pair (${dp},${dq}) is already marked`,
                    });
                    propCellSteps.push({
                      cellId,
                      action: 'mark',
                      info: `Marked (${a}, ${b}) — distinguished via symbol '${sym}'`,
                    });
                    break;
                  }
                }
              }
            } else if (!entry.marked) {
              // Unmarked — show checking briefly
              propCellSteps.push({
                cellId,
                action: 'skip',
                info: `(${a}, ${b}): transitions don't lead to any marked pair — still equivalent`,
              });
            }
          }
        }

        this.displaySteps.push({
          title: `Propagation — Round ${idx + 1}`,
          explanation:
            `We scan all still-unmarked pairs. For each pair (p, q), we check each input symbol: ` +
            `"If I apply this symbol to both states, does the resulting pair already appear as distinguishable?" ` +
            `If yes, then (p, q) is also distinguishable, and we mark it. ` +
            (pairs.length > 0
              ? `In this round, newly marked pairs: ${pairs.join(', ')}.`
              : `No new pairs were marked — we've reached a fixed point. The algorithm terminates.`),
          type: 'propagation',
          iteration: iter.iteration,
          newlyMarkedKeys: iter.newlyMarked,
          details: details,
          _cellSteps: propCellSteps,
        });
      });
    }

    // Step: Equivalence Classes
    const classStep = engineSteps.find(s => s.phase === 'classes');
    const classes = classStep ? classStep.classes : [];
    this.displaySteps.push({
      title: 'Identify Equivalence Classes',
      explanation:
        `All pairs that remain unmarked are equivalent — no string can distinguish them. ` +
        `We group these equivalent states into equivalence classes. ` +
        `Each class becomes exactly one state in the minimized DFA. ` +
        `We found ${classes.length} equivalence class${classes.length !== 1 ? 'es' : ''}.`,
      type: 'classes',
      classes: classes,
    });

    // Step: Build minimized DFA
    this.displaySteps.push({
      title: 'Build the Minimized DFA',
      explanation:
        `Finally, we construct the minimized DFA. Each equivalence class becomes a single state. ` +
        `Transitions between classes are derived from the original transitions — all states within a class ` +
        `agree on where each symbol leads (that's precisely what equivalence guarantees). ` +
        `The start class is whichever class contains the original start state. ` +
        `Accept classes are those containing at least one original accept state. ` +
        `Result: ${r.minimalDFA.states.length} states (down from ${this.currentDFA.states.length}).`,
      type: 'final',
    });

    this.totalSteps = this.displaySteps.length;
  }

  /* ─────────────────────────────────────────────────────────
     PROGRESS BAR
     ───────────────────────────────────────────────────────── */
  _renderProgressBar() {
    const bar = document.getElementById('step-progress-bar');
    let html = '';
    for (let i = 0; i < this.totalSteps; i++) {
      html += `<div class="step-pip">`;
      html += `<div class="dot" id="pip-${i}">${i + 1}</div>`;
      if (i < this.totalSteps - 1) html += `<div class="connector" id="conn-${i}"></div>`;
      html += `</div>`;
    }
    bar.innerHTML = html;
  }

  /* ─────────────────────────────────────────────────────────
     SHOW STEP
     ───────────────────────────────────────────────────────── */
  _showStep(idx) {
    if (idx < 0 || idx >= this.totalSteps) return;
    this.currentStep = idx;
    const step = this.displaySteps[idx];

    // Update progress dots
    for (let i = 0; i < this.totalSteps; i++) {
      const dot = document.getElementById(`pip-${i}`);
      const conn = document.getElementById(`conn-${i}`);
      if (!dot) continue;
      dot.classList.remove('active', 'done');
      if (i < idx) dot.classList.add('done');
      else if (i === idx) dot.classList.add('active');
      if (conn) {
        conn.classList.remove('done');
        if (i < idx) conn.classList.add('done');
      }
    }

    // Render step content
    const content = document.getElementById('step-content');
    content.innerHTML = this._buildStepHTML(step, idx);

    // Update counter
    document.getElementById('step-counter').textContent = `Step ${idx + 1} of ${this.totalSteps}`;
  }

  /* ─────────────────────────────────────────────────────────
     BUILD STEP HTML
     ───────────────────────────────────────────────────────── */
  _buildStepHTML(step, idx) {
    let html = `
      <div class="step-card">
        <div class="step-header">
          <div class="step-number">${idx + 1}</div>
          <div class="step-title">${step.title}</div>
        </div>
        <div class="step-explanation">
          <div class="explain-label">📖 What's happening</div>
          ${step.explanation}
        </div>`;

    // ─── Reachability ───
    if (step.type === 'reachability') {
      html += `<div class="step-detail">
        <strong>Reachable states:</strong>
        <div class="partition-list" style="margin-top:10px">
          ${(step.reachable || []).map(s => `<span class="partition-group">${s}</span>`).join('')}
        </div>
      </div>`;
      if (step.removed && step.removed.length > 0) {
        html += `<div class="step-detail" style="margin-top:10px;">
          <strong>Removed (unreachable):</strong>
          <div class="partition-list" style="margin-top:10px">
            ${step.removed.map(s => `<span class="partition-group" style="border-color:#e06060;color:#e06060;">${s}</span>`).join('')}
          </div>
        </div>`;
      }
    }

    // ─── Base / Propagation: pair table ───
    if (step.type === 'base' || step.type === 'propagation') {
      html += this._renderPairTableHTML(step, idx);

      // Info box for live comparison
      html += `<div class="comparison-info-box" id="comparison-info"></div>`;

      // Show details for propagation
      if (step.type === 'propagation' && step.details && step.details.length > 0) {
        const nonEmpty = step.details.filter(d => d);
        if (nonEmpty.length > 0) {
          html += `<div class="step-detail" style="margin-top:14px;">
            <strong>Reasoning:</strong><br/>
            ${nonEmpty.map(d => `<code>${d}</code>`).join('<br/>')}
          </div>`;
        }
      }
    }

    // ─── Equivalence Classes ───
    if (step.type === 'classes') {
      html += `<div class="step-detail">
        <strong>Equivalence classes (each becomes one state):</strong>
        <div class="partition-list" style="margin-top:10px">
          ${(step.classes || []).map(cls => `<span class="partition-group highlight">{ ${[...cls].join(', ')} }</span>`).join('')}
        </div>
      </div>`;
    }

    // ─── Final: minimized DFA summary ───
    if (step.type === 'final') {
      const m = this.engineResult.minimalDFA;
      html += `<div class="step-detail">
        <strong>Minimized DFA:</strong> ${m.states.length} states<br/>
        <strong>Start:</strong> ${m.startState}<br/>
        <strong>Accept:</strong> { ${m.acceptStates.join(', ')} }
      </div>`;
    }

    html += `</div>`;
    return html;
  }

  /* ─────────────────────────────────────────────────────────
     PAIR TABLE RENDERING — with unique cell IDs for animation
     ───────────────────────────────────────────────────────── */
  _renderPairTableHTML(step, stepIdx) {
    const ws = this.engineResult.workingStates;
    const mt = this.engineResult.markedTable;
    if (ws.length < 2) return '';

    let maxIter = 0;
    if (step.type === 'base') {
      maxIter = 0;
    } else if (step.type === 'propagation') {
      maxIter = step.iteration || 999;
    }

    // Determine which keys were newly marked this step
    const newlyMarkedSet = new Set();
    if (step.type === 'base') {
      for (const key in mt) {
        if (mt[key].marked && mt[key].iteration === 0) newlyMarkedSet.add(key);
      }
    } else if (step.type === 'propagation' && step.newlyMarkedKeys) {
      step.newlyMarkedKeys.forEach(k => newlyMarkedSet.add(k));
    }

    // Prefix for cell IDs
    const prefix = step.type === 'base' ? 'cell-base' : `cell-prop${this.displaySteps.indexOf(step) - 2}`;

    let html = '<div style="overflow-x:auto; margin-top:16px;"><table class="pair-table"><tr><th></th>';
    for (let i = 0; i < ws.length - 1; i++) html += `<th>${ws[i]}</th>`;
    html += '</tr>';

    for (let j = 1; j < ws.length; j++) {
      html += `<tr><th>${ws[j]}</th>`;
      for (let i = 0; i < ws.length - 1; i++) {
        if (i >= j) {
          html += '<td class="empty-cell"></td>';
          continue;
        }
        const a = ws[i], b = ws[j];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const cellId = `${prefix}-${i}-${j}`;
        const entry = mt[key];

        if (entry && entry.marked && entry.iteration <= maxIter) {
          const isNew = newlyMarkedSet.has(key);
          // For animation: newly marked cells start empty, will be filled by animation
          if (isNew && step._cellSteps && step._cellSteps.length > 0) {
            html += `<td id="${cellId}" class="pending-cell">—</td>`;
          } else {
            html += `<td id="${cellId}" class="${isNew ? 'just-marked' : 'marked'}">×</td>`;
          }
        } else {
          html += `<td id="${cellId}">—</td>`;
        }
      }
      html += '</tr>';
    }
    html += '</table></div>';
    return html;
  }

  /* ─────────────────────────────────────────────────────────
     RENDER FINAL RESULT
     ───────────────────────────────────────────────────────── */
  _renderFinal() {
    if (!this.engineResult) return;
    const r = this.engineResult;

    // Stats
    document.getElementById('stat-orig').textContent = this.currentDFA.states.length;
    document.getElementById('stat-min').textContent = r.minimalDFA.states.length;
    const classStep = r.steps.find(s => s.phase === 'classes');
    document.getElementById('stat-classes').textContent = classStep ? classStep.count : r.minimalDFA.states.length;
    const reduction = Math.round(
      ((this.currentDFA.states.length - r.minimalDFA.states.length) / this.currentDFA.states.length) * 100
    );
    document.getElementById('stat-reduction').textContent = `${reduction}%`;

    // Render both graphs
    this.vizOrigFinal.render(this.currentDFA);
    this.vizMinimal.render(r.minimalDFA, { isMinimal: true });

    // Equivalence classes
    const eqDiv = document.getElementById('eq-classes-display');
    const classes = classStep ? classStep.classes : [];
    eqDiv.innerHTML = classes
      .map(cls => `<span class="partition-group highlight">{ ${[...cls].join(', ')} }</span>`)
      .join('');

    // Minimized DFA transition table
    this._renderMinTransitionTable(r.minimalDFA);
  }

  /* ─────────────────────────────────────────────────────────
     RENDER MINIMIZED DFA TRANSITION TABLE
     ───────────────────────────────────────────────────────── */
  _renderMinTransitionTable(minDFA) {
    const wrap = document.getElementById('min-transition-table-wrap');
    if (!wrap) return;

    let html = '<table class="trans-table"><thead><tr>';
    html += '<th>State</th>';
    minDFA.alphabet.forEach(a => (html += `<th>δ'(·, ${a})</th>`));
    html += '</tr></thead><tbody>';

    minDFA.states.forEach(s => {
      html += '<tr>';
      let indicator = '';
      if (s === minDFA.startState && minDFA.acceptStates.includes(s))
        indicator = '<span class="indicator both"></span>';
      else if (s === minDFA.startState) indicator = '<span class="indicator start"></span>';
      else if (minDFA.acceptStates.includes(s)) indicator = '<span class="indicator accept"></span>';

      html += `<td><span class="state-badge">${indicator} ${s}`;
      if (s === minDFA.startState) html += ' <small style="color:var(--gold);font-size:10px">(start)</small>';
      if (minDFA.acceptStates.includes(s))
        html += ' <small style="color:var(--green);font-size:10px">(accept)</small>';
      html += '</span></td>';

      minDFA.alphabet.forEach(a => {
        const tgt = minDFA.transitions[s] ? minDFA.transitions[s][a] : '—';
        html += `<td>${tgt || '—'}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;
  }
}

// Init on load
window.addEventListener('DOMContentLoaded', () => {
  window.ui = new UIController();
});
