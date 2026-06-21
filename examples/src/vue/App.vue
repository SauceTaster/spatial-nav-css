<!--
  Vue 3 adapter example.

  Surfaces:
   - v-spatial-container directive to mark a zone (wrap / remember)
   - useFocusable() composable (in Card.vue) → { elRef, focused }
   - v-focusable directive shorthand on native buttons
   - EXCLUSION gotcha: a plain element with no directive is skipped; an
     <input tabindex="-1"> is skipped even though inputs are native stops
   - autoRestoreFocus: activating a card removes it; focus lands on a neighbor
-->
<script setup lang="ts">
import { ref } from 'vue'
import Card from './Card.vue'

const cards = ref(
  ['Quartz', 'Rhyolite', 'Slate', 'Tuff', 'Umber', 'Vellum'].map((label, i) => ({
    id: `card-${i}`,
    label,
  })),
)
const removed = ref<string | null>(null)

function remove(id: string, label: string) {
  cards.value = cards.value.filter((c) => c.id !== id)
  removed.value = label
}
</script>

<template>
  <div class="ex-body">
    <section class="ex-panel" v-spatial-container="'remember'">
      <h2>Toolbar — v-spatial-container directive</h2>
      <p class="hint">
        <code>v-focusable</code> buttons are stops. The search field opts out with
        <code>tabindex="-1"</code>, so spatial nav skips straight past it.
      </p>
      <div class="ex-row">
        <button class="btn" id="tb-play" v-focusable>▶ Play</button>
        <input class="btn" id="tb-search" tabindex="-1" placeholder="(skipped: type freely)" />
        <button class="btn" id="tb-info" v-focusable>ⓘ Info</button>
      </div>
    </section>

    <section class="ex-panel" v-spatial-container="'wrap remember'">
      <h2>Cards — useFocusable composable</h2>
      <p class="hint">
        Each card is a <code>useFocusable()</code> stop. <kbd>Enter</kbd>/Ⓐ removes it and focus
        auto-restores. The hatched tile has no directive — never a stop.
      </p>
      <div class="ex-grid">
        <Card v-for="c in cards" :key="c.id" :id="c.id" :label="c.label" @remove="remove(c.id, c.label)" />
        <div class="tile decoration" id="decoration"><span class="tag">decorative — not focusable</span></div>
      </div>
      <p class="status" id="status">
        {{ removed ? `removed “${removed}” — focus auto-restored` : 'activate a card to remove it' }}
      </p>
    </section>
  </div>
</template>
