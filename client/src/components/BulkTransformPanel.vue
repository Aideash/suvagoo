<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { numericRangeForAttribute } from '../lib/attributeSchema'
import { describeBakePlan } from '../lib/bakeTransform'
import { getViewBox, type PathSegment } from '../lib/svgDocument'
import {
  createIdentitySession,
  isIdentitySession,
  type TransformSessionValues,
} from '../lib/transformSession'
import {
  ANGLE_TRANSFORM_RANGE,
  SCALE_TRANSFORM_RANGE,
} from '../lib/transformAttribute'
import AxisControl from './AxisControl.vue'

const props = defineProps<{
  content: string
  selectedPaths: PathSegment[][]
  session: TransformSessionValues
  bakeWarning?: string
}>()

const emit = defineEmits<{
  'update:session': [session: TransformSessionValues]
  commit: []
  cancel: []
}>()

const uniformScale = ref(true)

const viewBox = computed(() => getViewBox(props.content))

const translateRange = computed(() =>
  numericRangeForAttribute('x', viewBox.value, String(props.session.tx)),
)

const pivotRangeX = computed(() =>
  numericRangeForAttribute('x', viewBox.value, String(props.session.cx)),
)
const pivotRangeY = computed(() =>
  numericRangeForAttribute('y', viewBox.value, String(props.session.cy)),
)

const bakePlan = computed(() =>
  describeBakePlan(props.content, props.selectedPaths, props.session),
)

const canCommit = computed(
  () => props.selectedPaths.length > 0 && !isIdentitySession(props.session),
)

watch(
  () => [props.session.sx, props.session.sy] as const,
  ([sx, sy]) => {
    if (Math.abs(sx - sy) > 1e-6) uniformScale.value = false
  },
)

function patch(partial: Partial<TransformSessionValues>) {
  emit('update:session', { ...props.session, ...partial })
}

function onSx(value: number) {
  if (uniformScale.value) {
    patch({ sx: value, sy: value })
  } else {
    patch({ sx: value })
  }
}

function onSy(value: number) {
  if (uniformScale.value) {
    patch({ sx: value, sy: value })
  } else {
    patch({ sy: value })
  }
}

function onUniformToggle() {
  uniformScale.value = !uniformScale.value
  if (uniformScale.value) {
    patch({ sy: props.session.sx })
  }
}

function reset() {
  emit('update:session', createIdentitySession({ cx: props.session.cx, cy: props.session.cy }))
}

function uniqueTags(tags: string[]): string {
  return [...new Set(tags)].join(', ')
}
</script>

<template>
  <section class="bulk-transform">
    <div class="bulk-transform__header">
      <h3 class="bulk-transform__heading">Transform</h3>
      <p class="bulk-transform__meta">
        {{ selectedPaths.length }} selected
      </p>
    </div>

    <p v-if="bakeWarning" class="bulk-transform__warn">{{ bakeWarning }}</p>

    <p v-if="bakePlan.convert.length" class="bulk-transform__note">
      Will convert to path: {{ uniqueTags(bakePlan.convert) }}
    </p>
    <p v-if="bakePlan.skip.length" class="bulk-transform__note bulk-transform__note--muted">
      Skipped on commit: {{ uniqueTags(bakePlan.skip) }}
    </p>

    <div class="bulk-transform__controls">
      <AxisControl
        label="Translate X"
        :value="session.tx"
        :default-min="translateRange.min"
        :default-max="translateRange.max"
        :default-step="translateRange.step"
        @update="(v) => patch({ tx: v })"
      />
      <AxisControl
        label="Translate Y"
        :value="session.ty"
        :default-min="translateRange.min"
        :default-max="translateRange.max"
        :default-step="translateRange.step"
        @update="(v) => patch({ ty: v })"
      />
      <AxisControl
        label="Rotate"
        :value="session.angle"
        :default-min="ANGLE_TRANSFORM_RANGE.min"
        :default-max="ANGLE_TRANSFORM_RANGE.max"
        :default-step="ANGLE_TRANSFORM_RANGE.step"
        @update="(v) => patch({ angle: v })"
      />
      <AxisControl
        label="Pivot X"
        :value="session.cx"
        :default-min="pivotRangeX.min"
        :default-max="pivotRangeX.max"
        :default-step="pivotRangeX.step"
        @update="(v) => patch({ cx: v })"
      />
      <AxisControl
        label="Pivot Y"
        :value="session.cy"
        :default-min="pivotRangeY.min"
        :default-max="pivotRangeY.max"
        :default-step="pivotRangeY.step"
        @update="(v) => patch({ cy: v })"
      />
      <div class="bulk-transform__scale-lock">
        <label class="bulk-transform__lock">
          <input type="checkbox" :checked="uniformScale" @change="onUniformToggle" />
          Uniform scale
        </label>
      </div>
      <AxisControl
        label="Scale X"
        :value="session.sx"
        :default-min="SCALE_TRANSFORM_RANGE.min"
        :default-max="SCALE_TRANSFORM_RANGE.max"
        :default-step="SCALE_TRANSFORM_RANGE.step"
        @update="onSx"
      />
      <AxisControl
        v-if="!uniformScale"
        label="Scale Y"
        :value="session.sy"
        :default-min="SCALE_TRANSFORM_RANGE.min"
        :default-max="SCALE_TRANSFORM_RANGE.max"
        :default-step="SCALE_TRANSFORM_RANGE.step"
        @update="onSy"
      />
    </div>

    <div class="bulk-transform__actions">
      <button type="button" class="btn btn--primary" :disabled="!canCommit" @click="emit('commit')">
        Commit
      </button>
      <button type="button" class="btn btn--secondary" @click="emit('cancel')">Cancel</button>
      <button type="button" class="btn btn--secondary" @click="reset">Reset</button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../styles/variables' as *;

.bulk-transform {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-sm;
  border: 1px solid var(--border);
  border-radius: $radius-sm;
  background: color-mix(in srgb, var(--accent) 6%, transparent);

  &__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: $spacing-sm;
  }

  &__heading {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $color-text-muted;
  }

  &__meta {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text-muted;
  }

  &__warn {
    margin: 0;
    padding: $spacing-xs $spacing-sm;
    border-radius: $radius-sm;
    font-size: 0.75rem;
    color: var(--amber);
    background: color-mix(in srgb, var(--amber) 12%, transparent);
  }

  &__note {
    margin: 0;
    font-size: 0.75rem;
    color: $color-text;

    &--muted {
      color: $color-text-muted;
    }
  }

  &__controls {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__scale-lock {
    padding: 2px 0;
  }

  &__lock {
    display: inline-flex;
    align-items: center;
    gap: $spacing-xs;
    font-size: 0.75rem;
    color: $color-text-muted;
    cursor: pointer;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }
}
</style>
