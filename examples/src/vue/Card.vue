<script setup lang="ts">
import { useFocusable } from 'spatial-nav-css/vue'

const props = defineProps<{ id: string; label: string }>()
const emit = defineEmits<{ remove: [] }>()

// useFocusable marks the bound element a stop and tracks reactive focus state.
const { elRef, focused } = useFocusable({ onActivate: () => emit('remove') })
</script>

<template>
  <button ref="elRef" :id="props.id" class="tile" :data-focused="String(focused)">
    {{ props.label }}
    <span class="tag">{{ focused ? '◉ focused — Enter removes' : 'card' }}</span>
  </button>
</template>
