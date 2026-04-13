/**
 * DFA Minimization Engine
 * Based on the Myhill–Nerode Theorem / Table-Filling (Hopcroft-style) algorithm.
 *
 * Key insight: Two states p, q are Myhill–Nerode equivalent (p ~L q) iff
 * ∀w ∈ Σ*, δ*(p,w) ∈ F ↔ δ*(q,w) ∈ F
 * i.e., no suffix string w distinguishes them.
 * The equivalence classes of ~L are exactly the states of the minimal DFA.
 */

class DFAEngine {
  constructor(dfa) {
    // dfa = { states, alphabet, transitions, startState, acceptStates }
    this.states = dfa.states;                // array of state names
    this.alphabet = dfa.alphabet;            // array of symbols
    this.transitions = dfa.transitions;      // { state: { symbol: nextState } }
    this.startState = dfa.startState;
    this.acceptStates = new Set(dfa.acceptStates);
    this.minimizationSteps = [];             // recorded steps for visualization
    this.partitionHistory = [];              // partition at each iteration
  }

  /**
   * Table-filling algorithm that directly implements Myhill–Nerode:
   * Mark pair (p,q) as distinguishable if ∃ suffix w that separates them.
   * Base: accept vs. non-accept are distinguishable by ε.
   * Inductive: (p,q) distinguishable if ∃ a ∈ Σ s.t. (δ(p,a), δ(q,a)) already marked.
   */
  minimize() {
    const states = this.states;
    const n = states.length;
    this.minimizationSteps = [];
    this.partitionHistory = [];

    // --- Step 0: Remove unreachable states ---
    const reachable = this._getReachableStates();
    const workingStates = states.filter(s => reachable.has(s));

    this.minimizationSteps.push({
      phase: 'reachability',
      title: 'Step 1 — Remove Unreachable States',
      description: `Starting from state "${this.startState}", perform BFS/DFS to identify all reachable states.`,
      nerodeNote: 'Unreachable states do not participate in any Myhill–Nerode equivalence class and can be discarded immediately.',
      reachable: [...reachable],
      removed: states.filter(s => !reachable.has(s)),
      workingStates: [...workingStates]
    });

    // --- Step 1: Build pair table ---
    // Create ordered pairs (i < j)
    const pairs = [];
    const pairKey = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
    const marked = {};    // pair key → { marked: bool, reason: string, iteration: int }
    const dependents = {}; // pair key → [ pair keys that depend on it ]

    for (let i = 0; i < workingStates.length; i++) {
      for (let j = i + 1; j < workingStates.length; j++) {
        const key = pairKey(workingStates[i], workingStates[j]);
        pairs.push(key);
        marked[key] = { marked: false, reason: '', iteration: -1 };
        dependents[key] = [];
      }
    }

    // --- Step 2: Base case — mark (accept, non-accept) pairs ---
    let baseCaseMarked = [];
    for (const key of pairs) {
      const [p, q] = key.split(',');
      const pAccept = this.acceptStates.has(p);
      const qAccept = this.acceptStates.has(q);
      if (pAccept !== qAccept) {
        marked[key] = {
          marked: true,
          reason: `One is an accept state, the other is not. Distinguished by ε (empty string).`,
          iteration: 0,
          distinguishingString: 'ε'
        };
        baseCaseMarked.push(key);
      }
    }

    this.minimizationSteps.push({
      phase: 'base',
      title: 'Step 2 — Base Case: ε distinguishes Accept vs. Non-Accept',
      description: 'Mark all pairs (p, q) where exactly one of p, q is an accept state.',
      nerodeNote: 'By definition of L-equivalence (Rₗ): if δ*(p,ε) ∈ F but δ*(q,ε) ∉ F, then p and q are distinguishable. The empty string ε serves as the distinguishing suffix.',
      markedPairs: [...baseCaseMarked],
      markedCount: baseCaseMarked.length,
      tableSnapshot: JSON.parse(JSON.stringify(marked))
    });

    // Build initial partition from Step 2
    this.partitionHistory.push(this._derivePartitions(workingStates, marked, 0));

    // --- Step 3: Inductive propagation ---
    let iteration = 1;
    let changed = true;
    const iterationSteps = [];

    while (changed) {
      changed = false;
      const newlyMarked = [];

      for (const key of pairs) {
        if (marked[key].marked) continue;
        const [p, q] = key.split(',');

        for (const symbol of this.alphabet) {
          const dp = this._transition(p, symbol);
          const dq = this._transition(q, symbol);
          if (dp === null || dq === null) continue;
          if (dp === dq) continue;

          const transKey = pairKey(dp, dq);
          if (marked[transKey] && marked[transKey].marked) {
            marked[key] = {
              marked: true,
              reason: `δ(${p},'${symbol}')=${dp}, δ(${q},'${symbol}')=${dq} → pair (${dp},${dq}) is already marked.`,
              iteration: iteration,
              distinguishingString: symbol + (marked[transKey].distinguishingString && marked[transKey].distinguishingString !== 'ε' ? marked[transKey].distinguishingString : (marked[transKey].distinguishingString === 'ε' ? '' : '')),
              distinguishingSymbol: symbol,
              transitionPair: transKey
            };
            newlyMarked.push(key);
            changed = true;
            break;
          }
        }
      }

      iterationSteps.push({
        iteration,
        newlyMarked: [...newlyMarked],
        tableSnapshot: JSON.parse(JSON.stringify(marked))
      });

      this.partitionHistory.push(this._derivePartitions(workingStates, marked, iteration));
      iteration++;
    }

    this.minimizationSteps.push({
      phase: 'propagation',
      title: 'Step 3 — Inductive Propagation',
      description: 'Repeatedly scan all unmarked pairs. Mark (p,q) if ∃ symbol a such that (δ(p,a), δ(q,a)) is already marked.',
      nerodeNote: 'This implements the inductive step of Myhill–Nerode: if suffix w distinguishes δ(p,a) from δ(q,a), then suffix aw distinguishes p from q.',
      iterations: iterationSteps,
      finalTable: JSON.parse(JSON.stringify(marked))
    });

    // --- Step 4: Identify equivalence classes ---
    const equivalenceClasses = this._buildEquivalenceClasses(workingStates, marked);

    this.minimizationSteps.push({
      phase: 'classes',
      title: 'Step 4 — Myhill–Nerode Equivalence Classes',
      description: 'Unmarked pairs are equivalent under Rₗ. Group all mutually equivalent states together.',
      nerodeNote: 'Each equivalence class [q]ₗ is exactly one state in the minimal DFA. The index of Rₗ (number of classes) equals the number of states in the minimal DFA — this is precisely the Myhill–Nerode theorem.',
      classes: equivalenceClasses.map(cls => [...cls]),
      count: equivalenceClasses.length
    });

    // --- Step 5: Construct minimal DFA ---
    const minimalDFA = this._constructMinimalDFA(equivalenceClasses, workingStates);

    this.minimizationSteps.push({
      phase: 'result',
      title: 'Step 5 — Minimal DFA (Canonical Form)',
      description: `The minimized DFA has ${minimalDFA.states.length} states vs. the original ${workingStates.length} reachable states.`,
      nerodeNote: 'The resulting DFA is the unique (up to isomorphism) minimal DFA for language L. Its states are the equivalence classes of Rₗ, confirming the Myhill–Nerode theorem constructively.',
      minimalDFA,
      originalStateCount: workingStates.length,
      minimalStateCount: minimalDFA.states.length,
      stateReduction: workingStates.length - minimalDFA.states.length
    });

    return {
      steps: this.minimizationSteps,
      partitionHistory: this.partitionHistory,
      minimalDFA,
      markedTable: marked,
      workingStates,
      pairs
    };
  }

  _getReachableStates() {
    const visited = new Set();
    const queue = [this.startState];
    visited.add(this.startState);
    while (queue.length > 0) {
      const s = queue.shift();
      for (const sym of this.alphabet) {
        const next = this._transition(s, sym);
        if (next && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return visited;
  }

  _transition(state, symbol) {
    return (this.transitions[state] && this.transitions[state][symbol]) || null;
  }

  _derivePartitions(states, marked, iteration) {
    // Union-Find to group equivalent states
    const parent = {};
    states.forEach(s => parent[s] = s);
    const find = s => parent[s] === s ? s : (parent[s] = find(parent[s]));
    const union = (a, b) => { parent[find(a)] = find(b); };

    for (let i = 0; i < states.length; i++) {
      for (let j = i + 1; j < states.length; j++) {
        const key = states[i] < states[j] ? `${states[i]},${states[j]}` : `${states[j]},${states[i]}`;
        if (!marked[key] || !marked[key].marked) {
          union(states[i], states[j]);
        }
      }
    }

    const groups = {};
    states.forEach(s => {
      const root = find(s);
      if (!groups[root]) groups[root] = [];
      groups[root].push(s);
    });
    return { iteration, partitions: Object.values(groups) };
  }

  _buildEquivalenceClasses(states, marked) {
    const parent = {};
    states.forEach(s => parent[s] = s);
    const find = s => parent[s] === s ? s : (parent[s] = find(parent[s]));
    const union = (a, b) => { parent[find(a)] = find(b); };

    for (let i = 0; i < states.length; i++) {
      for (let j = i + 1; j < states.length; j++) {
        const key = states[i] < states[j] ? `${states[i]},${states[j]}` : `${states[j]},${states[i]}`;
        if (!marked[key] || !marked[key].marked) {
          union(states[i], states[j]);
        }
      }
    }

    const groups = {};
    states.forEach(s => {
      const root = find(s);
      if (!groups[root]) groups[root] = new Set();
      groups[root].add(s);
    });
    return Object.values(groups);
  }

  _constructMinimalDFA(classes, workingStates) {
    const classOf = {};
    const classNames = classes.map((cls, i) => {
      const name = `{${[...cls].sort().join(',')}}`;
      cls.forEach(s => classOf[s] = name);
      return name;
    });

    const startClass = classOf[this.startState];
    const acceptClasses = new Set(
      classNames.filter(name => {
        const members = classes[classNames.indexOf(name)];
        return [...members].some(s => this.acceptStates.has(s));
      })
    );

    const transitions = {};
    classes.forEach((cls, i) => {
      const rep = [...cls][0];
      const className = classNames[i];
      transitions[className] = {};
      for (const sym of this.alphabet) {
        const next = this._transition(rep, sym);
        if (next) {
          transitions[className][sym] = classOf[next];
        }
      }
    });

    return {
      states: classNames,
      alphabet: [...this.alphabet],
      transitions,
      startState: startClass,
      acceptStates: [...acceptClasses],
      stateMap: classOf  // original state → minimized state name
    };
  }
}

// ── Pre-built Example DFAs ─────────────────────────────────────────────────────

const EXAMPLE_DFAS = {
  classic: {
    name: 'Classic 5-State DFA (accepts strings ending in "ab")',
    states: ['q0', 'q1', 'q2', 'q3', 'q4'],
    alphabet: ['a', 'b'],
    transitions: {
      q0: { a: 'q1', b: 'q0' },
      q1: { a: 'q1', b: 'q2' },
      q2: { a: 'q3', b: 'q0' },
      q3: { a: 'q3', b: 'q4' },
      q4: { a: 'q3', b: 'q0' }
    },
    startState: 'q0',
    acceptStates: ['q2', 'q4']
  },
  textbook: {
    name: 'Textbook 6-State DFA (Sipser example)',
    states: ['a', 'b', 'c', 'd', 'e', 'f'],
    alphabet: ['0', '1'],
    transitions: {
      a: { 0: 'b', 1: 'c' },
      b: { 0: 'a', 1: 'd' },
      c: { 0: 'e', 1: 'f' },
      d: { 0: 'e', 1: 'f' },
      e: { 0: 'e', 1: 'f' },
      f: { 0: 'f', 1: 'f' }
    },
    startState: 'a',
    acceptStates: ['c', 'd', 'e']
  },
  simple: {
    name: 'Simple even-length strings over {a,b}',
    states: ['s0', 's1', 's2', 's3'],
    alphabet: ['a', 'b'],
    transitions: {
      s0: { a: 's1', b: 's2' },
      s1: { a: 's0', b: 's3' },
      s2: { a: 's3', b: 's0' },
      s3: { a: 's2', b: 's1' }
    },
    startState: 's0',
    acceptStates: ['s0']
  },
  obvious: {
    name: 'DFA with obviously redundant states',
    states: ['p', 'q', 'r', 's', 't'],
    alphabet: ['0', '1'],
    transitions: {
      p: { 0: 'q', 1: 'r' },
      q: { 0: 's', 1: 't' },
      r: { 0: 's', 1: 't' },
      s: { 0: 's', 1: 't' },
      t: { 0: 's', 1: 't' }
    },
    startState: 'p',
    acceptStates: ['s']
  }
};
