import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { detectPlatform } from './lib/platform'
import './styles/base.css'
import './styles/editor.css'

document.body.classList.add(`platform-${detectPlatform()}`)

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
