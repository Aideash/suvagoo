import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initTheme } from './themes/manager'
import './styles/main.scss'

initTheme()
createApp(App).use(router).mount('#app')
