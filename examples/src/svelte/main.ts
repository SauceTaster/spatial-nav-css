import { mount } from 'svelte'
import 'spatial-nav-css/css'
import '../shared/examples.css'
import App from './App.svelte'

mount(App, { target: document.getElementById('app')! })
