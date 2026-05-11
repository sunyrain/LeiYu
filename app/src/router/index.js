import { createRouter, createWebHistory } from 'vue-router'
import StoryView from '../views/StoryView.vue'
import AdminView from '../views/AdminView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: StoryView },
    { path: '/admin', component: AdminView },
  ],
})

export default router
