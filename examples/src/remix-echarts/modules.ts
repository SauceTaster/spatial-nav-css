import { BarChart } from 'echarts/charts'
import { GridSimpleComponent, LegendPlainComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

export function registerEChartsModules() {
  use([BarChart, GridSimpleComponent, LegendPlainComponent, TooltipComponent, SVGRenderer])
}
