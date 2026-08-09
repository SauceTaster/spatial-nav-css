// Solid 1.9's JSX types have no data-* wildcard, and this example is *about*
// declarative data-spatial-* attributes — widen the JSX surface for src/solid.
import 'solid-js'

declare module 'solid-js' {
  namespace JSX {
    interface HTMLAttributes<T> {
      [attr: `data-${string}`]: string | undefined
    }
  }
}
