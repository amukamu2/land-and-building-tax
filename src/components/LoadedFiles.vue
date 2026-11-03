<script setup lang="ts">
defineProps<{ files: File[] }>()

const emit = defineEmits<{ remove: [name: string] }>()
</script>

<template>
  <ul v-if="files.length" class="loaded-files">
    <li v-for="file in files" :key="file.name">
      <span class="name" :title="file.name">{{ file.name }}</span>
      <button type="button" :aria-label="`Remove ${file.name}`" title="Remove file" @click="emit('remove', file.name)">
        ×
      </button>
    </li>
  </ul>
</template>

<style scoped>
.loaded-files {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 2px 2px 8px;
  border: 1px solid #e2e6df;
  border-radius: 6px;
  background: #f6f8f4;
  color: #3e4c42;
  font-size: 10px;
}
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
button {
  width: 18px;
  height: 18px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #7a8279;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
button:hover {
  background: #f6e3df;
  color: #b34838;
}
</style>
