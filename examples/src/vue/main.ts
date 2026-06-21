import { createApp } from 'vue'
import { SpatialNavigationPlugin } from 'spatial-nav-css/vue'
import 'spatial-nav-css/css'
import '../shared/examples.css'
import App from './App.vue'

createApp(App).use(SpatialNavigationPlugin, { autofocus: true }).mount('#app')
