/**
 * React Flow (@xyflow/react) remix.
 *
 * React Flow positions nodes with CSS transforms on a pan/zoom canvas. The
 * spatial engine reads getBoundingClientRect — which is post-transform — so
 * directional navigation can use those on-screen rectangles at any zoom/pan.
 *
 * Two integration notes (gotchas):
 *  - Disable React Flow's own node focus (nodesFocusable={false}) and mark a
 *    one native control inside each node instead — otherwise each node is TWO stops
 *    (RF's focusable wrapper + your content).
 *  - The custom node's box is the stop; its rect tracks the transformed wrapper.
 */
import { ReactFlow, Background, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

function SpatialNode({ id, data }: NodeProps) {
  return (
    <button type="button" className="flow-node" id={`node-${id}`}>
      {(data as { label: string }).label}
    </button>
  )
}

const nodeTypes = { spatial: SpatialNode }

// Explicit width/height so React Flow has measured dimensions immediately —
// otherwise nodes stay visibility:hidden until a ResizeObserver pass, which can
// hang in some environments and would make them unreachable by spatial nav.
const NODE_SIZE = { width: 110, height: 40 }
const nodes = [
  { id: '1', type: 'spatial', position: { x: 240, y: 0 }, data: { label: 'Ingest' }, ...NODE_SIZE },
  { id: '2', type: 'spatial', position: { x: 60, y: 120 }, data: { label: 'Transform' }, ...NODE_SIZE },
  { id: '3', type: 'spatial', position: { x: 420, y: 120 }, data: { label: 'Validate' }, ...NODE_SIZE },
  { id: '4', type: 'spatial', position: { x: 240, y: 240 }, data: { label: 'Load' }, ...NODE_SIZE },
]
const edges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e1-3', source: '1', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-4', source: '3', target: '4' },
]

export function ReactFlowExample() {
  return (
    <div className="ex-body">
      <section className="ex-panel" data-spatial-container="remember">
        <h2>Node graph — spatial nav across transformed nodes</h2>
        <p className="hint">
          Each node contains one native <code>&lt;button&gt;</code> stop; React Flow's own node focus is
          off to avoid double stops. The engine reads post-transform geometry, so <kbd>←↑↓→</kbd>
          moves by on-screen position.
        </p>
        <div className="flow-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesFocusable={false}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
          </ReactFlow>
        </div>
      </section>
    </div>
  )
}
