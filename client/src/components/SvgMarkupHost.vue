<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    markup: string
    mode?: 'fill' | 'fit' | 'specimen'
    contentCss?: string
  }>(),
  {
    mode: 'fit',
    contentCss: '',
  },
)

const host = ref<HTMLElement | null>(null)
let shadow: ShadowRoot | null = null

function hostCss(): string {
  const svgRule =
    props.mode === 'fill'
      ? 'svg { display: block; width: 100%; height: 100%; }'
      : props.mode === 'specimen'
        ? `svg {
            display: block;
            width: var(--preview-svg-width, auto);
            height: var(--preview-svg-height, auto);
            max-width: 100%;
            max-height: 100%;
          }`
        : 'svg { display: block; width: auto; height: auto; max-width: 100%; max-height: 100%; }'

  return `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      line-height: 0;
    }
    ${svgRule}
    ${props.contentCss}
  `
}

function render() {
  if (!shadow) return
  shadow.innerHTML = `<style>${hostCss()}</style>${props.markup}`
}

onMounted(() => {
  if (!host.value) return
  shadow = host.value.attachShadow({ mode: 'open' })
  render()
})

watch(() => [props.markup, props.mode, props.contentCss], render)

onBeforeUnmount(() => {
  shadow = null
})

function root(): SVGSVGElement | null {
  return shadow?.querySelector('svg') ?? null
}

defineExpose({ root })
</script>

<template>
  <span ref="host" />
</template>
