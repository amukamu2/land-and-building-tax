<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{ label: string; multiple?: boolean }>(), { multiple: false })

const emit = defineEmits<{ files: [files: File[]] }>()

const dragging = ref(false)

function accept(list: FileList | null | undefined) {
  const files = [...(list ?? [])].filter((f) => f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv')
  if (files.length > 0) emit('files', props.multiple ? files : files.slice(0, 1))
}

function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  accept(input.files)
  input.value = '' // allow picking the same file again
}

function onDrop(e: DragEvent) {
  dragging.value = false
  accept(e.dataTransfer?.files)
}
</script>

<template>
  <!-- Vue: `@event` ≈ Angular `(event)`, `:attr` ≈ `[attr]`, and `.prevent` calls preventDefault(). -->
  <label
    class="drop"
    :class="{ dragging }"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <input type="file" accept=".csv,text/csv" :multiple="multiple" @change="onChange" />
    <strong>{{ label }}</strong>
    <span>Drop CSV{{ multiple ? ' file(s)' : '' }} here or click to choose</span>
  </label>
</template>

<style scoped>
.drop {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border: 2px dashed #b5b5b5;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.drop span {
  color: #666;
}
.drop.dragging {
  border-color: #2166ac;
  background: #eef4fb;
}
input {
  display: none;
}
</style>
