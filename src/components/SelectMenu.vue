<script setup lang="ts" generic="T extends string | number">
// A dropdown that replaces the native <select>, so its arrow can flip while the list is
// open (browsers don't expose that state for native selects). Follows the WAI-ARIA
// "select-only combobox" pattern: focus stays on the button, arrow keys move through
// the options, Enter/Space picks, Escape closes.
import { computed, nextTick, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'
import Chevron from './Chevron.vue'

export interface SelectOption<V> {
  value: V
  label: string
}

const props = defineProps<{
  id?: string
  options: SelectOption<T>[]
  disabled?: boolean
}>()

// Angular: `defineModel` ≈ a two-way bindable input/output pair (what `v-model` binds to).
const model = defineModel<T>({ required: true })
const emit = defineEmits<{
  /** Fired when the user picks an option (even the one already selected). */
  change: [value: T]
}>()

const root = useTemplateRef<HTMLDivElement>('root')
const list = useTemplateRef<HTMLUListElement>('list')
const listId = useId()
const open = ref(false)
const activeIndex = ref(-1)

const selectedIndex = computed(() => props.options.findIndex((o) => o.value === model.value))
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label ?? '')
const optionId = (i: number) => `${listId}-${i}`

function show() {
  if (props.disabled || open.value) return
  open.value = true
  activeIndex.value = Math.max(selectedIndex.value, 0)
}

function hide() {
  open.value = false
}

function pick(i: number) {
  const option = props.options[i]
  if (!option) return
  model.value = option.value
  emit('change', option.value)
  hide()
}

function onKeydown(e: KeyboardEvent) {
  const last = props.options.length - 1
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      show()
    }
    return
  }
  const moves: Record<string, number> = {
    ArrowDown: Math.min(activeIndex.value + 1, last),
    ArrowUp: Math.max(activeIndex.value - 1, 0),
    Home: 0,
    End: last,
  }
  if (e.key in moves) {
    e.preventDefault()
    activeIndex.value = moves[e.key]!
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    pick(activeIndex.value)
  } else if (e.key === 'Escape' || e.key === 'Tab') {
    hide()
  }
}

// Keep the highlighted option visible when moving through a long list with the keyboard.
watch(activeIndex, async (i) => {
  await nextTick()
  list.value?.querySelector(`#${CSS.escape(optionId(i))}`)?.scrollIntoView({ block: 'nearest' })
})

// Close when clicking anywhere outside the dropdown.
function onPointerDownOutside(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) hide()
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onPointerDownOutside)
  else document.removeEventListener('pointerdown', onPointerDownOutside)
})
watch(
  () => props.disabled,
  (disabled) => disabled && hide(),
)
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDownOutside))
</script>

<template>
  <div ref="root" class="select-menu" :class="{ open }">
    <button
      :id="id"
      class="trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open && activeIndex >= 0 ? optionId(activeIndex) : undefined"
      :disabled="disabled"
      @click="open ? hide() : show()"
      @keydown="onKeydown"
    >
      <span class="value">{{ selectedLabel }}</span>
      <Chevron />
    </button>
    <ul v-show="open" :id="listId" ref="list" class="options" role="listbox" tabindex="-1">
      <li
        v-for="(option, i) in options"
        :id="optionId(i)"
        :key="String(option.value)"
        role="option"
        :aria-selected="i === selectedIndex"
        :class="{ active: i === activeIndex, selected: i === selectedIndex }"
        @mouseenter="activeIndex = i"
        @mousedown.prevent
        @click="pick(i)"
      >
        {{ option.label }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.select-menu {
  position: relative;
}
.trigger {
  width: 100%;
  min-height: 37px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid #e2e1da;
  border-radius: 8px;
  background: #fff;
  color: #293a30;
  font: inherit;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}
.trigger:not(:disabled):hover {
  border-color: #c9d2c7;
}
.trigger:focus-visible {
  outline: 2px solid #49865b;
  outline-offset: 2px;
}
.trigger:disabled {
  background: #f7f6f2;
  color: #989a92;
  cursor: default;
}
.value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.open .chevron {
  transform: rotate(180deg);
}
.options {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 10;
  max-height: 240px;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid #e2e1da;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 6px 20px #2334261f;
}
li {
  padding: 7px 8px;
  border-radius: 6px;
  color: #293a30;
  font-size: 11px;
  cursor: pointer;
}
li.active {
  background: #f1f7f0;
}
li.selected {
  color: #276142;
  font-weight: 600;
}
</style>
