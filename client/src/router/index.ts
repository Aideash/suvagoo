import { createRouter, createWebHistory } from 'vue-router'
import ListView from '../views/ListView.vue'
import EditorView from '../views/EditorView.vue'
import ViewView from '../views/ViewView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'list', component: ListView, meta: { title: 'Suvagoo' } },
    { path: '/edit', name: 'create', component: EditorView, meta: { title: 'New SVG — Suvagoo' } },
    {
      path: '/edit/:id',
      name: 'edit',
      component: EditorView,
      meta: { title: 'Edit SVG — Suvagoo' },
    },
    { path: '/view/:id', name: 'view', component: ViewView, meta: { title: 'View SVG — Suvagoo' } },
  ],
})

router.afterEach((to) => {
  if (to.name === 'edit' || to.name === 'view') return
  const title = typeof to.meta.title === 'string' ? to.meta.title : 'Suvagoo'
  document.title = title
})

export default router
