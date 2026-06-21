/**
 * Apache ECharts remix.
 *
 * The gotcha: a chart renders to one opaque <canvas> (or <svg>). You can't make
 * individual bars spatial stops — the whole chart is a single element. So the
 * chart container is NOT data-focusable; instead a row of focusable CONTROLS
 * drives it: a prev/next stepper that highlights a bar via dispatchAction, and
 * legend toggles. The controls are the spatial stops; the chart reacts.
 *
 * ECharts init is guarded + uses the SVG renderer so the example is resilient
 * (and the jsdom test can mount it without a canvas 2d context).
 */
import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'

const CATEGORIES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SERIES = {
  Builds: [12, 18, 9, 22, 16, 7, 4],
  Deploys: [3, 5, 2, 8, 6, 1, 0],
}

export function EchartsExample() {
  const elRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!elRef.current) return
    // ECharts (zrender) measures text through a canvas 2d context even in SVG
    // mode. Environments without one (jsdom) can't render — skip init there;
    // the focusable controls below still work. Real browsers always pass this.
    if (!document.createElement('canvas').getContext?.('2d')) return
    let chart: echarts.ECharts | null = null
    try {
      chart = echarts.init(elRef.current, undefined, { renderer: 'svg', width: 560, height: 240 })
      chart.setOption({
        tooltip: {},
        legend: { data: Object.keys(SERIES), textStyle: { color: '#c7d5e0' } },
        xAxis: { type: 'category', data: CATEGORIES, axisLabel: { color: '#c7d5e0' } },
        yAxis: { type: 'value', axisLabel: { color: '#c7d5e0' } },
        series: Object.entries(SERIES).map(([name, data]) => ({ name, type: 'bar', data })),
      })
      chartRef.current = chart
    } catch {
      // jsdom / no-layout environments: the controls below still work.
    }
    return () => chart?.dispose()
  }, [])

  // Drive the chart from spatial focus: highlight the active bar.
  function highlight(index: number) {
    const next = (index + CATEGORIES.length) % CATEGORIES.length
    setActive(next)
    const chart = chartRef.current
    if (!chart) return
    chart.dispatchAction({ type: 'downplay' })
    chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: next })
    chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: next })
  }

  function toggleSeries(name: string) {
    chartRef.current?.dispatchAction({ type: 'legendToggleSelect', name })
  }

  return (
    <div className="ex-body">
      <section className="ex-panel" data-spatial-container="remember">
        <h2>Chart — controls are the stops, not the canvas</h2>
        <p className="hint">
          The chart container has no <code>data-focusable</code> (an SVG/canvas is one opaque
          element). The focusable controls below drive it via <code>dispatchAction</code>.
        </p>
        <div id="chart" ref={elRef} className="chart-surface" />
        <div className="ex-row" data-spatial-container style={{ marginTop: 14 }}>
          <button className="btn" id="ctrl-prev" onClick={() => highlight(active - 1)}>
            ◀ Prev bar
          </button>
          <button className="btn" id="ctrl-next" onClick={() => highlight(active + 1)}>
            Next bar ▶
          </button>
          {Object.keys(SERIES).map((name) => (
            <button key={name} className="btn" id={`ctrl-${name}`} onClick={() => toggleSeries(name)}>
              Toggle {name}
            </button>
          ))}
        </div>
        <p className="status" id="readout">
          highlighted: <strong>{CATEGORIES[active]}</strong>
        </p>
      </section>
    </div>
  )
}
