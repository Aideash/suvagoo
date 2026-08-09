import { createRouter, createWebHistory } from "vue-router";
import ListView from "../views/ListView.vue";
import EditorView from "../views/EditorView.vue";
import ViewView from "../views/ViewView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "list", component: ListView },
    { path: "/edit", name: "create", component: EditorView },
    { path: "/edit/:id", name: "edit", component: EditorView },
    { path: "/view/:id", name: "view", component: ViewView },
  ],
});

export default router;
