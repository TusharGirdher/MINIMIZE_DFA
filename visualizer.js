/**
 * DFA Graph Visualizer — D3.js
 * Premium Black/Gold theme
 */

class DFAVisualizer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = {
      nodeRadius: 28,
      width: 500,
      height: 350,
      ...options,
    };
    this.simulation = null;
  }

  render(dfa, options = {}) {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    container.innerHTML = '';

    const rect = container.getBoundingClientRect();
    const W = rect.width || this.options.width;
    const H = rect.height || this.options.height;
    const R = this.options.nodeRadius;

    /* ── Colors ── */
    const COL = {
      nodeFill: '#131318',
      nodeStroke: '#3a3535',
      nodeText: '#eae6df',
      startStroke: '#c9952e',
      startText: '#e8c36a',
      acceptStroke: '#4ade80',
      acceptText: '#4ade80',
      edge: '#2d2d35',
      edgeText: '#8a8478',
      arrow: '#4a4a52',
      arrowStart: '#c9952e',
    };

    // Build nodes & links
    const nodes = dfa.states.map((s, i) => ({
      id: s,
      isAccept: dfa.acceptStates.includes(s),
      isStart: s === dfa.startState,
      index: i,
    }));

    const linkAgg = {};
    for (const src of dfa.states) {
      if (!dfa.transitions[src]) continue;
      for (const sym of dfa.alphabet) {
        const tgt = dfa.transitions[src][sym];
        if (tgt == null) continue;
        const key = `${src}→${tgt}`;
        if (!linkAgg[key]) linkAgg[key] = { source: src, target: tgt, labels: [] };
        linkAgg[key].labels.push(sym);
      }
    }
    const links = Object.values(linkAgg).map(l => ({ ...l, label: l.labels.join(', ') }));

    // SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', H)
      .attr('viewBox', `0 0 ${W} ${H}`);

    const defs = svg.append('defs');

    // Glow filter
    const glow = defs.append('filter').attr('id', `glow-${this.containerId}`);
    glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arrow markers
    const makeMarker = (id, color, refX) => {
      defs.append('marker')
        .attr('id', `${id}-${this.containerId}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', refX)
        .attr('refY', 0)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L10,0L0,4')
        .attr('fill', color);
    };

    makeMarker('arrow', COL.arrow, R + 10);
    makeMarker('arrow-loop', COL.arrow, 8);
    makeMarker('arrow-start', COL.arrowStart, R + 10);

    const g = svg.append('g');

    // Zoom
    svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', e => g.attr('transform', e.transform)));

    // Force
    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(140))
      .force('charge', d3.forceManyBody().strength(-450))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(R + 24));

    // Self-loop path
    function selfLoop(x, y) {
      const lr = 24;
      return `M${x},${y - R} C${x - lr * 2},${y - R - lr * 2.5} ${x + lr * 2},${y - R - lr * 2.5} ${x},${y - R}`;
    }

    function linkArc(d) {
      if (d.source.id === d.target.id) return selfLoop(d.source.x, d.source.y);
      const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
      const hasReverse = links.some(l => l !== d &&
        (l.source.id || l.source) === (d.target.id || d.target) &&
        (l.target.id || l.target) === (d.source.id || d.source));
      if (hasReverse) return `M${d.source.x},${d.source.y} A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      return `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`;
    }

    // Links
    const linkG = g.append('g');
    const linkPaths = linkG.selectAll('path').data(links).enter().append('path')
      .attr('fill', 'none')
      .attr('stroke', COL.edge)
      .attr('stroke-width', 1.5)
      .attr('marker-end', d =>
        d.source.id === d.target.id
          ? `url(#arrow-loop-${this.containerId})`
          : `url(#arrow-${this.containerId})`
      );

    const linkLabels = linkG.selectAll('text').data(links).enter().append('text')
      .text(d => d.label)
      .attr('font-size', 12)
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('font-weight', 500)
      .attr('fill', COL.edgeText)
      .attr('text-anchor', 'middle')
      .attr('dy', -9);

    // Nodes
    const nodeG = g.selectAll('.node').data(nodes).enter().append('g').attr('class', 'node')
      .call(d3.drag().on('start', dragStart).on('drag', dragged).on('end', dragEnd));

    // Accept outer ring
    nodeG.filter(d => d.isAccept).append('circle')
      .attr('r', R + 6)
      .attr('fill', 'none')
      .attr('stroke', COL.acceptStroke)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,3')
      .attr('opacity', 0.7);

    // Main circle
    nodeG.append('circle')
      .attr('r', R)
      .attr('fill', COL.nodeFill)
      .attr('stroke', d => d.isStart ? COL.startStroke : d.isAccept ? COL.acceptStroke : COL.nodeStroke)
      .attr('stroke-width', d => d.isStart ? 2.5 : d.isAccept ? 2 : 1.5)
      .attr('filter', d => d.isStart ? `url(#glow-${this.containerId})` : null);

    // Label
    nodeG.append('text')
      .text(d => d.id)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.38em')
      .attr('font-size', 14)
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('font-weight', 600)
      .attr('fill', d => d.isStart ? COL.startText : d.isAccept ? COL.acceptText : COL.nodeText);

    // Start arrow
    const startNode = nodes.find(n => n.isStart);
    if (startNode) {
      g.append('line').attr('class', 'start-arrow')
        .attr('stroke', COL.arrowStart)
        .attr('stroke-width', 2)
        .attr('marker-end', `url(#arrow-start-${this.containerId})`);
    }

    const sim = this.simulation;
    sim.on('tick', () => {
      linkPaths.attr('d', linkArc);
      linkLabels
        .attr('x', d => d.source.id === d.target.id ? d.source.x : (d.source.x + d.target.x) / 2)
        .attr('y', d => d.source.id === d.target.id ? d.source.y - R - 40 : (d.source.y + d.target.y) / 2);
      nodeG.attr('transform', d => `translate(${d.x},${d.y})`);
      if (startNode) {
        g.select('.start-arrow')
          .attr('x1', startNode.x - R - 38).attr('y1', startNode.y)
          .attr('x2', startNode.x - R - 2).attr('y2', startNode.y);
      }
    });

    function dragStart(event, d) { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
    function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
    function dragEnd(event, d) { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }
  }

  clear() {
    const c = document.getElementById(this.containerId);
    if (c) c.innerHTML = '';
    if (this.simulation) this.simulation.stop();
  }
}
