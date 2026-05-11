import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { initAudienceBackend } from './stores/game.js'

const app = createApp(App)
app.use(router)
app.mount('#app')

if (!window.location.pathname.startsWith('/admin')) {
  initAudienceBackend()
}
