import { createRouter, createWebHistory } from 'vue-router'
import StoryView from '../views/StoryView.vue'
import AdminView from '../views/AdminView.vue'
import TalkView from '../views/TalkView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: StoryView },
    { path: '/admin', component: AdminView },
    { path: '/talk', component: TalkView },
  ],
})

export default router
