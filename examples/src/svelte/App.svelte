<!--
  Svelte adapter example (Svelte 5 runes).

  Surfaces:
   - createSpatialNav() → { nav, focused (store), destroy }
   - use:spatialContainer action to mark a zone
   - use:focusable action on cards, with onActivate
   - the `focused` store to drive styling ($focused)
   - EXCLUSION gotcha: a plain element with no action is skipped; a
     tabindex="-1" button is skipped
   - autoRestoreFocus on card removal

  `options`/`onReady` props let the test inject deterministic engine options
  and grab the nav handle; the browser entry uses the defaults.
-->
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { createSpatialNav, focusable, spatialContainer } from 'spatial-nav-css/svelte'
  import type { SpatialNavigation, SpatialNavigationOptions } from 'spatial-nav-css'

  let {
    options = { autofocus: true } as SpatialNavigationOptions,
    onReady,
  }: { options?: SpatialNavigationOptions; onReady?: (nav: SpatialNavigation) => void } = $props()

  const { nav, focused, destroy } = createSpatialNav(options)
  onReady?.(nav)
  onDestroy(destroy)

  let cards = $state(
    ['Willow', 'Xeric', 'Yarrow', 'Zephyr', 'Aster', 'Briar'].map((label, i) => ({
      id: `card-${i}`,
      label,
    })),
  )
  let removed = $state<string | null>(null)

  function remove(id: string, label: string) {
    cards = cards.filter((c) => c.id !== id)
    removed = label
  }
</script>

<div class="ex-body">
  <section class="ex-panel" use:spatialContainer={'remember'}>
    <h2>Toolbar — use:spatialContainer action</h2>
    <p class="hint">
      <code>use:focusable</code> buttons are stops. The middle one opts out with
      <code>tabindex="-1"</code> and is skipped.
    </p>
    <div class="ex-row">
      <button class="btn" id="tb-play" use:focusable>▶ Play</button>
      <button class="btn" id="tb-skip" tabindex="-1">(skipped)</button>
      <button class="btn" id="tb-info" use:focusable>ⓘ Info</button>
    </div>
  </section>

  <section class="ex-panel" use:spatialContainer={'wrap remember'}>
    <h2>Cards — use:focusable + focused store</h2>
    <p class="hint">
      <kbd>Enter</kbd>/Ⓐ removes a card; focus auto-restores. The hatched tile has no action — never a
      stop.
    </p>
    <div class="ex-grid">
      {#each cards as c (c.id)}
        <button
          class="tile"
          id={c.id}
          data-focused={$focused?.id === c.id ? 'true' : 'false'}
          use:focusable={{ onActivate: () => remove(c.id, c.label) }}
        >
          {c.label}
          <span class="tag">{$focused?.id === c.id ? '◉ focused — Enter removes' : 'card'}</span>
        </button>
      {/each}
      <div class="tile decoration" id="decoration"><span class="tag">decorative — not focusable</span></div>
    </div>
    <p class="status" id="status">
      {removed ? `removed “${removed}” — focus auto-restored` : 'activate a card to remove it'}
    </p>
  </section>
</div>
